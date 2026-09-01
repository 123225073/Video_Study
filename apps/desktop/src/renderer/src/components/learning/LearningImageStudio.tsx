import { LearningImageViewer } from '@renderer/components/learning/LearningImageViewer'
import { TranscriptPromptThinking } from '@renderer/components/transcript/TranscriptPromptThinking'
import { Button } from '@renderer/components/ui/button'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { Textarea } from '@renderer/components/ui/textarea'
import { useImageRun } from '@renderer/hooks/use-image-run'
import { usePromptRun } from '@renderer/hooks/use-prompt-run'
import { ipcServices } from '@renderer/lib/ipc'
import { cropLearningImageToAspect } from '@renderer/lib/learning-image-processing'
import { logger } from '@renderer/lib/logger'
import type { CompanionCapturePayload } from '@shared/companion-types'
import {
  formatGenerationElapsed,
  imageApiSizeForAspect,
  isFreshImagePromptOptimization,
  type LearningImageAspectRatio,
  type LearningImagePurpose,
  type LearningImageStyle
} from '@shared/learning-image'
import type { LearningBlock, LearningNotebook } from '@shared/learning-types'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Expand,
  ImageIcon,
  Loader2,
  Sparkles,
  Square,
  WandSparkles
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const IMAGE_PROMPT_ID = 'image-prompt-optimizer'
const IMAGE_MARKER = 'generated-image:'
const CAPTURED_FRAME_MARKER = 'captured-video-frame:'
const IMAGE_DRAFT_VERSION = 1

const PURPOSES: LearningImagePurpose[] = ['explain', 'share', 'cover']
const STYLES: LearningImageStyle[] = ['infographic', 'minimal', 'editorial', 'cinematic']
const ASPECT_RATIOS: LearningImageAspectRatio[] = ['1:1', '4:5', '3:4', '16:9', '9:16']

interface LearningImageDraft {
  aspectRatio: LearningImageAspectRatio
  optimizedPrompt: string
  optimizedSignature: string
  pendingStartedAfter: number
  pendingSignature: string
  purpose: LearningImagePurpose
  request: string
  style: LearningImageStyle
  version: number
}

interface LearningImageStudioProps {
  capturedFrame?: CompanionCapturePayload | null
  downloadId: string
  selectedQuote?: { startMs: number; text: string } | null
  sourceTitle: string
  transcriptText: string
}

interface ProcessedGeneratedImage {
  dataUrl: string
  ratio: LearningImageAspectRatio
  runId: string
  source: string
}

const defaultDraft = (): LearningImageDraft => ({
  aspectRatio: '4:5',
  optimizedPrompt: '',
  optimizedSignature: '',
  pendingStartedAfter: 0,
  pendingSignature: '',
  purpose: 'explain',
  request: '',
  style: 'infographic',
  version: IMAGE_DRAFT_VERSION
})

const draftStorageKey = (downloadId: string): string => `fengsha.learning.image-draft:${downloadId}`

const isPurpose = (value: unknown): value is LearningImagePurpose =>
  typeof value === 'string' && PURPOSES.includes(value as LearningImagePurpose)
const isStyle = (value: unknown): value is LearningImageStyle =>
  typeof value === 'string' && STYLES.includes(value as LearningImageStyle)
const isAspectRatio = (value: unknown): value is LearningImageAspectRatio =>
  typeof value === 'string' && ASPECT_RATIOS.includes(value as LearningImageAspectRatio)

