import assert from 'node:assert/strict'
import {
  applyAiResultToStudyBlock,
  buildAiGenerationInput,
  parseGeneratedLearningMermaid,
  parseGeneratedQuote
} from '../src/renderer/src/lib/study-studio/ai-generation'
import {
  createStudyNoteBlock,
  isLegacyMermaidPlaceholder
} from '../src/renderer/src/lib/study-studio/markdown'
import {
  loadPendingAiGenerations,
  savePendingAiGenerations
} from '../src/renderer/src/lib/study-studio/pending-ai-generation'
import { applyTranscriptCorrectionOverlay } from '../src/renderer/src/lib/transcript-correction-overlay'
import {
  buildTranscriptHighlightMap,
  splitTranscriptHighlightParts
} from '../src/renderer/src/lib/transcript-highlights'
import { buildNativeTranscriptSelection } from '../src/renderer/src/lib/transcript-native-selection'
import { AI_PROMPT_PRESETS } from '../src/shared/ai-prompts'
import { LEARNING_AI_PROMPT_METADATA } from '../src/shared/learning-workflow/ai-prompts'
import { applyLearningWorkflowOutputContract } from '../src/shared/learning-workflow/defaults'

const input = buildAiGenerationInput('[00:00:05] Speaker: Evidence', {
  selectedTranscript: { startMs: 5000, text: 'Evidence' },
  sourceTitle: 'Lesson',
  targetKind: 'reflection'
})
assert.match(input, /AI_GENERATION_CONTEXT/u)
assert.match(input, /"targetKind": "reflection"/u)

const builtInPromptIds = new Set(AI_PROMPT_PRESETS.map((prompt) => prompt.id))
for (const metadata of Object.values(LEARNING_AI_PROMPT_METADATA)) {
  assert.equal(
    builtInPromptIds.has(metadata.promptId),
    true,
    `${metadata.promptId} must resolve to a runnable built-in prompt`
  )
}

const migratedCustomMindmapPrompt = applyLearningWorkflowOutputContract(
  'mindmap',
  '请保留我的自定义分类方式，并输出 flowchart LR。'
)
assert.match(migratedCustomMindmapPrompt, /请保留我的自定义分类方式/u)
assert.match(migratedCustomMindmapPrompt, /优先级高于/u)
assert.match(migratedCustomMindmapPrompt, /第一行必须是 mindmap/u)
assert.ok(
  migratedCustomMindmapPrompt.lastIndexOf('mindmap') >
    migratedCustomMindmapPrompt.lastIndexOf('flowchart LR'),
  'the non-overridable mindmap contract must follow legacy custom instructions'
)

const mermaid = parseGeneratedLearningMermaid(`\`\`\`mermaid
mindmap
  视频学习
    来源
    结论
\`\`\``)
assert.match(mermaid, /^mindmap/u)
assert.throws(
  () => parseGeneratedLearningMermaid('说明\n```mermaid\nmindmap\n  A\n    B\n```'),
  /图外说明/u
)
assert.throws(
  () => parseGeneratedLearningMermaid('mindmap\n  A\n    click B "https://example.com"'),
  /不允许/u
)
assert.throws(() => parseGeneratedLearningMermaid('flowchart TD\nA --> B'), /mindmap/u)

const quote = parseGeneratedQuote('原句：学习应该形成输出\n时间：01:02:03\n推荐语：适合复盘')
assert.deepEqual(quote, {
  note: '适合复盘',
  quote: '学习应该形成输出',
  startMs: 3_723_000
})

const emptyMermaid = createStudyNoteBlock('mermaid')
assert.equal(emptyMermaid.kind, 'mermaid')
assert.equal(emptyMermaid.code, '')
assert.equal(isLegacyMermaidPlaceholder('flowchart LR\n  A[Source] --> B[Insight]'), true)
assert.equal(isLegacyMermaidPlaceholder('flowchart LR\n  A["来源"] --> B["洞察"]'), false)
const generated = applyAiResultToStudyBlock(
  emptyMermaid,
  'mindmap\n  学习\n    应用',
  'AI 生成 Mermaid 图解'
)
assert.equal(generated.kind, 'mermaid')
assert.match(generated.code, /^mindmap/u)

const nativeLine = buildNativeTranscriptSelection(
  [
    {
      confidence: 1,
      endMs: 10_000,
      id: 'line-1',
      sortIndex: 0,
      speakerId: null,
      startMs: 0,
      text: '视频学习很好用'
    }
  ],
  2,
  5
)
assert.equal(nativeLine?.text, '学习很')
assert.equal(nativeLine?.sourceStartOffset, 2)
assert.equal(nativeLine?.sourceEndOffset, 5)

