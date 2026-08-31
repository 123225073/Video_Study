import type { TranscriptSegmentView } from '@renderer/store/transcripts'
import type { LearningNote, LearningNoteHighlight } from '@shared/learning-types'

export interface TranscriptHighlightRange {
  color: LearningNoteHighlight
  end: number
  noteId: string
  start: number
}

export interface TranscriptHighlightPart {
  color: LearningNoteHighlight | null
  end: number
  highlighted: boolean
  start: number
  text: string
}

const clampOffset = (text: string, value: number): number =>
  Math.min(text.length, Math.max(0, Math.round(value)))

/** Build exact per-row character ranges from persisted single- or multi-row notes. */
export const buildTranscriptHighlightMap = (
  segments: TranscriptSegmentView[],
  notes: LearningNote[]
): Map<string, TranscriptHighlightRange[]> => {
  const byId = new Map(segments.map((segment) => [segment.id, segment] as const))
  const highlights = new Map<string, TranscriptHighlightRange[]>()

  for (const note of notes) {
    if (!note.highlightColor) {
      continue
    }
    const sourceIds = note.sourceSegmentIds ?? []
    for (const [index, segmentId] of sourceIds.entries()) {
      const segment = byId.get(segmentId)
      if (!segment) {
        continue
      }
      const start = clampOffset(segment.text, index === 0 ? (note.sourceStartOffset ?? 0) : 0)
      const end = clampOffset(
        segment.text,
        index === sourceIds.length - 1
          ? (note.sourceEndOffset ?? segment.text.length)
          : segment.text.length
      )
      if (end <= start) {
        continue
      }
      const ranges = highlights.get(segmentId) ?? []
      ranges.push({ color: note.highlightColor, end, noteId: note.id, start })
      highlights.set(segmentId, ranges)
    }
  }

  return highlights
}

/** Slice rendered text at every persisted highlight boundary. */
export const splitTranscriptHighlightParts = (
  text: string,
  ranges: readonly TranscriptHighlightRange[],
  sourceStart = 0
): TranscriptHighlightPart[] => {
  if (!text) {
    return []
  }
  const sourceEnd = sourceStart + text.length
  const relevant = ranges.filter((range) => range.start < sourceEnd && range.end > sourceStart)
  if (relevant.length === 0) {
    return [{ color: null, end: sourceEnd, highlighted: false, start: sourceStart, text }]
  }
  const boundaries = new Set([sourceStart, sourceEnd])
  for (const range of relevant) {
    boundaries.add(Math.max(sourceStart, range.start))
    boundaries.add(Math.min(sourceEnd, range.end))
  }
  const ordered = [...boundaries].sort((left, right) => left - right)
  return ordered.slice(0, -1).map((start, index) => {
    const end = ordered[index + 1] ?? sourceEnd
    const active = relevant.find((range) => range.start < end && range.end > start)
    return {
      color: active?.color ?? null,
      end,
      highlighted: Boolean(active),
      start,
      text: text.slice(start - sourceStart, end - sourceStart)
    }
  })
}
