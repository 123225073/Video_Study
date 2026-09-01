import {
  clampStudySideWidth,
  parseStudyStudioLayout,
  STUDY_STUDIO_LAYOUT_KEY,
  type StudyStudioLayout
} from '@renderer/lib/study-studio/layout'
import type {
  StudyScene,
  StudyStudioLabels,
  StudyStudioSlots
} from '@renderer/lib/study-studio/types'
import { cn } from '@renderer/lib/utils'
import {
  BookOpenText,
  Clapperboard,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenLine
} from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'

interface StudySceneSwitcherProps {
  labels: StudyStudioLabels
  onChange: (scene: StudyScene, focusRegion: boolean) => void
  scene: StudyScene
}

const sceneItems = [
  { icon: Clapperboard, scene: 'watch' },
  { icon: PenLine, scene: 'note' },
  { icon: BookOpenText, scene: 'output' }
] as const

const selectAdjacentScene = (
  event: KeyboardEvent<HTMLButtonElement>,
  scene: StudyScene,
  onChange: (next: StudyScene, focusRegion: boolean) => void
): void => {
  if (!(event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    return
  }
  event.preventDefault()
  const currentIndex = sceneItems.findIndex((item) => item.scene === scene)
  const offset = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (currentIndex + offset + sceneItems.length) % sceneItems.length
  const nextScene = sceneItems[nextIndex]?.scene
  if (!nextScene) {
    return
  }
  const tabList = event.currentTarget.parentElement
  onChange(nextScene, false)
  requestAnimationFrame(() => {
    tabList?.querySelector<HTMLButtonElement>(`[data-scene="${nextScene}"]`)?.focus()
  })
}

export function StudySceneSwitcher({ labels, onChange, scene }: StudySceneSwitcherProps) {
  return (
    <div
      aria-label={labels.sceneDescriptions[scene]}
      className="study-scene-switcher inline-flex rounded-xl border border-stone-300/70 bg-stone-100/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] dark:border-white/10 dark:bg-stone-950/70"
      role="tablist"
    >
      {sceneItems.map((item) => {
        const Icon = item.icon
        const selected = item.scene === scene
        return (
          <button
            aria-selected={selected}
            className={cn(
              'relative inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-3 font-medium text-xs transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
              'study-scene-tab',
              selected
                ? 'bg-stone-950 text-amber-300 shadow-md dark:bg-amber-400 dark:text-stone-950'
                : 'text-stone-500 hover:bg-white/80 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/8 dark:hover:text-stone-100'
            )}
            data-scene={item.scene}
            data-state={selected ? 'active' : 'idle'}
            key={item.scene}
            onClick={() => onChange(item.scene, true)}
            onKeyDown={(event) => selectAdjacentScene(event, item.scene, onChange)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <Icon aria-hidden className="size-3.5" />
            {labels.scenes[item.scene]}
          </button>
        )
      })}
    </div>
  )
}

interface StudioRegionProps {
  children: ReactNode
  className?: string
  collapsedOnDesktop?: boolean
  hidden?: boolean
  label: string
  region: keyof StudyStudioSlots
}

function StudioRegion({
  children,
  className,
  collapsedOnDesktop = false,
  hidden = false,
  label,
  region
}: StudioRegionProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'study-studio-region relative min-h-0 min-w-0 scroll-mt-20 overflow-hidden rounded-lg border border-stone-300/60 bg-background shadow-[0_12px_32px_-28px_rgba(15,15,12,.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-inset dark:border-white/10',
        hidden && 'hidden',
        collapsedOnDesktop && 'xl:!hidden',
        className
      )}
      data-study-region={region}
      tabIndex={-1}
    >
      <div className="size-full min-h-0">{children}</div>
    </section>
  )
}

interface LayoutHandleProps {
  collapsed: boolean
  collapseLabel: string
  expandLabel: string
  onDrag: (event: PointerEvent<HTMLButtonElement>) => void
  onNudge: (delta: number) => void
  onToggle: () => void
  resizeLabel: string
  side: 'left' | 'right'
}

