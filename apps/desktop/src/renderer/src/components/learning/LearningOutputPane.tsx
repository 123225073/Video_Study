import { QuoteCardStudio } from '@renderer/components/study-studio/QuoteCardStudio'
import { StudyBlockEditor } from '@renderer/components/study-studio/StudyBlockEditor'
import { Button } from '@renderer/components/ui/button'
import { validateGeneratedLearningMermaid } from '@renderer/lib/beautiful-mermaid-plugin'
import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import { formatLearningClock } from '@renderer/lib/learning-notebook'
import { logger } from '@renderer/lib/logger'
import {
  AI_PROMPT_ID_BY_BLOCK_KIND,
  applyAiResultToStudyBlock,
  buildAiGenerationInput,
  createStudyBlockFromAiResult,
  parseGeneratedLearningMermaid
} from '@renderer/lib/study-studio/ai-generation'
import {
  createStudyNoteBlock,
  isLegacyMermaidPlaceholder
} from '@renderer/lib/study-studio/markdown'
import {
  loadPendingAiGenerations,
  type PendingAiGeneration,
  savePendingAiGenerations
} from '@renderer/lib/study-studio/pending-ai-generation'
import type {
  QuoteCardDraft,
  StudyBlockEditorLabels,
  StudyNoteBlock,
  StudyNoteBlockKind,
  StudyNoteDocument,
  TranscriptSelection
} from '@renderer/lib/study-studio/types'
import type { TranscriptSegmentView } from '@renderer/store/transcripts'
import { buildPromptTranscriptText } from '@shared/ai-prompt-text'
import type { AiPromptRunSnapshot } from '@shared/ai-types'
import type { CompanionCapturePayload } from '@shared/companion-types'
import { APP_PROTOCOL } from '@shared/constants'
import type {
  LearningBlock,
  LearningNotebook,
  ObsidianAttachmentInput
} from '@shared/learning-types'
import { FileDown, FileText, Image, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface LearningOutputPaneProps {
  companionCapture?: CompanionCapturePayload | null
  currentTimeMs: number
  downloadId: string
  onSeek: (seconds: number) => void
  segments: TranscriptSegmentView[]
  selectedQuote?: TranscriptSelection | null
  selectionIntent?: 'quote-card' | 'reflection' | null
  sourceAuthor?: string | null
  sourceCover?: string | null
  sourceTitle: string
  sourceUrl?: string | null
}

const mapLearningBlock = (block: LearningBlock): StudyNoteBlock => {
  const base = { createdAt: block.createdAt, id: block.id, updatedAt: block.updatedAt }
  switch (block.kind) {
    case 'quote':
      return {
        ...base,
        kind: 'quote',
        note: block.content,
        quote: block.quote || block.content,
        startMs: block.timestampMs ?? 0
      }
    case 'screenshot':
      return {
        ...base,
        alt: block.quote,
        caption: block.content,
        imageSrc: block.attachmentPath ?? '',
        kind: 'screenshot',
        timestampMs: block.timestampMs ?? 0
      }
    case 'mermaid':
      return { ...base, code: block.content, kind: 'mermaid' }
    case 'ai':
      return { ...base, kind: 'ai', markdown: block.content }
    case 'todo':
      return { ...base, kind: 'question', markdown: block.content, resolved: block.completed }
    case 'note':
      return { ...base, kind: 'reflection', markdown: block.content }
    default:
      return { ...base, kind: 'paragraph', markdown: block.content }
  }
}

const mapStudyBlock = (block: StudyNoteBlock): LearningBlock => {
  const base = {
    attachmentPath: null,
    completed: false,
    createdAt: block.createdAt,
    id: block.id,
    quote: '',
    sourceSegmentIds: [],
    timestampMs: null,
    updatedAt: Date.now()
  }
  switch (block.kind) {
    case 'quote':
      return {
        ...base,
        content: block.note ?? '',
        kind: 'quote',
        quote: block.quote,
        timestampMs: block.startMs
      }
    case 'screenshot':
      return {
        ...base,
        attachmentPath: block.imageSrc || null,
        content: block.caption ?? '',
        kind: 'screenshot',
        quote: block.alt,
        timestampMs: block.timestampMs
      }
    case 'mermaid':
      return { ...base, content: block.code, kind: 'mermaid' }
    case 'ai':
      return { ...base, content: block.markdown, kind: 'ai' }
    case 'question':
      return {
        ...base,
        completed: block.resolved ?? false,
        content: block.markdown,
        kind: 'todo'
      }
    case 'reflection':
      return { ...base, content: block.markdown, kind: 'note' }
    case 'paragraph':
      return { ...base, content: block.markdown, kind: 'text' }
    default:
      throw new Error(`Unsupported learning block kind: ${block satisfies never}`)
  }
}

const buildObsidianNotebook = (
  notebook: LearningNotebook
): { attachments: ObsidianAttachmentInput[]; notebook: LearningNotebook } => {
  const attachments: ObsidianAttachmentInput[] = []
  const blocks = (notebook.blocks ?? []).map((block) => {
    const dataUrlMatch = block.attachmentPath?.match(/^data:image\/(jpeg|png|webp);base64,/iu)
    let storedMatch: RegExpMatchArray | null = null
    if (block.attachmentPath?.startsWith(`${APP_PROTOCOL}://`)) {
      try {
        const storedUrl = new URL(block.attachmentPath)
        if (storedUrl.hostname === 'learning-attachments') {
          storedMatch = storedUrl.pathname.match(/^\/[a-f\d]{64}\.(jpg|png|webp)$/u)
        }
      } catch {
        storedMatch = null
      }
    }
    if (!(block.attachmentPath && (dataUrlMatch || storedMatch))) {
      return block
    }
    const rawExtension = dataUrlMatch?.[1] ?? storedMatch?.[1] ?? 'png'
    const extension =
      rawExtension.toLocaleLowerCase() === 'jpeg' ? 'jpg' : rawExtension.toLowerCase()
    const safeBlockId = block.id.replace(/[^a-z\d_-]+/giu, '-').slice(0, 80) || `${block.createdAt}`
    const relativePath = `attachments/${notebook.workspaceId}-${safeBlockId}.${extension}`
    attachments.push(
      dataUrlMatch
        ? { dataUrl: block.attachmentPath, relativePath }
        : { relativePath, sourcePath: block.attachmentPath }
    )
    return { ...block, attachmentPath: relativePath }
  })
  return { attachments, notebook: { ...notebook, blocks } }
}

const stripMermaidFence = (content: string): string =>
  content
    .trim()
    .replace(/^```mermaid\s*/iu, '')
    .replace(/```$/u, '')
    .trim()

const blocksWithAiArtifacts = (
  current: StudyNoteBlock[],
  notebook: LearningNotebook | null
): StudyNoteBlock[] => {
  const next = [...current]
  for (const artifact of notebook?.aiArtifacts ?? []) {
    const id = `artifact-${artifact.id}`
    if (next.some((block) => block.id === id)) {
      continue
    }
    if (artifact.kind === 'mindmap') {
      next.push(
        createStudyNoteBlock('mermaid', {
          code: stripMermaidFence(artifact.content),
          id
        })
      )
      continue
    }
    if (artifact.kind === 'reflection') {
      next.push(
        createStudyNoteBlock('reflection', {
          id,
          markdown: artifact.content
        })
      )
      continue
    }
    next.push(
      createStudyNoteBlock('ai', {
        id,
        markdown: artifact.content,
        model: artifact.model,
        promptLabel: `v${artifact.promptVersion}`
      })
    )
  }
  return next
}

export function LearningOutputPane({
  companionCapture,
  currentTimeMs,
  downloadId,
  onSeek,
  segments,
  selectedQuote,
  selectionIntent,
  sourceAuthor,
  sourceCover,
  sourceTitle,
  sourceUrl
}: LearningOutputPaneProps) {
  const { i18n, t } = useTranslation()
  const [notebook, setNotebook] = useState<LearningNotebook | null>(null)
  const [loadState, setLoadState] = useState<'error' | 'loading' | 'ready'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const notebookRef = useRef<LearningNotebook | null>(null)
  const [document, setDocument] = useState<StudyNoteDocument>({
    blocks: [],
    title: sourceTitle,
    version: 1
  })
  const [view, setView] = useState<'document' | 'quote-card'>('document')
  const [conflictVault, setConflictVault] = useState<string | null>(null)
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null)
  const pendingAiRunsRef = useRef(loadPendingAiGenerations(downloadId))
  const lastReflectionSelectionRef = useRef<string | null>(null)
  const hydrated = useRef(false)
  const documentRef = useRef(document)
  documentRef.current = document
  const fallbackQuote =
    notebook?.notes.find((note) => note.quote)?.quote ??
    segments.find((segment) => segment.startMs <= currentTimeMs && segment.endMs >= currentTimeMs)
      ?.text ??
    segments[0]?.text ??
    ''
  const [quoteDraft, setQuoteDraft] = useState<QuoteCardDraft>({
    aspect: 'portrait',
    fontScale: 'balanced',
    imageSrc: sourceCover ?? undefined,
    quote: '',
    showBrand: true,
    showSource: true,
    signature: '',
    sourceAuthor: sourceAuthor ?? undefined,
    sourceTitle,
    template: 'quote',
    theme: 'ink',
    timestampLabel: formatLearningClock(currentTimeMs)
  })

  const rememberPendingAiRun = useCallback(
    (promptId: string, pending: PendingAiGeneration): void => {
      pendingAiRunsRef.current.set(promptId, pending)
      savePendingAiGenerations(downloadId, pendingAiRunsRef.current)
    },
    [downloadId]
  )

  const forgetPendingAiRun = useCallback(
    (promptId: string): void => {
      pendingAiRunsRef.current.delete(promptId)
      savePendingAiGenerations(downloadId, pendingAiRunsRef.current)
    },
    [downloadId]
  )

  useEffect(() => {
    pendingAiRunsRef.current = loadPendingAiGenerations(downloadId)
    setAiBusyKey(pendingAiRunsRef.current.values().next().value?.busyKey ?? null)
  }, [downloadId])

  useEffect(() => {
    // The retry counter deliberately invalidates this request after a recoverable load error.
    void loadAttempt
    let active = true
    setLoadState('loading')
    hydrated.current = false
    void ipcServices.learning
      .get(downloadId)
      .then((saved) => {
        if (!active) {
          return
        }
        notebookRef.current = saved
        setNotebook(saved)
        setDocument({
          blocks: blocksWithAiArtifacts(
            (saved?.blocks ?? [])
              .filter(
                (block) => !(block.kind === 'mermaid' && isLegacyMermaidPlaceholder(block.content))
              )
              .map(mapLearningBlock),
            saved
          ),
          title: saved?.title || sourceTitle,
          version: 1
        })
        hydrated.current = true
        setLoadState('ready')
      })
      .catch((error) => {
        logger.error('Failed to load learning output workspace', error)
        if (active) {
          setLoadState('error')
        }
      })
    return () => {
      active = false
    }
  }, [downloadId, loadAttempt, sourceTitle])

  const transcriptText = useMemo(
    () =>
      buildPromptTranscriptText(segments, (speakerId) =>
        speakerId?.trim() ? speakerId : t('learning.unknownSpeaker')
      ),
    [segments, t]
  )

  const startAiGeneration = useCallback(
    async (
      kind: StudyNoteBlockKind,
      block?: StudyNoteBlock,
      selection?: TranscriptSelection | null
    ): Promise<void> => {
      if (aiBusyKey) {
        toast.info(t('learning.output.aiGenerating'))
        return
      }
      if (!transcriptText.trim()) {
        toast.error(t('learning.output.aiFailed', { message: t('learning.output.aiNoTranscript') }))
        return
      }
      const promptId = AI_PROMPT_ID_BY_BLOCK_KIND[kind]
      const currentRun = await ipcServices.ai.getPromptRun({ downloadId, promptId })
      if (currentRun.status === 'running') {
        toast.info(t('learning.output.aiGenerating'))
        return
      }
      const busyKey = block?.id ?? `new:${kind}`
      const currentBlock =
        block?.kind === 'screenshot'
          ? { ...block, imageSrc: block.imageSrc ? '[captured image stored locally]' : '' }
          : block
      const targetTimestampMs =
        block?.kind === 'quote'
          ? block.startMs
          : block?.kind === 'screenshot'
            ? block.timestampMs
            : selection?.startMs
      const input = buildAiGenerationInput(transcriptText, {
        currentBlock,
        personalNotes: notebookRef.current?.notes.map((note) => ({
          kind: note.kind,
          quote: note.quote,
          text: note.text,
          timestampMs: note.timestampMs
        })),
        selectedTranscript: selection ?? undefined,
        sourceTitle,
        targetKind: kind,
        targetTimestampMs
      })
      const pending: PendingAiGeneration = {
        attempt: 0,
        blockId: block?.id ?? null,
        busyKey,
        input,
        kind,
        promptId
      }
      rememberPendingAiRun(promptId, pending)
      setAiBusyKey(busyKey)
      try {
        const snapshot = await ipcServices.ai.startPrompt({
          downloadId,
          promptId,
          transcriptText: input,
          uiLanguage: i18n.language
        })
        if (snapshot.status === 'error') {
          forgetPendingAiRun(promptId)
          setAiBusyKey(null)
          toast.error(
            t('learning.output.aiFailed', {
              message: snapshot.error ?? t('learning.output.aiUnknownError')
            })
          )
        }
      } catch (error) {
        forgetPendingAiRun(promptId)
        setAiBusyKey(null)
        toast.error(
          t('learning.output.aiFailed', {
            message: error instanceof Error ? error.message : t('learning.output.aiUnknownError')
          })
        )
      }
    },
    [
      aiBusyKey,
      downloadId,
      forgetPendingAiRun,
      i18n.language,
      rememberPendingAiRun,
      sourceTitle,
      t,
      transcriptText
    ]
  )

  useEffect(() => {
    const listener = (...args: unknown[]): void => {
      const run = args[0] as AiPromptRunSnapshot | undefined
      if (run?.downloadId !== downloadId) {
        return
      }
      const pending = pendingAiRunsRef.current.get(run.promptId)
      if (pending) {
        if (!hydrated.current) {
          return
        }
        if (run.status === 'running' || run.status === 'idle') {
          return
        }
        if (run.status !== 'completed') {
          forgetPendingAiRun(run.promptId)
          setAiBusyKey(null)
          toast.error(
            t('learning.output.aiFailed', {
              message: run.error ?? t('learning.output.aiUnknownError')
            })
          )
          return
        }
        void (async () => {
          let output = run.text.trim()
          try {
            if (pending.kind === 'mermaid') {
              const code = parseGeneratedLearningMermaid(output)
              validateGeneratedLearningMermaid(code)
              output = code
            }
          } catch (error) {
            if (pending.attempt < 1) {
              const message = error instanceof Error ? error.message : String(error)
              const repairInput = `${pending.input}\n\nAI_GENERATED_DRAFT (repair this data):\n${run.text}\n\nRENDER_ERROR:\n${message}`
              rememberPendingAiRun(run.promptId, {
                ...pending,
                attempt: pending.attempt + 1,
                input: repairInput
              })
              const snapshot = await ipcServices.ai.startPrompt({
                downloadId,
                promptId: run.promptId,
                transcriptText: repairInput,
                uiLanguage: i18n.language
              })
              if (snapshot.status !== 'error') {
                return
              }
              output = ''
            }
            forgetPendingAiRun(run.promptId)
            setAiBusyKey(null)
            toast.error(
              t('learning.output.aiFailed', {
                message:
                  error instanceof Error ? error.message : t('learning.output.aiUnknownError')
              })
            )
            return
          }

          const promptLabel = t(`learning.output.aiActions.${pending.kind}`)
          setDocument((current) => {
            const existing = pending.blockId
              ? current.blocks.find((block) => block.id === pending.blockId)
              : undefined
            let generated = existing
              ? applyAiResultToStudyBlock(existing, output, promptLabel)
              : createStudyBlockFromAiResult(pending.kind, output, promptLabel)
            if (generated.kind === 'quote') {
              generated = { ...generated, sourceUrl: generated.sourceUrl ?? sourceUrl ?? undefined }
            }
            const blocks = existing
              ? current.blocks.map((block) => (block.id === existing.id ? generated : block))
              : [...current.blocks, generated]
            return { ...current, blocks }
          })
          forgetPendingAiRun(run.promptId)
          setAiBusyKey(null)
          setView('document')
          toast.success(t('learning.output.aiGenerated', { type: promptLabel }))
        })().catch((error) => {
          forgetPendingAiRun(run.promptId)
          setAiBusyKey(null)
          logger.error('Failed to apply AI-generated learning block', error)
          toast.error(
            t('learning.output.aiFailed', {
              message: error instanceof Error ? error.message : t('learning.output.aiUnknownError')
            })
          )
        })
        return
      }
      if (run.status !== 'completed') {
        return
      }
      window.setTimeout(() => {
        void ipcServices.learning
          .get(downloadId)
          .then((saved) => {
            if (!saved) {
              return
            }
            notebookRef.current = saved
            setNotebook(saved)
            setDocument((current) => ({
              ...current,
              blocks: blocksWithAiArtifacts(current.blocks, saved)
            }))
          })
          .catch((error) => logger.error('Failed to refresh learning AI output', error))
      }, 700)
    }
    const subscription = ipcEvents.on('ai:prompt-run', listener)
    if (loadState === 'ready') {
      for (const promptId of pendingAiRunsRef.current.keys()) {
        void ipcServices.ai
          .getPromptRun({ downloadId, promptId })
          .then((snapshot) => listener(snapshot))
          .catch((error) => logger.error('Failed to restore pending learning AI output', error))
      }
    }
    return () => {
      ipcEvents.removeListener('ai:prompt-run', subscription)
    }
  }, [downloadId, forgetPendingAiRun, i18n.language, loadState, rememberPendingAiRun, sourceUrl, t])

  useEffect(() => {
    if (!quoteDraft.quote && fallbackQuote) {
      setQuoteDraft((current) => ({ ...current, quote: fallbackQuote }))
    }
  }, [fallbackQuote, quoteDraft.quote])

  useEffect(() => {
    if (!selectedQuote?.text.trim()) {
      return
    }
    if (selectionIntent === 'reflection') {
      const selectionKey = `${selectedQuote.startMs}:${selectedQuote.endMs ?? ''}:${selectedQuote.text}`
      if (lastReflectionSelectionRef.current !== selectionKey) {
        lastReflectionSelectionRef.current = selectionKey
        void startAiGeneration('reflection', undefined, selectedQuote)
      }
      setView('document')
      return
    }
    setQuoteDraft((current) => ({
      ...current,
      quote: selectedQuote.text.trim(),
      timestampLabel: formatLearningClock(selectedQuote.startMs)
    }))
    setView('quote-card')
  }, [selectedQuote, selectionIntent, startAiGeneration])

  useEffect(() => {
    if (!(companionCapture?.action === 'frame' && companionCapture.screenshotDataUrl)) {
      return
    }
    const blockId = `companion-frame-${Math.round(companionCapture.currentTimeSeconds * 1000)}`
    setDocument((current) => {
      if (current.blocks.some((block) => block.id === blockId)) {
        return current
      }
      return {
        ...current,
        blocks: [
          ...current.blocks,
          createStudyNoteBlock('screenshot', {
            alt: companionCapture.title,
            caption: companionCapture.selectedText || companionCapture.captionText,
            id: blockId,
            imageSrc: companionCapture.screenshotDataUrl ?? '',
            sourceUrl: companionCapture.pageUrl,
            timestampMs: companionCapture.currentTimeSeconds * 1000
          })
        ]
      }
    })
    setView('document')
  }, [companionCapture])

  useEffect(() => {
    if (!hydrated.current) {
      return
    }
    const timer = window.setTimeout(() => {
      void ipcServices.learning
        .save({
          blocks: document.blocks.map(mapStudyBlock),
          downloadId,
          scene: 'output',
          sourceUrl: sourceUrl ?? undefined,
          title: document.title
        })
        .then((saved) => {
          notebookRef.current = saved
          setNotebook(saved)
        })
        .catch((error) => {
          logger.error('Failed to save visual learning document', error)
          toast.error(t('learning.saveFailed'))
        })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [document, downloadId, sourceUrl, t])

  useEffect(
    () => () => {
      if (!hydrated.current) {
        return
      }
      const latest = documentRef.current
      void ipcServices.learning
        .save({
          blocks: latest.blocks.map(mapStudyBlock),
          downloadId,
          scene: 'output',
          sourceUrl: sourceUrl ?? undefined,
          title: latest.title
        })
        .catch((error) => logger.error('Failed to flush learning document on navigation', error))
    },
    [downloadId, sourceUrl]
  )

  const editorLabels = useMemo<StudyBlockEditorLabels>(
    () => ({
      addBlock: t('learning.output.addBlock'),
      aiActions: {
        ai: t('learning.output.aiActions.ai'),
        mermaid: t('learning.output.aiActions.mermaid'),
        paragraph: t('learning.output.aiActions.paragraph'),
        question: t('learning.output.aiActions.question'),
        quote: t('learning.output.aiActions.quote'),
        reflection: t('learning.output.aiActions.reflection'),
        screenshot: t('learning.output.aiActions.screenshot')
      },
      aiFailed: t('learning.output.aiFailed'),
      aiGenerate: t('learning.output.aiGenerate'),
      aiGenerating: t('learning.output.aiGenerating'),
      aiRegenerate: t('learning.output.aiRegenerate'),
      blockKinds: {
        ai: t('learning.output.blockKinds.ai'),
        mermaid: t('learning.output.blockKinds.mermaid'),
        paragraph: t('learning.output.blockKinds.paragraph'),
        question: t('learning.output.blockKinds.question'),
        quote: t('learning.output.blockKinds.quote'),
        reflection: t('learning.output.blockKinds.reflection'),
        screenshot: t('learning.output.blockKinds.screenshot')
      },
      blockDeleted: t('learning.output.blockDeleted'),
      deleteBlock: t('learning.output.deleteBlock'),
      emptyDescription: t('learning.output.emptyDescription'),
      emptyTitle: t('learning.output.emptyTitle'),
      fields: {
        alt: t('learning.output.fields.alt'),
        caption: t('learning.output.fields.caption'),
        content: t('learning.output.fields.content'),
        imageSrc: t('learning.output.fields.imageSrc'),
        mermaid: t('learning.output.fields.mermaid'),
        model: t('learning.output.fields.model'),
        note: t('learning.output.fields.note'),
        prompt: t('learning.output.fields.prompt'),
        quote: t('learning.output.fields.quote'),
        resolved: t('learning.output.fields.resolved'),
        sourceUrl: t('learning.output.fields.sourceUrl'),
        timestamp: t('learning.output.fields.timestamp'),
        title: t('learning.output.fields.title')
      },
      markdownPreview: t('learning.output.markdownPreview'),
      mermaidPreview: t('learning.output.mermaidPreview'),
      mermaidSource: t('learning.output.mermaidSource'),
      moveDown: t('learning.output.moveDown'),
      moveUp: t('learning.output.moveUp'),
      title: t('learning.output.documentTitle'),
      undoDelete: t('learning.output.undoDelete')
    }),
    [t]
  )

  const exportObsidian = async (force = false) => {
    const savedNotebook = await ipcServices.learning.save({
      blocks: document.blocks.map(mapStudyBlock),
      downloadId,
      scene: 'output',
      sourceUrl: sourceUrl ?? undefined,
      title: document.title
    })
    const vaultPath = conflictVault ?? (await ipcServices.fs.selectDirectory())
    if (!vaultPath) {
      return
    }
    try {
      const obsidianExport = buildObsidianNotebook(savedNotebook)
      const result = await ipcServices.learning.writeObsidian({
        attachments: obsidianExport.attachments,
        expectedManagedHash: savedNotebook.obsidian?.managedHash,
        force,
        notebook: obsidianExport.notebook,
        relativePath: savedNotebook.obsidian?.relativePath ?? undefined,
        vaultPath
      })
      if (result.status === 'conflict') {
        setConflictVault(vaultPath)
        toast.warning(t('learning.output.obsidianConflict'))
        return
      }
      setConflictVault(null)
      const exportedNotebook = await ipcServices.learning.save({
        downloadId,
        obsidian: {
          lastExportedAt: Date.now(),
          managedHash: result.managedHash,
          relativePath: result.relativePath
        }
      })
      notebookRef.current = exportedNotebook
      setNotebook(exportedNotebook)
      toast.success(t('learning.output.obsidianWritten', { path: result.relativePath }))
      void ipcServices.fs.openFileLocation(result.absolutePath)
    } catch (error) {
      logger.error('Failed to export learning document to Obsidian', error)
      toast.error(t('learning.output.obsidianFailed'))
    }
  }

  const quoteLabels = {
    aspect: t('learning.output.quote.aspect'),
    aspects: {
      portrait: t('learning.output.quote.aspects.portrait'),
      square: t('learning.output.quote.aspects.square'),
      story: t('learning.output.quote.aspects.story')
    },
    brand: t('learning.output.quote.brand'),
    export: t('learning.output.quote.export'),
    exportFailed: t('learning.output.quote.exportFailed'),
    exporting: t('learning.output.quote.exporting'),
    fields: {
      imageSrc: t('learning.output.fields.imageSrc'),
      quote: t('learning.output.fields.quote'),
      reflection: t('learning.output.blockKinds.reflection'),
      signature: t('learning.output.quote.signature'),
      sourceAuthor: t('learning.output.quote.sourceAuthor'),
      sourceTitle: t('learning.output.quote.sourceTitle'),
      timestamp: t('learning.output.fields.timestamp')
    },
    fontScale: t('learning.output.quote.fontScale'),
    fontScales: {
      balanced: t('learning.output.quote.fontScales.balanced'),
      compact: t('learning.output.quote.fontScales.compact'),
      large: t('learning.output.quote.fontScales.large')
    },
    insightLabel: t('learning.output.blockKinds.reflection'),
    preview: t('learning.output.quote.preview'),
    showBrand: t('learning.output.quote.showBrand'),
    showSource: t('learning.output.quote.showSource'),
    template: t('learning.output.quote.template'),
    templates: {
      quote: t('learning.output.quote.templates.quote'),
      'quote-reflection': t('learning.output.quote.templates.quote-reflection'),
      'visual-quote': t('learning.output.quote.templates.visual-quote')
    },
    theme: t('learning.output.quote.theme'),
    themes: {
      forest: t('learning.output.quote.themes.forest'),
      ink: t('learning.output.quote.themes.ink'),
      paper: t('learning.output.quote.themes.paper')
    },
    videoNoteLabel: t('learning.output.documentTitle')
  }

  if (loadState === 'loading') {
    return <div className="p-6 text-muted-foreground text-sm">{t('learning.loading')}</div>
  }

  if (loadState === 'error') {
    return (
      <div
        aria-live="assertive"
        className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
        role="alert"
      >
        <p className="max-w-md text-muted-foreground text-sm">{t('learning.loadFailed')}</p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)} variant="outline">
          {t('learning.retryLoad')}
        </Button>
      </div>
    )
  }

  return (
    <div className="learning-output-pane flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-border/60 border-b px-3 py-2">
        <Button
          aria-pressed={view === 'document'}
          onClick={() => setView('document')}
          variant={view === 'document' ? 'default' : 'ghost'}
        >
          <FileText /> {t('learning.output.document')}
        </Button>
        <Button
          aria-pressed={view === 'quote-card'}
          onClick={() => setView('quote-card')}
          variant={view === 'quote-card' ? 'default' : 'ghost'}
        >
          <Image /> {t('learning.output.quoteCard')}
        </Button>
        <div className="ml-auto flex gap-2">
          {conflictVault ? (
            <Button onClick={() => void exportObsidian(true)} variant="destructive">
              <RefreshCw /> {t('learning.output.overwriteObsidian')}
            </Button>
          ) : null}
          <Button onClick={() => void exportObsidian()} variant="outline">
            <FileDown /> {t('learning.output.exportObsidian')}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {view === 'document' ? (
          <StudyBlockEditor
            aiBusyKey={aiBusyKey}
            className="h-full"
            document={document}
            labels={editorLabels}
            markdownLabels={{
              ai: t('learning.output.blockKinds.ai'),
              question: t('learning.output.blockKinds.question'),
              reflection: t('learning.output.blockKinds.reflection'),
              source: t('learning.output.source')
            }}
            onAiGenerate={(kind, block) => void startAiGeneration(kind, block, selectedQuote)}
            onChange={setDocument}
            onSeek={onSeek}
          />
        ) : (
          <QuoteCardStudio
            brandName={t('learning.appName')}
            className="h-full"
            draft={quoteDraft}
            labels={quoteLabels}
            onChange={setQuoteDraft}
            onExportError={(error) => logger.error('Failed to export quote card', error)}
            onExportPng={async (blob, fileName) => {
              const result = await ipcServices.fs.saveBinaryFile({
                data: await blob.arrayBuffer(),
                defaultFileName: fileName
              })
              if (result) {
                toast.success(t('learning.output.quote.exported'))
                void ipcServices.fs.openFileLocation(result.path)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
