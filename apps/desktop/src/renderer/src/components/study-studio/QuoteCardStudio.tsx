import { RemoteImage } from '@renderer/components/ui/remote-image'
import {
  downloadQuoteCardPng,
  renderQuoteCardPng,
  safeQuoteCardFileName
} from '@renderer/lib/study-studio/quote-card-export'
import type {
  QuoteCardAspect,
  QuoteCardDraft,
  QuoteCardFontScale,
  QuoteCardStudioLabels,
  QuoteCardTemplate,
  QuoteCardTheme
} from '@renderer/lib/study-studio/types'
import { cn } from '@renderer/lib/utils'
import { Download, ImageIcon, Quote, Sparkles } from 'lucide-react'
import { type CSSProperties, type Ref, useId, useLayoutEffect, useRef, useState } from 'react'

const CARD_WIDTH = 540
const CARD_HEIGHTS: Record<QuoteCardAspect, number> = {
  portrait: 720,
  square: 540,
  story: 960
}

const CARD_THEME: Record<
  QuoteCardTheme,
  { accent: string; background: string; muted: string; text: string }
> = {
  forest: {
    accent: '#e6b85a',
    background: '#14261f',
    muted: 'rgba(235,239,219,.66)',
    text: '#f2f1e6'
  },
  ink: {
    accent: '#f5bd58',
    background: '#181614',
    muted: 'rgba(255,255,255,.58)',
    text: '#faf7ef'
  },
  paper: {
    accent: '#a95d19',
    background: '#eee5d0',
    muted: 'rgba(49,39,28,.62)',
    text: '#2e261e'
  }
}

const QUOTE_FONT_SIZE: Record<QuoteCardFontScale, number> = {
  balanced: 31,
  compact: 25,
  large: 38
}

const FIELD_CLASS =
  'w-full rounded-lg border border-stone-300/70 bg-background/82 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/65 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15 dark:border-white/10'

interface QuoteCardPreviewProps {
  brandName: string
  cardRef?: Ref<HTMLDivElement>
  draft: QuoteCardDraft
  labels: Pick<QuoteCardStudioLabels, 'insightLabel' | 'videoNoteLabel'>
}

function SourceLine({ draft }: { draft: QuoteCardDraft }) {
  const source = [draft.sourceTitle, draft.sourceAuthor].filter(Boolean).join(' · ')
  if (!(draft.showSource && (source || draft.timestampLabel))) {
    return null
  }
  return (
    <div className="flex items-end justify-between gap-4 font-medium text-[12px] tracking-wide">
      <span className="line-clamp-2 max-w-[75%]">{source}</span>
      <span className="shrink-0 font-mono">{draft.timestampLabel}</span>
    </div>
  )
}

function CardFooter({ brandName, draft }: { brandName: string; draft: QuoteCardDraft }) {
  return (
    <footer className="flex items-center justify-between gap-4 border-current/15 border-t pt-5 text-[11px] uppercase tracking-[.16em]">
      <span>{draft.signature}</span>
      {draft.showBrand ? (
        <span className="inline-flex items-center gap-2 font-bold">
          <span className="inline-block size-2 rotate-45 bg-current" />
          {brandName}
        </span>
      ) : null}
    </footer>
  )
}

