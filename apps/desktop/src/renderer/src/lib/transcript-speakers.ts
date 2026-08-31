import type { TranscriptSegmentView, TranscriptSpeakerView } from '@renderer/store/transcripts'

export interface SpeakerRange {
  endMs: number
  startMs: number
}

export interface SpeakerTimelineRow {
  ranges: SpeakerRange[]
  share: number
  sortIndex: number
  speakerId: string
  speakingMs: number
}

export interface SpeakerColorClasses {
  avatar: string
  bar: string
  ring: string
}

const MERGE_GAP_MS = 400
const MIN_VISIBLE_RANGE_PERCENT = 0.4

export const SPEAKER_COLOR_PALETTE: SpeakerColorClasses[] = [
  {
    avatar: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    bar: 'bg-amber-500',
    ring: 'ring-amber-500/50'
  },
  {
    avatar: 'bg-[#7f8c63]/15 text-[#55613f] dark:text-[#b7c295]',
    bar: 'bg-[#7f8c63]',
    ring: 'ring-[#7f8c63]/50'
  },
  {
    avatar: 'bg-[#b76645]/15 text-[#8b452d] dark:text-[#dca387]',
    bar: 'bg-[#b76645]',
    ring: 'ring-[#b76645]/50'
  },
  {
    avatar: 'bg-[#846277]/15 text-[#654858] dark:text-[#c6a5b8]',
    bar: 'bg-[#846277]',
    ring: 'ring-[#846277]/50'
  },
  {
    avatar: 'bg-[#6f7778]/15 text-[#50595a] dark:text-[#b2bcbd]',
    bar: 'bg-[#6f7778]',
    ring: 'ring-[#6f7778]/50'
  },
  {
    avatar: 'bg-[#a88332]/15 text-[#765d20] dark:text-[#d7bd78]',
    bar: 'bg-[#a88332]',
    ring: 'ring-[#a88332]/50'
  },
  {
    avatar: 'bg-[#587b76]/15 text-[#3f5f5b] dark:text-[#9cc0bb]',
    bar: 'bg-[#587b76]',
    ring: 'ring-[#587b76]/50'
  },
  {
    avatar: 'bg-[#9a5b42]/15 text-[#743f2d] dark:text-[#cf9b85]',
    bar: 'bg-[#9a5b42]',
    ring: 'ring-[#9a5b42]/50'
  }
]

export const UNKNOWN_SPEAKER_COLOR: SpeakerColorClasses = {
  avatar: 'bg-muted text-muted-foreground',
  bar: 'bg-zinc-400',
  ring: 'ring-zinc-400/50'
}

/**
 * Pick a stable color set for a speaker, or the muted fallback.
 */
export const speakerColor = (sortIndex: number | null): SpeakerColorClasses => {
  if (sortIndex == null) {
    return UNKNOWN_SPEAKER_COLOR
  }
  const count = SPEAKER_COLOR_PALETTE.length
  const index = ((sortIndex % count) + count) % count
  return SPEAKER_COLOR_PALETTE[index] ?? UNKNOWN_SPEAKER_COLOR
}

/**
 * Build a short avatar label from a speaker display name.
 */
export const speakerInitials = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return '?'
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = [...(parts[0] ?? '')][0] ?? ''
    const second = [...(parts[1] ?? '')][0] ?? ''
    return `${first}${second}`.toUpperCase()
  }
  return [...trimmed].slice(0, 2).join('').toUpperCase()
}

/**
 * Merge overlapping or nearly adjacent speech ranges.
 */
export const mergeRanges = (ranges: SpeakerRange[]): SpeakerRange[] => {
  if (ranges.length === 0) {
    return []
  }
  const sorted = [...ranges].sort((left, right) => left.startMs - right.startMs)
  const first = sorted[0]
  if (!first) {
    return []
  }
  const merged: SpeakerRange[] = [{ endMs: first.endMs, startMs: first.startMs }]
  for (const range of sorted.slice(1)) {
    const last = merged.at(-1)
    if (!last) {
      break
    }
    if (range.startMs <= last.endMs + MERGE_GAP_MS) {
      last.endMs = Math.max(last.endMs, range.endMs)
    } else {
      merged.push({ endMs: range.endMs, startMs: range.startMs })
    }
  }
  return merged
}

/**
 * Prefer the player duration, then fall back to the last caption end.
 */
export const resolveMediaDurationMs = (
  playerDurationMs: number,
  segments: Pick<TranscriptSegmentView, 'endMs'>[]
): number => {
  if (Number.isFinite(playerDurationMs) && playerDurationMs > 0) {
    return playerDurationMs
  }
  let maxEnd = 0
  for (const segment of segments) {
    if (segment.endMs > maxEnd) {
      maxEnd = segment.endMs
    }
  }
  return maxEnd
}

/**
 * Build per-speaker talking-time stats and timeline ranges.
 */
export const buildSpeakerTimelines = (
  speakers: Pick<TranscriptSpeakerView, 'id' | 'sortIndex'>[],
  segments: Pick<TranscriptSegmentView, 'endMs' | 'speakerId' | 'startMs'>[]
): SpeakerTimelineRow[] => {
  const rangesById = new Map<string, SpeakerRange[]>()
  for (const speaker of speakers) {
    rangesById.set(speaker.id, [])
  }

  let totalMs = 0
  for (const segment of segments) {
    if (!segment.speakerId) {
      continue
    }
    const ranges = rangesById.get(segment.speakerId)
    if (!ranges) {
      continue
    }
    const startMs = Math.max(0, segment.startMs)
    const endMs = Math.max(startMs, segment.endMs)
    const duration = endMs - startMs
    if (duration <= 0) {
      continue
    }
    ranges.push({ endMs, startMs })
    totalMs += duration
  }

  return speakers.flatMap((speaker) => {
    const rawRanges = rangesById.get(speaker.id) ?? []
    const speakingMs = rawRanges.reduce((sum, range) => sum + (range.endMs - range.startMs), 0)
    if (speakingMs <= 0) {
      return []
    }
    return [
      {
        ranges: mergeRanges(rawRanges),
        share: totalMs > 0 ? speakingMs / totalMs : 0,
        sortIndex: speaker.sortIndex,
        speakerId: speaker.id,
        speakingMs
      }
    ]
  })
}

/**
 * Convert a talking-time share to a whole-number percent.
 */
export const speakingSharePercent = (share: number): number => {
  if (share <= 0) {
    return 0
  }
  return Math.max(1, Math.round(share * 100))
}

/**
 * Position a speech burst on a 0-100 timeline track.
 */
export const rangePosition = (
  range: SpeakerRange,
  durationMs: number
): { left: string; width: string } => {
  if (durationMs <= 0) {
    return { left: '0%', width: '0%' }
  }
  const left = Math.max(0, (range.startMs / durationMs) * 100)
  const width = Math.max(
    MIN_VISIBLE_RANGE_PERCENT,
    ((range.endMs - range.startMs) / durationMs) * 100
  )
  return {
    left: `${left}%`,
    width: `${Math.min(100 - left, width)}%`
  }
}

/**
 * Clamp the playhead to the visible timeline.
 */
export const playheadPercent = (currentMs: number, durationMs: number): number => {
  if (durationMs <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (currentMs / durationMs) * 100))
}
