import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Textarea } from '@renderer/components/ui/textarea'
import { usePanZoom } from '@renderer/hooks/use-pan-zoom'
import { ipcServices } from '@renderer/lib/ipc'
import {
  collectCollapsibleMindmapNodeIds,
  collectDefaultCollapsedMindmapNodeIds,
  layoutLearningMindmap,
  parseLearningMindmap,
  serializeLearningMindmapDocument
} from '@renderer/lib/learning-mindmap'
import {
  buildLearningMindmapJson,
  buildLearningMindmapSvg,
  learningMindmapFileStem,
  mindmapSvgToPng
} from '@renderer/lib/learning-mindmap-export'
import { cn } from '@renderer/lib/utils'
import {
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock3,
  Download,
  Expand,
  FileImage,
  FileJson,
  FileText,
  Pencil,
  Scan,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const MIN_ZOOM = 0.55
const MAX_ZOOM = 2.4
const ZOOM_STEP = 1.2

const branchNodeClass = [
  'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
  'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100',
  'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
  'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100'
] as const

const branchEdgeClass = [
  'text-amber-400/75 dark:text-amber-500/65',
  'text-sky-400/75 dark:text-sky-500/65',
  'text-emerald-400/75 dark:text-emerald-500/65',
  'text-violet-400/75 dark:text-violet-500/65',
  'text-rose-400/75 dark:text-rose-500/65'
] as const

interface InteractiveLearningMindmapProps {
  allowFullscreen?: boolean
  className?: string
  initialCollapsed?: ReadonlySet<string>
  initialOffset?: { x: number; y: number }
  initialZoom?: number
  onSeek?: (seconds: number) => void
  onSourceChange?: (source: string) => Promise<void> | void
  source: string
  sourceTitle?: string
}

/** Interactive, inert tree view for AI-generated Mermaid learning mindmaps. */
export function InteractiveLearningMindmap({
  allowFullscreen = true,
  className,
  initialCollapsed,
  initialOffset,
  initialZoom = 1,
  onSeek,
  onSourceChange,
  source,
  sourceTitle = ''
}: InteractiveLearningMindmapProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const parsed = useMemo(() => {
    try {
      return { document: parseLearningMindmap(source), error: null }
    } catch (error) {
      return {
        document: null,
        error: error instanceof Error ? error.message : t('learning.mindmapViewer.invalid')
      }
    }
  }, [source, t])
  const defaultCollapsed = useMemo(
    () =>
      parsed.document
        ? collectDefaultCollapsedMindmapNodeIds(parsed.document.root)
        : new Set<string>(),
    [parsed.document]
  )
  const editableSource = useMemo(
    () =>
      parsed.document?.sourceFormat === 'legacy-flowchart'
        ? serializeLearningMindmapDocument(parsed.document)
        : source.trim(),
    [parsed.document, source]
  )
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => initialCollapsed ?? defaultCollapsed
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(editableSource)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [viewport, setViewport] = useState({ height: 480, width: 900 })
  const previousSourceRef = useRef(source)
  const panZoom = usePanZoom({
    baselineZoom: 1,
    initialOffset,
    initialZoom,
    maxZoom: MAX_ZOOM,
    minZoom: MIN_ZOOM,
    zoomStep: 0.2
  })

  useEffect(() => {
    const element = viewportRef.current
    if (!element) {
      return
    }
    const update = (): void => {
      const rect = element.getBoundingClientRect()
      setViewport({ height: Math.max(240, rect.height), width: Math.max(320, rect.width) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (previousSourceRef.current === source) {
      return
    }
    previousSourceRef.current = source
    setCollapsed(defaultCollapsed)
    panZoom.reset()
    setEditDraft(editableSource)
    setEditError(null)
  }, [defaultCollapsed, editableSource, panZoom.reset, source])

  const layout = useMemo(
    () =>
      parsed.document
        ? layoutLearningMindmap(parsed.document.root, collapsed)
        : { edges: [], height: 320, nodes: [], width: 520 },
    [collapsed, parsed.document]
  )
  const fitScale = Math.min(
    1.2,
    Math.max(0.2, (viewport.width - 24) / layout.width),
    Math.max(0.2, (viewport.height - 24) / layout.height)
  )
  const scale = fitScale * panZoom.zoom

  const toggleNode = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const setAllCollapsed = (): void => {
    if (parsed.document) {
      setCollapsed(collectCollapsibleMindmapNodeIds(parsed.document.root))
    }
  }

  const saveEdit = async (): Promise<void> => {
    try {
      parseLearningMindmap(editDraft)
      setSaving(true)
      await onSourceChange?.(editDraft.trim())
      setEditing(false)
      setEditError(null)
      toast.success(t('learning.mindmapViewer.editSaved'))
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const downloadMindmap = async (format: 'json' | 'markdown' | 'png' | 'svg'): Promise<void> => {
    if (downloading) {
      return
    }
    setDownloading(true)
    try {
      const fileStem = learningMindmapFileStem(
        sourceTitle || parsed.document?.root.label || '',
        t('learning.mindmapViewer.defaultFileName')
      )
      const svg = format === 'png' || format === 'svg' ? buildLearningMindmapSvg(source) : ''
      const saved =
        format === 'png'
          ? await ipcServices.fs.saveBinaryFile({
              data: await mindmapSvgToPng(svg),
              defaultFileName: `${fileStem}.png`
            })
          : await ipcServices.fs.saveTextFile({
              content:
                format === 'svg'
                  ? svg
                  : format === 'json'
                    ? buildLearningMindmapJson(source)
                    : source,
              defaultFileName: `${fileStem}.${format === 'markdown' ? 'md' : format}`
            })
      if (saved) {
        toast.success(t('learning.mindmapViewer.downloaded'))
      }
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error))
      toast.error(t('learning.mindmapViewer.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }

  if (!parsed.document) {
    return (
      <div
        aria-label={t('learning.mindmapViewer.hint')}
        className={cn(
          'rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm',
          className
        )}
        data-testid="learning-mindmap-error"
        role="alert"
      >
        <p className="font-medium">{t('learning.mindmapViewer.invalid')}</p>
        <p className="mt-1 text-xs opacity-80">{parsed.error}</p>
      </div>
    )
  }

  return (
    <section
      aria-label={t('learning.mindmapViewer.title')}
      className={cn(
        'flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card',
        className
      )}
      data-source-format={parsed.document.sourceFormat}
      data-testid="interactive-learning-mindmap"
      data-zoom={panZoom.zoom}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-border/60 border-b bg-background/80 px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-sm">{parsed.document.root.label}</h3>
          <p className="text-muted-foreground text-xs">
            {parsed.document.sourceFormat === 'legacy-flowchart'
              ? t('learning.mindmapViewer.legacy')
              : t('learning.mindmapViewer.hint')}
          </p>
        </div>
        <div
          className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1"
          role="toolbar"
        >
          {onSourceChange ? (
            <Button
              aria-label={t('learning.mindmapViewer.edit')}
              data-testid="learning-mindmap-edit"
              onClick={() => {
                setEditDraft(editableSource)
                setEditError(null)
                setEditing(true)
              }}
              size="sm"
              title={t('learning.mindmapViewer.edit')}
              type="button"
              variant="ghost"
            >
              <Pencil />
              <span className="hidden 2xl:inline">{t('learning.mindmapViewer.edit')}</span>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t('learning.mindmapViewer.download')}
                data-testid="learning-mindmap-download"
                disabled={downloading}
                size="sm"
                title={t('learning.mindmapViewer.download')}
                type="button"
                variant="ghost"
              >
                <Download />
                <span className="hidden 2xl:inline">{t('learning.mindmapViewer.download')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void downloadMindmap('png')}>
                <FileImage /> PNG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadMindmap('svg')}>
                <FileImage /> SVG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadMindmap('markdown')}>
                <FileText /> Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadMindmap('json')}>
                <FileJson /> JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            aria-label={t('learning.mindmapViewer.expandAll')}
            onClick={() => setCollapsed(new Set())}
            size="icon"
            title={t('learning.mindmapViewer.expandAll')}
            type="button"
            variant="ghost"
          >
            <ChevronsDown />
          </Button>
          <Button
            aria-label={t('learning.mindmapViewer.collapseAll')}
            onClick={setAllCollapsed}
            size="icon"
            title={t('learning.mindmapViewer.collapseAll')}
            type="button"
            variant="ghost"
          >
            <ChevronsUp />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            aria-label={t('learning.mindmapViewer.zoomOut')}
            disabled={panZoom.zoom <= MIN_ZOOM}
            onClick={() => panZoom.setZoom(Math.max(MIN_ZOOM, panZoom.zoom / ZOOM_STEP))}
            size="icon"
            title={t('learning.mindmapViewer.zoomOut')}
            type="button"
            variant="ghost"
          >
            <ZoomOut />
          </Button>
          <span className="w-11 text-center text-[11px] text-muted-foreground tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            aria-label={t('learning.mindmapViewer.zoomIn')}
            disabled={panZoom.zoom >= MAX_ZOOM}
            onClick={() => panZoom.setZoom(Math.min(MAX_ZOOM, panZoom.zoom * ZOOM_STEP))}
            size="icon"
            title={t('learning.mindmapViewer.zoomIn')}
            type="button"
            variant="ghost"
          >
            <ZoomIn />
          </Button>
          <Button
            aria-label={t('learning.mindmapViewer.fit')}
            onClick={panZoom.reset}
            size="icon"
            title={t('learning.mindmapViewer.fit')}
            type="button"
            variant="ghost"
          >
            <Scan />
          </Button>
          {allowFullscreen ? (
            <Button
              aria-label={t('learning.mindmapViewer.fullscreen')}
              onClick={() => setFullscreen(true)}
              size="icon"
              title={t('learning.mindmapViewer.fullscreen')}
              type="button"
              variant="ghost"
            >
              <Expand />
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'relative min-h-[300px] flex-1 touch-none overflow-hidden bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px)] bg-[size:20px_20px]',
          panZoom.dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={panZoom.onPointerCancel}
        onPointerDown={panZoom.onPointerDown}
        onPointerMove={panZoom.onPointerMove}
        onPointerUp={panZoom.onPointerUp}
        onWheel={panZoom.onWheel}
        ref={viewportRef}
        role="application"
      >
        <div
          className="absolute top-1/2 left-1/2 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            height: layout.height,
            transform: `translate(calc(-50% + ${panZoom.offset.x}px), calc(-50% + ${panZoom.offset.y}px)) scale(${scale})`,
            transformOrigin: 'center',
            width: layout.width
          }}
        >
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            {layout.edges.map((edge) => {
              const midpoint = (edge.fromX + edge.toX) / 2
              const target = layout.nodes.find((node) => node.id === edge.to)
              return (
                <path
                  className={cn(
                    'fill-none stroke-current transition-[d] duration-300 motion-reduce:transition-none',
                    branchEdgeClass[(target?.colorIndex ?? 0) % branchEdgeClass.length]
                  )}
                  d={`M ${edge.fromX} ${edge.fromY} C ${midpoint} ${edge.fromY}, ${midpoint} ${edge.toY}, ${edge.toX} ${edge.toY}`}
                  key={edge.id}
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              )
            })}
          </svg>

          {layout.nodes.map((node) => {
            const root = node.id === parsed.document?.root.id
            const expandable = node.childCount > 0
            const seekable = node.timeMs !== null && Boolean(onSeek)
            return (
              <div
                className={cn(
                  'absolute flex -translate-x-1/2 -translate-y-1/2 items-stretch overflow-hidden rounded-xl border shadow-sm transition-[top,left] duration-300 motion-reduce:transition-none',
                  root
                    ? 'w-52 border-stone-900 bg-stone-950 text-white shadow-lg dark:border-amber-300 dark:bg-amber-300 dark:text-stone-950'
                    : cn('w-44', branchNodeClass[node.colorIndex % branchNodeClass.length])
                )}
                data-collapsed={node.collapsed ? 'true' : undefined}
                data-mindmap-node-id={node.id}
                key={node.id}
                style={{ left: node.x, top: node.y }}
              >
                <button
                  aria-expanded={expandable ? !node.collapsed : undefined}
                  className="min-h-12 min-w-0 flex-1 px-3 py-2 text-left disabled:cursor-default"
                  disabled={!(expandable || seekable)}
                  onClick={() => {
                    if (expandable) {
                      toggleNode(node.id)
                    } else if (node.timeMs !== null) {
                      onSeek?.(node.timeMs / 1000)
                    }
                  }}
                  title={expandable ? t('learning.mindmapViewer.toggleNode') : undefined}
                  type="button"
                >
                  <span className="line-clamp-3 text-xs leading-4" title={node.label}>
                    {node.label}
                  </span>
                </button>
                {expandable ? (
                  <button
                    aria-label={
                      node.collapsed
                        ? t('learning.mindmapViewer.expandNode', { label: node.label })
                        : t('learning.mindmapViewer.collapseNode', { label: node.label })
                    }
                    className="flex w-7 shrink-0 items-center justify-center border-current/15 border-l transition hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => toggleNode(node.id)}
                    type="button"
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 transition-transform',
                        !node.collapsed && 'rotate-90'
                      )}
                    />
                  </button>
                ) : null}
                {node.timeMs === null ? null : (
                  <button
                    aria-label={t('learning.mindmapViewer.seek', {
                      time: node.evidenceLabel ?? ''
                    })}
                    className="flex shrink-0 items-center gap-1 border-current/15 border-l px-2 text-[10px] tabular-nums transition hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => onSeek?.(node.timeMs === null ? 0 : node.timeMs / 1000)}
                    title={t('learning.mindmapViewer.seek', {
                      time: node.evidenceLabel ?? ''
                    })}
                    type="button"
                  >
                    <Clock3 className="size-3" />
                    {node.evidenceLabel}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {allowFullscreen ? (
        <Dialog onOpenChange={setFullscreen} open={fullscreen}>
          <DialogContent
            className="overflow-hidden p-2"
            data-testid="learning-mindmap-fullscreen-dialog"
            style={{ height: 'calc(100vh - 16px)', maxWidth: 'none', width: 'calc(100vw - 16px)' }}
          >
            <DialogTitle className="sr-only">{t('learning.mindmapViewer.fullscreen')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('learning.mindmapViewer.fullscreenDescription')}
            </DialogDescription>
            <InteractiveLearningMindmap
              allowFullscreen={false}
              className="h-full min-h-0"
              initialCollapsed={collapsed}
              initialOffset={panZoom.offset}
              initialZoom={panZoom.zoom}
              onSeek={onSeek}
              onSourceChange={onSourceChange}
              source={source}
              sourceTitle={sourceTitle}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      {onSourceChange ? (
        <Dialog onOpenChange={setEditing} open={editing}>
          <DialogContent className="flex h-[88vh] max-w-[94vw] flex-col overflow-hidden p-0 sm:max-w-[94vw]">
            <div className="shrink-0 border-border/60 border-b px-5 py-4">
              <DialogTitle>{t('learning.mindmapViewer.editTitle')}</DialogTitle>
              <DialogDescription>{t('learning.mindmapViewer.editDescription')}</DialogDescription>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(320px,.72fr)_minmax(480px,1.28fr)]">
              <div className="flex min-h-0 flex-col gap-2">
                <Textarea
                  aria-label={t('learning.mindmapViewer.editSource')}
                  className="min-h-0 flex-1 resize-none font-mono text-xs leading-5"
                  onChange={(event) => {
                    setEditDraft(event.target.value)
                    setEditError(null)
                  }}
                  spellCheck={false}
                  value={editDraft}
                />
                {editError ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive text-xs">
                    {editError}
                  </p>
                ) : null}
              </div>
              <InteractiveLearningMindmap
                allowFullscreen={false}
                className="min-h-0"
                source={editDraft}
              />
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-border/60 border-t px-5 py-3">
              <Button onClick={() => setEditing(false)} type="button" variant="ghost">
                {t('learning.mindmapViewer.cancel')}
              </Button>
              <Button disabled={saving} onClick={() => void saveEdit()} type="button">
                {saving ? t('learning.mindmapViewer.saving') : t('learning.mindmapViewer.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}
