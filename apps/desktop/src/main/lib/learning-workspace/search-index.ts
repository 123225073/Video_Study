import type {
  LearningSearchField,
  LearningSearchQuery,
  LearningSearchResult,
  LearningWorkspace
} from '../../../shared/learning-types'
import { getEffectiveTranscriptText } from './transcript-overlay'

interface SearchEntry {
  downloadId: string
  field: LearningSearchField
  id: string
  text: string
  timestampMs: number | null
  title: string
  workspaceId: string
}

const MAX_RESULTS = 100
const DEFAULT_RESULTS = 30
const SNIPPET_CONTEXT = 72
const TOKEN_SPLIT_PATTERN = /[\s,.;:!?，。；：！？、()[\]{}<>《》“”‘’"'`~@#$%^&*+=|\\/_-]+/u

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase()

const tokenize = (query: string): string[] => {
  const normalized = normalize(query).trim()
  if (!normalized) {
    return []
  }
  const split = normalized.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  return split.length > 1 ? split : [normalized]
}

const addEntry = (entries: SearchEntry[], entry: SearchEntry): void => {
  if (entry.text.trim()) {
    entries.push(entry)
  }
}

export const buildLearningSearchIndex = (notebooks: LearningWorkspace[]): SearchEntry[] => {
  const entries: SearchEntry[] = []
  for (const notebook of notebooks) {
    const common = {
      downloadId: notebook.downloadId,
      title: notebook.title,
      workspaceId: notebook.workspaceId
    }
    addEntry(entries, {
      ...common,
      field: 'title',
      id: `${notebook.workspaceId}:title`,
      text: [notebook.title, notebook.source.author, notebook.source.courseTitle].join(' '),
      timestampMs: null
    })
    addEntry(entries, {
      ...common,
      field: 'note',
      id: `${notebook.workspaceId}:personal-note`,
      text: notebook.personalNote,
      timestampMs: null
    })
    for (const note of notebook.notes) {
      addEntry(entries, {
        ...common,
        field: 'note',
        id: note.id,
        text: [note.quote, note.text].join(' '),
        timestampMs: note.timestampMs
      })
    }
    for (const block of notebook.blocks) {
      addEntry(entries, {
        ...common,
        field: block.kind === 'ai' || block.kind === 'mermaid' ? 'ai' : 'note',
        id: block.id,
        text: [block.quote, block.content].join(' '),
        timestampMs: block.timestampMs
      })
    }
    for (const artifact of notebook.aiArtifacts) {
      addEntry(entries, {
        ...common,
        field: 'ai',
        id: artifact.id,
        text: artifact.content,
        timestampMs: null
      })
    }
    if (!notebook.transcript) {
      continue
    }
    for (const segment of notebook.transcript.segments) {
      addEntry(entries, {
        ...common,
        field: 'transcript',
        id: segment.id,
        text: getEffectiveTranscriptText(notebook.transcript, segment.id),
        timestampMs: segment.startMs
      })
      addEntry(entries, {
        ...common,
        field: 'translation',
        id: `${segment.id}:translation`,
        text: segment.translatedText,
        timestampMs: segment.startMs
      })
    }
  }
  return entries
}

const scoreEntry = (entry: SearchEntry, phrase: string, tokens: string[]): number => {
  const normalizedText = normalize(entry.text)
  const phraseIndex = normalizedText.indexOf(phrase)
  let score = phraseIndex >= 0 ? 100 + Math.min(30, phrase.length) : 0
  for (const token of tokens) {
    const tokenIndex = normalizedText.indexOf(token)
    if (tokenIndex < 0) {
      return 0
    }
    score += 12 + Math.min(12, token.length)
    if (tokenIndex === 0) {
      score += 4
    }
  }
  return score
}

const createSnippet = (text: string, query: string): string => {
  const normalizedText = normalize(text)
  const index = normalizedText.indexOf(normalize(query))
  const center = index >= 0 ? index : 0
  const start = Math.max(0, center - SNIPPET_CONTEXT)
  const end = Math.min(text.length, center + query.length + SNIPPET_CONTEXT)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

export const queryLearningSearchIndex = (
  index: SearchEntry[],
  input: LearningSearchQuery
): LearningSearchResult[] => {
  const phrase = normalize(input.query).trim()
  const tokens = tokenize(input.query)
  if (!(phrase && tokens.length)) {
    return []
  }
  const fields = input.fields ? new Set(input.fields) : null
  const limit = Math.min(MAX_RESULTS, Math.max(1, input.limit ?? DEFAULT_RESULTS))
  const results: LearningSearchResult[] = []
  for (const entry of index) {
    if (input.downloadId && entry.downloadId !== input.downloadId) {
      continue
    }
    if (fields && !fields.has(entry.field)) {
      continue
    }
    const score = scoreEntry(entry, phrase, tokens)
    if (score === 0) {
      continue
    }
    results.push({
      ...entry,
      score,
      snippet: createSnippet(entry.text, input.query)
    })
  }
  return results
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        (left.timestampMs ?? Number.MAX_SAFE_INTEGER) -
          (right.timestampMs ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, limit)
}
