import { createHash } from 'node:crypto'
import type {
  LearningAiArtifact,
  LearningAiArtifactKind,
  LearningAiWorkflowId,
  LearningAiWorkflowSettings,
  LearningBlock,
  LearningBlockKind,
  LearningNote,
  LearningNoteHighlight,
  LearningObsidianState,
  LearningPromptDefinition,
  LearningScene,
  LearningSourceMetadata,
  LearningTranscriptCorrection,
  LearningTranscriptOverlay,
  LearningTranscriptRevision,
  LearningTranscriptSegment,
  LearningWorkspace
} from '../../../shared/learning-types'
import {
  createDefaultLearningAiSettings,
  isLegacyDefaultLearningPrompt,
  LEARNING_AI_WORKFLOW_IDS
} from '../../../shared/learning-workflow/defaults'

export interface LearningStoreDocument {
  aiSettings: LearningAiWorkflowSettings
  notebooks: LearningWorkspace[]
  version: 2
}

const AI_ARTIFACT_KINDS = new Set<LearningAiArtifactKind>([
  'mindmap',
  'quotes',
  'reflection',
  'summary',
  'translation'
])
const BLOCK_KINDS = new Set<LearningBlockKind>([
  'ai',
  'heading',
  'mermaid',
  'note',
  'quote',
  'screenshot',
  'text',
  'todo'
])
const NOTE_KINDS = new Set(['action', 'bookmark', 'insight', 'question'])
const NOTE_HIGHLIGHTS = new Set<LearningNoteHighlight>(['amber', 'blue', 'green', 'pink', 'purple'])
const SCENES = new Set<LearningScene>(['note', 'output', 'watch'])
const WORKFLOW_IDS = new Set<LearningAiWorkflowId>(LEARNING_AI_WORKFLOW_IDS)
const STABLE_ID_PATTERN = /^[a-z0-9._:-]{1,128}$/iu

export const normalizedText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export const normalizedTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback

const normalizedBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback

const normalizedStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(normalizedText).filter(Boolean) : []

const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      unique.push(item)
    }
  }
  return unique
}

const stableId = (prefix: string, source: string): string => {
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 20)
  return `${prefix}-${hash}`
}

const normalizedStableId = (value: unknown, fallback: string): string => {
  const candidate = normalizedText(value)
  return STABLE_ID_PATTERN.test(candidate) ? candidate : fallback
}

const normalizedNote = (value: unknown, fallbackTime: number): LearningNote | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningNote>
  const id = normalizedText(candidate.id)
  const noteText = normalizedText(candidate.text)
  const quote = normalizedText(candidate.quote)
  // A transcript highlight is a valid source annotation even before the learner
  // adds a comment. Requiring note text used to silently discard those records.
  if (!(id && (noteText || quote) && NOTE_KINDS.has(candidate.kind ?? ''))) {
    return null
  }
  const createdAt = normalizedTimestamp(candidate.createdAt, fallbackTime)
  const highlightColor = NOTE_HIGHLIGHTS.has(candidate.highlightColor as LearningNoteHighlight)
    ? (candidate.highlightColor as LearningNoteHighlight)
    : null
  const sourceStartOffset =
    typeof candidate.sourceStartOffset === 'number'
      ? Math.floor(normalizedTimestamp(candidate.sourceStartOffset, 0))
      : null
  const sourceEndOffset =
    typeof candidate.sourceEndOffset === 'number'
      ? Math.max(
          sourceStartOffset ?? 0,
          Math.floor(normalizedTimestamp(candidate.sourceEndOffset, sourceStartOffset ?? 0))
        )
      : null
  return {
    completed: Boolean(candidate.completed),
    createdAt,
    highlightColor,
    id,
    kind: candidate.kind as LearningNote['kind'],
    quote,
    sourceEndOffset,
    sourceSegmentIds: normalizedStringList(candidate.sourceSegmentIds),
    sourceStartOffset,
    text: noteText,
    timestampMs: normalizedTimestamp(candidate.timestampMs, 0),
    updatedAt: normalizedTimestamp(candidate.updatedAt, createdAt)
  }
}

