import { RemoteImage } from '@renderer/components/ui/remote-image'
import { Response } from '@renderer/components/ui/response'
import {
  createStudyNoteBlock,
  formatStudyTimestamp,
  serializeStudyDocumentToMarkdown
} from '@renderer/lib/study-studio/markdown'
import type {
  StudyBlockEditorLabels,
  StudyMarkdownLabels,
  StudyNoteBlock,
  StudyNoteBlockKind,
  StudyNoteDocument
} from '@renderer/lib/study-studio/types'
import { cn } from '@renderer/lib/utils'
import {
  BotMessageSquare,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  CodeXml,
  ImageIcon,
  Lightbulb,
  ListPlus,
  LoaderCircle,
  Quote,
  Sparkles,
  Trash2,
  Type
} from 'lucide-react'
import { type ComponentType, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const blockIcons: Record<StudyNoteBlockKind, ComponentType<{ className?: string }>> = {
  ai: BotMessageSquare,
  mermaid: CodeXml,
  paragraph: Type,
  question: CircleHelp,
  quote: Quote,
  reflection: Lightbulb,
  screenshot: ImageIcon
}

const INPUT_CLASS =
  'w-full rounded-lg border border-stone-300/70 bg-background/80 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/65 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15 dark:border-white/10'
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-24 resize-y leading-6`

interface FieldProps {
  label: string
  onChange: (value: string) => void
  rows?: number
  value: string
}

function TextAreaField({ label, onChange, rows = 4, value }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em]">
        {label}
      </span>
      <textarea
        className={TEXTAREA_CLASS}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </label>
  )
}

function InputField({ label, onChange, value }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em]">
        {label}
      </span>
      <input
        className={INPUT_CLASS}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

interface BlockFieldsProps {
  block: StudyNoteBlock
  labels: StudyBlockEditorLabels
  onPatch: (patch: Partial<StudyNoteBlock>) => void
}

function BlockFields({ block, labels, onPatch }: BlockFieldsProps) {
  const fields = labels.fields
  switch (block.kind) {
    case 'paragraph':
    case 'reflection':
      return (
        <TextAreaField
          label={fields.content}
          onChange={(markdown) => onPatch({ markdown })}
          value={block.markdown}
        />
      )
    case 'question':
      return (
        <div className="space-y-3">
          <TextAreaField
            label={fields.content}
            onChange={(markdown) => onPatch({ markdown })}
            value={block.markdown}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              checked={block.resolved ?? false}
              className="size-4 accent-amber-500"
              onChange={(event) => onPatch({ resolved: event.target.checked })}
              type="checkbox"
            />
            {fields.resolved}
          </label>
        </div>
      )
    case 'quote':
      return (
        <div className="space-y-3">
          <TextAreaField
            label={fields.quote}
            onChange={(quote) => onPatch({ quote })}
            value={block.quote}
          />
          <TextAreaField
            label={fields.note}
            onChange={(note) => onPatch({ note })}
            rows={2}
            value={block.note ?? ''}
          />
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <label className="block space-y-1.5">
              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em]">
                {fields.timestamp}
              </span>
              <input
                className={INPUT_CLASS}
                min={0}
                onChange={(event) => onPatch({ startMs: Number(event.target.value) * 1000 })}
                step={0.1}
                type="number"
                value={block.startMs / 1000}
              />
            </label>
            <InputField
              label={fields.sourceUrl}
              onChange={(sourceUrl) => onPatch({ sourceUrl })}
              value={block.sourceUrl ?? ''}
            />
          </div>
        </div>
      )
    case 'screenshot':
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(180px,.7fr)_minmax(240px,1.3fr)]">
          <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-xl border border-stone-300/65 bg-stone-100 dark:border-white/10 dark:bg-stone-900">
            {block.imageSrc ? (
              <RemoteImage
                alt={block.alt}
                className="size-full max-h-64 object-contain"
                src={block.imageSrc}
              />
            ) : (
              <ImageIcon aria-hidden className="size-8 text-muted-foreground/45" />
            )}
          </div>
          <div className="space-y-3">
            <InputField
              label={fields.imageSrc}
              onChange={(imageSrc) => onPatch({ imageSrc })}
              value={block.imageSrc}
            />
            <InputField label={fields.alt} onChange={(alt) => onPatch({ alt })} value={block.alt} />
            <InputField
              label={fields.caption}
              onChange={(caption) => onPatch({ caption })}
              value={block.caption ?? ''}
            />
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <label className="block space-y-1.5">
                <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em]">
                  {fields.timestamp}
                </span>
                <input
                  className={INPUT_CLASS}
                  min={0}
                  onChange={(event) => onPatch({ timestampMs: Number(event.target.value) * 1000 })}
                  step={0.1}
                  type="number"
                  value={block.timestampMs / 1000}
                />
              </label>
              <InputField
                label={fields.sourceUrl}
                onChange={(sourceUrl) => onPatch({ sourceUrl })}
                value={block.sourceUrl ?? ''}
              />
            </div>
          </div>
        </div>
      )
    case 'mermaid':
      return (
        <div className="space-y-3">
          <InputField
            label={fields.title}
            onChange={(title) => onPatch({ title })}
            value={block.title ?? ''}
          />
          {block.code.trim() ? (
            <div className="overflow-hidden rounded-xl border border-stone-300/65 bg-stone-50/70 dark:border-white/10 dark:bg-stone-950/40">
              <div className="border-stone-300/55 border-b px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[.1em] dark:border-white/8">
                {labels.mermaidPreview}
              </div>
              <Response className="min-h-44 overflow-auto p-4">
                {`\`\`\`mermaid\n${block.code}\n\`\`\``}
              </Response>
            </div>
          ) : null}
          <details
            className="rounded-xl border border-stone-300/65 bg-background/70 dark:border-white/10"
            open={!block.code.trim()}
          >
            <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground text-xs">
              {labels.mermaidSource}
            </summary>
            <div className="border-stone-300/55 border-t p-3 dark:border-white/8">
              <TextAreaField
                label={fields.mermaid}
                onChange={(code) => onPatch({ code })}
                rows={7}
                value={block.code}
              />
            </div>
          </details>
        </div>
      )
    case 'ai':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              label={fields.prompt}
              onChange={(promptLabel) => onPatch({ promptLabel })}
              value={block.promptLabel ?? ''}
            />
            <InputField
              label={fields.model}
              onChange={(model) => onPatch({ model })}
              value={block.model ?? ''}
            />
          </div>
          <TextAreaField
            label={fields.content}
            onChange={(markdown) => onPatch({ markdown })}
            rows={7}
            value={block.markdown}
          />
        </div>
      )
    default:
      return null
  }
}