function LayoutHandle({
  collapsed,
  collapseLabel,
  expandLabel,
  onDrag,
  onNudge,
  onToggle,
  resizeLabel,
  side
}: LayoutHandleProps) {
  const CollapseIcon = side === 'left' ? PanelLeftClose : PanelRightClose
  const ExpandIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen
  const Icon = collapsed ? ExpandIcon : CollapseIcon
  return (
    <div
      className={cn(
        'group relative z-10 hidden min-h-0 items-start justify-center xl:flex',
        side === 'left' ? 'xl:col-start-2' : 'xl:col-start-4',
        'xl:row-span-2 xl:row-start-1'
      )}
      data-study-resizer={side}
    >
      <button
        aria-label={resizeLabel}
        className="absolute inset-0 cursor-col-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            const visualDirection = event.key === 'ArrowRight' ? 1 : -1
            onNudge(side === 'left' ? visualDirection : -visualDirection)
          }
        }}
        onPointerDown={onDrag}
        title={resizeLabel}
        type="button"
      />
      <span className="mt-12 h-[calc(100%-6rem)] w-px rounded-full bg-stone-300/70 transition group-hover:w-0.5 group-hover:bg-amber-400 dark:bg-white/12" />
      <button
        aria-label={collapsed ? expandLabel : collapseLabel}
        className="absolute top-1.5 flex size-7 cursor-pointer items-center justify-center rounded-full border border-stone-300/80 bg-background text-stone-500 shadow-sm transition hover:border-amber-400 hover:bg-amber-50 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-white/12 dark:hover:bg-amber-300"
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title={collapsed ? expandLabel : collapseLabel}
        type="button"
      >
        <Icon aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}

export interface StudyStudioProps extends StudyStudioSlots {
  actions?: ReactNode
  className?: string
  defaultScene?: StudyScene
  labels: StudyStudioLabels
  onSceneChange?: (scene: StudyScene) => void
  scene?: StudyScene
  title?: ReactNode
}

