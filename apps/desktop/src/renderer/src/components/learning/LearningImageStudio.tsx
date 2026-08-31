import { TranscriptPromptThinking } from '@renderer/components/transcript/TranscriptPromptThinking'
import { Button } from '@renderer/components/ui/button'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { Response } from '@renderer/components/ui/response'
import { Textarea } from '@renderer/components/ui/textarea'
import { useImageRun } from '@renderer/hooks/use-image-run'
import { usePromptRun } from '@renderer/hooks/use-prompt-run'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { LearningBlock, LearningNotebook } from '@shared/learning-types'
import { Download, ImageIcon, Loader2, Sparkles, Square, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

type LearningImageKind = 'cover' | 'logic' | 'quote'

const IMAGE_PROMPT_ID = 'image-prompt-optimizer'
const IMAGE_MARKER = 'generated-image:'
const IMAGE_LABELS: Record<LearningImageKind, string> = {
  cover: '封面图',
  logic: '学习逻辑图',
  quote: '金句图'
}
const IMAGE_SIZES: Record<LearningImageKind, '1024x1536' | '1536x1024'> = {
  cover: '1536x1024',
  logic: '1536x1024',
  quote: '1024x1536'
}

interface LearningImageStudioProps {
  downloadId: string
  selectedQuote?: { startMs: number; text: string } | null
  sourceTitle: string
  transcriptText: string
}

const imageKindForBlock = (block: LearningBlock): LearningImageKind | null => {
  const marker = block.sourceSegmentIds.find((id) => id.startsWith(IMAGE_MARKER))
  const value = marker?.slice(IMAGE_MARKER.length)
  return value === 'cover' || value === 'logic' || value === 'quote' ? value : null
}

const safeImageName = (title: string, kind: LearningImageKind): string => {
  const name =
    title
      .replace(/[<>:"/\\|?*]+/gu, '-')
      .trim()
      .slice(0, 56) || '学习图片'
  return `${name}-${IMAGE_LABELS[kind]}.png`
}

const wrapCanvasText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const characters = [...text.trim()]
  const lines: string[] = []
  let current = ''
  for (const character of characters) {
    const next = `${current}${character}`
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current)
      current = character
    } else {
      current = next
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines
}

const quotePosterBytes = async (source: string, quote: string): Promise<ArrayBuffer> => {
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`)
  }
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Canvas is unavailable')
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const padding = Math.round(canvas.width * 0.11)
  const fontSize = Math.max(34, Math.round(canvas.width * 0.055))
  context.font = `600 ${fontSize}px "Noto Serif SC", "Microsoft YaHei", serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const lines = wrapCanvasText(context, quote, canvas.width - padding * 2).slice(0, 8)
  const lineHeight = Math.round(fontSize * 1.55)
  const panelHeight = Math.max(lineHeight * (lines.length + 1), Math.round(canvas.height * 0.34))
  const panelTop = Math.round((canvas.height - panelHeight) / 2)
  context.fillStyle = 'rgba(16, 15, 13, 0.72)'
  context.fillRect(padding / 2, panelTop, canvas.width - padding, panelHeight)
  context.fillStyle = '#fffaf0'
  context.shadowColor = 'rgba(0,0,0,.45)'
  context.shadowBlur = 18
  const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, startY + index * lineHeight)
  })
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('PNG render failed'))),
      'image/png'
    )
  })
  return blob.arrayBuffer()
}

