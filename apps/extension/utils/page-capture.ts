import type {
  CaptionCue,
  CaptionTrackSnapshot,
  PageSnapshot,
  VideoPlatform
} from './companion-contract'

export const extractActivePageSnapshot = (): PageSnapshot => {
  const cleanText = (value: unknown, maxLength = 4000): string => {
    if (typeof value !== 'string') {
      return ''
    }
    const normalized = value.replace(/\s+/g, ' ').trim()
    return Array.from(normalized)
      .filter((character) => {
        const code = character.charCodeAt(0)
        return code >= 32 && code !== 127
      })
      .join('')
      .slice(0, maxLength)
  }

  const finiteNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

  const visibleArea = (rect: DOMRect): number => {
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0))
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))
    return width * height
  }

  const videos = Array.from(document.querySelectorAll('video'))
  let primaryVideo: HTMLVideoElement | null = null
  let largestArea = 0
  for (const video of videos) {
    const rect = video.getBoundingClientRect()
    const area = visibleArea(rect)
    if (area > largestArea) {
      largestArea = area
      primaryVideo = video
    }
  }

  const detectPlatform = (): VideoPlatform => {
    if (location.hostname === 'youtu.be' || location.hostname.endsWith('youtube.com')) {
      return 'youtube'
    }
    if (location.hostname === 'b23.tv' || location.hostname.endsWith('bilibili.com')) {
      return 'bilibili'
    }
    return 'generic'
  }

  const parseTimestamp = (value: string): number | null => {
    const parts = value
      .trim()
      .split(':')
      .map((part) => Number(part))
    if (parts.length < 2 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
      return null
    }
    let result = 0
    for (const part of parts) {
      result = result * 60 + part
    }
    return result
  }

  const collectTrackSnapshots = (video: HTMLVideoElement | null): CaptionTrackSnapshot[] => {
    if (!video) {
      return []
    }
    const tracks: CaptionTrackSnapshot[] = []
    for (const track of Array.from(video.textTracks).slice(0, 12)) {
      const cues: CaptionCue[] = []
      const sourceCues = track.cues ? Array.from(track.cues) : []
      const nearbyCues = sourceCues
        .filter(
          (cue) =>
            cue.endTime >= Math.max(0, video.currentTime - 60) &&
            cue.startTime <= video.currentTime + 180
        )
        .slice(0, 120)
      const relevantCues = nearbyCues.length > 0 ? nearbyCues : sourceCues.slice(0, 120)
      for (const cue of relevantCues) {
        const text = cleanText('text' in cue ? String(cue.text) : '', 2000)
        if (text) {
          cues.push({ endTime: cue.endTime, startTime: cue.startTime, text })
        }
      }
      tracks.push({
        cues,
        kind: cleanText(track.kind, 40),
        label: cleanText(track.label, 120),
        language: cleanText(track.language, 40),
        mode: track.mode
      })
    }
    return tracks
  }

  const collectRenderedSegments = (): CaptionCue[] => {
    const selector = [
      'ytd-transcript-segment-renderer',
      '[class*="transcript-segment"]',
      '[class*="subtitle-item"]'
    ].join(',')
    const result: CaptionCue[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(
      0,
      120
    )) {
      const timestampElement = element.querySelector<HTMLElement>(
        '.segment-timestamp, [class*="timestamp"], [class*="subtitle-item-time"]'
      )
      const textElement = element.querySelector<HTMLElement>(
        '.segment-text, [class*="transcript-text"], [class*="subtitle-item-text"]'
      )
      const startTime = parseTimestamp(timestampElement?.innerText ?? '')
      const text = cleanText(textElement?.innerText ?? '', 2000)
      if (startTime !== null && text) {
        result.push({ endTime: startTime, startTime, text })
      }
    }
    return result
  }

  const collectVisibleCaptionText = (): string => {
    const selectors = [
      '.ytp-caption-segment',
      '.bpx-player-subtitle-panel-text',
      '.bilibili-player-video-subtitle-item-text',
      '[class*="caption-window"] [class*="caption"]'
    ]
    const parts: string[] = []
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        const rect = element.getBoundingClientRect()
        if (visibleArea(rect) > 0) {
          const text = cleanText(element.innerText, 2000)
          if (text && !parts.includes(text)) {
            parts.push(text)
          }
        }
      }
    }
    return parts.join(' ').slice(0, 64 * 1024)
  }

  const titleSelectors = [
    'ytd-watch-metadata h1',
    '.video-title',
    'h1.video-title',
    'h1[class*="title"]'
  ]
  let pageTitle = ''
  for (const selector of titleSelectors) {
    pageTitle = cleanText(document.querySelector<HTMLElement>(selector)?.innerText, 1000)
    if (pageTitle) {
      break
    }
  }

  const rect = primaryVideo?.getBoundingClientRect()
  const videoRect = rect
    ? {
        height: Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)),
        width: Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)),
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top)
      }
    : null

  return {
    captions: {
      renderedSegments: collectRenderedSegments(),
      tracks: collectTrackSnapshots(primaryVideo),
      visibleText: collectVisibleCaptionText()
    },
    capturedAt: new Date().toISOString(),
    page: {
      language: cleanText(document.documentElement.lang, 40),
      platform: detectPlatform(),
      selectedText: cleanText(globalThis.getSelection?.()?.toString(), 4000),
      title: pageTitle || cleanText(document.title, 1000) || 'Untitled video',
      url: location.href
    },
    video: {
      currentTime: finiteNumber(primaryVideo?.currentTime),
      duration: finiteNumber(primaryVideo?.duration),
      found: Boolean(primaryVideo),
      paused: primaryVideo?.paused ?? true,
      playbackRate: primaryVideo?.playbackRate ?? 1,
      rect: videoRect
    },
    viewport: { height: innerHeight, width: innerWidth }
  }
}