const normalizedBlock = (value: unknown, fallbackTime: number): LearningBlock | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningBlock>
  const id = normalizedText(candidate.id)
  const kind = candidate.kind
  if (!(id && kind && BLOCK_KINDS.has(kind))) {
    return null
  }
  const createdAt = normalizedTimestamp(candidate.createdAt, fallbackTime)
  const rawTimestamp = candidate.timestampMs
  return {
    attachmentPath: normalizedText(candidate.attachmentPath) || null,
    completed: normalizedBoolean(candidate.completed),
    content: normalizedText(candidate.content),
    createdAt,
    id,
    kind,
    quote: normalizedText(candidate.quote),
    sourceSegmentIds: normalizedStringList(candidate.sourceSegmentIds),
    timestampMs: typeof rawTimestamp === 'number' ? normalizedTimestamp(rawTimestamp, 0) : null,
    updatedAt: normalizedTimestamp(candidate.updatedAt, createdAt)
  }
}

const normalizedSegment = (value: unknown, index: number): LearningTranscriptSegment | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningTranscriptSegment>
  const originalText = normalizedText(candidate.originalText)
  if (!originalText) {
    return null
  }
  const startMs = normalizedTimestamp(candidate.startMs, 0)
  return {
    endMs: Math.max(startMs, normalizedTimestamp(candidate.endMs, startMs)),
    id: normalizedText(candidate.id) || `segment-${index}-${startMs}`,
    originalText,
    speakerId: normalizedText(candidate.speakerId) || null,
    startMs,
    translatedText: normalizedText(candidate.translatedText)
  }
}

const normalizedCorrection = (
  value: unknown,
  segmentIds: Set<string>,
  fallbackTime: number
): LearningTranscriptCorrection | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningTranscriptCorrection>
  const id = normalizedText(candidate.id)
  const segmentId = normalizedText(candidate.segmentId)
  const correctedText = normalizedText(candidate.correctedText)
  if (!(id && segmentIds.has(segmentId) && correctedText)) {
    return null
  }
  const reason =
    candidate.reason === 'ai' || candidate.reason === 'restore' ? candidate.reason : 'manual'
  return {
    correctedText,
    createdAt: normalizedTimestamp(candidate.createdAt, fallbackTime),
    id,
    previousText: normalizedText(candidate.previousText),
    reason,
    segmentId
  }
}

const normalizedTranscriptRevision = (
  value: unknown,
  fallbackTime: number
): LearningTranscriptRevision | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningTranscriptOverlay>
  const segments = Array.isArray(candidate.segments)
    ? candidate.segments
        .map(normalizedSegment)
        .filter((segment): segment is LearningTranscriptSegment => segment !== null)
    : []
  const uniqueSegments = uniqueById(segments)
  if (uniqueSegments.length === 0) {
    return null
  }
  const segmentIds = new Set(uniqueSegments.map((segment) => segment.id))
  const corrections = uniqueById(
    Array.isArray(candidate.corrections)
      ? candidate.corrections
          .map((correction) => normalizedCorrection(correction, segmentIds, fallbackTime))
          .filter((correction): correction is LearningTranscriptCorrection => correction !== null)
      : []
  )
  return {
    corrections,
    segments: uniqueSegments,
    sourceVersionId:
      normalizedText(candidate.sourceVersionId) ||
      stableId('transcript', JSON.stringify(uniqueSegments)),
    updatedAt: normalizedTimestamp(candidate.updatedAt, fallbackTime),
    version: Math.max(1, Math.floor(normalizedTimestamp(candidate.version, 1)))
  }
}

const normalizedTranscript = (
  value: unknown,
  fallbackTime: number
): LearningTranscriptOverlay | null => {
  const current = normalizedTranscriptRevision(value, fallbackTime)
  if (!current) {
    return null
  }
  const candidate = value as Partial<LearningTranscriptOverlay>
  const historyBySourceVersion = new Map<string, LearningTranscriptRevision>()
  if (Array.isArray(candidate.sourceHistory)) {
    for (const historyValue of candidate.sourceHistory) {
      const revision = normalizedTranscriptRevision(historyValue, fallbackTime)
      if (revision && revision.sourceVersionId !== current.sourceVersionId) {
        historyBySourceVersion.set(revision.sourceVersionId, revision)
      }
    }
  }
  return { ...current, sourceHistory: [...historyBySourceVersion.values()] }
}