const readDraft = (downloadId: string): LearningImageDraft => {
  const fallback = defaultDraft()
  try {
    const parsed = JSON.parse(
      globalThis.localStorage?.getItem(draftStorageKey(downloadId)) ?? '{}'
    ) as Partial<LearningImageDraft> | undefined
    return {
      ...fallback,
      aspectRatio: isAspectRatio(parsed?.aspectRatio) ? parsed.aspectRatio : fallback.aspectRatio,
      optimizedPrompt:
        typeof parsed?.optimizedPrompt === 'string' ? parsed.optimizedPrompt.slice(0, 32_000) : '',
      optimizedSignature:
        typeof parsed?.optimizedSignature === 'string' ? parsed.optimizedSignature : '',
      pendingStartedAfter:
        typeof parsed?.pendingStartedAfter === 'number' ? parsed.pendingStartedAfter : 0,
      pendingSignature: typeof parsed?.pendingSignature === 'string' ? parsed.pendingSignature : '',
      purpose: isPurpose(parsed?.purpose) ? parsed.purpose : fallback.purpose,
      request: typeof parsed?.request === 'string' ? parsed.request.slice(0, 8000) : '',
      style: isStyle(parsed?.style) ? parsed.style : fallback.style
    }
  } catch {
    return fallback
  }
}

const imageDraftSignature = (draft: LearningImageDraft): string =>
  [draft.request.trim(), draft.purpose, draft.style, draft.aspectRatio].join('\n')

const isGeneratedImageBlock = (block: LearningBlock): boolean =>
  block.kind === 'screenshot' &&
  block.sourceSegmentIds.some(
    (id) => id.startsWith(IMAGE_MARKER) || id.startsWith(CAPTURED_FRAME_MARKER)
  )

