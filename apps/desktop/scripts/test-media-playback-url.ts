import assert from 'node:assert/strict'
import {
  grantPlayableMediaUrl,
  matchesActiveMediaPath,
  resolvePlayableMediaUrl,
  revokePlayableMediaUrl
} from '../src/main/lib/playable-media-protocol'
import { toLocalFileSrc } from '../src/renderer/src/lib/local-file-src'

const localPath = 'C:\\Users\\learner\\Videos\\lesson.mp4'
const mediaUrl = grantPlayableMediaUrl(localPath)

assert.equal(
  toLocalFileSrc(mediaUrl),
  mediaUrl,
  'The secure app-protocol media URL must not be rewritten as a file URL'
)
assert.equal(
  resolvePlayableMediaUrl(new URL(mediaUrl)),
  localPath,
  'Only a main-process granted media token should resolve to the local path'
)
assert.equal(
  resolvePlayableMediaUrl(new URL('fengsha-video://media/not-granted/lesson.mp4')),
  null,
  'An untrusted renderer cannot guess a local filesystem path'
)

revokePlayableMediaUrl(mediaUrl)
assert.equal(resolvePlayableMediaUrl(new URL(mediaUrl)), null, 'Detaching must revoke media access')

const lessonA = 'C:\\Users\\learner\\Videos\\Lesson A.mp4'
const lessonAPreview = 'C:\\AppData\\Fengsha\\preview-a.mp4'
const lessonB = 'C:\\Users\\learner\\Videos\\Lesson B.mp4'
assert.equal(matchesActiveMediaPath(lessonA.toUpperCase(), lessonA, lessonAPreview, 'win32'), true)
assert.equal(
  matchesActiveMediaPath(lessonAPreview, lessonA, lessonAPreview, 'win32'),
  true,
  'Deleting an active preview should detach its own session'
)
assert.equal(
  matchesActiveMediaPath(lessonB, lessonA, lessonAPreview, 'win32'),
  false,
  'Deleting lesson B must not interrupt lesson A'
)

console.log('Media playback URL regression test passed')
