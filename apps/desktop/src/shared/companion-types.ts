export interface CompanionCaptionCue {
  endSeconds: number
  startSeconds: number
  text: string
}

export interface CompanionCapturePayload {
  action: 'frame' | 'open' | 'time-marker'
  captionCues: CompanionCaptionCue[]
  captionLanguage: string | null
  captionText: string
  currentTimeSeconds: number
  durationSeconds: number | null
  pageUrl: string
  platform: 'bilibili' | 'youtube' | 'other'
  screenshotDataUrl: string | null
  selectedText: string
  title: string
}

export interface CompanionPairingInfo {
  clientNames: string[]
  code: string
  codeExpiresAt: number
  pairedClientCount: number
  port: number | null
}