export function StudyStudio({
  actions,
  className,
  defaultScene = 'watch',
  labels,
  note,
  onSceneChange,
  output,
  scene,
  title,
  transcript,
  video
}: StudyStudioProps) {
  const descriptionId = useId()
  const [localScene, setLocalScene] = useState<StudyScene>(defaultScene)
  const focusRegionOnChangeRef = useRef(false)
  const shellRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [layout, setLayout] = useState<StudyStudioLayout>(() =>
    parseStudyStudioLayout(window.localStorage.getItem(STUDY_STUDIO_LAYOUT_KEY))
  )
  const activeScene = scene ?? localScene

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)')
    const update = (): void => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STUDY_STUDIO_LAYOUT_KEY, JSON.stringify(layout))
  }, [layout])

  useEffect(() => {
    const focusRegion = focusRegionOnChangeRef.current
    focusRegionOnChangeRef.current = false
    if (activeScene === 'watch' || !window.matchMedia('(max-width: 1023px)').matches) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      const region = shellRef.current?.querySelector<HTMLElement>(
        `[data-study-region="${activeScene}"]`
      )
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      region?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      if (focusRegion) {
        region?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeScene])

  const changeScene = (nextScene: StudyScene, focusRegion: boolean): void => {
    focusRegionOnChangeRef.current = focusRegion
    if (scene === undefined) {
      setLocalScene(nextScene)
    }
    onSceneChange?.(nextScene)
  }

  const beginResize =
    (side: 'left' | 'right') =>
    (event: PointerEvent<HTMLButtonElement>): void => {
      if (event.button !== 0) {
        return
      }
      const grid = gridRef.current
      if (!grid) {
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      const rect = grid.getBoundingClientRect()
      const resize = (moveEvent: globalThis.PointerEvent): void => {
        setLayout((current) => {
          const otherWidth = side === 'left' ? current.rightWidth : current.leftWidth
          const otherVisible = side === 'left' ? !current.rightCollapsed : !current.leftCollapsed
          const maximum = rect.width - (otherVisible ? otherWidth : 0) - 480 - 36
          const requested =
            side === 'left' ? moveEvent.clientX - rect.left : rect.right - moveEvent.clientX
          const width = clampStudySideWidth(requested, maximum)
          return side === 'left'
            ? { ...current, leftCollapsed: false, leftWidth: width }
            : { ...current, rightCollapsed: false, rightWidth: width }
        })
      }
      const finish = (): void => {
        window.removeEventListener('pointermove', resize)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
      }
      window.addEventListener('pointermove', resize)
      window.addEventListener('pointerup', finish, { once: true })
      window.addEventListener('pointercancel', finish, { once: true })
      event.preventDefault()
    }

  const desktopGridStyle: CSSProperties | undefined = isDesktop
    ? {
        gridTemplateColumns: `${layout.leftCollapsed ? 0 : layout.leftWidth}px 10px minmax(460px, 1fr) 10px ${layout.rightCollapsed ? 0 : layout.rightWidth}px`
      }
    : undefined

  return (
    <main
      aria-describedby={descriptionId}
      className={cn(
        'study-studio-shell flex h-full min-h-0 flex-col overflow-y-auto xl:overflow-hidden',
        className
      )}
      data-study-scene={activeScene}
      ref={shellRef}
    >
      <header className="study-studio-header sticky top-0 z-20 flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-stone-300/55 border-b bg-background/92 px-3 py-1.5 backdrop-blur-xl dark:border-white/8">
        <div className="min-w-0 flex-1">
          {title ? (
            <div className="truncate font-semibold font-serif text-base">{title}</div>
          ) : null}
          <p className="truncate text-muted-foreground text-xs" id={descriptionId}>
            {labels.sceneDescriptions[activeScene]}
          </p>
        </div>
        <div className="xl:hidden">
          <StudySceneSwitcher labels={labels} onChange={changeScene} scene={activeScene} />
        </div>
        {actions ? <div className="ml-auto flex items-center gap-1.5">{actions}</div> : null}
      </header>

      <div
        className={cn(
          'grid min-h-0 flex-none gap-2 p-1.5 sm:p-2 xl:flex-1',
          activeScene === 'watch' && 'grid-cols-1 grid-rows-[minmax(280px,56vh)_minmax(260px,1fr)]',
          activeScene === 'note' &&
            'grid-cols-1 grid-rows-[minmax(260px,44vh)_minmax(240px,40vh)_minmax(320px,1fr)] lg:grid-cols-[minmax(340px,.88fr)_minmax(420px,1.12fr)] lg:grid-rows-[minmax(220px,.68fr)_minmax(220px,.52fr)]',
          activeScene === 'output' &&
            'grid-cols-1 grid-rows-[minmax(220px,36vh)_minmax(220px,34vh)_minmax(420px,1fr)] lg:grid-cols-[minmax(300px,.55fr)_minmax(520px,1.45fr)] lg:grid-rows-[minmax(220px,.54fr)_minmax(220px,.46fr)]',
          'xl:gap-x-0 xl:gap-y-2',
          'xl:grid-cols-[minmax(300px,.82fr)_10px_minmax(540px,1.62fr)_10px_minmax(286px,.74fr)] xl:grid-rows-[minmax(330px,.54fr)_minmax(260px,.46fr)]'
        )}
        ref={gridRef}
        style={desktopGridStyle}
      >
        <StudioRegion
          className={cn(
            activeScene === 'note' && 'lg:col-start-1 lg:row-start-1',
            activeScene === 'output' && 'lg:col-start-1 lg:row-start-1',
            'xl:col-start-3 xl:row-start-1 xl:block'
          )}
          label={labels.regions.video}
          region="video"
        >
          {video}
        </StudioRegion>
        <StudioRegion
          className={cn(
            activeScene === 'note' && 'lg:col-start-1 lg:row-start-2',
            activeScene === 'output' && 'lg:col-start-1 lg:row-start-2',
            'xl:col-start-3 xl:row-start-2 xl:block'
          )}
          label={labels.regions.transcript}
          region="transcript"
        >
          {transcript}
        </StudioRegion>
        <StudioRegion
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-5 xl:row-span-2 xl:row-start-1 xl:block"
          collapsedOnDesktop={layout.rightCollapsed}
          hidden={activeScene !== 'note'}
          label={labels.regions.note}
          region="note"
        >
          {note}
        </StudioRegion>
        <LayoutHandle
          collapsed={layout.rightCollapsed}
          collapseLabel={labels.layout.collapseNote}
          expandLabel={labels.layout.expandNote}
          onDrag={beginResize('right')}
          onNudge={(delta) =>
            setLayout((current) => ({
              ...current,
              rightCollapsed: false,
              rightWidth: clampStudySideWidth(current.rightWidth + delta * 16)
            }))
          }
          onToggle={() =>
            setLayout((current) => ({ ...current, rightCollapsed: !current.rightCollapsed }))
          }
          resizeLabel={labels.layout.resizeNote}
          side="right"
        />
        <StudioRegion
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:block"
          collapsedOnDesktop={layout.leftCollapsed}
          hidden={activeScene !== 'output'}
          label={labels.regions.output}
          region="output"
        >
          {output}
        </StudioRegion>
        <LayoutHandle
          collapsed={layout.leftCollapsed}
          collapseLabel={labels.layout.collapseOutput}
          expandLabel={labels.layout.expandOutput}
          onDrag={beginResize('left')}
          onNudge={(delta) =>
            setLayout((current) => ({
              ...current,
              leftCollapsed: false,
              leftWidth: clampStudySideWidth(current.leftWidth + delta * 16)
            }))
          }
          onToggle={() =>
            setLayout((current) => ({ ...current, leftCollapsed: !current.leftCollapsed }))
          }
          resizeLabel={labels.layout.resizeOutput}
          side="left"
        />
      </div>
    </main>
  )
}