const nativeAcrossLines = buildNativeTranscriptSelection(
  [
    {
      confidence: 1,
      endMs: 1000,
      id: 'line-1',
      sortIndex: 0,
      speakerId: null,
      startMs: 0,
      text: '第一段内容'
    },
    {
      confidence: 1,
      endMs: 2000,
      id: 'line-2',
      sortIndex: 1,
      speakerId: null,
      startMs: 1000,
      text: '第二段内容'
    }
  ],
  2,
  3
)
assert.equal(nativeAcrossLines?.text, '段内容\n第二段')
assert.deepEqual(nativeAcrossLines?.segmentIds, ['line-1', 'line-2'])

const wordTimedSource = {
  confidence: 0.98,
  endMs: 2000,
  id: 'word-line',
  sortIndex: 0,
  speakerId: 'speaker-1',
  startMs: 0,
  text: '错误原文',
  words: [
    { endMs: 1000, startMs: 0, text: '错误' },
    { endMs: 2000, startMs: 1000, text: '原文' }
  ]
}
const correctedWordTimed = applyTranscriptCorrectionOverlay([wordTimedSource], {
  corrections: [
    {
      correctedText: '人工校对后的正文',
      createdAt: 2,
      id: 'correction-1',
      previousText: '错误原文',
      reason: 'manual',
      segmentId: 'word-line'
    }
  ],
  segments: [
    {
      endMs: 2000,
      id: 'word-line',
      originalText: '错误原文',
      speakerId: 'speaker-1',
      startMs: 0,
      translatedText: ''
    }
  ],
  sourceVersionId: 'source-v1',
  updatedAt: 2,
  version: 2
})
assert.equal(correctedWordTimed[0]?.text, '人工校对后的正文')
assert.equal(correctedWordTimed[0]?.words, undefined)

const highlightSegments = [
  { ...wordTimedSource, id: 'highlight-1', text: '第一段内容', words: undefined },
  {
    ...wordTimedSource,
    id: 'highlight-2',
    startMs: 2000,
    text: '第二段内容',
    words: undefined
  }
]
const highlightMap = buildTranscriptHighlightMap(highlightSegments, [
  {
    completed: false,
    createdAt: 1,
    highlightColor: 'blue',
    id: 'cross-line-highlight',
    kind: 'bookmark',
    quote: '一段内容\n第二段',
    sourceEndOffset: 3,
    sourceSegmentIds: ['highlight-1', 'highlight-2'],
    sourceStartOffset: 1,
    text: '',
    timestampMs: 0,
    updatedAt: 1
  }
])
assert.deepEqual(
  highlightMap.get('highlight-1')?.map(({ start, end }) => ({ end, start })),
  [{ end: 5, start: 1 }]
)
assert.deepEqual(
  highlightMap.get('highlight-2')?.map(({ start, end }) => ({ end, start })),
  [{ end: 3, start: 0 }]
)
assert.equal(
  splitTranscriptHighlightParts('第一段内容', highlightMap.get('highlight-1') ?? [])
    .filter((part) => part.highlighted)
    .map((part) => part.text)
    .join(''),
  '一段内容'
)
assert.equal(
  splitTranscriptHighlightParts('第二段内容', highlightMap.get('highlight-2') ?? [])
    .filter((part) => part.highlighted)
    .map((part) => part.text)
    .join(''),
  '第二段'
)

const stored = new Map<string, string>()
const pendingStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  removeItem: (key: string) => {
    stored.delete(key)
  },
  setItem: (key: string, value: string) => {
    stored.set(key, value)
  }
}
const pending = new Map([
  [
    'create-mindmap',
    {
      attempt: 0 as const,
      blockId: null,
      busyKey: 'new:mermaid',
      input: 'timestamped transcript',
      kind: 'mermaid' as const,
      promptId: 'create-mindmap'
    }
  ]
])
savePendingAiGenerations('lesson', pending, pendingStorage)
assert.deepEqual(loadPendingAiGenerations('lesson', pendingStorage), pending)
savePendingAiGenerations('lesson', new Map(), pendingStorage)
assert.equal(loadPendingAiGenerations('lesson', pendingStorage).size, 0)

process.stdout.write('Learning AI generation checks passed.\n')
