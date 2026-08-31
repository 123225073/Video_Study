/**
 * Join speaker-labeled transcript lines for an LLM prompt.
 *
 * @param segments Transcript rows with speaker labels and text.
 * @param resolveSpeaker Display name for a speaker id.
 */
export const buildPromptTranscriptText = (
  segments: ReadonlyArray<{ speakerId: string | null; startMs?: number; text: string }>,
  resolveSpeaker: (speakerId: string | null) => string
): string =>
  segments
    .map((segment) => {
      const speaker = resolveSpeaker(segment.speakerId).trim()
      const text = segment.text.trim()
      if (!text) {
        return ''
      }
      const totalSeconds = Math.max(0, Math.floor((segment.startMs ?? 0) / 1000))
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      const prefix = speaker ? `${speaker}: ` : ''
      return `[${clock}] ${prefix}${text}`
    })
    .filter((line) => line.length > 0)
    .join('\n')