const normalizedArtifact = (value: unknown, fallbackTime: number): LearningAiArtifact | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningAiArtifact>
  const id = normalizedText(candidate.id)
  const content = normalizedText(candidate.content)
  const kind = candidate.kind
  if (!(id && content && kind && AI_ARTIFACT_KINDS.has(kind))) {
    return null
  }
  return {
    content,
    createdAt: normalizedTimestamp(candidate.createdAt, fallbackTime),
    id,
    kind,
    model: normalizedText(candidate.model),
    prompt: normalizedText(candidate.prompt),
    promptVersion: Math.max(1, Math.floor(normalizedTimestamp(candidate.promptVersion, 1))),
    sourceSegmentIds: normalizedStringList(candidate.sourceSegmentIds),
    transcriptVersion: Math.max(1, Math.floor(normalizedTimestamp(candidate.transcriptVersion, 1)))
  }
}

const normalizedSource = (
  value: unknown,
  input: { downloadId: string; sourceUrl: string | null; title: string },
  fallbackTime: number
): LearningSourceMetadata => {
  const candidate =
    value && typeof value === 'object' ? (value as Partial<LearningSourceMetadata>) : {}
  return {
    author: normalizedText(candidate.author),
    canonicalUrl: normalizedText(candidate.canonicalUrl) || input.sourceUrl,
    courseTitle: normalizedText(candidate.courseTitle),
    durationMs: normalizedTimestamp(candidate.durationMs, 0),
    importedAt: normalizedTimestamp(candidate.importedAt, fallbackTime),
    localPath: normalizedText(candidate.localPath) || null,
    platform: normalizedText(candidate.platform) || 'unknown',
    playlistId: normalizedText(candidate.playlistId) || null,
    sourceId: normalizedStableId(
      candidate.sourceId,
      stableId('source', input.sourceUrl ?? input.downloadId)
    ),
    thumbnailUrl: normalizedText(candidate.thumbnailUrl) || null,
    title: normalizedText(candidate.title) || input.title
  }
}

const normalizedObsidianState = (value: unknown): LearningObsidianState => {
  const candidate =
    value && typeof value === 'object' ? (value as Partial<LearningObsidianState>) : {}
  return {
    lastExportedAt:
      typeof candidate.lastExportedAt === 'number'
        ? normalizedTimestamp(candidate.lastExportedAt, 0)
        : null,
    managedHash: normalizedText(candidate.managedHash) || null,
    relativePath: normalizedText(candidate.relativePath) || null
  }
}

export const normalizeNotebook = (value: unknown): LearningWorkspace | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LearningWorkspace>
  const downloadId = normalizedText(candidate.downloadId)
  if (!downloadId) {
    return null
  }
  const now = Date.now()
  const createdAt = normalizedTimestamp(candidate.createdAt, now)
  const title = normalizedText(candidate.title) || 'Untitled lesson'
  const sourceUrl = normalizedText(candidate.sourceUrl) || null
  return {
    aiArtifacts: uniqueById(
      Array.isArray(candidate.aiArtifacts)
        ? candidate.aiArtifacts
            .map((artifact) => normalizedArtifact(artifact, createdAt))
            .filter((artifact): artifact is LearningAiArtifact => artifact !== null)
        : []
    ),
    blocks: uniqueById(
      Array.isArray(candidate.blocks)
        ? candidate.blocks
            .map((block) => normalizedBlock(block, createdAt))
            .filter((block): block is LearningBlock => block !== null)
        : []
    ),
    createdAt,
    downloadId,
    goal: normalizedText(candidate.goal),
    migratedLegacyNoteIds: normalizedStringList(candidate.migratedLegacyNoteIds),
    notes: uniqueById(
      Array.isArray(candidate.notes)
        ? candidate.notes
            .map((note) => normalizedNote(note, createdAt))
            .filter((note): note is LearningNote => note !== null)
        : []
    ),
    // Preserve Markdown whitespace (code blocks and intentional line breaks) in the
    // learner's free-form note. Legacy notebooks simply receive an empty string.
    personalNote: typeof candidate.personalNote === 'string' ? candidate.personalNote : '',
    obsidian: normalizedObsidianState(candidate.obsidian),
    scene: candidate.scene && SCENES.has(candidate.scene) ? candidate.scene : 'watch',
    source: normalizedSource(candidate.source, { downloadId, sourceUrl, title }, createdAt),
    sourceUrl,
    title,
    transcript: normalizedTranscript(candidate.transcript, createdAt),
    updatedAt: normalizedTimestamp(candidate.updatedAt, createdAt),
    version: 2,
    workspaceId: normalizedStableId(candidate.workspaceId, stableId('workspace', downloadId))
  }
}

