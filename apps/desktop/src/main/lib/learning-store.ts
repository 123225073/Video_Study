import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  LearningAiArtifact,
  LearningAiArtifactAppendInput,
  LearningAiWorkflowSettings,
  LearningBlockUpsertInput,
  LearningNotebook,
  LearningNotebookWriteInput,
  LearningNoteDeleteInput,
  LearningNoteUpsertInput,
  LearningSearchQuery,
  LearningSearchResult,
  LearningTranscriptCorrectionInput,
  LearningTranscriptOverlay,
  LearningTranscriptRestoreInput,
  LearningTranscriptRevision,
  LearningTranscriptSourceRestoreInput
} from '../../shared/learning-types'
import { LearningAttachmentStore } from './learning-workspace/attachment-store'
import {
  type LearningStoreDocument,
  mergeAiSettings,
  normalizedText,
  normalizeNotebook,
  normalizeStoreDocument
} from './learning-workspace/normalization'
import {
  buildLearningSearchIndex,
  queryLearningSearchIndex
} from './learning-workspace/search-index'
import {
  applyTranscriptCorrection,
  restoreTranscriptCorrection
} from './learning-workspace/transcript-overlay'

const mergeAiArtifactHistory = (
  existing: LearningAiArtifact[],
  incoming: LearningAiArtifact[] | undefined
): LearningAiArtifact[] => {
  if (!incoming) {
    return existing
  }
  const merged = [...existing]
  const ids = new Set(existing.map((artifact) => normalizedText(artifact.id)))
  for (const artifact of incoming) {
    const id = normalizedText(artifact.id)
    if (id && !ids.has(id)) {
      ids.add(id)
      merged.push({ ...artifact, id })
    }
  }
  return merged
}

const currentTranscriptRevision = (
  transcript: LearningTranscriptOverlay
): LearningTranscriptRevision => ({
  corrections: transcript.corrections,
  segments: transcript.segments,
  sourceVersionId: transcript.sourceVersionId,
  updatedAt: transcript.updatedAt,
  version: transcript.version
})

const mergeSourceHistory = (
  currentSourceVersionId: string,
  ...groups: Array<LearningTranscriptRevision[] | undefined>
): LearningTranscriptRevision[] => {
  const revisions = new Map<string, LearningTranscriptRevision>()
  for (const group of groups) {
    for (const revision of group ?? []) {
      if (revision.sourceVersionId !== currentSourceVersionId) {
        revisions.set(revision.sourceVersionId, revision)
      }
    }
  }
  return [...revisions.values()].toSorted((left, right) => left.updatedAt - right.updatedAt)
}

const mergeTranscriptHistory = (
  existing: LearningTranscriptOverlay | null | undefined,
  incoming: LearningTranscriptOverlay | null | undefined
): LearningTranscriptOverlay | null | undefined => {
  if (incoming === undefined || !existing) {
    return incoming ?? existing
  }
  if (incoming === null) {
    return null
  }
  const normalizedIncoming = normalizeNotebook({
    createdAt: 0,
    downloadId: 'transcript-merge',
    goal: '',
    notes: [],
    title: 'Transcript merge',
    transcript: incoming,
    updatedAt: 0,
    version: 2
  })?.transcript
  if (!normalizedIncoming || normalizedIncoming.sourceVersionId !== existing.sourceVersionId) {
    if (!normalizedIncoming) {
      return incoming
    }
    if (
      existing.sourceHistory?.some(
        (revision) => revision.sourceVersionId === normalizedIncoming.sourceVersionId
      )
    ) {
      return existing
    }
    return {
      ...normalizedIncoming,
      sourceHistory: mergeSourceHistory(
        normalizedIncoming.sourceVersionId,
        existing.sourceHistory,
        [currentTranscriptRevision(existing)],
        normalizedIncoming.sourceHistory
      ),
      version: Math.max(existing.version + 1, normalizedIncoming.version)
    }
  }
  const corrections = [...existing.corrections]
  const correctionIds = new Set(corrections.map((correction) => correction.id))
  for (const correction of normalizedIncoming.corrections) {
    if (!correctionIds.has(correction.id)) {
      correctionIds.add(correction.id)
      corrections.push(correction)
    }
  }
  const incomingSegments = new Map(
    normalizedIncoming.segments.map((segment) => [segment.id, segment] as const)
  )
  const existingSegmentIds = new Set(existing.segments.map((segment) => segment.id))
  const segments = existing.segments.map((segment) => ({
    ...segment,
    translatedText: incomingSegments.get(segment.id)?.translatedText || segment.translatedText
  }))
  for (const segment of normalizedIncoming.segments) {
    if (!existingSegmentIds.has(segment.id)) {
      segments.push(segment)
    }
  }
  return {
    ...normalizedIncoming,
    corrections,
    segments,
    sourceHistory: mergeSourceHistory(
      existing.sourceVersionId,
      existing.sourceHistory,
      normalizedIncoming.sourceHistory
    ),
    updatedAt: Math.max(existing.updatedAt, normalizedIncoming.updatedAt),
    version: Math.max(existing.version, normalizedIncoming.version)
  }
}

