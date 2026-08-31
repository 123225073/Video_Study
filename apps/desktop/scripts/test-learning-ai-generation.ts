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

const input = buildAiGenerationInput('[00:00:05] Speaker: Evidence', {
  selectedTranscript: { startMs: 5000, text: 'Evidence' },
  sourceTitle: 'Lesson',
  targetKind: 'reflection'
})
assert.match(input, /AI_GENERATION_CONTEXT/u)
assert.match(input, /"targetKind": "reflection"/u)

const mermaid = parseGeneratedLearningMermaid(`\`\`\`mermaid
flowchart TD
  source["来源"] --> insight["结论"]
\`\`\``)
assert.match(mermaid, /^flowchart TD/u)
assert.throws(
  () => parseGeneratedLearningMermaid('说明\n```mermaid\nflowchart TD\nA --> B\n```'),
  /图外说明/u
)
assert.throws(
  () => parseGeneratedLearningMermaid('flowchart TD\nA --> B\nclick A "https://example.com"'),
  /不允许/u
)

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
  'flowchart LR\n  learn["学习"] --> apply["应用"]',
  'AI 生成 Mermaid 图解'
)
assert.equal(generated.kind, 'mermaid')
assert.match(generated.code, /^flowchart LR/u)

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
    'learning-diagram',
    {
      attempt: 0 as const,
      blockId: null,
      busyKey: 'new:mermaid',
      input: 'timestamped transcript',
      kind: 'mermaid' as const,
      promptId: 'learning-diagram'
    }
  ]
])
savePendingAiGenerations('lesson', pending, pendingStorage)
assert.deepEqual(loadPendingAiGenerations('lesson', pendingStorage), pending)
savePendingAiGenerations('lesson', new Map(), pendingStorage)
assert.equal(loadPendingAiGenerations('lesson', pendingStorage).size, 0)

process.stdout.write('Learning AI generation checks passed.\n')
