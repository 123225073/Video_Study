import { calculateLearningImageCrop, type LearningImageAspectRatio } from '@shared/learning-image'

const blobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Image data could not be read'))
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Image data URL is unavailable'))
    reader.readAsDataURL(blob)
  })

/** Crop a generated image to the exact selected ratio before previewing or persisting it. */
export const cropLearningImageToAspect = async (
  source: string,
  ratio: LearningImageAspectRatio
): Promise<string> => {
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`)
  }
  const bitmap = await createImageBitmap(await response.blob())
  const crop = calculateLearningImageCrop(bitmap.width, bitmap.height, ratio)
  const canvas = document.createElement('canvas')
  canvas.width = crop.outputWidth
  canvas.height = crop.outputHeight
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Canvas is unavailable')
  }
  context.drawImage(
    bitmap,
    crop.sourceX,
    crop.sourceY,
    crop.sourceWidth,
    crop.sourceHeight,
    0,
    0,
    crop.outputWidth,
    crop.outputHeight
  )
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('PNG crop failed'))),
      'image/png'
    )
  })
  return blobAsDataUrl(blob)
}