const normalizedPrompt = (
  value: unknown,
  fallback: LearningPromptDefinition
): LearningPromptDefinition => {
  const candidate =
    value && typeof value === 'object' ? (value as Partial<LearningPromptDefinition>) : {}
  const storedPrompt = normalizedText(candidate.systemPrompt)
  const upgradeLegacyDefault = isLegacyDefaultLearningPrompt(fallback.id, storedPrompt)
  return {
    id: fallback.id,
    systemPrompt: upgradeLegacyDefault
      ? fallback.systemPrompt
      : storedPrompt || fallback.systemPrompt,
    updatedAt: upgradeLegacyDefault
      ? fallback.updatedAt
      : normalizedTimestamp(candidate.updatedAt, fallback.updatedAt),
    version: upgradeLegacyDefault
      ? fallback.version
      : Math.max(1, Math.floor(normalizedTimestamp(candidate.version, fallback.version)))
  }
}

export const normalizeAiSettings = (
  value: unknown,
  now = Date.now()
): LearningAiWorkflowSettings => {
  const defaults = createDefaultLearningAiSettings(now)
  const candidate =
    value && typeof value === 'object' ? (value as Partial<LearningAiWorkflowSettings>) : {}
  const inputPrompts = Array.isArray(candidate.prompts) ? candidate.prompts : []
  const inputRules = Array.isArray(candidate.workflows) ? candidate.workflows : []
  return {
    defaultModel: normalizedText(candidate.defaultModel),
    prompts: defaults.prompts.map((fallback) =>
      normalizedPrompt(
        inputPrompts.find((prompt) => prompt?.id === fallback.id),
        fallback
      )
    ),
    updatedAt: normalizedTimestamp(candidate.updatedAt, now),
    version: 1,
    workflows: defaults.workflows.map((fallback) => {
      const input = inputRules.find(
        (rule) => rule && WORKFLOW_IDS.has(rule.id) && rule.id === fallback.id
      )
      return {
        enabled: normalizedBoolean(input?.enabled, fallback.enabled),
        id: fallback.id,
        runOnTranscriptComplete: normalizedBoolean(
          input?.runOnTranscriptComplete,
          fallback.runOnTranscriptComplete
        )
      }
    })
  }
}

export const mergeAiSettings = (
  existing: LearningAiWorkflowSettings,
  input: LearningAiWorkflowSettings,
  now = Date.now()
): LearningAiWorkflowSettings => {
  const normalized = normalizeAiSettings(input, now)
  return {
    ...normalized,
    prompts: normalized.prompts.map((prompt) => {
      const previous = existing.prompts.find((item) => item.id === prompt.id)
      if (previous && prompt.version < previous.version) {
        return previous
      }
      const changed = previous?.systemPrompt !== prompt.systemPrompt
      return {
        ...prompt,
        updatedAt: changed ? now : (previous?.updatedAt ?? prompt.updatedAt),
        version: changed ? (previous?.version ?? 0) + 1 : (previous?.version ?? prompt.version)
      }
    }),
    updatedAt: now
  }
}

export const normalizeStoreDocument = (value: unknown): LearningStoreDocument => {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const normalizedNotebooks = Array.isArray(candidate.notebooks)
    ? candidate.notebooks
        .map(normalizeNotebook)
        .filter((notebook): notebook is LearningWorkspace => notebook !== null)
    : []
  const notebooksByDownloadId = new Map<string, LearningWorkspace>()
  for (const notebook of normalizedNotebooks) {
    const current = notebooksByDownloadId.get(notebook.downloadId)
    if (!current || notebook.updatedAt >= current.updatedAt) {
      notebooksByDownloadId.set(notebook.downloadId, notebook)
    }
  }
  return {
    aiSettings: normalizeAiSettings(candidate.aiSettings),
    notebooks: [...notebooksByDownloadId.values()],
    version: 2
  }
}
