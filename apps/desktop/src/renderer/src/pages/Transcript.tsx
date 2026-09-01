import { LearningNotebookPane } from '@renderer/components/learning/LearningNotebookPane'
import {
  LEARNING_TRANSLATION_LANGUAGES,
  LearningTranscriptPane,
  type LearningTranscriptView,
  type LearningTranslationLanguage
} from '@renderer/components/learning/LearningTranscriptPane'
import { LearningWorkbenchPane } from '@renderer/components/learning/LearningWorkbenchPane'
import { StudyStudio } from '@renderer/components/study-studio/StudyStudio'
import { AsrUpgradeDialog } from '@renderer/components/transcript/AsrUpgradeDialog'
import { SpeakerCountDialog } from '@renderer/components/transcript/SpeakerCountDialog'
import { TranscriptExportDialog } from '@renderer/components/transcript/TranscriptExportDialog'
import {
  fileNameFromPath,
  type TranscriptInfoFields
} from '@renderer/components/transcript/TranscriptInfoPane'
import { TranscriptPlaybackSlot } from '@renderer/components/transcript/TranscriptPlaybackSlot'
import { TranscriptPlaybackStandby } from '@renderer/components/transcript/TranscriptPlaybackStandby'
import { TranscriptSourceSwitch } from '@renderer/components/transcript/TranscriptSourceSwitch'
import { TranscriptSpeakersPane } from '@renderer/components/transcript/TranscriptSpeakersPane'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { DesktopChromeContext, useTitleBar } from '@renderer/desktop-chrome'
import { useCachedThumbnail } from '@renderer/hooks/use-cached-thumbnail'
import {
  automaticMermaidRepairStorageKey,
  rememberAutomaticMermaidRepairAttempt,
  wasAutomaticMermaidRepairAttempted
} from '@renderer/lib/automatic-mermaid-repair'
import { validateGeneratedLearningMermaid } from '@renderer/lib/beautiful-mermaid-plugin'
import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { parseGeneratedLearningMermaid } from '@renderer/lib/study-studio/ai-generation'
import type {
  StudyScene,
  StudyStudioLabels,
  TranscriptSelection,
  TranscriptSelectionAction
} from '@renderer/lib/study-studio/types'
import { applyTranscriptCorrectionOverlay } from '@renderer/lib/transcript-correction-overlay'
import { segmentAtTime } from '@renderer/lib/transcript-index'
import {
  isInProgressTranscript,
  isListedTranscript,
  resolveTranscriptWorkspaceView,
  shouldAutoStartAsr,
  transcriptProgressLabelKey
} from '@renderer/lib/transcript-library'
import { resolveMediaDurationMs } from '@renderer/lib/transcript-speakers'
import {
  type PartialTranscriptRow,
  speakersFromSegments,
  toPartialSegmentViews
} from '@renderer/lib/transcript-stream'
import { useTranscriptModelPrep } from '@renderer/store/transcript-models'
import {
  ensurePlaybackSessionAtom,
  playbackClockAtom,
  playbackControlsAtom,
  playbackPresentationAtom,
  playbackSessionAtom,
  releaseIdlePlaybackAtom,
  takePlaybackSessionAtom
} from '@renderer/store/transcript-playback'
import {
  type TranscriptSegmentView,
  type TranscriptSnapshotView,
  type TranscriptSpeakerView,
  upsertTranscriptAtom
} from '@renderer/store/transcripts'
import { buildPromptTranscriptText } from '@shared/ai-prompt-text'
import type { AiPromptRunSnapshot } from '@shared/ai-types'
import type { CompanionCapturePayload } from '@shared/companion-types'
import type {
  LearningAiArtifactKind,
  LearningAiWorkflowId,
  LearningTranscriptOverlay
} from '@shared/learning-types'
import {
  LEARNING_AI_PROMPT_METADATA,
  learningWorkflowIdForPrompt
} from '@shared/learning-workflow/ai-prompts'
import { useNavigate, useParams } from '@tanstack/react-router'
import { DragRegion, NoDrag } from '@vidbee/ui/components/ui/drag-region'
import {
  downloadPlatformDisplayLabel,
  resolveDownloadPlatform
} from '@vidbee/ui/lib/download-platform'
import { mediaKindFromName } from '@vidbee/ui/lib/ingest'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  Camera,
  Captions,
  ChevronLeft,
  Languages,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Sparkles
} from 'lucide-react'
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  getCodecLabel,
  getFormatLabel,
  getQualityLabel
} from '../components/download/download-item-utils'
import { type DownloadRecord, downloadRecordsAtom } from '../store/downloads'

const EMPTY_SEGMENTS: TranscriptSegmentView[] = []
const EMPTY_SPEAKERS: TranscriptSpeakerView[] = []
const WIDE_LAYOUT_QUERY = '(min-width: 1024px)'

const AI_ARTIFACT_KIND_BY_WORKFLOW: Record<LearningAiWorkflowId, LearningAiArtifactKind> = {
  mindmap: 'mindmap',
  'quote-candidates': 'quotes',
  reflection: 'reflection',
  summary: 'summary',
  translation: 'translation'
}

/**
 * Map a download record onto Info tab fields that used to live in the details drawer.
 */
const downloadFieldsForInfo = (
  download: DownloadRecord | null,
  t: (key: string, options?: Record<string, unknown>) => string
): Partial<TranscriptInfoFields> => {
  if (!download) {
    return {}
  }
  const platform = resolveDownloadPlatform(download.url)
  const format = download.selectedFormat
  const quality = getQualityLabel(download)
  const playlistTitle = download.playlistTitle || download.playlistId
  const playlist = playlistTitle
    ? `${download.playlistTitle || t('playlist.untitled')}${
        download.playlistIndex !== undefined && download.playlistSize !== undefined
          ? ` ${t('playlist.positionLabel', {
              index: download.playlistIndex,
              total: download.playlistSize
            })}`
          : ''
      }`
    : null
  return {
    audioCodec: format?.acodec && format.acodec !== 'none' ? format.acodec : null,
    codec: getCodecLabel(download) ?? null,
    completedAt: download.completedAt ?? null,
    description: download.description ?? null,
    downloadPath: download.downloadPath ?? null,
    downloadedAt: download.completedAt ?? download.downloadedAt ?? download.createdAt ?? null,
    format: getFormatLabel(download) ?? null,
    formatNote: format?.format_note ?? null,
    fps: format?.fps ? String(format.fps) : null,
    platformDomain: platform.domain,
    platformLabel: downloadPlatformDisplayLabel(platform, {
      local: t('download.localSource'),
      other: t('download.otherSource')
    }),
    playlist,
    protocol: format?.protocol ? format.protocol.toUpperCase() : null,
    quality: quality ?? null,
    startedAt: download.startedAt ?? null,
    subscription:
      download.origin === 'subscription'
        ? (download.subscriptionId ?? t('subscriptions.labels.unknown'))
        : null,
    tags: download.tags && download.tags.length > 0 ? download.tags.join(', ') : null,
    videoCodec: format?.vcodec && format.vcodec !== 'none' ? format.vcodec : null,
    views: download.viewCount == null ? null : download.viewCount.toLocaleString(),
    width: format?.width && !quality ? `${format.width}px` : null
  }
}

