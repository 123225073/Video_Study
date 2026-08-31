import type { AiImageRunContext, AiImageSize } from './ai-types'

export type LearningImageAspectRatio = NonNullable<AiImageRunContext['aspectRatio']>
export type LearningImagePurpose = 'explain' | 'share' | 'cover'
export type LearningImageStyle = 'infographic' | 'minimal' | 'editorial' | 'cinematic'

/** Map an exact canvas intent to the closest size accepted by GPT Image compatible APIs. */
export const imageApiSizeForAspect = (ratio: LearningImageAspectRatio): AiImageSize => {
  if (ratio === '1:1') {
    return '1024x1024'
  }
  if (ratio === '16:9') {
    return '1536x1024'
  }
  return '1024x1536'
}

export const imageAspectDimensions = (
  ratio: LearningImageAspectRatio
): { height: number; width: number } => {
  const [width, height] = ratio.split(':').map(Number)
  return { height, width }
}

export interface LearningImageCrop {
  outputHeight: number
  outputWidth: number
  sourceHeight: number
  sourceWidth: number
  sourceX: number
  sourceY: number
}

/** Return a centered source crop and exact integer output size for the selected ratio. */
export const calculateLearningImageCrop = (
  sourceWidth: number,
  sourceHeight: number,
  ratio: LearningImageAspectRatio
): LearningImageCrop => {
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    throw new Error('Image dimensions must be positive')
  }
  const target = imageAspectDimensions(ratio)
  const targetRatio = target.width / target.height
  const sourceRatio = sourceWidth / sourceHeight
  const croppedSourceWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth
  const croppedSourceHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio
  const unit = Math.max(
    1,
    Math.floor(Math.min(croppedSourceWidth / target.width, croppedSourceHeight / target.height))
  )
  return {
    outputHeight: target.height * unit,
    outputWidth: target.width * unit,
    sourceHeight: croppedSourceHeight,
    sourceWidth: croppedSourceWidth,
    sourceX: (sourceWidth - croppedSourceWidth) / 2,
    sourceY: (sourceHeight - croppedSourceHeight) / 2
  }
}

export const formatGenerationElapsed = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`
}

/** Reject a completed optimizer snapshot that predates the user's latest optimize action. */
export const isFreshImagePromptOptimization = (
  requestedAt: number,
  runStartedAt: number
): boolean => requestedAt > 0 && runStartedAt >= requestedAt
