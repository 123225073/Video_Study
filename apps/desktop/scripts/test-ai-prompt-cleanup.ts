import assert from 'node:assert/strict'
import {
  AI_PROMPT_PRESETS,
  createDefaultAiPrompts,
  mergeDefaultAiPrompts,
  RETIRED_LEARNING_PROMPT_IDS
} from '../src/shared/ai-prompts'
import type { AiPrompt } from '../src/shared/ai-types'
import { createDefaultLearningAiSettings } from '../src/shared/learning-workflow/defaults'

const now = 1_700_000_000_000
const defaults = createDefaultAiPrompts(now)
const canonicalMindmap = defaults.find((prompt) => prompt.id === 'create-mindmap')
assert.ok(canonicalMindmap)
const officialWorkflowBody = createDefaultLearningAiSettings(now).prompts.find(
  (prompt) => prompt.id === 'mindmap'
)?.systemPrompt
assert.ok(officialWorkflowBody)

const duplicate = (id: string, content = officialWorkflowBody): AiPrompt => ({
  ...canonicalMindmap,
  content,
  createdAt: now - 100,
  id,
  isPreset: false,
  title: '风沙学习 · 思维导图',
  updatedAt: now - 100
})

const customPrompt = duplicate(
  'custom-edited-mindmap',
  'My intentionally customized workflow prompt'
)
const retiredCustomized: AiPrompt = {
  ...canonicalMindmap,
  content: 'My customized outline that must survive retirement',
  id: 'learning-outline',
  isPreset: true,
  title: 'My learning outline'
}
const retiredTitleCustomized: AiPrompt = {
  ...canonicalMindmap,
  content: AI_PROMPT_PRESETS.find((prompt) => prompt.id === 'learning-outline')?.content ?? '',
  enabled: false,
  icon: 'sparkles',
  id: 'learning-outline',
  isPreset: true,
  title: 'My renamed official outline'
}
const merged = mergeDefaultAiPrompts(
  [
    ...defaults,
    duplicate('historical-sync-1'),
    duplicate('historical-sync-2'),
    customPrompt,
    duplicate('custom-identical-copy', customPrompt.content),
    retiredCustomized,
    retiredTitleCustomized
  ],
  now
)

assert.equal(
  merged.filter((prompt) => prompt.title === '风沙学习 · 思维导图').length,
  1,
  'Repeated historical workflow records should be removed while one customized record is preserved'
)
assert.equal(
  merged.some((prompt) => prompt.id === customPrompt.id),
  true
)
assert.equal(
  merged.filter((prompt) => prompt.content === customPrompt.content).length,
  1,
  'Identical customized workflow prompts must keep one recoverable record'
)
assert.equal(
  merged.some(
    (prompt) =>
      prompt.content === retiredCustomized.content &&
      prompt.isPreset === false &&
      prompt.id.startsWith('customized-learning-outline-')
  ),
  true,
  'A user-edited retired preset must be migrated to a custom prompt'
)
assert.equal(
  merged.some(
    (prompt) =>
      prompt.title === retiredTitleCustomized.title &&
      prompt.enabled === false &&
      prompt.icon === retiredTitleCustomized.icon &&
      prompt.isPreset === false
  ),
  true,
  'A retired preset with customized metadata must survive as a custom prompt'
)
assert.equal(
  merged.some((prompt) => prompt.id === canonicalMindmap.id),
  true
)
for (const retiredId of RETIRED_LEARNING_PROMPT_IDS) {
  assert.equal(
    merged.some((prompt) => prompt.id === retiredId),
    false
  )
}

process.stdout.write('AI prompt cleanup checks passed.\n')