export function LearningImageStudio({
  downloadId,
  selectedQuote,
  sourceTitle,
  transcriptText
}: LearningImageStudioProps) {
  const [kind, setKind] = useState<LearningImageKind>('logic')
  const [request, setRequest] = useState('')
  const [quote, setQuote] = useState('')
  const [optimizedPrompt, setOptimizedPrompt] = useState('')
  const [notebook, setNotebook] = useState<LearningNotebook | null>(null)
  const persistedRunIds = useRef(new Set<string>())
  const optimizer = usePromptRun(downloadId, IMAGE_PROMPT_ID)
  const imageRun = useImageRun(downloadId)

  useEffect(() => {
    if (!selectedQuote?.text.trim()) {
      return
    }
    setKind('quote')
    setQuote(selectedQuote.text.trim())
    setRequest(
      `为这句学习摘录设计一张克制、高级、适合分享的金句卡片背景。内容来自 ${Math.floor(
        selectedQuote.startMs / 1000
      )} 秒附近，保留充足的中文排版安全区。`
    )
  }, [selectedQuote])

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
    if (optimizer.run.status === 'completed' && optimizer.run.text.trim()) {
      setOptimizedPrompt(optimizer.run.text.trim())
    }
  }, [optimizer.run.status, optimizer.run.text])

  useEffect(() => {
    const snapshot = imageRun.run
    const runContext = snapshot.context
    if (
      snapshot.status !== 'completed' ||
      !snapshot.imageDataUrl ||
      !snapshot.runId ||
      !runContext ||
      persistedRunIds.current.has(snapshot.runId)
    ) {
      return
    }
    persistedRunIds.current.add(snapshot.runId)
    void (async () => {
      try {
        const now = Date.now()
        const block: LearningBlock = {
          attachmentPath: snapshot.imageDataUrl,
          completed: false,
          content: runContext.optimizedPrompt,
          createdAt: now,
          id: `ai-image-${snapshot.runId}`,
          kind: 'screenshot',
          quote: runContext.kind === 'quote' ? runContext.quote : IMAGE_LABELS[runContext.kind],
          sourceSegmentIds: [`${IMAGE_MARKER}${runContext.kind}`],
          timestampMs: null,
          updatedAt: now
        }
        const saved = await ipcServices.learning.upsertBlock({
          block,
          downloadId
        })
        setNotebook(saved)
        toast.success(`${IMAGE_LABELS[runContext.kind]}已生成并保存`)
      } catch (error) {
        persistedRunIds.current.delete(snapshot.runId)
        logger.error('Failed to persist generated image', error)
        toast.error('图片已生成，但保存失败')
      }
    })()
  }, [downloadId, imageRun.run])

  const generatedImages = useMemo(
    () =>
      [...(notebook?.blocks ?? [])]
        .filter((block) => block.kind === 'screenshot' && imageKindForBlock(block))
        .sort((left, right) => right.createdAt - left.createdAt),
    [notebook?.blocks]
  )
  const savedImage = generatedImages.find((block) => imageKindForBlock(block) === kind)
  const activeImageMatchesKind = imageRun.run.context?.kind === kind
  const visibleImage =
    (activeImageMatchesKind ? imageRun.run.imageDataUrl : null) ??
    savedImage?.attachmentPath ??
    null
  const visibleQuote =
    kind === 'quote'
      ? activeImageMatchesKind
        ? (imageRun.run.context?.quote ?? quote.trim())
        : (savedImage?.quote ?? quote.trim())
      : ''
  const optimizing = optimizer.run.status === 'running'
  const generating = imageRun.run.status === 'running'

  const optimizePrompt = async (): Promise<void> => {
    if (!request.trim()) {
      toast.warning('请先描述你希望图片表达什么')
      return
    }
    const noTextRule =
      kind === 'quote'
        ? 'Generate a refined background with a generous central text-safe area. Do not render any letters, words, logos, or watermarks; the app will typeset the exact quote afterward.'
        : ''
    await optimizer.start(
      [
        `IMAGE_TYPE: ${IMAGE_LABELS[kind]}`,
        `SOURCE_TITLE: ${sourceTitle}`,
        `USER_REQUEST: ${request.trim()}`,
        quote.trim() ? `EXACT_QUOTE_FOR_LAYOUT_REFERENCE: ${quote.trim()}` : '',
        noTextRule,
        `VIDEO_CONTEXT:\n${transcriptText.slice(0, 12_000)}`
      ]
        .filter(Boolean)
        .join('\n\n')
    )
  }

  const generateImage = async (): Promise<void> => {
    if (!optimizedPrompt.trim()) {
      toast.warning('请先让 AI 优化提示词')
      return
    }
    if (kind === 'quote' && !quote.trim()) {
      toast.warning('请输入需要准确排版的金句原文')
      return
    }
    await imageRun.start({
      context: {
        kind,
        optimizedPrompt,
        quote: kind === 'quote' ? quote.trim() : ''
      },
      quality: 'high',
      size: IMAGE_SIZES[kind]
    })
  }

  const exportImage = async (source: string): Promise<void> => {
    try {
      const data =
        kind === 'quote' && visibleQuote
          ? await quotePosterBytes(source, visibleQuote)
          : await (await fetch(source)).arrayBuffer()
      const saved = await ipcServices.fs.saveBinaryFile({
        data,
        defaultFileName: safeImageName(sourceTitle, kind)
      })
      if (saved) {
        toast.success('图片已导出')
      }
    } catch (error) {
      logger.error('Failed to export generated image', error)
      toast.error('图片导出失败')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-border/60 border-b p-3">
        <div className="grid grid-cols-3 gap-1.5" role="tablist">
          {(Object.keys(IMAGE_LABELS) as LearningImageKind[]).map((item) => (
            <Button
              aria-selected={kind === item}
              key={item}
              onClick={() => setKind(item)}
              role="tab"
              size="sm"
              variant={kind === item ? 'default' : 'outline'}
            >
              {IMAGE_LABELS[item]}
            </Button>
          ))}
        </div>
        {kind === 'quote' ? (
          <Textarea
            aria-label="金句原文"
            className="min-h-16 resize-y"
            onChange={(event) => setQuote(event.target.value)}
            placeholder="粘贴需要准确排版的金句原文"
            value={quote}
          />
        ) : null}
        <Textarea
          aria-label="图片需求"
          className="min-h-20 resize-y"
          onChange={(event) => setRequest(event.target.value)}
          placeholder="描述构图、风格、重点和使用场景……"
          value={request}
        />
        <Button disabled={optimizing || !request.trim()} onClick={() => void optimizePrompt()}>
          {optimizing ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {optimizing ? '正在流式优化…' : 'AI 优化提示词'}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {optimizer.run.thinking.trim() || optimizing ? (
          <TranscriptPromptThinking
            running={optimizing}
            thinking={optimizer.run.thinking}
            thinkingMs={optimizer.run.thinkingMs}
          />
        ) : null}
        {optimizer.run.text ? (
          <div className="mt-3 rounded-xl border bg-muted/20 p-3">
            <Response className="text-xs leading-5" isAnimating={optimizing}>
              {optimizer.run.text}
            </Response>
          </div>
        ) : null}
        {optimizedPrompt ? (
          <Textarea
            aria-label="优化后的图片提示词"
            className="mt-3 min-h-28 resize-y font-mono text-xs leading-5"
            onChange={(event) => setOptimizedPrompt(event.target.value)}
            value={optimizedPrompt}
          />
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {generating ? (
            <Button onClick={() => void imageRun.stop()} variant="outline">
              <Square /> 停止
            </Button>
          ) : (
            <Button disabled={!optimizedPrompt.trim()} onClick={() => void generateImage()}>
              <WandSparkles /> 生成{IMAGE_LABELS[kind]}
            </Button>
          )}
          <span className="text-muted-foreground text-xs">
            {imageRun.run.modelId || 'gpt-image-2'}
          </span>
        </div>
        {imageRun.run.progressText ? (
          <p className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {imageRun.run.progressText}
          </p>
        ) : null}
        {imageRun.run.status === 'error' ? (
          <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive text-xs">
            {imageRun.run.error}
          </p>
        ) : null}

        <div className="relative mt-4 grid min-h-64 place-items-center overflow-hidden rounded-xl border border-dashed bg-stone-950/95 p-3">
          {visibleImage ? (
            <>
              <RemoteImage
                alt={`AI 生成的${IMAGE_LABELS[kind]}`}
                className="max-h-96 max-w-full rounded-lg object-contain"
                src={visibleImage}
              />
              {kind === 'quote' && visibleQuote ? (
                <div className="pointer-events-none absolute inset-x-[9%] top-1/2 -translate-y-1/2 rounded-xl bg-stone-950/70 px-6 py-8 text-center font-semibold font-serif text-lg text-stone-50 leading-8 shadow-2xl backdrop-blur-sm">
                  {visibleQuote}
                </div>
              ) : null}
              <Button
                className="absolute right-3 bottom-3"
                onClick={() => void exportImage(visibleImage)}
                size="sm"
                variant="secondary"
              >
                <Download /> 导出 PNG
              </Button>
            </>
          ) : (
            <div className="text-center text-stone-400">
              <ImageIcon className="mx-auto size-8 text-amber-400" />
              <p className="mt-2 text-sm">生成过程和结果会显示在这里</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
