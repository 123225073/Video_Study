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
  NotebookPen,
  Play
} from 'lucide-react'
import { type KeyboardEvent, useEffect } from 'react'

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

  if (!(visible && selection.text.trim())) {
    return null
  }

  const placeBelowSelection = Boolean(anchor && anchor.top < 84)
  const anchorStyle = anchor
    ? {
        left: `clamp(176px, ${anchor.left + anchor.width / 2}px, calc(100vw - 176px))`,
        top: placeBelowSelection ? anchor.top + anchor.height + 10 : anchor.top - 10
      }
    : undefined

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'z-50 flex max-w-[calc(100vw-16px)] origin-bottom flex-wrap items-center justify-center gap-0.5 rounded-xl border border-amber-300/30 bg-stone-950/96 p-1.5 text-stone-100 shadow-[0_18px_46px_-16px_rgba(0,0,0,.78)] backdrop-blur-xl',
        anchor && 'fixed -translate-x-1/2',
        anchor && !placeBelowSelection && '-translate-y-full',
        className
      )}
      data-testid="transcript-selection-toolbar"
      role="toolbar"
      style={anchorStyle}
    >
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
