import {
  type CapturedFrame,
  MAX_FRAME_DATA_URL_LENGTH,
  type PageSnapshot
} from './companion-contract'

const MAX_FRAME_WIDTH = 1600
const MAX_FRAME_HEIGHT = 900

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener(
      'error',
      () => reject(new Error('Unable to read the captured tab image.')),
      {
        once: true
      }
    )
    image.src = dataUrl
  })

const encodeJpeg = (canvas: HTMLCanvasElement): string => {
  const highQuality = canvas.toDataURL('image/jpeg', 0.86)
  if (highQuality.length <= MAX_FRAME_DATA_URL_LENGTH) {
    return highQuality
  }
  return canvas.toDataURL('image/jpeg', 0.68)
}

export const captureVisibleVideoFrame = async (
  tab: Browser.tabs.Tab,
  snapshot: PageSnapshot
): Promise<CapturedFrame> => {
  const rect = snapshot.video.rect
  if (!(snapshot.video.found && rect && rect.width > 1 && rect.height > 1)) {
    throw new Error('The current page does not contain a visible video frame.')
  }
  if (typeof tab.windowId !== 'number') {
    throw new Error('Unable to identify the current browser window.')
  }

  const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, {
    format: 'jpeg',
    quality: 92
  })
  const source = await loadImage(screenshot)
  const scaleX = source.naturalWidth / snapshot.viewport.width
  const scaleY = source.naturalHeight / snapshot.viewport.height
  const sourceWidth = Math.max(1, Math.round(rect.width * scaleX))
  const sourceHeight = Math.max(1, Math.round(rect.height * scaleY))
  const targetScale = Math.min(1, MAX_FRAME_WIDTH / sourceWidth, MAX_FRAME_HEIGHT / sourceHeight)
  const targetWidth = Math.max(1, Math.round(sourceWidth * targetScale))
  const targetHeight = Math.max(1, Math.round(sourceHeight * targetScale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('The browser could not initialize the screenshot canvas.')
  }
  context.drawImage(
    source,
    Math.round(rect.x * scaleX),
    Math.round(rect.y * scaleY),
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight
  )
  const dataUrl = encodeJpeg(canvas)
  if (dataUrl.length > MAX_FRAME_DATA_URL_LENGTH) {
    throw new Error('The captured frame is too large to send safely.')
  }
  return { dataUrl, height: targetHeight, mimeType: 'image/jpeg', width: targetWidth }
}