export function QuoteCardPreview({ brandName, cardRef, draft, labels }: QuoteCardPreviewProps) {
  const theme = CARD_THEME[draft.theme]
  const cardStyle = {
    background: theme.background,
    color: theme.text,
    height: CARD_HEIGHTS[draft.aspect],
    width: CARD_WIDTH,
    '--quote-accent': theme.accent,
    '--quote-muted': theme.muted
  } as CSSProperties
  const quoteStyle = { fontSize: QUOTE_FONT_SIZE[draft.fontScale] }

  if (draft.template === 'visual-quote') {
    return (
      <article
        className="relative flex shrink-0 flex-col justify-between overflow-hidden p-10"
        data-quote-card
        ref={cardRef}
        style={cardStyle}
      >
        {draft.imageSrc ? (
          <RemoteImage
            alt=""
            className="absolute inset-0 size-full object-cover"
            src={draft.imageSrc}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-15">
            <ImageIcon aria-hidden className="size-28" />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,.8))]" />
        <div className="relative ml-auto h-1 w-20" style={{ background: theme.accent }} />
        <div className="relative mt-auto text-white">
          <Quote aria-hidden className="mb-5 size-8" style={{ color: theme.accent }} />
          <blockquote
            className="font-semibold leading-[1.48] tracking-[-.025em]"
            style={quoteStyle}
          >
            {draft.quote}
          </blockquote>
          <div className="mt-7 text-white/68">
            <SourceLine draft={draft} />
          </div>
          <div className="mt-6 text-white/72">
            <CardFooter brandName={brandName} draft={draft} />
          </div>
        </div>
      </article>
    )
  }

  if (draft.template === 'quote-reflection') {
    const imageHeight = draft.aspect === 'story' ? 360 : 250
    return (
      <article
        className="relative flex shrink-0 flex-col overflow-hidden"
        data-quote-card
        ref={cardRef}
        style={cardStyle}
      >
        <div className="relative shrink-0 overflow-hidden" style={{ height: imageHeight }}>
          {draft.imageSrc ? (
            <RemoteImage alt="" className="size-full object-cover" src={draft.imageSrc} />
          ) : (
            <div className="flex size-full items-center justify-center bg-black/12">
              <ImageIcon aria-hidden className="size-20 opacity-20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="absolute right-7 bottom-6 left-7 text-white/78">
            <SourceLine draft={draft} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-9">
          <blockquote className="font-semibold leading-[1.45]" style={quoteStyle}>
            {draft.quote}
          </blockquote>
          {draft.reflection ? (
            <div
              className="mt-6 border-l-2 pl-5 text-[16px] leading-7"
              style={{ borderColor: theme.accent }}
            >
              <p
                className="inline-flex rounded-full border border-current/20 px-2.5 py-1 font-semibold text-[10px] tracking-[.14em]"
                style={{ color: theme.accent }}
              >
                {labels.insightLabel}
              </p>
              <p className="mt-2" style={{ color: theme.muted }}>
                {draft.reflection}
              </p>
            </div>
          ) : null}
          <div className="mt-auto pt-6" style={{ color: theme.muted }}>
            <CardFooter brandName={brandName} draft={draft} />
          </div>
        </div>
      </article>
    )
  }

  return (
    <article
      className="relative flex shrink-0 flex-col overflow-hidden p-11"
      data-quote-card
      ref={cardRef}
      style={cardStyle}
    >
      <div
        aria-hidden
        className="absolute -top-16 -right-20 size-72 rounded-full opacity-15 blur-2xl"
        style={{ background: theme.accent }}
      />
      <div className="relative flex items-center justify-between">
        <span
          className="inline-flex rounded-full border border-current/20 px-2.5 py-1 font-semibold text-[10px] tracking-[.16em]"
          style={{ color: theme.muted }}
        >
          {labels.videoNoteLabel}
        </span>
        <span className="h-px w-20" style={{ background: theme.accent }} />
      </div>
      <div className="relative my-auto">
        <Quote aria-hidden className="mb-7 size-9" style={{ color: theme.accent }} />
        <blockquote className="font-semibold leading-[1.52] tracking-[-.03em]" style={quoteStyle}>
          {draft.quote}
        </blockquote>
        <div className="mt-9" style={{ color: theme.muted }}>
          <SourceLine draft={draft} />
        </div>
      </div>
      <div className="relative" style={{ color: theme.muted }}>
        <CardFooter brandName={brandName} draft={draft} />
      </div>
    </article>
  )
}

interface SegmentControlProps<T extends string> {
  label: string
  labels: Record<T, string>
  onChange: (value: T) => void
  options: readonly T[]
  value: T
}

function SegmentControl<T extends string>({
  label,
  labels,
  onChange,
  options,
  value
}: SegmentControlProps<T>) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em]">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1 rounded-xl border border-stone-300/65 bg-stone-100/70 p-1 dark:border-white/10 dark:bg-white/[.025]">
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={cn(
              'min-h-8 flex-1 cursor-pointer rounded-lg px-2 font-medium text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
              value === option
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

interface LabeledFieldProps {
  label: string
  onChange: (value: string) => void
  textarea?: boolean
  value: string
}

function LabeledField({ label, onChange, textarea = false, value }: LabeledFieldProps) {
  const fieldId = useId()
  return (
    <div className="block space-y-1.5">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em]">
        <label htmlFor={fieldId}>{label}</label>
      </span>
      {textarea ? (
        <textarea
          className={`${FIELD_CLASS} min-h-24 resize-y leading-6`}
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <input
          className={FIELD_CLASS}
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      )}
    </div>
  )
}

export interface QuoteCardStudioProps {
  brandName: string
  className?: string
  draft: QuoteCardDraft
  labels: QuoteCardStudioLabels
  onChange: (draft: QuoteCardDraft) => void
  onExportError?: (error: unknown) => void
  onExportPng?: (blob: Blob, fileName: string) => Promise<void> | void
}

export function QuoteCardStudio({
  brandName,
  className,
  draft,
  labels,
  onChange,
  onExportError,
  onExportPng
}: QuoteCardStudioProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const studioRef = useRef<HTMLElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [studioWidth, setStudioWidth] = useState(0)

  useLayoutEffect(() => {
    const studio = studioRef.current
    const previewViewport = previewViewportRef.current
    if (!(studio && previewViewport)) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width)
        if (entry.target === studio) {
          setStudioWidth(width)
        } else if (entry.target === previewViewport) {
          setPreviewWidth(width)
        }
      }
    })
    observer.observe(studio)
    observer.observe(previewViewport)
    return () => observer.disconnect()
  }, [])

  const wideLayout = studioWidth >= 820
  const previewScale = previewWidth > 0 ? Math.min(1, previewWidth / CARD_WIDTH) : 1
  const previewHeight = CARD_HEIGHTS[draft.aspect]

  const patchDraft = (patch: Partial<QuoteCardDraft>): void => {
    onChange({ ...draft, ...patch })
  }

  const exportPng = async (): Promise<void> => {
    if (!cardRef.current) {
      return
    }
    setExportFailed(false)
    setExporting(true)
    try {
      const blob = await renderQuoteCardPng(cardRef.current)
      const fileName = safeQuoteCardFileName(draft.sourceTitle)
      if (onExportPng) {
        await onExportPng(blob, fileName)
      } else {
        downloadQuoteCardPng(blob, fileName)
      }
    } catch (error) {
      setExportFailed(true)
      onExportError?.(error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section
      className={cn(
        'grid h-full min-h-0 bg-background',
        wideLayout
          ? 'grid-cols-[360px_minmax(0,1fr)] grid-rows-1 overflow-hidden'
          : 'grid-cols-1 grid-rows-[minmax(280px,42%)_minmax(360px,1fr)] overflow-y-auto',
        className
      )}
      ref={studioRef}
    >
      <div
        className={cn(
          'min-h-0 overflow-y-auto border-stone-300/60 bg-[linear-gradient(180deg,rgba(245,158,11,.06),transparent_180px)] p-4 dark:border-white/8',
          wideLayout ? 'border-r' : 'border-b'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600">
            <Sparkles aria-hidden className="size-4" />
          </span>
          <div>
            <p className="font-semibold text-sm">{labels.brand}</p>
            <p className="text-muted-foreground text-xs">{brandName}</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <SegmentControl<QuoteCardTemplate>
            label={labels.template}
            labels={labels.templates}
            onChange={(template) => patchDraft({ template })}
            options={['quote', 'visual-quote', 'quote-reflection']}
            value={draft.template}
          />
          <div className="grid grid-cols-2 gap-3">
            <SegmentControl<QuoteCardAspect>
              label={labels.aspect}
              labels={labels.aspects}
              onChange={(aspect) => patchDraft({ aspect })}
              options={['square', 'portrait', 'story']}
              value={draft.aspect}
            />
            <SegmentControl<QuoteCardTheme>
              label={labels.theme}
              labels={labels.themes}
              onChange={(theme) => patchDraft({ theme })}
              options={['ink', 'paper', 'forest']}
              value={draft.theme}
            />
          </div>
          <SegmentControl<QuoteCardFontScale>
            label={labels.fontScale}
            labels={labels.fontScales}
            onChange={(fontScale) => patchDraft({ fontScale })}
            options={['compact', 'balanced', 'large']}
            value={draft.fontScale}
          />
          <LabeledField
            label={labels.fields.quote}
            onChange={(quote) => patchDraft({ quote })}
            textarea
            value={draft.quote}
          />
          {draft.template === 'quote-reflection' ? (
            <LabeledField
              label={labels.fields.reflection}
              onChange={(reflection) => patchDraft({ reflection })}
              textarea
              value={draft.reflection ?? ''}
            />
          ) : null}
          {draft.template === 'quote' ? null : (
            <LabeledField
              label={labels.fields.imageSrc}
              onChange={(imageSrc) => patchDraft({ imageSrc })}
              value={draft.imageSrc ?? ''}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <LabeledField
              label={labels.fields.sourceTitle}
              onChange={(sourceTitle) => patchDraft({ sourceTitle })}
              value={draft.sourceTitle ?? ''}
            />
            <LabeledField
              label={labels.fields.sourceAuthor}
              onChange={(sourceAuthor) => patchDraft({ sourceAuthor })}
              value={draft.sourceAuthor ?? ''}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField
              label={labels.fields.timestamp}
              onChange={(timestampLabel) => patchDraft({ timestampLabel })}
              value={draft.timestampLabel ?? ''}
            />
            <LabeledField
              label={labels.fields.signature}
              onChange={(signature) => patchDraft({ signature })}
              value={draft.signature ?? ''}
            />
          </div>
          <div className="flex flex-wrap gap-4 rounded-xl border border-stone-300/60 bg-background/70 p-3 text-xs dark:border-white/8">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                checked={draft.showSource}
                className="size-4 accent-amber-500"
                onChange={(event) => patchDraft({ showSource: event.target.checked })}
                type="checkbox"
              />
              {labels.showSource}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                checked={draft.showBrand}
                className="size-4 accent-amber-500"
                onChange={(event) => patchDraft({ showBrand: event.target.checked })}
                type="checkbox"
              />
              {labels.showBrand}
            </label>
          </div>
          <button
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 font-semibold text-amber-300 text-sm transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-wait disabled:opacity-65 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
            disabled={exporting || !draft.quote.trim()}
            onClick={() => void exportPng()}
            type="button"
          >
            <Download aria-hidden className="size-4" />
            {exporting ? labels.exporting : labels.export}
          </button>
          {exportFailed ? (
            <p aria-live="polite" className="text-red-600 text-xs">
              {labels.exportFailed}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="min-h-0 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,.12),transparent_36%),repeating-linear-gradient(135deg,rgba(120,113,108,.045)_0,rgba(120,113,108,.045)_1px,transparent_1px,transparent_11px)] p-5 sm:p-8"
        data-quote-card-preview="true"
        ref={previewViewportRef}
      >
        <p className="mb-4 font-semibold text-[10px] text-muted-foreground uppercase tracking-[.18em]">
          {labels.preview}
        </p>
        <div
          className="mx-auto overflow-hidden rounded-[3px] shadow-[0_32px_80px_-28px_rgba(0,0,0,.68)]"
          data-quote-card-preview-frame="true"
          style={{ height: previewHeight * previewScale, width: CARD_WIDTH * previewScale }}
        >
          <div
            style={{
              height: previewHeight,
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
              width: CARD_WIDTH
            }}
          >
            <QuoteCardPreview brandName={brandName} draft={draft} labels={labels} />
          </div>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
        <QuoteCardPreview brandName={brandName} cardRef={cardRef} draft={draft} labels={labels} />
      </div>
    </section>
  )
}
