import assert from 'node:assert/strict'
import {
  calculateLearningImageCrop,
  formatGenerationElapsed,
  imageApiSizeForAspect,
  imageAspectDimensions,
  isFreshImagePromptOptimization
} from '../src/shared/learning-image'

assert.equal(imageApiSizeForAspect('1:1'), '1024x1024')
assert.equal(imageApiSizeForAspect('16:9'), '1536x1024')
assert.equal(imageApiSizeForAspect('4:5'), '1024x1536')
assert.equal(imageApiSizeForAspect('3:4'), '1024x1536')
assert.equal(imageApiSizeForAspect('9:16'), '1024x1536')
assert.deepEqual(imageAspectDimensions('9:16'), { height: 16, width: 9 })
assert.deepEqual(calculateLearningImageCrop(1536, 1024, '16:9'), {
  outputHeight: 864,
  outputWidth: 1536,
  sourceHeight: 864,
  sourceWidth: 1536,
  sourceX: 0,
  sourceY: 80
})
assert.deepEqual(calculateLearningImageCrop(1024, 1536, '4:5'), {
  outputHeight: 1280,
  outputWidth: 1024,
  sourceHeight: 1280,
  sourceWidth: 1024,
  sourceX: 0,
  sourceY: 128
})
const threeByFourCrop = calculateLearningImageCrop(1024, 1536, '3:4')
assert.equal(threeByFourCrop.outputWidth, 1023)
assert.equal(threeByFourCrop.outputHeight, 1364)
assert.equal(threeByFourCrop.outputWidth / threeByFourCrop.outputHeight, 3 / 4)
assert.throws(() => calculateLearningImageCrop(0, 1024, '1:1'), /positive/u)
assert.equal(formatGenerationElapsed(999), '0s')
assert.equal(formatGenerationElapsed(12_999), '12s')
assert.equal(formatGenerationElapsed(65_000), '1:05')
assert.equal(isFreshImagePromptOptimization(2000, 1999), false)
assert.equal(isFreshImagePromptOptimization(2000, 2000), true)
assert.equal(isFreshImagePromptOptimization(2000, 2001), true)
assert.equal(isFreshImagePromptOptimization(0, 2001), false)

process.stdout.write('Learning image workflow tests passed\n')
