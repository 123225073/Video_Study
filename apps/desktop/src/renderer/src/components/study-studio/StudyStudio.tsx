import type {
  StudyScene,
  StudyStudioLabels,
  StudyStudioSlots
} from '@renderer/lib/study-studio/types'
import { cn } from '@renderer/lib/utils'
import { BookOpenText, Clapperboard, PenLine } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'

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
  hidden?: boolean
  label: string
  region: keyof StudyStudioSlots
}

function StudioRegion({ children, className, hidden = false, label, region }: StudioRegionProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'study-studio-region relative min-h-0 min-w-0 scroll-mt-20 overflow-hidden rounded-xl border border-stone-300/70 bg-background shadow-[0_18px_48px_-34px_rgba(15,15,12,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-inset dark:border-white/10',
        hidden && 'hidden',
        className
      )}
      data-study-region={region}
      tabIndex={-1}
    >
      <div className="size-full min-h-0">{children}</div>
    </section>
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
  const activeScene = scene ?? localScene

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
      <header className="study-studio-header sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-stone-300/55 border-b bg-background/92 px-4 py-2.5 backdrop-blur-xl dark:border-white/8">
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
          'grid min-h-0 flex-none gap-2 p-2 sm:gap-3 sm:p-3 xl:flex-1',
          activeScene === 'watch' && 'grid-cols-1 grid-rows-[minmax(280px,56vh)_minmax(260px,1fr)]',
          activeScene === 'note' &&
            'grid-cols-1 grid-rows-[minmax(260px,44vh)_minmax(240px,40vh)_minmax(320px,1fr)] lg:grid-cols-[minmax(340px,.88fr)_minmax(420px,1.12fr)] lg:grid-rows-[minmax(220px,.68fr)_minmax(220px,.52fr)]',
          activeScene === 'output' &&
            'grid-cols-1 grid-rows-[minmax(220px,36vh)_minmax(220px,34vh)_minmax(420px,1fr)] lg:grid-cols-[minmax(300px,.55fr)_minmax(520px,1.45fr)] lg:grid-rows-[minmax(220px,.54fr)_minmax(220px,.46fr)]',
          'xl:grid-cols-[minmax(310px,.86fr)_minmax(560px,1.55fr)_minmax(300px,.78fr)] xl:grid-rows-[minmax(240px,.46fr)_minmax(280px,.54fr)]'
        )}
      >
        <StudioRegion
          className={cn(
            activeScene === 'note' && 'lg:col-start-1 lg:row-start-1',
            activeScene === 'output' && 'lg:col-start-1 lg:row-start-1',
            'xl:col-start-2 xl:row-start-1 xl:block'
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
            'xl:col-start-2 xl:row-start-2 xl:block'
          )}
          label={labels.regions.transcript}
          region="transcript"
        >
          {transcript}
        </StudioRegion>
        <StudioRegion
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:block"
          hidden={activeScene !== 'note'}
          label={labels.regions.note}
          region="note"
        >
          {note}
        </StudioRegion>
        <StudioRegion
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:block"
          hidden={activeScene !== 'output'}
          label={labels.regions.output}
          region="output"
        >
          {output}
        </StudioRegion>
      </div>
    </main>
  )
}