interface StudyBlockCardProps {
  aiBusy: boolean
  block: StudyNoteBlock
  index: number
  labels: StudyBlockEditorLabels
  onDelete: () => void
  onAiGenerate?: () => void
  onMove: (offset: -1 | 1) => void
  onPatch: (patch: Partial<StudyNoteBlock>) => void
  onSeek?: (seconds: number) => void
  total: number
}

function StudyBlockCard({
  aiBusy,
  block,
  index,
  labels,
  onDelete,
  onAiGenerate,
  onMove,
  onPatch,
  onSeek,
  total
}: StudyBlockCardProps) {
  const Icon = blockIcons[block.kind]
  const timestampMs =
    block.kind === 'quote' ? block.startMs : block.kind === 'screenshot' ? block.timestampMs : null
  return (
    <article className="study-block-card group/block overflow-hidden rounded-xl border border-stone-300/70 bg-background/88 shadow-[0_16px_36px_-32px_rgba(0,0,0,.7)] transition focus-within:border-amber-500/35 dark:border-white/10">
      <header className="flex items-center gap-2 border-stone-300/55 border-b bg-stone-100/62 px-3 py-2 dark:border-white/8 dark:bg-white/[.025]">
        <span className="inline-flex size-7 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <Icon aria-hidden className="size-3.5" />
        </span>
        <span className="font-semibold text-xs">{labels.blockKinds[block.kind]}</span>
        {timestampMs === null ? null : (
          <button
            className="ml-1 inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-amber-700 hover:underline disabled:cursor-default dark:text-amber-300"
            disabled={!onSeek}
            onClick={() => onSeek?.(timestampMs / 1000)}
            type="button"
          >
            <Clock3 aria-hidden className="size-3" />
            {formatStudyTimestamp(timestampMs)}
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {onAiGenerate ? (
            <button
              aria-label={`${labels.aiRegenerate} ${labels.blockKinds[block.kind]}`}
              className="mr-1 inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md px-2 font-semibold text-[11px] text-amber-700 transition hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-55 dark:text-amber-300"
              disabled={aiBusy || (block.kind === 'screenshot' && !block.imageSrc)}
              onClick={onAiGenerate}
              type="button"
            >
              {aiBusy ? (
                <LoaderCircle aria-hidden className="size-3 animate-spin" />
              ) : (
                <Sparkles aria-hidden className="size-3" />
              )}
              {aiBusy ? labels.aiGenerating : labels.aiRegenerate}
            </button>
          ) : null}
          <button
            aria-label={labels.moveUp}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-25"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            type="button"
          >
            <ChevronUp aria-hidden className="size-3.5" />
          </button>
          <button
            aria-label={labels.moveDown}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-25"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            type="button"
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </button>
          <button
            aria-label={labels.deleteBlock}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-600"
            onClick={onDelete}
            type="button"
          >
            <Trash2 aria-hidden className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="p-3 sm:p-4">
        <BlockFields block={block} labels={labels} onPatch={onPatch} />
      </div>
    </article>
  )
}

export interface StudyBlockEditorProps {
  aiBusyKey?: string | null
  className?: string
  document: StudyNoteDocument
  labels: StudyBlockEditorLabels
  markdownLabels?: StudyMarkdownLabels
  onChange: (document: StudyNoteDocument) => void
  onAiGenerate?: (kind: StudyNoteBlockKind, block?: StudyNoteBlock) => void
  onMarkdownChange?: (markdown: string) => void
  onSeek?: (seconds: number) => void
}

export function StudyBlockEditor({
  aiBusyKey = null,
  className,
  document,
  labels,
  markdownLabels,
  onChange,
  onAiGenerate,
  onMarkdownChange,
  onSeek
}: StudyBlockEditorProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const latestDocumentRef = useRef(document)
  latestDocumentRef.current = document
  const markdown = useMemo(
    () => serializeStudyDocumentToMarkdown(document, markdownLabels),
    [document, markdownLabels]
  )

  const commit = (nextDocument: StudyNoteDocument): void => {
    onChange(nextDocument)
    onMarkdownChange?.(serializeStudyDocumentToMarkdown(nextDocument, markdownLabels))
  }

  const patchBlock = (id: string, patch: Partial<StudyNoteBlock>): void => {
    commit({
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === id ? ({ ...block, ...patch, updatedAt: Date.now() } as StudyNoteBlock) : block
      )
    })
  }

  const moveBlock = (index: number, offset: -1 | 1): void => {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= document.blocks.length) {
      return
    }
    const blocks = [...document.blocks]
    const [block] = blocks.splice(index, 1)
    if (!block) {
      return
    }
    blocks.splice(nextIndex, 0, block)
    commit({ ...document, blocks })
  }

  const addBlock = (kind: StudyNoteBlockKind): void => {
    commit({ ...document, blocks: [...document.blocks, createStudyNoteBlock(kind)] })
    setAddMenuOpen(false)
  }

  const aiGenerationKinds = (Object.keys(blockIcons) as StudyNoteBlockKind[]).filter(
    (kind) => kind !== 'screenshot'
  )

  const deleteBlock = (block: StudyNoteBlock, index: number): void => {
    commit({ ...document, blocks: document.blocks.filter((item) => item.id !== block.id) })
    toast(labels.blockDeleted, {
      action: {
        label: labels.undoDelete,
        onClick: () => {
          const current = latestDocumentRef.current
          if (current.blocks.some((item) => item.id === block.id)) {
            return
          }
          const blocks = [...current.blocks]
          blocks.splice(Math.min(index, blocks.length), 0, block)
          commit({ ...current, blocks })
        }
      }
    })
  }

  return (
    <section
      aria-label={labels.title}
      className={cn('study-block-editor flex h-full min-h-0 flex-col', className)}
    >
      <header className="study-block-editor-header shrink-0 border-stone-300/60 border-b bg-background/80 p-3 backdrop-blur-sm sm:p-4 dark:border-white/8">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="study-note-title">
              {labels.fields.title}
            </label>
            <input
              className="w-full border-0 bg-transparent font-semibold text-base outline-none placeholder:text-muted-foreground"
              id="study-note-title"
              onChange={(event) => commit({ ...document, title: event.target.value })}
              value={document.title}
            />
          </div>
          {onAiGenerate ? (
            <button
              aria-expanded={aiMenuOpen}
              className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-stone-950 px-3 font-semibold text-amber-300 text-xs transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-wait disabled:opacity-60 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
              disabled={aiBusyKey !== null}
              onClick={() => {
                setAiMenuOpen((open) => !open)
                setAddMenuOpen(false)
              }}
              type="button"
            >
              {aiBusyKey ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden className="size-4" />
              )}
              {aiBusyKey ? labels.aiGenerating : labels.aiGenerate}
            </button>
          ) : null}
          <button
            aria-expanded={addMenuOpen}
            className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-stone-300/70 bg-background px-3 font-semibold text-xs transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-white/10 dark:hover:bg-white/5"
            onClick={() => {
              setAddMenuOpen((open) => !open)
              setAiMenuOpen(false)
            }}
            type="button"
          >
            <ListPlus aria-hidden className="size-4" />
            {labels.addBlock}
          </button>
        </div>
        {aiMenuOpen && onAiGenerate ? (
          <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-amber-500/20 bg-background p-2 shadow-xl sm:grid-cols-2 xl:grid-cols-3">
            {aiGenerationKinds.map((kind) => {
              const Icon = blockIcons[kind]
              return (
                <button
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-xs transition hover:bg-amber-500/10 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:hover:text-amber-300"
                  key={kind}
                  onClick={() => {
                    onAiGenerate(kind)
                    setAiMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {labels.aiActions[kind]}
                </button>
              )
            })}
          </div>
        ) : null}
        {addMenuOpen ? (
          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl border border-stone-300/70 bg-background p-2 shadow-xl sm:grid-cols-4 dark:border-white/10">
            {Object.entries(blockIcons).map(([kind, Icon]) => (
              <button
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-xs transition hover:bg-amber-500/10 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:hover:text-amber-300"
                key={kind}
                onClick={() => addBlock(kind as StudyNoteBlockKind)}
                type="button"
              >
                <Icon aria-hidden className="size-3.5 shrink-0" />
                {labels.blockKinds[kind as StudyNoteBlockKind]}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {document.blocks.length === 0 ? (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-stone-300/70 bg-background/55 p-8 text-center dark:border-white/10">
            <EditorialEmptyMark />
            <p className="mt-4 font-semibold text-sm">{labels.emptyTitle}</p>
            <p className="mt-1 max-w-sm text-muted-foreground text-xs leading-5">
              {labels.emptyDescription}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {document.blocks.map((block, index) => (
              <StudyBlockCard
                aiBusy={aiBusyKey === block.id}
                block={block}
                index={index}
                key={block.id}
                labels={labels}
                onAiGenerate={onAiGenerate ? () => onAiGenerate(block.kind, block) : undefined}
                onDelete={() => deleteBlock(block, index)}
                onMove={(offset) => moveBlock(index, offset)}
                onPatch={(patch) => patchBlock(block.id, patch)}
                onSeek={onSeek}
                total={document.blocks.length}
              />
            ))}
          </div>
        )}
        <details className="mt-4 rounded-xl border border-stone-300/60 bg-background/65 dark:border-white/8">
          <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground text-xs">
            {labels.markdownPreview}
          </summary>
          <pre className="max-h-80 overflow-auto border-stone-300/55 border-t p-3 font-mono text-[11px] leading-5 dark:border-white/8">
            {markdown}
          </pre>
        </details>
      </div>
    </section>
  )
}

function EditorialEmptyMark() {
  return (
    <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
      <span className="h-px w-8 bg-current opacity-45" />
      <Lightbulb aria-hidden className="size-5" />
      <span className="h-px w-8 bg-current opacity-45" />
    </div>
  )
}
