import type { TranscriptSegmentView } from '@renderer/store/transcripts'
import type { LearningTranscriptOverlay } from '@shared/learning-types'

/**
 * Materialize the user's latest non-destructive corrections over source rows.
 *
 * Word timings belong to the original ASR text. Keeping them after a correction
 * makes the karaoke renderer print the old words instead of the corrected line,
 * so changed rows deliberately fall back to freshly interpolated timings.
 */
export const applyTranscriptCorrectionOverlay = (
  sourceSegments: TranscriptSegmentView[],
  overlay: LearningTranscriptOverlay
): TranscriptSegmentView[] => {
  const effectiveText = new Map(
    overlay.segments.map((segment) => {
      const correction = overlay.corrections.findLast((item) => item.segmentId === segment.id)
      return [segment.id, correction?.correctedText ?? segment.originalText] as const
    })
  )

  return sourceSegments.map((segment) => {
    const text = effectiveText.get(segment.id) ?? segment.text
    if (text === segment.text) {
      return segment
    }
    return {
      ...segment,
      text,
      words: undefined
    }
  })
}