export class LearningStore {
  private readonly attachmentStore: LearningAttachmentStore
  private readonly filePath: string
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string) {
    this.filePath = filePath
    this.attachmentStore = new LearningAttachmentStore(filePath)
  }

  async list(): Promise<LearningNotebook[]> {
    await this.writeQueue
    const document = await this.readDocument()
    return document.notebooks.toSorted((left, right) => right.updatedAt - left.updatedAt)
  }

  async get(downloadId: string): Promise<LearningNotebook | null> {
    const id = normalizedText(downloadId)
    if (!id) {
      return null
    }
    await this.writeQueue
    const document = await this.readDocument()
    return document.notebooks.find((notebook) => notebook.downloadId === id) ?? null
  }

  save(input: LearningNotebookWriteInput): Promise<LearningNotebook> {
    const id = normalizedText(input.downloadId)
    if (!id) {
      throw new Error('A download id is required to save a learning notebook')
    }
    return this.mutateDocument((document) => {
      const existing = document.notebooks.find((notebook) => notebook.downloadId === id)
      const now = Date.now()
      const notebook = normalizeNotebook({
        ...existing,
        ...input,
        aiArtifacts: mergeAiArtifactHistory(existing?.aiArtifacts ?? [], input.aiArtifacts),
        blocks: input.blocks ?? existing?.blocks,
        createdAt: existing?.createdAt ?? now,
        downloadId: id,
        goal: input.goal ?? existing?.goal ?? '',
        notes: input.notes ?? existing?.notes ?? [],
        personalNote: input.personalNote ?? existing?.personalNote ?? '',
        obsidian: input.obsidian ?? existing?.obsidian,
        scene: input.scene ?? existing?.scene,
        source: {
          ...existing?.source,
          ...input.source,
          sourceId: existing?.source.sourceId ?? input.source?.sourceId
        },
        sourceUrl: input.sourceUrl === undefined ? (existing?.sourceUrl ?? null) : input.sourceUrl,
        title: normalizedText(input.title ?? existing?.title ?? '') || 'Untitled lesson',
        transcript: mergeTranscriptHistory(existing?.transcript, input.transcript),
        updatedAt: now,
        version: 2,
        workspaceId: existing?.workspaceId ?? input.workspaceId
      })
      if (!notebook) {
        throw new Error('The learning notebook is invalid')
      }
      document.notebooks = document.notebooks.filter((item) => item.downloadId !== id)
      document.notebooks.push(notebook)
      return notebook
    })
  }

  upsertNote(input: LearningNoteUpsertInput): Promise<LearningNotebook> {
    const id = normalizedText(input.downloadId)
    const noteId = normalizedText(input.note.id)
    if (!(id && noteId)) {
      throw new Error('A download id and note id are required to upsert a learning note')
    }
    return this.mutateNotebook(id, (existing) => {
      const nextNote = { ...input.note, id: noteId, updatedAt: Date.now() }
      const found = existing.notes.some((note) => note.id === noteId)
      const updated = normalizeNotebook({
        ...existing,
        notes: found
          ? existing.notes.map((note) => (note.id === noteId ? nextNote : note))
          : [...existing.notes, nextNote]
      })
      if (!updated?.notes.some((note) => note.id === noteId)) {
        throw new Error('The learning note is invalid')
      }
      return updated
    })
  }

  deleteNote(input: LearningNoteDeleteInput): Promise<LearningNotebook> {
    const id = normalizedText(input.downloadId)
    const noteId = normalizedText(input.noteId)
    if (!(id && noteId)) {
      throw new Error('A download id and note id are required to delete a learning note')
    }
    return this.mutateNotebook(id, (existing) => ({
      ...existing,
      notes: existing.notes.filter((note) => note.id !== noteId)
    }))
  }

  upsertBlock(input: LearningBlockUpsertInput): Promise<LearningNotebook> {
    const id = normalizedText(input.downloadId)
    const blockId = normalizedText(input.block.id)
    if (!(id && blockId)) {
      throw new Error('A download id and block id are required to upsert a learning block')
    }
    return this.mutateNotebook(id, (existing) => {
      const nextBlock = { ...input.block, id: blockId, updatedAt: Date.now() }
      const blocks = existing.blocks ?? []
      const found = blocks.some((block) => block.id === blockId)
      const updated = normalizeNotebook({
        ...existing,
        blocks: found
          ? blocks.map((block) => (block.id === blockId ? nextBlock : block))
          : [...blocks, nextBlock]
      })
      if (!updated?.blocks.some((block) => block.id === blockId)) {
        throw new Error('The learning block is invalid')
      }
      return updated
    })
  }

  applyCorrection(input: LearningTranscriptCorrectionInput): Promise<LearningNotebook> {
    return this.updateTranscript(input.downloadId, (notebook) => {
      if (!notebook.transcript) {
        throw new Error('The learning notebook does not have a transcript')
      }
      return applyTranscriptCorrection(notebook.transcript, input)
    })
  }

  restoreCorrection(input: LearningTranscriptRestoreInput): Promise<LearningNotebook> {
    return this.updateTranscript(input.downloadId, (notebook) => {
      if (!notebook.transcript) {
        throw new Error('The learning notebook does not have a transcript')
      }
      return restoreTranscriptCorrection(notebook.transcript, input)
    })
  }

  restoreTranscriptSource(input: LearningTranscriptSourceRestoreInput): Promise<LearningNotebook> {
    return this.updateTranscript(input.downloadId, (notebook) => {
      if (!notebook.transcript) {
        throw new Error('The learning notebook does not have a transcript')
      }
      const sourceVersionId = normalizedText(input.sourceVersionId)
      const target = notebook.transcript.sourceHistory?.find(
        (revision) => revision.sourceVersionId === sourceVersionId
      )
      if (!target) {
        throw new Error(`Transcript source version not found: ${sourceVersionId}`)
      }
      const history = mergeSourceHistory(
        target.sourceVersionId,
        notebook.transcript.sourceHistory,
        [currentTranscriptRevision(notebook.transcript)]
      )
      return {
        ...target,
        sourceHistory: history,
        updatedAt: Date.now(),
        version: Math.max(notebook.transcript.version, target.version) + 1
      }
    })
  }

  async search(input: LearningSearchQuery): Promise<LearningSearchResult[]> {
    await this.writeQueue
    const document = await this.readDocument()
    return queryLearningSearchIndex(buildLearningSearchIndex(document.notebooks), input)
  }

  async getAiSettings(): Promise<LearningAiWorkflowSettings> {
    await this.writeQueue
    const document = await this.readDocument()
    return document.aiSettings
  }

  saveAiSettings(input: LearningAiWorkflowSettings): Promise<LearningAiWorkflowSettings> {
    return this.mutateDocument((document) => {
      const settings = mergeAiSettings(document.aiSettings, input)
      document.aiSettings = settings
      return settings
    })
  }

  appendAiArtifact(input: LearningAiArtifactAppendInput): Promise<LearningNotebook> {
    const id = normalizedText(input.downloadId)
    if (!id) {
      throw new Error('A download id is required to append an AI artifact')
    }
    return this.mutateDocument((document) => {
      const index = document.notebooks.findIndex((notebook) => notebook.downloadId === id)
      if (index < 0) {
        throw new Error(`Learning notebook not found: ${id}`)
      }
      const existing = document.notebooks[index]
      const artifactId = normalizedText(input.artifact.id)
      if (!artifactId) {
        throw new Error('An AI artifact id is required')
      }
      if (existing.aiArtifacts.some((artifact) => artifact.id === artifactId)) {
        throw new Error(`AI artifact already exists: ${artifactId}`)
      }
      const notebook = normalizeNotebook({
        ...existing,
        aiArtifacts: [...existing.aiArtifacts, { ...input.artifact, id: artifactId }],
        updatedAt: Date.now()
      })
      if (!notebook || notebook.aiArtifacts.length !== existing.aiArtifacts.length + 1) {
        throw new Error('The AI artifact is invalid')
      }
      document.notebooks[index] = notebook
      return notebook
    })
  }

  resolveAttachmentSource(reference: string): Promise<string> {
    return this.attachmentStore.resolveAttachmentSource(reference)
  }

  private updateTranscript(
    downloadId: string,
    update: (notebook: LearningNotebook) => NonNullable<LearningNotebook['transcript']>
  ): Promise<LearningNotebook> {
    const id = normalizedText(downloadId)
    if (!id) {
      throw new Error('A download id is required to update a transcript')
    }
    return this.mutateDocument((document) => {
      const index = document.notebooks.findIndex((notebook) => notebook.downloadId === id)
      if (index < 0) {
        throw new Error(`Learning notebook not found: ${id}`)
      }
      const existing = document.notebooks[index]
      const notebook = normalizeNotebook({
        ...existing,
        transcript: update(existing),
        updatedAt: Date.now()
      })
      if (!notebook) {
        throw new Error('The updated learning notebook is invalid')
      }
      document.notebooks[index] = notebook
      return notebook
    })
  }

  private mutateNotebook(
    downloadId: string,
    update: (notebook: LearningNotebook) => LearningNotebook
  ): Promise<LearningNotebook> {
    return this.mutateDocument((document) => {
      const index = document.notebooks.findIndex((notebook) => notebook.downloadId === downloadId)
      const existing =
        index >= 0
          ? document.notebooks[index]
          : normalizeNotebook({
              createdAt: Date.now(),
              downloadId,
              goal: '',
              notes: [],
              title: 'Untitled lesson',
              updatedAt: Date.now(),
              version: 2
            })
      if (!existing) {
        throw new Error('The learning notebook could not be initialized')
      }
      const notebook = normalizeNotebook({ ...update(existing), updatedAt: Date.now() })
      if (!notebook) {
        throw new Error('The updated learning notebook is invalid')
      }
      if (index >= 0) {
        document.notebooks[index] = notebook
      } else {
        document.notebooks.push(notebook)
      }
      return notebook
    })
  }

  private mutateDocument<T>(update: (document: LearningStoreDocument) => T): Promise<T> {
    const operation = this.writeQueue.then(async () => {
      const document = await this.readDocument()
      const result = update(document)
      await this.writeDocument(document)
      return result
    })
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async readDocument(): Promise<LearningStoreDocument> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const document = normalizeStoreDocument(JSON.parse(raw.replace(/^\uFEFF/u, '')) as unknown)
      // Materialize legacy data URLs for the caller, but do not rewrite from a
      // read path. A concurrent save may begin after list/get has awaited the
      // queue; keeping persistence inside mutateDocument avoids a lost update.
      await this.attachmentStore.materializeDocument(document)
      return document
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return normalizeStoreDocument({})
      }
      if (error instanceof SyntaxError) {
        await this.preserveCorruptedDocument()
        return normalizeStoreDocument({})
      }
      throw error
    }
  }

  private async preserveCorruptedDocument(): Promise<void> {
    const recoveryPath = `${this.filePath}.corrupt-${Date.now()}`
    await fs.rename(this.filePath, recoveryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error
      }
    })
  }

  private async writeDocument(document: LearningStoreDocument): Promise<void> {
    await this.attachmentStore.materializeDocument(document)
    await this.writeDocumentFile(document)
  }

  private async writeDocumentFile(document: LearningStoreDocument): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(document, null, 2), 'utf8')
      await fs.rename(temporaryPath, this.filePath)
    } finally {
      await fs.unlink(temporaryPath).catch(() => undefined)
    }
  }
}
