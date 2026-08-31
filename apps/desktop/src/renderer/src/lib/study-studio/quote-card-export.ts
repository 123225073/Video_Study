import { snapdom } from '@zumer/snapdom'

const waitForImage = async (image: HTMLImageElement): Promise<void> => {
  if (image.complete) {
    return
  }
  await new Promise<void>((resolve) => {
    const done = (): void => {
      window.clearTimeout(timeout)
      image.removeEventListener('load', done)
      image.removeEventListener('error', done)
      resolve()
    }
    const timeout = window.setTimeout(done, 8000)
    image.addEventListener('load', done, { once: true })
    image.addEventListener('error', done, { once: true })
  })
}

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read quote-card image'))
    reader.readAsDataURL(blob)
  })

const decodedImageToDataUrl = (image: HTMLImageElement): string | null => {
  if (!(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)) {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.drawImage(image, 0, 0)
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

const fetchImageAsDataUrl = async (src: string): Promise<string | null> => {
  try {
    const response = await fetch(src)
    if (!response.ok) {
      return null
    }
    const blob = await response.blob()
    return blob.size > 0 ? await readBlobAsDataUrl(blob) : null
  } catch {
    return null
  }
}

const inlineQuoteCardImages = async (element: HTMLElement): Promise<void> => {
  const images = [...element.querySelectorAll('img')]
  await Promise.all(
    images.map(async (image) => {
      const src = image.currentSrc || image.src
      if (!src || src.startsWith('data:')) {
        return
      }
      const dataUrl = decodedImageToDataUrl(image) ?? (await fetchImageAsDataUrl(src))
      if (!dataUrl) {
        return
      }
      image.src = dataUrl
      await waitForImage(image)
    })
  )
}

const waitForPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

export const safeQuoteCardFileName = (sourceTitle?: string): string => {
  const cleaned = (sourceTitle?.trim() || 'quote-card')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 72)
  return `${cleaned || 'quote-card'}.png`
}

export const renderQuoteCardPng = async (element: HTMLElement): Promise<Blob> => {
  await Promise.all([...element.querySelectorAll('img')].map(waitForImage))
  await inlineQuoteCardImages(element)
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForPaint()
  const blob = await snapdom.toBlob(element, {
    dpr: 2,
    embedFonts: true,
    type: 'png'
  })
  return blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' })
}

export const downloadQuoteCardPng = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.download = fileName
  anchor.href = url
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
