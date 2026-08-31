import { Button } from '@renderer/components/ui/button'
import {
  collectCollapsibleMindmapNodeIds,
  collectDefaultCollapsedMindmapNodeIds,
  layoutLearningMindmap,
  parseLearningMindmap
} from '@renderer/lib/learning-mindmap'
import { cn } from '@renderer/lib/utils'
import {
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock3,
  Maximize2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  className?: string
  onSeek?: (seconds: number) => void
  source: string
}

/** Interactive, inert tree view for AI-generated Mermaid learning mindmaps. */
export function InteractiveLearningMindmap({
  className,
  onSeek,
  source
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => defaultCollapsed)
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState({ height: 480, width: 900 })

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
    setCollapsed(defaultCollapsed)
    setZoom(1)
  }, [defaultCollapsed])

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
  const scale = fitScale * zoom

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

  if (!parsed.document) {
    return (
      <div
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
        <div className="flex items-center gap-1" role="toolbar">
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
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current / ZOOM_STEP))}
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
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current * ZOOM_STEP))}
            size="icon"
            title={t('learning.mindmapViewer.zoomIn')}
            type="button"
            variant="ghost"
          >
            <ZoomIn />
          </Button>
          <Button
            aria-label={t('learning.mindmapViewer.fit')}
            onClick={() => setZoom(1)}
            size="icon"
            title={t('learning.mindmapViewer.fit')}
            type="button"
            variant="ghost"
          >
            <Maximize2 />
          </Button>
        </div>
      </div>

      <div
        className="relative min-h-[300px] flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px)] bg-[size:20px_20px]"
        ref={viewportRef}
      >
        <div
          className="absolute top-1/2 left-1/2 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            height: layout.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
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
                  <span className="line-clamp-3 text-xs leading-4">{node.label}</span>
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
    </section>
  )
}
