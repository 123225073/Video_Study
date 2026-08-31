import type {
  FloatingAnchorRect,
  TranscriptSelection,
  TranscriptSelectionAction,
  TranscriptSelectionIntent
} from '@renderer/lib/study-studio/types'
import { cn } from '@renderer/lib/utils'
import {
  BotMessageSquare,
  Clipboard,
  Highlighter,
  ImageIcon,
  Lightbulb,
  Move,
  NotebookPen,
  Play
} from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'

const TOOLBAR_POSITION_KEY = 'fengsha-transcript-toolbar-position-v1'
const VIEWPORT_MARGIN = 8

interface ToolbarPosition {
  left: number
  top: number
}

const clampPosition = (
  position: ToolbarPosition,
  width: number,
  height: number
): ToolbarPosition => ({
  left: Math.min(
    Math.max(VIEWPORT_MARGIN, position.left),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
  ),
  top: Math.min(
    Math.max(VIEWPORT_MARGIN, position.top),
    Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
  )
})

const loadToolbarPosition = (): ToolbarPosition | null => {
  try {
    const value = JSON.parse(window.localStorage.getItem(TOOLBAR_POSITION_KEY) ?? 'null') as unknown
    if (
      value &&
      typeof value === 'object' &&
      'left' in value &&
      'top' in value &&
      typeof value.left === 'number' &&
      typeof value.top === 'number'
    ) {
      return { left: value.left, top: value.top }
    }
  } catch {
    // Ignore stale local layout data and use the selection anchor.
  }
  return null
}

const TOOLBAR_ACTIONS = [
  { icon: Play, intent: 'seek' },
  { icon: Clipboard, intent: 'copy' },
  { icon: Highlighter, intent: 'highlight' },
  { icon: NotebookPen, intent: 'note' },
  { icon: Lightbulb, intent: 'reflection' },
  { icon: ImageIcon, intent: 'quote-card' },
  { icon: BotMessageSquare, intent: 'ask-ai' }
] as const

interface TranscriptSelectionToolbarProps {
  anchor?: FloatingAnchorRect
  ariaLabel: string
  className?: string
  labels: Record<TranscriptSelectionIntent, string>
  onDismiss?: () => void
  onIntent: (action: TranscriptSelectionAction) => void
  selection: TranscriptSelection
  visible?: boolean
}

const focusAdjacentAction = (event: KeyboardEvent<HTMLButtonElement>): void => {
  if (!(event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    return
  }
  event.preventDefault()
  const buttons = [...(event.currentTarget.parentElement?.querySelectorAll('button') ?? [])]
  const currentIndex = buttons.indexOf(event.currentTarget)
  const offset = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (currentIndex + offset + buttons.length) % buttons.length
  buttons[nextIndex]?.focus()
}

export function TranscriptSelectionToolbar({
  anchor,
  ariaLabel,
  className,
  labels,
  onDismiss,
  onIntent,
  selection,
  visible = true
}: TranscriptSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const [position, setPosition] = useState<ToolbarPosition | null>(() => loadToolbarPosition())

  useEffect(() => {
    if (!(visible && onDismiss)) {
      return
    }
    const dismissOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }
    document.addEventListener('keydown', dismissOnEscape)
    return () => document.removeEventListener('keydown', dismissOnEscape)
  }, [onDismiss, visible])

  useEffect(() => {
    if (!(visible && onDismiss)) {
      return
    }
    const dismissOnOutsidePointer = (event: globalThis.PointerEvent): void => {
      if (!(event.target instanceof Node && toolbarRef.current?.contains(event.target))) {
        onDismiss()
      }
    }
    document.addEventListener('pointerdown', dismissOnOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', dismissOnOutsidePointer, true)
  }, [onDismiss, visible])

  useEffect(() => {
    if (!visible) {
      return
    }
    const keepInsideViewport = (): void => {
      const toolbar = toolbarRef.current
      if (!toolbar) {
        return
      }
      setPosition((current) => {
        if (!current) {
          return current
        }
        const next = clampPosition(current, toolbar.offsetWidth, toolbar.offsetHeight)
        return next.left === current.left && next.top === current.top ? current : next
      })
    }
    window.addEventListener('resize', keepInsideViewport)
    keepInsideViewport()
    return () => window.removeEventListener('resize', keepInsideViewport)
  }, [visible])

  const beginDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) {
      return
    }
    const toolbar = toolbarRef.current
    if (!toolbar) {
      return
    }
    const rect = toolbar.getBoundingClientRect()
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    const toolbar = toolbarRef.current
    if (!(drag && toolbar)) {
      return
    }
    setPosition(
      clampPosition(
        { left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY },
        toolbar.offsetWidth,
        toolbar.offsetHeight
      )
    )
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    setPosition((current) => {
      if (current) {
        window.localStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify(current))
      }
      return current
    })
  }

  if (!(visible && selection.text.trim())) {
    return null
  }

  const placeBelowSelection = Boolean(anchor && anchor.top < 84)
  const anchorStyle = position
    ? { left: position.left, top: position.top }
    : anchor
      ? {
          left: `clamp(176px, ${anchor.left + anchor.width / 2}px, calc(100vw - 176px))`,
          top: placeBelowSelection ? anchor.top + anchor.height + 10 : anchor.top - 10
        }
      : undefined

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'z-50 flex max-w-[calc(100vw-16px)] touch-none select-none flex-wrap items-center justify-center gap-0.5 rounded-xl border border-amber-300/30 bg-stone-950/96 p-1.5 text-stone-100 shadow-[0_18px_46px_-16px_rgba(0,0,0,.78)] backdrop-blur-xl',
        anchor && 'fixed',
        anchor && !position && '-translate-x-1/2',
        anchor && !position && !placeBelowSelection && '-translate-y-full',
        className
      )}
      data-testid="transcript-selection-toolbar"
      onPointerCancel={endDrag}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      ref={toolbarRef}
      role="toolbar"
      style={anchorStyle}
    >
      <span
        aria-hidden="true"
        className="mr-0.5 inline-flex h-9 cursor-grab items-center rounded-lg px-1 text-stone-400 active:cursor-grabbing"
        title={ariaLabel}
      >
        <Move className="size-3.5" />
      </span>
      {TOOLBAR_ACTIONS.map((action) => {
        const Icon = action.icon
        return (
          <button
            aria-label={labels[action.intent]}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 font-medium text-[11px] transition hover:bg-amber-300 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            data-intent={action.intent}
            key={action.intent}
            onClick={() => onIntent({ intent: action.intent, selection })}
            onKeyDown={focusAdjacentAction}
            type="button"
          >
            <Icon aria-hidden className="size-3.5" />
            <span>{labels[action.intent]}</span>
          </button>
        )
      })}
    </div>
  )
}
