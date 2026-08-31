import { randomUUID } from 'node:crypto'
import type {
  LearningTranscriptCorrection,
  LearningTranscriptOverlay,
  LearningTranscriptSegment
} from '../../../shared/learning-types'

const cleanText = (value: string): string => value.trim()

const findSegment = (
  overlay: LearningTranscriptOverlay,
  segmentId: string
): LearningTranscriptSegment => {
  const segment = overlay.segments.find((item) => item.id === segmentId)
  if (!segment) {
    throw new Error(`Transcript segment not found: ${segmentId}`)
  }
  return segment
}

export const getEffectiveTranscriptText = (
  overlay: LearningTranscriptOverlay,
  segmentId: string
): string => {
  const segment = findSegment(overlay, segmentId)
  const latest = overlay.corrections.findLast((item) => item.segmentId === segmentId)
  return latest?.correctedText ?? segment.originalText
}

export const applyTranscriptCorrection = (
  overlay: LearningTranscriptOverlay,
  input: {
    correctedText: string
    now?: number
    reason?: 'ai' | 'manual'
    segmentId: string
  }
): LearningTranscriptOverlay => {
  const correctedText = cleanText(input.correctedText)
  if (!correctedText) {
    throw new Error('Corrected transcript text cannot be empty')
  }
  findSegment(overlay, input.segmentId)
  const previousText = getEffectiveTranscriptText(overlay, input.segmentId)
  if (correctedText === previousText) {
    return overlay
  }
  const correction: LearningTranscriptCorrection = {
    correctedText,
    createdAt: input.now ?? Date.now(),
    id: randomUUID(),
    previousText,
    reason: input.reason ?? 'manual',
    segmentId: input.segmentId
  }
  return {
    ...overlay,
    corrections: [...overlay.corrections, correction],
    updatedAt: correction.createdAt,
    version: overlay.version + 1
  }
}

export const restoreTranscriptCorrection = (
  overlay: LearningTranscriptOverlay,
  input: { correctionId?: string | null; now?: number; segmentId: string }
): LearningTranscriptOverlay => {
  const segment = findSegment(overlay, input.segmentId)
  const target = input.correctionId
    ? overlay.corrections.find(
        (item) => item.id === input.correctionId && item.segmentId === input.segmentId
      )
    : null
  if (input.correctionId && !target) {
    throw new Error(`Transcript correction not found: ${input.correctionId}`)
  }
  const correctedText = target?.correctedText ?? segment.originalText
  const previousText = getEffectiveTranscriptText(overlay, input.segmentId)
  if (correctedText === previousText) {
    return overlay
  }
  const correction: LearningTranscriptCorrection = {
    correctedText,
    createdAt: input.now ?? Date.now(),
    id: randomUUID(),
    previousText,
    reason: 'restore',
    segmentId: input.segmentId
  }
  return {
    ...overlay,
    corrections: [...overlay.corrections, correction],
    updatedAt: correction.createdAt,
    version: overlay.version + 1
  }
}

export const materializeTranscript = (
  overlay: LearningTranscriptOverlay
): Array<LearningTranscriptSegment & { correctedText: string }> =>
  overlay.segments.map((segment) => ({
    ...segment,
    correctedText: getEffectiveTranscriptText(overlay, segment.id)
  }))
