export const BRIDGE_SCHEMA_VERSION = '1.0.0'
export const MAX_TEXT_LENGTH = 64 * 1024
export const MAX_FRAME_DATA_URL_LENGTH = 4 * 1024 * 1024
export const BRIDGE_PORT_RANGE = { end: 27_120, start: 27_100 } as const

export type CaptureAction = 'open' | 'time-marker' | 'frame'
export type VideoPlatform = 'youtube' | 'bilibili' | 'generic'

export interface CaptionCue {
  endTime: number
  startTime: number
  text: string
}

export interface BridgeCaptionCue {
  endSeconds: number
  startSeconds: number
  text: string
}

export interface CaptionTrackSnapshot {
  cues: CaptionCue[]
  kind: string
  label: string
  language: string
  mode: string
}

export interface VideoRect {
  height: number
  width: number
  x: number
  y: number
}

export interface PageSnapshot {
  captions: {
    renderedSegments: CaptionCue[]
    tracks: CaptionTrackSnapshot[]
    visibleText: string
  }
  capturedAt: string
  page: {
    language: string
    platform: VideoPlatform
    selectedText: string
    title: string
    url: string
  }
  video: {
    currentTime: number | null
    duration: number | null
    found: boolean
    paused: boolean
    playbackRate: number
    rect: VideoRect | null
  }
  viewport: {
    height: number
    width: number
  }
}

export interface CapturedFrame {
  dataUrl: string
  height: number
  mimeType: 'image/jpeg'
  width: number
}

export interface BridgeCapturePayload {
  action: CaptureAction
  captionCues: BridgeCaptionCue[]
  captionLanguage: string
  captionText: string
  currentTimeSeconds: number | null
  durationSeconds: number | null
  pageUrl: string
  platform: VideoPlatform
  screenshotDataUrl?: string
  selectedText: string
  title: string
}

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()

export const cleanText = (value: unknown, maxLength = 4000): string => {
  if (typeof value !== 'string') {
    return ''
  }
  const normalized = normalizeWhitespace(value)
  return Array.from(normalized)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .slice(0, maxLength)
}

export const cleanHttpUrl = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  } catch {
    return ''
  }
}

const cleanFiniteNumber = (value: unknown, minimum = 0): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    return null
  }
  return value
}

const cleanCue = (cue: CaptionCue): CaptionCue | null => {
  const startTime = cleanFiniteNumber(cue.startTime)
  const endTime = cleanFiniteNumber(cue.endTime)
  const text = cleanText(cue.text, 2000)
  if (startTime === null || endTime === null || endTime < startTime || !text) {
    return null
  }
  return { endTime, startTime, text }
}

const cleanCueList = (cues: CaptionCue[], limit: number): CaptionCue[] => {
  const result: CaptionCue[] = []
  for (const cue of cues.slice(0, limit)) {
    const cleaned = cleanCue(cue)
    if (cleaned) {
      result.push(cleaned)
    }
  }
  return result
}

const isPlatform = (value: unknown): value is VideoPlatform =>
  value === 'youtube' || value === 'bilibili' || value === 'generic'

const cleanFrame = (frame: CapturedFrame | undefined): CapturedFrame | undefined => {
  if (!frame) {
    return undefined
  }
  const isJpeg = frame.dataUrl.startsWith('data:image/jpeg;base64,')
  const width = cleanFiniteNumber(frame.width, 1)
  const height = cleanFiniteNumber(frame.height, 1)
  if (
    !isJpeg ||
    frame.dataUrl.length > MAX_FRAME_DATA_URL_LENGTH ||
    width === null ||
    height === null
  ) {
    return undefined
  }
  return { dataUrl: frame.dataUrl, height, mimeType: 'image/jpeg', width }
}

export const buildCapturePayload = (
  action: CaptureAction,
  snapshot: PageSnapshot,
  frame?: CapturedFrame
): BridgeCapturePayload => {
  const tracks: CaptionTrackSnapshot[] = []
  for (const track of snapshot.captions.tracks.slice(0, 12)) {
    tracks.push({
      cues: cleanCueList(track.cues, 120),
      kind: cleanText(track.kind, 40),
      label: cleanText(track.label, 120),
      language: cleanText(track.language, 40),
      mode: cleanText(track.mode, 40)
    })
  }

  const currentTime = cleanFiniteNumber(snapshot.video.currentTime)
  const duration = cleanFiniteNumber(snapshot.video.duration)
  const firstTrack = tracks.find((track) => track.cues.length > 0) ?? tracks[0]
  const cueSource = firstTrack?.cues.length
    ? firstTrack.cues
    : cleanCueList(snapshot.captions.renderedSegments, 120)
  const captionText =
    cleanText(snapshot.captions.visibleText, MAX_TEXT_LENGTH) ||
    cleanText(cueSource.map((cue) => cue.text).join(' '), MAX_TEXT_LENGTH)
  const cleanedFrame = cleanFrame(frame)
  const payload: BridgeCapturePayload = {
    action,
    captionCues: cueSource.map((cue) => ({
      endSeconds: cue.endTime,
      startSeconds: cue.startTime,
      text: cue.text
    })),
    captionLanguage: cleanText(firstTrack?.language || snapshot.page.language, 40),
    captionText,
    currentTimeSeconds: currentTime,
    durationSeconds: duration,
    pageUrl: cleanHttpUrl(snapshot.page.url),
    platform: isPlatform(snapshot.page.platform) ? snapshot.page.platform : 'generic',
    selectedText: cleanText(snapshot.page.selectedText, 4000),
    title: cleanText(snapshot.page.title, 1000) || 'Untitled video'
  }
  if (action === 'frame' && cleanedFrame) {
    payload.screenshotDataUrl = cleanedFrame.dataUrl
  }
  return payload
}

export const isCapturePayloadSafe = (payload: BridgeCapturePayload): boolean => {
  if (!cleanHttpUrl(payload.pageUrl)) {
    return false
  }
  if (payload.action === 'frame' && !payload.screenshotDataUrl) {
    return false
  }
  return JSON.stringify(payload).length <= MAX_FRAME_DATA_URL_LENGTH + MAX_TEXT_LENGTH + 32_768
}