const safeImageName = (title: string): string => {
  const name =
    title
      .replace(/[<>:"/\\|?*]+/gu, '-')
      .trim()
      .slice(0, 56) || '学习图片'
  return `${name}-AI图片.png`
}

const buildImagePrompt = ({
  aspectRatio,
  purpose,
  request,
  sourceTitle,
  style
}: {
  aspectRatio: string
  purpose: string
  request: string
  sourceTitle: string
  style: string
}): string =>
  [
    '为视频学习内容创作一张可直接使用的图片。',
    `来源标题：${sourceTitle}`,
    `使用场景：${purpose}`,
    `视觉风格：${style}`,
    `目标画幅：${aspectRatio}。构图必须适应该画幅，并保留安全边距。`,
    `用户需求：${request}`,
    '画面保持清晰、克制、有明确视觉层级；不要添加水印、品牌 Logo、二维码或无关元素。'
  ].join('\n')

export function LearningImageStudio({
  capturedFrame,
  downloadId,
  selectedQuote,
  sourceTitle,
  transcriptText
}: LearningImageStudioProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<LearningImageDraft>(() => readDraft(downloadId))
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [notebook, setNotebook] = useState<LearningNotebook | null>(null)
  const [processedImage, setProcessedImage] = useState<ProcessedGeneratedImage | null>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const persistedRunIds = useRef(new Set<string>())
  const optimizer = usePromptRun(downloadId, IMAGE_PROMPT_ID)
  const imageRun = useImageRun(downloadId)

  const purposeOptions = PURPOSES.map((id) => ({
    id,
    label: t(`learning.imageStudio.purposes.${id}`)
  }))
  const styleOptions = STYLES.map((id) => ({
    id,
    label: t(`learning.imageStudio.styles.${id}`)
  }))
  const signature = imageDraftSignature(draft)
  const optimizedPrompt = draft.optimizedSignature === signature ? draft.optimizedPrompt.trim() : ''
  const optimizing = optimizer.run.status === 'running'
  const generating = imageRun.run.status === 'running'
  const elapsedMs = imageRun.run.startedAt
    ? Math.max(0, (generating ? clock : imageRun.run.updatedAt || clock) - imageRun.run.startedAt)
    : 0

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(draftStorageKey(downloadId), JSON.stringify(draft))
    } catch {
      // A disabled storage partition must not prevent image generation.
    }
  }, [downloadId, draft])

  useEffect(() => {
    if (!selectedQuote?.text.trim()) {
      return
    }
    setDraft((current) => ({
      ...current,
      aspectRatio: '4:5',
      purpose: 'share',
      request: t('learning.imageStudio.selectedQuoteRequest', {
        quote: selectedQuote.text.trim(),
        seconds: Math.floor(selectedQuote.startMs / 1000)
      })
    }))
  }, [selectedQuote?.startMs, selectedQuote?.text, t])

  useEffect(() => {
    let active = true
    void ipcServices.learning
      .get(downloadId)
      .then((saved) => {
        if (active) {
          setNotebook(saved)
        }
      })
      .catch((error) => logger.error('Failed to load generated learning images', error))
    return () => {
      active = false
    }
  }, [downloadId])

  useEffect(() => {
    if (!(capturedFrame?.action === 'frame' && capturedFrame.screenshotDataUrl)) {
      return
    }
    const timestampMs = Math.round(capturedFrame.currentTimeSeconds * 1000)
    const blockId = `captured-video-frame-${timestampMs}`
    if (notebook?.blocks?.some((block) => block.id === blockId)) {
      return
    }
    void ipcServices.learning
      .upsertBlock({
        block: {
          attachmentPath: capturedFrame.screenshotDataUrl,
          completed: false,
          content: capturedFrame.selectedText || capturedFrame.captionText,
          createdAt: Date.now(),
          id: blockId,
          kind: 'screenshot',
          quote: t('learning.captureFrame'),
          sourceSegmentIds: [`${CAPTURED_FRAME_MARKER}${timestampMs}`],
          timestampMs,
          updatedAt: Date.now()
        },
        downloadId
      })
      .then(setNotebook)
      .catch((error) => {
        logger.error('Failed to persist captured video frame', error)
        toast.error(t('learning.saveFailed'))
      })
  }, [capturedFrame, downloadId, notebook?.blocks, t])

  useEffect(() => {
    if (
      optimizer.run.status !== 'completed' ||
      !optimizer.run.text.trim() ||
      !draft.pendingSignature ||
      !isFreshImagePromptOptimization(draft.pendingStartedAfter, optimizer.run.startedAt)
    ) {
      return
    }
    setDraft((current) => ({
      ...current,
      optimizedPrompt: optimizer.run.text.trim(),
      optimizedSignature: current.pendingSignature,
      pendingStartedAfter: 0,
      pendingSignature: ''
    }))
  }, [
    draft.pendingSignature,
    draft.pendingStartedAfter,
    optimizer.run.startedAt,
    optimizer.run.status,
    optimizer.run.text
  ])

  useEffect(() => {
    if (!generating) {
      return
    }
    setClock(Date.now())
    const timer = globalThis.setInterval(() => setClock(Date.now()), 1000)
    return () => globalThis.clearInterval(timer)
  }, [generating])

  useEffect(() => {
    const source = imageRun.run.imageDataUrl
    const runId = imageRun.run.runId
    if (!(source && runId)) {
      return
    }
    const ratio = imageRun.run.context?.aspectRatio ?? draft.aspectRatio
    let active = true
    setProcessingError(null)
    void cropLearningImageToAspect(source, ratio)
      .then((dataUrl) => {
        if (active) {
          setProcessedImage({ dataUrl, ratio, runId, source })
        }
      })
      .catch((error) => {
        logger.error('Failed to crop generated image', error)
        if (active) {
          setProcessingError(
            error instanceof Error ? error.message : t('learning.imageStudio.cropFailed')
          )
        }
      })
    return () => {
      active = false
    }
  }, [
    draft.aspectRatio,
    imageRun.run.context?.aspectRatio,
    imageRun.run.imageDataUrl,
    imageRun.run.runId,
    t
  ])

  useEffect(() => {
    const snapshot = imageRun.run
    const runContext = snapshot.context
    if (
      snapshot.status !== 'completed' ||
      !snapshot.imageDataUrl ||
      !snapshot.runId ||
      !runContext ||
      processedImage?.runId !== snapshot.runId ||
      processedImage.source !== snapshot.imageDataUrl ||
      processedImage.ratio !== (runContext.aspectRatio ?? draft.aspectRatio) ||
      persistedRunIds.current.has(snapshot.runId)
    ) {
      return
    }
    persistedRunIds.current.add(snapshot.runId)
    void (async () => {
      try {
        const now = Date.now()
        const block: LearningBlock = {
          attachmentPath: processedImage.dataUrl,
          completed: false,
          content: runContext.optimizedPrompt,
          createdAt: now,
          id: `ai-image-${snapshot.runId}`,
          kind: 'screenshot',
          quote: t('learning.imageStudio.generatedImage'),
          sourceSegmentIds: [`${IMAGE_MARKER}visual`],
          timestampMs: null,
          updatedAt: now
        }
        const saved = await ipcServices.learning.upsertBlock({ block, downloadId })
        setNotebook(saved)
        toast.success(t('learning.imageStudio.generatedAndSaved'))
      } catch (error) {
        persistedRunIds.current.delete(snapshot.runId)
        logger.error('Failed to persist generated image', error)
        toast.error(t('learning.imageStudio.saveFailed'))
      }
    })()
  }, [downloadId, draft.aspectRatio, imageRun.run, processedImage, t])

  const generatedImages = useMemo(
    () =>
      [...(notebook?.blocks ?? [])]
        .filter(isGeneratedImageBlock)
        .sort((left, right) => right.createdAt - left.createdAt),
    [notebook?.blocks]
  )
  const activeProcessedImage =
    processedImage?.runId === imageRun.run.runId &&
    processedImage.source === imageRun.run.imageDataUrl
      ? processedImage.dataUrl
      : null
  const visibleImage = activeProcessedImage ?? generatedImages[0]?.attachmentPath ?? null
  const visibleImageIsPartial = generating && Boolean(activeProcessedImage)

  const optimizePrompt = async (): Promise<void> => {
    if (!draft.request.trim()) {
      toast.warning(t('learning.imageStudio.requestRequired'))
      return
    }
    const currentSignature = imageDraftSignature(draft)
    const requestedAt = Math.max(Date.now(), optimizer.run.startedAt + 1)
    setAdvancedOpen(true)
    setDraft((current) => ({
      ...current,
      pendingSignature: currentSignature,
      pendingStartedAfter: requestedAt
    }))
    await optimizer.start(
      [
        'IMAGE_TYPE: 一图胜千言',
        `SOURCE_TITLE: ${sourceTitle}`,
        `USE_CASE: ${t(`learning.imageStudio.purposes.${draft.purpose}`)}`,
        `VISUAL_STYLE: ${t(`learning.imageStudio.styles.${draft.style}`)}`,
        `ASPECT_RATIO: ${draft.aspectRatio}`,
        `USER_REQUEST: ${draft.request.trim()}`,
        `VIDEO_CONTEXT:\n${transcriptText.slice(0, 12_000)}`
      ].join('\n\n')
    )
  }

  const generateImage = async (): Promise<void> => {
    if (!draft.request.trim()) {
      toast.warning(t('learning.imageStudio.requestRequired'))
      return
    }
    const finalPrompt =
      optimizedPrompt ||
      buildImagePrompt({
        aspectRatio: draft.aspectRatio,
        purpose: t(`learning.imageStudio.purposes.${draft.purpose}`),
        request: draft.request.trim(),
        sourceTitle,
        style: t(`learning.imageStudio.styles.${draft.style}`)
      })
    await imageRun.start({
      context: {
        aspectRatio: draft.aspectRatio,
        kind: 'logic',
        optimizedPrompt: finalPrompt,
        quote: ''
      },
      quality: 'high',
      size: imageApiSizeForAspect(draft.aspectRatio)
    })
  }

  const exportImage = async (source: string): Promise<void> => {
    try {
      const data = await (await fetch(source)).arrayBuffer()
      const saved = await ipcServices.fs.saveBinaryFile({
        data,
        defaultFileName: safeImageName(sourceTitle)
      })
      if (saved) {
        toast.success(t('learning.imageStudio.exported'))
      }
    } catch (error) {
      logger.error('Failed to export generated image', error)
      toast.error(t('learning.imageStudio.exportFailed'))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-4">
          <header>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
                <ImageIcon className="size-4" />
              </span>
              <div>
                <h3 className="font-semibold text-sm">{t('learning.imageStudio.title')}</h3>
                <p className="text-muted-foreground text-xs">
                  {t('learning.imageStudio.description')}
                </p>
              </div>
            </div>
          </header>

          <section className="space-y-2">
            <p className="font-medium text-xs">{t('learning.imageStudio.purpose')}</p>
            <div className="flex flex-wrap gap-1.5">
              {purposeOptions.map((option) => (
                <Button
                  aria-pressed={draft.purpose === option.id}
                  key={option.id}
                  onClick={() => setDraft((current) => ({ ...current, purpose: option.id }))}
                  size="sm"
                  variant={draft.purpose === option.id ? 'default' : 'outline'}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className="font-medium text-xs">{t('learning.imageStudio.style')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {styleOptions.map((option) => (
                <button
                  aria-pressed={draft.style === option.id}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                    draft.style === option.id
                      ? 'border-amber-500 bg-amber-500/10 font-medium text-amber-800 dark:text-amber-200'
                      : 'border-border/70 bg-background hover:border-amber-400/70'
                  }`}
                  key={option.id}
                  onClick={() => setDraft((current) => ({ ...current, style: option.id }))}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-xs">{t('learning.imageStudio.aspectRatio')}</p>
              <span className="text-[10px] text-muted-foreground">
                {t('learning.imageStudio.ratioMappingHint')}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {ASPECT_RATIOS.map((ratio) => {
                const [width, height] = ratio.split(':').map(Number)
                return (
                  <button
                    aria-label={t('learning.imageStudio.ratioLabel', { ratio })}
                    aria-pressed={draft.aspectRatio === ratio}
                    className={`grid min-h-14 place-items-center rounded-xl border px-1 py-1.5 transition-colors ${
                      draft.aspectRatio === ratio
                        ? 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        : 'border-border/70 hover:border-amber-400/70'
                    }`}
                    key={ratio}
                    onClick={() => setDraft((current) => ({ ...current, aspectRatio: ratio }))}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="block max-h-6 max-w-8 rounded-sm border border-current/60"
                      style={{
                        aspectRatio: `${width} / ${height}`,
                        height: width > height ? '18px' : '24px',
                        width: width > height ? '30px' : 'auto'
                      }}
                    />
                    <span className="font-medium text-[10px]">{ratio}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2">
            <label className="font-medium text-xs" htmlFor="learning-image-request">
              {t('learning.imageStudio.request')}
            </label>
            <Textarea
              className="min-h-28 resize-y rounded-xl bg-muted/15 leading-6"
              id="learning-image-request"
              maxLength={8000}
              onChange={(event) =>
                setDraft((current) => ({ ...current, request: event.target.value }))
              }
              placeholder={t('learning.imageStudio.requestPlaceholder')}
              value={draft.request}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-border/70">
            <button
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/30"
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <span>
                <span className="flex items-center gap-1.5 font-medium text-xs">
                  <Sparkles className="size-3.5 text-amber-600" />
                  {t('learning.imageStudio.promptOptimization')}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {optimizedPrompt
                    ? t('learning.imageStudio.optimizedReady')
                    : t('learning.imageStudio.promptOptimizationHint')}
                </span>
              </span>
              {advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {advancedOpen ? (
              <div className="space-y-3 border-border/70 border-t p-3">
                {optimizer.run.thinking.trim() || optimizing ? (
                  <TranscriptPromptThinking
                    running={optimizing}
                    thinking={optimizer.run.thinking}
                    thinkingMs={optimizer.run.thinkingMs}
                  />
                ) : null}
                <Button
                  disabled={optimizing || !draft.request.trim()}
                  onClick={() => void optimizePrompt()}
                  size="sm"
                  variant="outline"
                >
                  {optimizing ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {optimizing
                    ? t('learning.imageStudio.optimizing')
                    : t('learning.imageStudio.optimize')}
                </Button>
                {optimizer.run.error ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive text-xs">
                    {optimizer.run.error}
                  </p>
                ) : null}
                {optimizing || optimizedPrompt ? (
                  <Textarea
                    aria-label={t('learning.imageStudio.optimizedPrompt')}
                    className="min-h-32 resize-y font-mono text-xs leading-5"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        optimizedPrompt: event.target.value,
                        optimizedSignature: imageDraftSignature(current)
                      }))
                    }
                    readOnly={optimizing}
                    value={optimizing ? optimizer.run.text : draft.optimizedPrompt}
                  />
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="flex items-center gap-2">
            {generating ? (
              <Button className="flex-1" onClick={() => void imageRun.stop()} variant="outline">
                <Square /> {t('learning.imageStudio.stop')}
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={!draft.request.trim() || optimizing}
                onClick={() => void generateImage()}
              >
                <WandSparkles /> {t('learning.imageStudio.generate')}
              </Button>
            )}
            <span className="max-w-28 truncate text-[10px] text-muted-foreground">
              {imageRun.run.modelId || 'gpt-image-2'}
            </span>
          </div>

          {generating ? (
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="absolute inset-y-0 left-0 w-1/3 animate-[pulse_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-amber-400/15 to-transparent" />
              <div className="relative flex items-center gap-3">
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full border border-amber-400/40 bg-background">
                  <span className="absolute inset-1 animate-ping rounded-full bg-amber-400/20" />
                  <Loader2 className="size-4 animate-spin text-amber-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    {t(`learning.imageStudio.stages.${imageRun.run.stage}`)}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {imageRun.run.progressText || t('learning.imageStudio.generatingHint')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold text-lg tabular-nums">
                    {formatGenerationElapsed(elapsedMs)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('learning.imageStudio.elapsed')}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {imageRun.run.status === 'error' ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs">
              {imageRun.run.error}
            </p>
          ) : null}

          {processingError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs">
              {t('learning.imageStudio.cropFailed')}: {processingError}
            </p>
          ) : null}

          <section className="relative grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 p-3">
            {visibleImage ? (
              <>
                <button
                  aria-label={t('learning.imageStudio.openViewer')}
                  className="group grid w-full place-items-center"
                  onClick={() => setViewerOpen(true)}
                  type="button"
                >
                  <RemoteImage
                    alt={t('learning.imageStudio.generatedImage')}
                    className="max-h-[26rem] max-w-full rounded-xl object-contain shadow-2xl transition duration-200 group-hover:brightness-90"
                    src={visibleImage}
                  />
                  <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-2 text-white text-xs shadow-xl">
                      <Expand className="size-3.5" /> {t('learning.imageStudio.clickToView')}
                    </span>
                  </span>
                </button>
                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                  {visibleImageIsPartial ? (
                    <span className="rounded-full bg-black/75 px-2.5 py-1 text-[10px] text-white">
                      {t('learning.imageStudio.partialPreview')}
                    </span>
                  ) : null}
                  <Button
                    onClick={() => void exportImage(visibleImage)}
                    size="sm"
                    variant="secondary"
                  >
                    <Download /> {t('learning.imageStudio.downloadPng')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="max-w-52 text-center text-stone-400">
                <ImageIcon className="mx-auto size-8 text-amber-400" />
                <p className="mt-3 font-medium text-sm text-stone-200">
                  {t('learning.imageStudio.emptyTitle')}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {t('learning.imageStudio.emptyDescription')}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      <LearningImageViewer
        alt={t('learning.imageStudio.generatedImage')}
        onDownload={() => {
          if (visibleImage) {
            void exportImage(visibleImage)
          }
        }}
        onOpenChange={setViewerOpen}
        open={viewerOpen}
        source={visibleImage}
      />
    </div>
  )
}
