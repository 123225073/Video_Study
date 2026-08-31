import type {
  LearningNote,
  LearningNotebook,
  LearningNoteHighlight,
  LearningNoteKind
} from '@shared/learning-types'

export const formatLearningClock = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

const quoteAsMarkdown = (quote: string): string =>
  quote
    .trim()
    .split(/\r?\n/u)
    .map((line) => `> ${line}`)
    .join('\n')

export const appendTranscriptQuoteToNotebook = (
  markdown: string,
  quote: string,
  timestampMs: number
): string => {
  const normalizedQuote = quoteAsMarkdown(quote)
  if (!normalizedQuote) {
    return markdown
  }
  const reference = `[▶ ${formatLearningClock(timestampMs)}](#fengsha-seek-${Math.max(0, Math.round(timestampMs))})`
  const excerpt = `${reference}\n\n${normalizedQuote}`
  return markdown.trim() ? `${markdown.trimEnd()}\n\n${excerpt}\n` : `${excerpt}\n`
}

const LEGACY_NOTE_MARKER_PATTERN = /^[\t ]*<!-- fengsha-legacy-note:([^>]+) -->[\t ]*\r?\n?/gmu
const LEGACY_AREA_MARKER_PATTERN =
  /^[\t ]*<!-- fengsha-legacy-notes:(?:start|end) -->[\t ]*\r?\n?/gmu

export interface LegacyNoteMigrationResult {
  markdown: string
  migratedNoteIds: string[]
}

const decodeLegacyNoteId = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const migrateLegacyNotesToNotebook = (
  markdown: string,
  notes: LearningNote[],
  migratedNoteIds: string[],
  sectionTitle: string
): LegacyNoteMigrationResult => {
  const migratedIds = new Set(migratedNoteIds.filter(Boolean))
  for (const match of markdown.matchAll(LEGACY_NOTE_MARKER_PATTERN)) {
    if (match[1]) {
      migratedIds.add(decodeLegacyNoteId(match[1]))
    }
  }
  const cleanedMarkdown = markdown
    .replace(LEGACY_NOTE_MARKER_PATTERN, '')
    .replace(LEGACY_AREA_MARKER_PATTERN, '')
  const missingNotes = notes.filter((note) => note.text.trim() && !migratedIds.has(note.id))
  if (missingNotes.length === 0) {
    return { markdown: cleanedMarkdown, migratedNoteIds: [...migratedIds] }
  }
  const additions = missingNotes
    .map((note) => {
      migratedIds.add(note.id)
      const timeLink = `[▶ ${formatLearningClock(note.timestampMs)}](#fengsha-seek-${Math.max(0, Math.round(note.timestampMs))})`
      const quote = quoteAsMarkdown(note.quote)
      return [`### ${timeLink}`, quote, note.text.trim()].filter(Boolean).join('\n\n')
    })
    .join('\n\n')
  const heading = `## ${sectionTitle}`
  const section = cleanedMarkdown.includes(heading) ? additions : `${heading}\n\n${additions}`
  const nextMarkdown = cleanedMarkdown.trim()
    ? `${cleanedMarkdown.trimEnd()}\n\n${section}\n`
    : `${section}\n`
  return { markdown: nextMarkdown, migratedNoteIds: [...migratedIds] }
}

export const createLearningNote = (input: {
  highlightColor?: LearningNoteHighlight | null
  kind: LearningNoteKind
  quote?: string
  sourceEndOffset?: number | null
  sourceSegmentIds?: string[]
  sourceStartOffset?: number | null
  text: string
  timestampMs: number
}): LearningNote => {
  const now = Date.now()
  return {
    completed: false,
    createdAt: now,
    highlightColor: input.highlightColor ?? null,
    id: globalThis.crypto?.randomUUID?.() ?? `note-${now}-${Math.random().toString(16).slice(2)}`,
    kind: input.kind,
    quote: input.quote?.trim() ?? '',
    sourceEndOffset: input.sourceEndOffset ?? null,
    sourceSegmentIds: input.sourceSegmentIds ?? [],
    sourceStartOffset: input.sourceStartOffset ?? null,
    text: input.text.trim(),
    timestampMs: Math.max(0, input.timestampMs),
    updatedAt: now
  }
}

export const buildLearningNotebookMarkdown = (notebook: LearningNotebook): string => {
  const timestampedNotes = notebook.notes.map((note) => {
    const sourceUrl = (() => {
      if (!notebook.sourceUrl) {
        return null
      }
      try {
        const url = new URL(notebook.sourceUrl)
        url.searchParams.set('t', String(Math.floor(note.timestampMs / 1000)))
        return url.toString()
      } catch {
        return notebook.sourceUrl
      }
    })()
    const source = sourceUrl
      ? `[${formatLearningClock(note.timestampMs)}](${sourceUrl})`
      : `\`${formatLearningClock(note.timestampMs)}\``
    const quote = note.quote ? `\n  > ${note.quote.replaceAll('\n', ' ')}` : ''
    return `- ${source} ${note.text}${quote}`
  })
  const aiOutputs = [...(notebook.blocks ?? [])]
    .filter((block) => block.kind === 'ai' || block.kind === 'mermaid')
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((block) => `### ${block.quote || 'AI 学习成果'}\n\n${block.content}`)
  const transcript = notebook.transcript?.segments.map((segment) => {
    const clock = formatLearningClock(segment.startMs)
    const translation = segment.translatedText.trim()
      ? `\n  - 译文：${segment.translatedText.trim()}`
      : ''
    return `- \`${clock}\` ${segment.originalText}${translation}`
  })

  return [
    `# ${notebook.title}`,
    '',
    `- 最后更新：${new Date(notebook.updatedAt).toLocaleString()}`,
    '',
    '## 我的笔记',
    '',
    notebook.personalNote?.trim() || '_暂无笔记_',
    '',
    '## 原文备注',
    '',
    ...(timestampedNotes.length > 0 ? timestampedNotes : ['_暂无原文备注_']),
    '',
    '## AI 学习成果',
    '',
    ...(aiOutputs.length > 0 ? aiOutputs : ['_暂无 AI 学习成果_']),
    '',
    '## 完整逐字稿',
    '',
    ...(transcript && transcript.length > 0 ? transcript : ['_暂无逐字稿_']),
    ''
  ].join('\n')
}

export const safeLearningFileName = (title: string): string => {
  const base = title
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 72)
  return `${base || '学习笔记'}-学习笔记.md`
}
