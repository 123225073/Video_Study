import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8')

const panZoom = read('src/renderer/src/hooks/use-pan-zoom.ts')
assert.doesNotMatch(
  panZoom,
  /zoom\s*<=\s*restingZoom/u,
  'Visual viewers must support panning at their fitted zoom level'
)
const imageStudio = read('src/renderer/src/components/learning/LearningImageStudio.tsx')
assert.match(
  imageStudio,
  /CAPTURED_FRAME_MARKER/u,
  'Captured video frames must be persisted as viewable learning images'
)

const transcript = read('src/renderer/src/pages/Transcript.tsx')
assert.match(
  transcript,
  /capturedFrame=\{companionCapture\}/u,
  'Captured frames must be delivered to the visible learning image workspace'
)
assert.match(
  transcript,
  /ipcServices\.fs\.captureVideoFrame/u,
  'Frame capture must use the managed local media pipeline'
)
assert.doesNotMatch(
  transcript,
  /document\.querySelector<HTMLVideoElement>\(['"]video['"]\)/u,
  'Frame capture must not guess the first video element in the document'
)

const fileSystemService = read('src/main/ipc/services/file-system-service.ts')
assert.match(fileSystemService, /'-vcodec',\s*'png'/u, 'Captured frames must contain PNG bytes')
assert.match(
  fileSystemService,
  /data:image\/png;base64/u,
  'Captured frame MIME type must match the saved PNG extension'
)

const captions = read('src/renderer/src/components/transcript/TranscriptCaptionsPane.tsx')
assert.match(
  captions,
  /formatTranscriptTimeRange/u,
  'Caption rows must show a start-to-end time range'
)

const mindmap = read('src/renderer/src/components/learning/InteractiveLearningMindmap.tsx')
assert.match(mindmap, /learning-mindmap-edit/u, 'Mindmaps must expose a source editor')
assert.match(mindmap, /learning-mindmap-download/u, 'Mindmaps must expose downloads')
assert.match(mindmap, /learning-mindmap-fullscreen-dialog/u, 'Mindmap fullscreen must be testable')

const speakers = read('src/renderer/src/components/transcript/TranscriptSpeakersPane.tsx')
assert.doesNotMatch(
  speakers,
  /min-h-48\s+flex-1/u,
  'The speaker timeline must not reserve a large empty flex region'
)

const prompts = read('src/shared/ai-prompts.ts')
for (const retiredId of [
  'concept-glossary',
  'generate-faq',
  'extract-statistics',
  'paraphrase-content',
  'learning-action-plan',
  'learning-diagram',
  'learning-outline',
  'learning-podcast-script'
]) {
  assert.match(
    prompts,
    new RegExp(`RETIRED_LEARNING_PROMPT_IDS[\\s\\S]*'${retiredId}'`, 'u'),
    `Legacy prompt ${retiredId} must be retired from settings`
  )
}

const promptPanel = read('src/renderer/src/components/settings/AiPromptsPanel.tsx')
assert.match(
  promptPanel,
  /VISIBLE_PRESET_PROMPT_IDS/u,
  'Settings must expose a focused prompt list while keeping internal workflows available'
)

process.stdout.write('Learning UX regression checks passed.\n')
