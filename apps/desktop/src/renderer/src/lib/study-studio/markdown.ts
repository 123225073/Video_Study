import type {
  QuoteStudyBlock,
  ScreenshotStudyBlock,
  StudyMarkdownLabels,
  StudyNoteBlock,
  StudyNoteBlockKind,
  StudyNoteDocument,
  TranscriptSelection
} from './types'

const DEFAULT_MARKDOWN_LABELS: StudyMarkdownLabels = {
  ai: 'AI generated',
  question: 'Question',
  reflection: 'Reflection',
  source: 'Source'
}

const createBlockId = (): string => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `study-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const formatStudyTimestamp = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minuteText = String(minutes).padStart(hours > 0 ? 2 : 1, '0')
  const secondText = String(seconds).padStart(2, '0')
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`
}

const timestampUrl = (sourceUrl: string | undefined, milliseconds: number): string | null => {
  if (!sourceUrl) {
    return null
  }
  try {
    const url = new URL(sourceUrl)
    url.searchParams.set('t', String(Math.max(0, Math.floor(milliseconds / 1000))))
    return url.toString()
  } catch {
    return sourceUrl
  }
}

const quoteLines = (value: string): string =>
  value
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')

const serializeQuote = (block: QuoteStudyBlock, labels: StudyMarkdownLabels): string => {
  const clock = formatStudyTimestamp(block.startMs)
  const url = timestampUrl(block.sourceUrl, block.startMs)
  const source = url ? `[${clock}](${url})` : clock
  const note = block.note?.trim() ? `\n\n${block.note.trim()}` : ''
  return `${quoteLines(block.quote)}\n> — ${labels.source} ${source}${note}`
}

const serializeScreenshot = (block: ScreenshotStudyBlock, labels: StudyMarkdownLabels): string => {
  const clock = formatStudyTimestamp(block.timestampMs)
  const url = timestampUrl(block.sourceUrl, block.timestampMs)
  const source = url ? `[${clock}](${url})` : clock
  const caption = block.caption?.trim() ? `\n*${block.caption.trim()}*` : ''
  return `![${block.alt}](${block.imageSrc})${caption}\n\n${labels.source}: ${source}`
}

const serializeBlock = (block: StudyNoteBlock, labels: StudyMarkdownLabels): string => {
  switch (block.kind) {
    case 'paragraph':
      return block.markdown.trim()
    case 'quote':
      return serializeQuote(block, labels)
    case 'screenshot':
      return serializeScreenshot(block, labels)
    case 'reflection':
      return `> **${labels.reflection}**\n>\n${quoteLines(block.markdown)}`
    case 'question': {
      const checkbox = block.resolved ? '[x]' : '[ ]'
      return `- ${checkbox} **${labels.question}:** ${block.markdown.trim()}`
    }
    case 'mermaid': {
      const title = block.title?.trim() ? `### ${block.title.trim()}\n\n` : ''
      return `${title}\`\`\`mermaid\n${block.code.trim()}\n\`\`\``
    }
    case 'ai': {
      const details = [block.promptLabel, block.model].filter(Boolean).join(' · ')
      const suffix = details ? ` · ${details}` : ''
      return `> **${labels.ai}${suffix}**\n>\n${quoteLines(block.markdown)}`
    }
    default:
      return ''
  }
}

export const serializeStudyDocumentToMarkdown = (
  document: StudyNoteDocument,
  labels: StudyMarkdownLabels = DEFAULT_MARKDOWN_LABELS
): string => {
  const body = document.blocks
    .map((block) => serializeBlock(block, labels))
    .filter(Boolean)
    .join('\n\n---\n\n')
  return `# ${document.title.trim() || 'Untitled'}${body ? `\n\n${body}` : ''}\n`
}

const emptyBlockContent: Record<StudyNoteBlockKind, string> = {
  ai: '',
  mermaid: '',
  paragraph: '',
  question: '',
  quote: '',
  reflection: '',
  screenshot: ''
}

const LEGACY_MERMAID_PLACEHOLDER = /^flowchart\s+LR\s+A\[Source\]\s*-->\s*B\[Insight\]\s*$/iu

/** Remove the old sample diagram that earlier builds inserted into a manual block. */
export const isLegacyMermaidPlaceholder = (code: string): boolean =>
  LEGACY_MERMAID_PLACEHOLDER.test(code.trim())

export const createStudyNoteBlock = (
  kind: StudyNoteBlockKind,
  overrides: Partial<StudyNoteBlock> = {}
): StudyNoteBlock => {
  const timestamp = Date.now()
  const base = {
    createdAt: timestamp,
    id: createBlockId(),
    updatedAt: timestamp
  }
  switch (kind) {
    case 'paragraph':
      return {
        ...base,
        kind,
        markdown: emptyBlockContent.paragraph,
        ...overrides
      } as StudyNoteBlock
    case 'quote':
      return {
        ...base,
        kind,
        quote: emptyBlockContent.quote,
        startMs: 0,
        ...overrides
      } as StudyNoteBlock
    case 'screenshot':
      return {
        ...base,
        alt: '',
        imageSrc: emptyBlockContent.screenshot,
        kind,
        timestampMs: 0,
        ...overrides
      } as StudyNoteBlock
    case 'reflection':
      return {
        ...base,
        kind,
        markdown: emptyBlockContent.reflection,
        ...overrides
      } as StudyNoteBlock
    case 'question':
      return {
        ...base,
        kind,
        markdown: emptyBlockContent.question,
        resolved: false,
        ...overrides
      } as StudyNoteBlock
    case 'mermaid':
      return { ...base, code: emptyBlockContent.mermaid, kind, ...overrides } as StudyNoteBlock
    case 'ai':
      return { ...base, kind, markdown: emptyBlockContent.ai, ...overrides } as StudyNoteBlock
    default:
      throw new Error(`Unsupported study block kind: ${kind satisfies never}`)
  }
}

export const createQuoteBlockFromSelection = (
  selection: TranscriptSelection,
  sourceUrl?: string
): QuoteStudyBlock =>
  createStudyNoteBlock('quote', {
    endMs: selection.endMs,
    quote: selection.text,
    sourceUrl,
    startMs: selection.startMs
  }) as QuoteStudyBlock
