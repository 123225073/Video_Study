import type { TranscriptSegmentView } from '../store/transcripts'
import type { TranscriptSelection } from './study-studio/types'

/** Clamp one DOM UTF-16 offset to a stored transcript line. */
export const clampTranscriptOffset = (text: string, offset: number): number =>
  Math.min(text.length, Math.max(0, Math.round(offset)))

/** Estimate playback time for a character offset while preserving the source time range. */
export const transcriptTimeForOffset = (segment: TranscriptSegmentView, offset: number): number => {
  const length = Math.max(1, segment.text.length)
  const ratio = clampTranscriptOffset(segment.text, offset) / length
  return Math.round(segment.startMs + ratio * Math.max(0, segment.endMs - segment.startMs))
}

/** Build a precise source selection from DOM Range character offsets. */
export const buildNativeTranscriptSelection = (
  segments: TranscriptSegmentView[],
  startOffset: number,
  endOffset: number
): TranscriptSelection | null => {
  const selected = segments.filter((segment) => segment.text.length > 0)
  const first = selected[0]
  const last = selected.at(-1)
  if (!(first && last)) {
    return null
  }
  let safeStart = clampTranscriptOffset(first.text, startOffset)
  let safeEnd = clampTranscriptOffset(last.text, endOffset)
  if (first.id === last.id && safeEnd < safeStart) {
    ;[safeStart, safeEnd] = [safeEnd, safeStart]
  }
  const parts = selected.map((segment, index) => {
    const from = index === 0 ? safeStart : 0
    const to = index === selected.length - 1 ? safeEnd : segment.text.length
    return segment.text.slice(from, to)
  })
  const rawText = parts.join('\n')
  const leadingWhitespace = rawText.length - rawText.trimStart().length
  const trailingWhitespace = rawText.length - rawText.trimEnd().length
  const text = rawText.trim()
  if (!text) {
    return null
  }
  safeStart = clampTranscriptOffset(first.text, safeStart + leadingWhitespace)
  safeEnd = clampTranscriptOffset(last.text, safeEnd - trailingWhitespace)
  return {
    endMs: transcriptTimeForOffset(last, safeEnd),
    segmentIds: selected.map((segment) => segment.id),
    sourceEndOffset: safeEnd,
    sourceStartOffset: safeStart,
    startMs: transcriptTimeForOffset(first, safeStart),
    text
  }
}