/**
 * Track whether the transcript workspace has room for a side-by-side layout.
 *
 * @returns True when the window is at the `lg` breakpoint or wider.
 */
const useWideTranscriptLayout = (): boolean => {
  const [isWide, setIsWide] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(WIDE_LAYOUT_QUERY).matches
  )

  useEffect(() => {
    const media = window.matchMedia(WIDE_LAYOUT_QUERY)
    const sync = (): void => {
      setIsWide(media.matches)
    }
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [])

  return isWide
}

interface TranscriptHeaderProps {
  backLabel: string
  canExport: boolean
  canForce: boolean
  canUpgrade: boolean
  captionsCollapsed: boolean
  collapseLabel: string
  expandLabel: string
  exportLabel: string
  failed: boolean
  onBack: () => void
  onExport: () => void
  onForce: () => void
  onRetry: () => void
  onToggleCaptions: () => void
  onUpgrade: () => void
  retryLabel: string
  sourceKind?: 'asr' | 'captions' | null
  sourceLabel?: string
  sourceSwitch?: ReactNode
  stillTranscribeLabel: string
  showCaptionsToggle?: boolean
  title: string
  upgradeLabel: string
}

/**
 * Caption / AI source mark: icon only, source name in a tooltip.
 */
function TranscriptSourceIcon({
  sourceKind,
  sourceLabel
}: Pick<TranscriptHeaderProps, 'sourceKind' | 'sourceLabel'>) {
  const icon =
    sourceKind === 'captions' ? (
      <Captions className="block size-4 text-muted-foreground" />
    ) : sourceKind === 'asr' ? (
      <Sparkles className="block size-4 text-amber-600 dark:text-amber-400" />
    ) : null
  if (!icon) {
    return null
  }
  if (!sourceLabel) {
    return (
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={sourceLabel}
          className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{sourceLabel}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Compact document header hosted in the window drag region.
 */
function TranscriptHeader({
  backLabel,
  canExport,
  canForce,
  canUpgrade,
  captionsCollapsed,
  collapseLabel,
  expandLabel,
  exportLabel,
  failed,
  onBack,
  onExport,
  onForce,
  onRetry,
  onToggleCaptions,
  onUpgrade,
  retryLabel,
  sourceKind,
  sourceLabel,
  sourceSwitch,
  stillTranscribeLabel,
  showCaptionsToggle = true,
  title,
  upgradeLabel
}: TranscriptHeaderProps) {
  return (
    <>
      <NoDrag className="inline-flex items-center">
        <Button
          aria-label={backLabel}
          className="h-8 w-8"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft className="block size-4" />
        </Button>
      </NoDrag>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {!sourceSwitch && (sourceKind === 'captions' || sourceKind === 'asr') ? (
          <NoDrag className="inline-flex items-center">
            <TranscriptSourceIcon sourceKind={sourceKind} sourceLabel={sourceLabel} />
          </NoDrag>
        ) : null}
        <h1 className="truncate font-semibold text-sm leading-none">{title}</h1>
      </div>
      <NoDrag className="flex shrink-0 items-center gap-1.5">
        {sourceSwitch}
        {canExport ? (
          <>
            {canUpgrade ? (
              <Button onClick={onUpgrade} size="sm" variant="ghost">
                {upgradeLabel}
              </Button>
            ) : null}
            <Button onClick={onExport} size="sm" variant="outline">
              {exportLabel}
            </Button>
          </>
        ) : null}
        {showCaptionsToggle ? (
          <Button
            aria-label={captionsCollapsed ? expandLabel : collapseLabel}
            className="h-8 w-8"
            onClick={onToggleCaptions}
            size="icon"
            type="button"
            variant="ghost"
          >
            {captionsCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
          </Button>
        ) : null}
        {failed ? (
          <Button onClick={onRetry} size="sm">
            <RotateCw />
            {retryLabel}
          </Button>
        ) : null}
        {canForce ? (
          <Button onClick={onForce} size="sm">
            <Sparkles />
            {stillTranscribeLabel}
          </Button>
        ) : null}
      </NoDrag>
    </>
  )
}

export function TranscriptPage() {
  const { downloadId } = useParams({ from: '/downloads/$downloadId/transcript' })
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const chrome = useContext(DesktopChromeContext)
  const isWide = useWideTranscriptLayout()
  const records = useAtomValue(downloadRecordsAtom)
  const upsert = useSetAtom(upsertTranscriptAtom)
  const modelPrep = useTranscriptModelPrep()
  const [snapshot, setSnapshot] = useState<TranscriptSnapshotView | null>(null)
  const [learningTranscript, setLearningTranscript] = useState<LearningTranscriptOverlay | null>(
    null
  )
  const [exportOpen, setExportOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [speakerCountOpen, setSpeakerCountOpen] = useState(false)
  const [partials, setPartials] = useState<TranscriptSegmentView[]>(EMPTY_SEGMENTS)
  const [studyScene, setStudyScene] = useState<StudyScene>(() => {
    const saved = window.localStorage.getItem(`fengsha-study-scene:${downloadId}`)
    return saved === 'note' || saved === 'output' ? saved : 'watch'
  })
  const [pendingNoteCapture, setPendingNoteCapture] = useState<{
    id: string
    kind: 'bookmark'
    quote: string
    text: string
    timestampMs: number
  } | null>(null)
  const [outputSelection, setOutputSelection] = useState<TranscriptSelection | null>(null)
  const [outputSelectionIntent, setOutputSelectionIntent] = useState<
    'quote-card' | 'reflection' | null
  >(null)
  const [outputSelectionDownloadId, setOutputSelectionDownloadId] = useState<string | null>(null)
  const [learningTranscriptView, setLearningTranscriptView] =
    useState<LearningTranscriptView>('original')
  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [translationLanguage, setTranslationLanguage] = useState<LearningTranslationLanguage>(
    () => {
      const saved = window.localStorage.getItem('fengsha-learning-translation-language')
      return saved && saved in LEARNING_TRANSLATION_LANGUAGES
        ? (saved as LearningTranslationLanguage)
        : 'zh-CN'
    }
  )
  const [bilingualTranslation, setBilingualTranslation] = useState(true)
  const [companionCapture, setCompanionCapture] = useState<CompanionCapturePayload | null>(null)
  const session = useAtomValue(playbackSessionAtom)
  const clock = useAtomValue(playbackClockAtom)
  const controls = useAtomValue(playbackControlsAtom)
  const ensureSession = useSetAtom(ensurePlaybackSessionAtom)
  const takeSession = useSetAtom(takePlaybackSessionAtom)
  const releaseIdle = useSetAtom(releaseIdlePlaybackAtom)
  const setPresentation = useSetAtom(playbackPresentationAtom)
  const hadListedTranscript = useRef(false)
  const handledCompanionCapturesRef = useRef(new Set<string>())
  const automaticAiRunKeysRef = useRef(new Set<string>())

  useEffect(() => {
    window.localStorage.setItem('fengsha-learning-translation-language', translationLanguage)
  }, [translationLanguage])

  useEffect(() => {
    if (downloadId) {
      setOutputSelection(null)
      setOutputSelectionIntent(null)
      setOutputSelectionDownloadId(null)
      setLearningTranscriptView('original')
    }
  }, [downloadId])
  const selectStudyScene = useCallback(
    (scene: StudyScene) => {
      setStudyScene(scene)
      window.localStorage.setItem(`fengsha-study-scene:${downloadId}`, scene)
    },
    [downloadId]
  )

  const download = useMemo(() => {
    for (const record of records.values()) {
      if (record.id === downloadId) {
        return record
      }
    }
    return null
  }, [downloadId, records])

  const refresh = useCallback(async () => {
    let next = (await ipcServices.transcript.getForDownload(downloadId)) as TranscriptSnapshotView
    if (shouldAutoStartAsr(next)) {
      try {
        next = (await ipcServices.transcript.start({ downloadId })) as TranscriptSnapshotView
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
      }
    }
    if (isListedTranscript(next.listState)) {
      hadListedTranscript.current = true
    }
    setSnapshot(next)
    upsert(next)
  }, [downloadId, t, upsert])

  useEffect(() => {
    hadListedTranscript.current = false
    void refresh()
    const offUpdated = ipcEvents.on('transcript:updated', (...args: unknown[]) => {
      const next = args[0] as TranscriptSnapshotView
      if (next?.downloadTaskId !== downloadId) {
        return
      }
      if (isListedTranscript(next.listState)) {
        hadListedTranscript.current = true
      }
      setSnapshot(next)
      upsert(next)
      if (hadListedTranscript.current && next.listState === 'none') {
        void navigate({ to: '/' })
      }
    })
    const offPartial = ipcEvents.on('transcript:partial', (...args: unknown[]) => {
      const payload = args[0] as {
        downloadTaskId?: string
        segments?: PartialTranscriptRow[]
      }
      if (payload?.downloadTaskId !== downloadId || !payload.segments) {
        return
      }
      setPartials(toPartialSegmentViews(payload.segments))
    })
    return () => {
      ipcEvents.removeListener('transcript:updated', offUpdated as (...args: unknown[]) => void)
      ipcEvents.removeListener('transcript:partial', offPartial as (...args: unknown[]) => void)
    }
  }, [downloadId, navigate, refresh, upsert])

  useEffect(() => {
    if (!(snapshot?.listState && isInProgressTranscript(snapshot.listState))) {
      return
    }
    void ipcServices.transcript.getPartials(downloadId).then((rows) => {
      setPartials(toPartialSegmentViews(rows as PartialTranscriptRow[]))
    })
  }, [downloadId, snapshot?.listState])

  const committedSegments = snapshot?.record?.segments ?? EMPTY_SEGMENTS
  const selectedSourceKind =
    snapshot?.sources?.find((source) => source.selected)?.kind ?? snapshot?.sourceKind ?? null
  const viewingCaptions = selectedSourceKind === 'captions'
  const workspace = resolveTranscriptWorkspaceView({
    committed: committedSegments,
    hasRecord: Boolean(snapshot?.record),
    listState: snapshot?.listState ?? 'none',
    partials,
    rediarize: snapshot?.rediarize,
    viewingCaptions
  })
  const running = workspace.running
  const streamLive = workspace.streamLive
  const rawSegments = workspace.segments
  const segments = useMemo(() => {
    if (!learningTranscript) {
      return rawSegments
    }
    const sourceSegments =
      rawSegments.length > 0
        ? rawSegments
        : learningTranscript.segments.map(
            (segment, sortIndex): TranscriptSegmentView => ({
              confidence: null,
              endMs: segment.endMs,
              id: segment.id,
              sortIndex,
              speakerId: segment.speakerId,
              startMs: segment.startMs,
              text: segment.originalText
            })
          )
    return applyTranscriptCorrectionOverlay(sourceSegments, learningTranscript)
  }, [learningTranscript, rawSegments])
  const correctedSegmentIds = useMemo(() => {
    if (!learningTranscript) {
      return new Set<string>()
    }
    return new Set(
      learningTranscript.segments.flatMap((segment) => {
        const latest = learningTranscript.corrections.findLast(
          (correction) => correction.segmentId === segment.id
        )
        return latest && latest.correctedText !== segment.originalText ? [segment.id] : []
      })
    )
  }, [learningTranscript])
  const liveSpeakers = useMemo(() => speakersFromSegments(segments), [segments])
  const speakers =
    snapshot?.record?.speakers && snapshot.record.speakers.length > 0
      ? snapshot.record.speakers
      : liveSpeakers.length > 0
        ? liveSpeakers
        : EMPTY_SPEAKERS
  const speakerName = useCallback(
    (speakerId: string | null): string => {
      if (!speakerId) {
        return t('transcript.unknownSpeaker')
      }
      return (
        speakers.find((speaker) => speaker.id === speakerId || speaker.speakerKey === speakerId)
          ?.displayName ?? t('transcript.unknownSpeaker')
      )
    },
    [speakers, t]
  )
  const speakerColorIndex = useCallback(
    (speakerId: string | null): number | null => {
      if (!speakerId) {
        return null
      }
      return (
        speakers.find((speaker) => speaker.id === speakerId || speaker.speakerKey === speakerId)
          ?.sortIndex ?? null
      )
    },
    [speakers]
  )

  const mediaPath = snapshot?.sourceFilePath
    ? snapshot.sourceFilePath
    : download?.savedFileName && download.downloadPath
      ? `${download.downloadPath}/${download.savedFileName}`
      : null
  const isAudio =
    download?.type === 'audio' ||
    mediaKindFromName(mediaPath ?? '') === 'audio' ||
    mediaKindFromName(download?.savedFileName ?? '') === 'audio'
  const cachedThumbnail = useCachedThumbnail(download?.thumbnail)
  const currentTime = session?.downloadId === downloadId ? clock.currentTime : 0
  const duration = session?.downloadId === downloadId ? clock.duration : 0
  const durationMs = useMemo(
    () => resolveMediaDurationMs(duration * 1000, segments),
    [duration, segments]
  )
  const currentTimeMs = Math.round(currentTime * 1000)
  const currentSegment = useMemo(
    () => segmentAtTime(segments, currentTimeMs),
    [currentTimeMs, segments]
  )
  const title = download?.title ?? t('transcript.title')
  const captureCurrentFrame = useCallback((): void => {
    if (!mediaPath) {
      toast.error(t('learning.captureFrameUnavailable'))
      return
    }
    void (async () => {
      try {
        const screenshotDataUrl = await ipcServices.fs.captureVideoFrame({
          filePath: mediaPath,
          timeSeconds: currentTime
        })
        setCompanionCapture({
          action: 'frame',
          captionCues: currentSegment
            ? [
                {
                  endSeconds: currentSegment.endMs / 1000,
                  startSeconds: currentSegment.startMs / 1000,
                  text: currentSegment.text
                }
              ]
            : [],
          captionLanguage: snapshot?.record?.language ?? null,
          captionText: currentSegment?.text ?? '',
          currentTimeSeconds: currentTime,
          durationSeconds: duration || null,
          pageUrl:
            download?.url ?? `https://local.fengsha.invalid/${encodeURIComponent(downloadId)}`,
          platform: 'other',
          screenshotDataUrl,
          selectedText: '',
          title
        })
        selectStudyScene('output')
        toast.success(t('learning.frameCaptured'))
      } catch (error) {
        logger.warn('Failed to capture the current video frame', error)
        toast.error(t('learning.captureFrameUnavailable'))
      }
    })()
  }, [
    currentSegment,
    currentTime,
    download?.url,
    downloadId,
    duration,
    mediaPath,
    selectStudyScene,
    snapshot?.record?.language,
    t,
    title
  ])
  const ensureLearningTranscript = useCallback(async (): Promise<LearningTranscriptOverlay> => {
    const existing = await ipcServices.learning.get(downloadId)
    const existingTranscript = existing?.transcript ?? null
    const sameSource =
      existingTranscript &&
      (rawSegments.length === 0 ||
        (existingTranscript.segments.length === rawSegments.length &&
          rawSegments.every(
            (segment, index) => existingTranscript.segments[index]?.id === segment.id
          )))
    if (existingTranscript && sameSource) {
      setLearningTranscript(existingTranscript)
      return existingTranscript
    }
    const now = Date.now()
    const transcript: LearningTranscriptOverlay = {
      corrections: [],
      segments: rawSegments.map((segment) => ({
        endMs: segment.endMs,
        id: segment.id,
        originalText: segment.text,
        speakerId: segment.speakerId,
        startMs: segment.startMs,
        translatedText: ''
      })),
      sourceVersionId: `${downloadId}:${snapshot?.record?.createdAt ?? snapshot?.updatedAt ?? now}`,
      updatedAt: now,
      version: 1
    }
    const saved = await ipcServices.learning.save({
      downloadId,
      source: existing?.source ?? {
        author: download?.channel ?? download?.uploader ?? '',
        canonicalUrl: download?.url ?? null,
        durationMs,
        platform: resolveDownloadPlatform(download?.url ?? '').key,
        thumbnailUrl: download?.thumbnail ?? null,
        title
      },
      sourceUrl: download?.url ?? null,
      title,
      transcript
    })
    if (!saved.transcript) {
      throw new Error('Learning transcript could not be initialized')
    }
    setLearningTranscript(saved.transcript)
    return saved.transcript
  }, [
    download,
    downloadId,
    durationMs,
    rawSegments,
    snapshot?.record?.createdAt,
    snapshot?.updatedAt,
    title
  ])

  useEffect(() => {
    if (running) {
      return
    }
    if (rawSegments.length === 0) {
      void ipcServices.learning
        .get(downloadId)
        .then((saved) => setLearningTranscript(saved?.transcript ?? null))
        .catch((error) => logger.error('Failed to restore the learning transcript', error))
      return
    }
    void ensureLearningTranscript().catch((error) =>
      logger.error('Failed to initialize non-destructive transcript history', error)
    )
  }, [downloadId, ensureLearningTranscript, rawSegments.length, running])

  const correctLearningSegment = useCallback(
    async (segmentId: string, text: string): Promise<void> => {
      await ensureLearningTranscript()
      const saved = await ipcServices.learning.applyCorrection({
        correctedText: text,
        downloadId,
        reason: 'manual',
        segmentId
      })
      setLearningTranscript(saved.transcript ?? null)
      toast.success(t('learning.corrections.saved'))
    },
    [downloadId, ensureLearningTranscript, t]
  )

  const restoreLearningSegment = useCallback(
    async (segmentId: string): Promise<void> => {
      const saved = await ipcServices.learning.restoreCorrection({
        correctionId: null,
        downloadId,
        segmentId
      })
      setLearningTranscript(saved.transcript ?? null)
      toast.success(t('learning.corrections.restored'))
    },
    [downloadId, t]
  )

  const persistLearningAiArtifact = useCallback(
    async (run: AiPromptRunSnapshot): Promise<void> => {
      if (run.downloadId !== downloadId || run.status !== 'completed' || !run.text.trim()) {
        return
      }
      const workflowId = learningWorkflowIdForPrompt(run.promptId)
      if (!workflowId) {
        return
      }
      const [settings, notebook, aiSnapshot] = await Promise.all([
        ipcServices.learning.getAiSettings(),
        ipcServices.learning.get(downloadId),
        ipcServices.ai.getSnapshot()
      ])
      if (!notebook) {
        return
      }
      const prompt = settings.prompts.find((item) => item.id === workflowId)
      if (!prompt) {
        return
      }
      if (
        (notebook.transcript?.updatedAt ?? 0) > run.startedAt ||
        prompt.updatedAt > run.startedAt
      ) {
        logger.info('Ignoring stale learning AI result', {
          downloadId,
          promptId: run.promptId,
          runStartedAt: run.startedAt
        })
        return
      }
      const transcriptVersion = notebook.transcript?.version ?? 1
      const repairKey = automaticMermaidRepairStorageKey(
        downloadId,
        run.promptId,
        transcriptVersion,
        prompt.version
      )
      let artifactContent = run.text.trim()
      if (workflowId === 'mindmap') {
        try {
          const code = parseGeneratedLearningMermaid(artifactContent)
          await validateGeneratedLearningMermaid(code)
          artifactContent = `\`\`\`mermaid\n${code}\n\`\`\``
          rememberAutomaticMermaidRepairAttempt(window.localStorage, repairKey, false)
        } catch (error) {
          if (wasAutomaticMermaidRepairAttempted(window.localStorage, repairKey)) {
            throw error
          }
          rememberAutomaticMermaidRepairAttempt(window.localStorage, repairKey, true)
          const transcriptText = buildPromptTranscriptText(segments, speakerName)
          const message = error instanceof Error ? error.message : String(error)
          await ipcServices.ai.startPrompt({
            downloadId,
            promptId: run.promptId,
            promptContent: prompt.systemPrompt,
            transcriptText: `${transcriptText}\n\nAI_GENERATED_DRAFT (repair this data):\n${run.text}\n\nRENDER_ERROR:\n${message}`,
            uiLanguage: i18n.language
          })
          return
        }
      }
      const artifactId = `ai:${workflowId}:${run.updatedAt}`
      if (notebook.aiArtifacts?.some((artifact) => artifact.id === artifactId)) {
        return
      }
      const activeProvider = aiSnapshot.providers.find(
        (provider) => provider.id === aiSnapshot.activeProviderId
      )
      try {
        await ipcServices.learning.appendAiArtifact({
          artifact: {
            content: artifactContent,
            createdAt: Date.now(),
            id: artifactId,
            kind: AI_ARTIFACT_KIND_BY_WORKFLOW[workflowId],
            model: activeProvider?.modelId ?? settings.defaultModel,
            prompt: prompt.systemPrompt,
            promptVersion: prompt.version,
            sourceSegmentIds: notebook.transcript?.segments.map((segment) => segment.id) ?? [],
            transcriptVersion
          },
          downloadId
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('already exists')) {
          throw error
        }
      }
    },
    [downloadId, i18n.language, segments, speakerName]
  )

  useEffect(() => {
    const listener = (...args: unknown[]): void => {
      const run = args[0] as AiPromptRunSnapshot | undefined
      if (!run) {
        return
      }
      void persistLearningAiArtifact(run).catch((error) =>
        logger.error('Failed to persist learning AI artifact', error)
      )
    }
    const subscription = ipcEvents.on('ai:prompt-run', listener)
    return () => {
      ipcEvents.removeListener('ai:prompt-run', subscription)
    }
  }, [persistLearningAiArtifact])

  useEffect(() => {
    if (running || segments.length === 0 || !learningTranscript) {
      return
    }
    let active = true
    const runAutomaticWorkflows = async (): Promise<void> => {
      const [settings, notebook, aiSnapshot] = await Promise.all([
        ipcServices.learning.getAiSettings(),
        ipcServices.learning.get(downloadId),
        ipcServices.ai.getSnapshot()
      ])
      if (!(active && notebook && aiSnapshot.activeProviderId)) {
        return
      }
      const transcriptVersion = notebook.transcript?.version ?? 1
      const transcriptText = buildPromptTranscriptText(segments, speakerName)
      for (const rule of settings.workflows) {
        if (!(active && rule.enabled && rule.runOnTranscriptComplete)) {
          continue
        }
        const prompt = settings.prompts.find((item) => item.id === rule.id)
        const metadata = LEARNING_AI_PROMPT_METADATA[rule.id]
        if (!prompt) {
          continue
        }
        const artifactKind = AI_ARTIFACT_KIND_BY_WORKFLOW[rule.id]
        if (
          notebook.aiArtifacts?.some(
            (artifact) =>
              artifact.kind === artifactKind &&
              artifact.promptVersion === prompt.version &&
              artifact.transcriptVersion === transcriptVersion
          )
        ) {
          continue
        }
        const currentRun = await ipcServices.ai.getPromptRun({
          downloadId,
          promptId: metadata.promptId
        })
        if (currentRun.status === 'running') {
          continue
        }
        if (
          currentRun.status === 'completed' &&
          currentRun.startedAt >= (notebook.transcript?.updatedAt ?? 0) &&
          currentRun.startedAt >= prompt.updatedAt
        ) {
          await persistLearningAiArtifact(currentRun)
          continue
        }
        const runKey = `${downloadId}:${metadata.promptId}:${transcriptVersion}:${prompt.version}`
        if (automaticAiRunKeysRef.current.has(runKey)) {
          continue
        }
        automaticAiRunKeysRef.current.add(runKey)
        // A persisted prompt run has no transcript-version key. When the current
        // artifact is missing, always start a fresh run so a corrected or restored
        // transcript cannot silently reuse an answer produced from older text.
        await ipcServices.ai.startPrompt({
          downloadId,
          promptId: metadata.promptId,
          promptContent: prompt.systemPrompt,
          transcriptText,
          uiLanguage: i18n.language
        })
      }
    }
    void runAutomaticWorkflows().catch((error) =>
      logger.error('Failed to start automatic learning workflows', error)
    )
    return () => {
      active = false
    }
  }, [
    downloadId,
    i18n.language,
    learningTranscript,
    persistLearningAiArtifact,
    running,
    segments,
    speakerName
  ])
  const subtitle = download?.channel ?? download?.uploader ?? null
  // Renderer CSP blocks remote covers (xyzcdn, etc.); only cached/local URLs are safe.
  const thumbnail = cachedThumbnail ?? null
  useEffect(() => {
    ensureSession({
      downloadId,
      filePath: mediaPath,
      isAudio,
      subtitle,
      thumbnail,
      title
    })
    return () => {
      releaseIdle(downloadId)
    }
  }, [downloadId, ensureSession, isAudio, mediaPath, releaseIdle, subtitle, thumbnail, title])

  const sessionInput = useMemo(
    () => ({
      downloadId,
      filePath: mediaPath,
      isAudio,
      subtitle,
      thumbnail,
      title
    }),
    [downloadId, isAudio, mediaPath, subtitle, thumbnail, title]
  )
  const ownsPlayer = session?.downloadId === downloadId
  useEffect(() => {
    if (!(ownsPlayer && controls)) {
      return
    }
    const key = `fengsha-pending-seek:${downloadId}`
    const pending = Number(window.localStorage.getItem(key))
    if (!Number.isFinite(pending) || pending < 0) {
      return
    }
    let cancelled = false
    let attempts = 0
    const applyPendingSeek = async (): Promise<void> => {
      if (cancelled) {
        return
      }
      try {
        await controls.seek(pending / 1000)
        window.localStorage.removeItem(key)
      } catch (error) {
        attempts += 1
        if (error instanceof Error && error.message === 'NO_TARGET' && attempts < 40) {
          window.setTimeout(() => void applyPendingSeek(), 50)
          return
        }
        logger.warn('Failed to apply pending transcript seek', error)
      }
    }
    void applyPendingSeek()
    return () => {
      cancelled = true
    }
  }, [controls, downloadId, ownsPlayer])
  const seek = useCallback(
    (seconds: number) => {
      if (ownsPlayer && controls) {
        try {
          void Promise.resolve(controls.seek(seconds)).catch((error: unknown) => {
            if (error instanceof Error && error.message === 'NO_TARGET') {
              takeSession({ ...sessionInput, seekTo: seconds })
              return
            }
            logger.warn('Failed to seek transcript playback', error)
          })
          return
        } catch (error) {
          if (!(error instanceof Error && error.message === 'NO_TARGET')) {
            throw error
          }
        }
      }
      takeSession({ ...sessionInput, seekTo: seconds })
    },
    [controls, ownsPlayer, sessionInput, takeSession]
  )

  useEffect(() => {
    const sourceUrl = download?.url
    if (!sourceUrl) {
      return
    }
    const comparableUrl = (value: string): string => {
      try {
        const url = new URL(value)
        url.hash = ''
        url.searchParams.delete('t')
        return url.toString()
      } catch {
        return value
      }
    }
    const applyCapture = (capture: CompanionCapturePayload): void => {
      if (comparableUrl(capture.pageUrl) !== comparableUrl(sourceUrl)) {
        return
      }
      const captureId = `${capture.action}:${capture.pageUrl}:${capture.currentTimeSeconds}:${capture.selectedText}`
      if (handledCompanionCapturesRef.current.has(captureId)) {
        return
      }
      handledCompanionCapturesRef.current.add(captureId)
      seek(capture.currentTimeSeconds)
      if (capture.action === 'frame') {
        setCompanionCapture(capture)
        selectStudyScene('output')
        return
      }
      if (capture.action === 'time-marker') {
        const quote = capture.selectedText || capture.captionText
        setPendingNoteCapture({
          id: `companion-${Date.now()}-${Math.round(capture.currentTimeSeconds * 1000)}`,
          kind: 'bookmark',
          quote,
          text: t('learning.companion.markerNote'),
          timestampMs: capture.currentTimeSeconds * 1000
        })
        selectStudyScene('note')
      }
    }
    const listener = (...args: unknown[]) => {
      const capture = args[0] as CompanionCapturePayload | undefined
      if (capture) {
        applyCapture(capture)
      }
    }
    const subscription = ipcEvents.on('companion:capture', listener)
    try {
      const stored = JSON.parse(
        window.localStorage.getItem('fengsha-companion-captures') ?? '[]'
      ) as unknown
      if (Array.isArray(stored)) {
        const latest = stored.findLast(
          (item): item is CompanionCapturePayload & { receivedAt?: number } =>
            Boolean(item && typeof item === 'object' && 'pageUrl' in item)
        )
        if (latest && latest.action !== 'open') {
          applyCapture(latest)
        }
      }
    } catch (error) {
      logger.warn('Failed to restore browser companion capture', error)
    }
    return () => {
      ipcEvents.removeListener('companion:capture', subscription)
    }
  }, [download?.url, seek, selectStudyScene, t])

  const handleSelectionIntent = useCallback(
    async (action: TranscriptSelectionAction): Promise<void> => {
      const selectedText = action.selection.text.trim()
      if (!selectedText) {
        return
      }
      if (action.intent === 'seek') {
        seek(action.selection.startMs / 1000)
        return
      }
      if (action.intent === 'copy') {
        await navigator.clipboard.writeText(selectedText)
        toast.success(t('learning.copied'))
        return
      }
      if (action.intent === 'highlight') {
        try {
          const now = Date.now()
          await ipcServices.learning.upsertNote({
            downloadId,
            note: {
              completed: false,
              createdAt: now,
              highlightColor: 'amber',
              id: `highlight-${now}-${action.selection.startMs}`,
              kind: 'bookmark',
              quote: selectedText,
              sourceEndOffset: action.selection.sourceEndOffset ?? selectedText.length,
              sourceSegmentIds: action.selection.segmentIds ?? [],
              sourceStartOffset: action.selection.sourceStartOffset ?? 0,
              text: '',
              timestampMs: action.selection.startMs,
              updatedAt: now
            }
          })
          window.dispatchEvent(
            new CustomEvent('learning:notes-changed', { detail: { downloadId } })
          )
          toast.success(t('learning.selection.highlighted'))
        } catch (error) {
          logger.error('Failed to highlight selected transcript', error)
          toast.error(t('learning.saveFailed'))
        }
        return
      }
      if (action.intent === 'note') {
        setPendingNoteCapture({
          id: `capture-${Date.now()}-${action.selection.startMs}`,
          kind: 'bookmark',
          quote: selectedText,
          text: t('learning.selection.capturedNote'),
          timestampMs: action.selection.startMs
        })
        selectStudyScene('note')
        toast.success(t('learning.selection.addedToNotes'))
        return
      }
      if (action.intent === 'reflection' || action.intent === 'quote-card') {
        setOutputSelection(action.selection)
        setOutputSelectionIntent(action.intent)
        setOutputSelectionDownloadId(downloadId)
        selectStudyScene('output')
        return
      }
      if (action.intent === 'ask-ai') {
        setOutputSelection(action.selection)
        setOutputSelectionIntent('reflection')
        setOutputSelectionDownloadId(downloadId)
        selectStudyScene('output')
      }
    },
    [downloadId, seek, selectStudyScene, t]
  )

  const handlePlayThis = useCallback(() => {
    takeSession(sessionInput)
  }, [sessionInput, takeSession])

  const handleRetry = useCallback(async () => {
    try {
      const next = (await ipcServices.transcript.retry(downloadId)) as TranscriptSnapshotView
      setSnapshot(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
    }
  }, [downloadId, t])

  const handleForce = useCallback(async () => {
    try {
      const next = (await ipcServices.transcript.start({
        downloadId,
        force: true
      })) as TranscriptSnapshotView
      setSnapshot(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
    }
  }, [downloadId, t])

  const handleSelectSource = useCallback(
    async (key: string) => {
      try {
        const next = (await ipcServices.transcript.selectSource({
          downloadId,
          key
        })) as TranscriptSnapshotView
        setSnapshot(next)
        upsert(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('transcript.retryFailed'))
      }
    },
    [downloadId, t, upsert]
  )

  /**
   * Stop the in-flight local ASR run and return to captions when no AI transcript exists.
   */
  const handleCancel = useCallback(async () => {
    try {
      const next = (await ipcServices.transcript.cancel(downloadId)) as TranscriptSnapshotView
      setSnapshot(next)
      upsert(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transcript.stopFailed'))
    }
  }, [downloadId, t, upsert])

  const handleBack = useCallback(() => {
    void navigate({ to: '/' })
  }, [navigate])

  const handleExport = useCallback(() => {
    setExportOpen(true)
  }, [])

  const noSpeech = snapshot?.listState === 'no-speech'
  const failed = snapshot?.listState === 'failed'
  const ready = workspace.ready
  const fromCaptions = viewingCaptions
  const sources = snapshot?.sources ?? []
  const sourceSwitch =
    sources.length > 1 ? (
      <TranscriptSourceSwitch onSelect={(key) => void handleSelectSource(key)} sources={sources} />
    ) : null

  const header = useMemo(
    () => (
      <TranscriptHeader
        backLabel={t('transcript.back')}
        canExport={Boolean(ready && segments.length > 0)}
        canForce={noSpeech}
        canUpgrade={Boolean(ready && segments.length > 0 && !fromCaptions && !running)}
        captionsCollapsed={false}
        collapseLabel={t('transcript.collapsePanel')}
        expandLabel={t('transcript.expandPanel')}
        exportLabel={t('transcript.export.action')}
        failed={failed}
        onBack={handleBack}
        onExport={handleExport}
        onForce={() => void handleForce()}
        onRetry={() => void handleRetry()}
        onToggleCaptions={() => {}}
        onUpgrade={() => setUpgradeOpen(true)}
        retryLabel={t('transcript.retry')}
        showCaptionsToggle={false}
        sourceKind={snapshot?.sourceKind}
        sourceLabel={
          fromCaptions
            ? t('transcript.sourceCaptions')
            : ready
              ? t('transcript.sourceAi')
              : undefined
        }
        sourceSwitch={sourceSwitch}
        stillTranscribeLabel={t('transcript.stillTranscribe')}
        title={title}
        upgradeLabel={t('transcript.qualityHint')}
      />
    ),
    [
      failed,
      fromCaptions,
      handleBack,
      handleExport,
      handleForce,
      handleRetry,
      noSpeech,
      ready,
      running,
      segments.length,
      snapshot?.sourceKind,
      sourceSwitch,
      t,
      title
    ]
  )
  useTitleBar(header)
  const currentSpeakerId = currentSegment?.speakerId ?? null
  useEffect(() => {
    if (session?.downloadId !== downloadId) {
      return
    }
    setPresentation({
      currentSpeakerName: currentSpeakerId ? speakerName(currentSpeakerId) : null,
      currentSpeakerSortIndex: speakerColorIndex(currentSpeakerId)
    })
  }, [
    currentSpeakerId,
    downloadId,
    session?.downloadId,
    setPresentation,
    speakerColorIndex,
    speakerName
  ])

  const mediaPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-end gap-1.5 border-border/60 border-b px-2">
        <Button
          aria-pressed={translationEnabled}
          disabled={learningTranscriptView !== 'reading'}
          onClick={() => setTranslationEnabled((enabled) => !enabled)}
          size="sm"
          title={
            learningTranscriptView === 'reading'
              ? t('learning.translation.toggle')
              : t('learning.translation.readingOnly')
          }
          variant={translationEnabled ? 'secondary' : 'ghost'}
        >
          <Languages className="size-3.5" />
          {t('learning.translation.label')}
        </Button>
        <select
          aria-label={t('learning.translation.targetLanguage')}
          className="h-7 max-w-28 rounded-md border border-border/70 bg-background px-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={learningTranscriptView !== 'reading'}
          onChange={(event) => {
            setTranslationLanguage(event.target.value as LearningTranslationLanguage)
            setTranslationEnabled(true)
          }}
          value={translationLanguage}
        >
          {Object.entries(LEARNING_TRANSLATION_LANGUAGES).map(([language, label]) => (
            <option key={language} value={language}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Switch
            checked={bilingualTranslation}
            disabled={learningTranscriptView !== 'reading'}
            onToggle={() => {
              setBilingualTranslation((enabled) => !enabled)
              setTranslationEnabled(true)
            }}
          />
          {t('learning.translation.bilingual')}
        </div>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <Button
          disabled={isAudio}
          onClick={captureCurrentFrame}
          size="sm"
          title={isAudio ? t('learning.captureFrameUnavailable') : t('learning.captureFrame')}
          variant="ghost"
        >
          <Camera className="size-3.5" />
          {t('learning.captureFrame')}
        </Button>
      </div>
      <div
        className={
          isAudio
            ? isWide
              ? 'min-h-0 w-full min-w-0 shrink-0'
              : 'min-h-0 min-w-0 flex-1'
            : 'min-h-0 w-full min-w-0 shrink overflow-hidden'
        }
      >
        {ownsPlayer || !session?.started ? (
          <TranscriptPlaybackSlot className="contents" slot="page" />
        ) : (
          <TranscriptPlaybackStandby
            isAudio={isAudio}
            onPlay={handlePlayThis}
            subtitle={subtitle}
            thumbnail={thumbnail}
            title={title}
          />
        )}
      </div>
      <TranscriptSpeakersPane
        canAdjustSpeakers={Boolean(ready && !isInProgressTranscript(snapshot?.listState ?? 'none'))}
        compact={!isWide}
        currentSpeakerId={currentSegment?.speakerId ?? null}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        info={{
          ...downloadFieldsForInfo(download, t),
          asrTier: snapshot?.asrTier ?? snapshot?.record?.asrTier,
          channel: download?.channel || download?.uploader || null,
          createdAt: snapshot?.record?.createdAt ?? snapshot?.updatedAt ?? null,
          durationMs: durationMs > 0 ? durationMs : (download?.duration ?? 0) * 1000,
          fileName: download?.savedFileName ?? fileNameFromPath(snapshot?.sourceFilePath),
          fileSize:
            download?.fileSize ??
            download?.selectedFormat?.filesize ??
            download?.selectedFormat?.filesize_approx ??
            null,
          language: snapshot?.record?.language ?? null,
          segmentCount: segments.length,
          sourceKind: snapshot?.sourceKind ?? null,
          speakerCount: speakers.length,
          url: download?.url ?? null
        }}
        onAdjustSpeakers={() => setSpeakerCountOpen(true)}
        onSeek={seek}
        resolveSpeaker={speakerName}
        segments={segments}
        speakers={speakers}
      />
    </div>
  )

  const studioLabels: StudyStudioLabels = {
    layout: {
      collapseNote: t('learning.studio.layout.collapseNote'),
      collapseOutput: t('learning.studio.layout.collapseOutput'),
      expandNote: t('learning.studio.layout.expandNote'),
      expandOutput: t('learning.studio.layout.expandOutput'),
      resizeNote: t('learning.studio.layout.resizeNote'),
      resizeOutput: t('learning.studio.layout.resizeOutput')
    },
    regions: {
      note: t('learning.studio.regions.note'),
      output: t('learning.studio.regions.output'),
      transcript: t('learning.studio.regions.transcript'),
      video: t('learning.studio.regions.video')
    },
    sceneDescriptions: {
      note: t('learning.studio.descriptions.note'),
      output: t('learning.studio.descriptions.output'),
      watch: t('learning.studio.descriptions.watch')
    },
    scenes: {
      note: t('learning.studio.scenes.note'),
      output: t('learning.studio.scenes.output'),
      watch: t('learning.studio.scenes.watch')
    }
  }

  const transcriptPane = (
    <LearningTranscriptPane
      bilingual={bilingualTranslation}
      correctedSegmentIds={correctedSegmentIds}
      currentSegmentId={currentSegment?.id ?? null}
      currentTimeMs={currentTimeMs}
      downloadId={downloadId}
      error={snapshot?.error ?? null}
      failed={failed}
      noSpeech={noSpeech}
      noSpeechDetail={t('transcript.noSpeechDetail')}
      onCancel={running ? () => void handleCancel() : undefined}
      onCorrectSegment={correctLearningSegment}
      onRestoreSegment={restoreLearningSegment}
      onRetry={failed ? () => void handleRetry() : undefined}
      onSeek={seek}
      onSelectionIntent={(action) => void handleSelectionIntent(action)}
      onViewChange={setLearningTranscriptView}
      ready={Boolean(ready) || segments.length > 0}
      resolveColorIndex={speakerColorIndex}
      resolveSpeaker={speakerName}
      running={running}
      runningLabel={t(
        transcriptProgressLabelKey(
          snapshot?.listState,
          snapshot?.stage,
          modelPrep.ready,
          segments.length > 0
        )
      )}
      segments={segments}
      sourceCover={thumbnail}
      sourceDurationMs={durationMs}
      sourceTitle={download?.title ?? title}
      sourceUrl={download?.url ?? null}
      speakers={speakers}
      stage={
        snapshot?.listState === 'queued'
          ? 'queued'
          : snapshot?.listState === 'retry-scheduled'
            ? 'retry-scheduled'
            : snapshot?.stage
      }
      stageHistory={snapshot?.stageHistory ?? []}
      streamLive={streamLive}
      transcriptText={buildPromptTranscriptText(segments, speakerName)}
      translationEnabled={translationEnabled}
      translationLanguage={translationLanguage}
      view={learningTranscriptView}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {chrome ? null : (
        <DragRegion className="flex h-12 items-center gap-2 border-border/60 border-b px-3">
          {header}
        </DragRegion>
      )}
      <StudyStudio
        labels={studioLabels}
        note={
          <LearningNotebookPane
            capture={pendingNoteCapture}
            downloadId={downloadId}
            onSeek={seek}
            sourceTitle={download?.title ?? title}
            sourceUrl={download?.url ?? null}
          />
        }
        onSceneChange={selectStudyScene}
        output={
          <LearningWorkbenchPane
            capturedFrame={companionCapture}
            downloadId={downloadId}
            onSeek={seek}
            selectedQuote={outputSelectionDownloadId === downloadId ? outputSelection : null}
            selectionIntent={
              outputSelectionDownloadId === downloadId ? outputSelectionIntent : null
            }
            sourceTitle={download?.title ?? title}
            transcriptText={buildPromptTranscriptText(segments, speakerName)}
          />
        }
        scene={studyScene}
        transcript={transcriptPane}
        video={mediaPane}
      />
      <TranscriptExportDialog
        isAudio={isAudio}
        mediaPath={mediaPath}
        onOpenChange={setExportOpen}
        open={exportOpen}
        resolveSpeaker={speakerName}
        segments={committedSegments}
        title={title}
      />
      <AsrUpgradeDialog
        currentTier={snapshot?.asrTier}
        downloadId={downloadId}
        onOpenChange={setUpgradeOpen}
        onUpgraded={(next) => setSnapshot(next)}
        open={upgradeOpen}
      />
      <SpeakerCountDialog
        currentCount={snapshot?.speakerCount}
        downloadId={downloadId}
        onOpenChange={setSpeakerCountOpen}
        onUpdated={(next) => {
          setSnapshot(next)
          upsert(next)
        }}
        open={speakerCountOpen}
      />
    </div>
  )
}
