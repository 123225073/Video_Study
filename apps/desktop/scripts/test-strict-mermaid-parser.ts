import assert from 'node:assert/strict'
import {
  automaticMermaidRepairStorageKey,
  rememberAutomaticMermaidRepairAttempt,
  wasAutomaticMermaidRepairAttempted
} from '../src/renderer/src/lib/automatic-mermaid-repair'
import {
  decideMermaidRecoveryAction,
  validateLearningFlowchartStructure,
  validateLearningMindmapStructure
} from '../src/renderer/src/lib/strict-mermaid-parser'

const run = (): void => {
  assert.equal(
    validateLearningFlowchartStructure(
      'flowchart TD\n  source["原始证据"] --> insight["形成洞察"]'
    ),
    true
  )
  for (const invalid of [
    'flowchart TD\nA[broken --> B',
    'flowchart TD\nA -->',
    'flowchart TD\nA --> B\nthis is nonsense'
  ]) {
    assert.equal(
      validateLearningFlowchartStructure(invalid),
      false,
      `strict parser must reject: ${invalid}`
    )
  }
  assert.equal(
    validateLearningMindmapStructure('mindmap\n  视频学习\n    核心概念\n      证据 [00:10]'),
    true
  )
  for (const invalid of [
    'mindmap\n视频学习\n  核心概念',
    'mindmap\n  视频学习\n      跳级节点',
    'mindmap\n  视频学习\n    flowchart TD'
  ]) {
    assert.equal(validateLearningMindmapStructure(invalid), false)
  }
  assert.equal(decideMermaidRecoveryAction(false), 'repair-once')
  assert.equal(decideMermaidRecoveryAction(true), 'reject')
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  }
  const firstVersionKey = automaticMermaidRepairStorageKey('video-1', 'diagram', 1, 1)
  const nextTranscriptKey = automaticMermaidRepairStorageKey('video-1', 'diagram', 2, 1)
  const nextPromptKey = automaticMermaidRepairStorageKey('video-1', 'diagram', 1, 2)
  rememberAutomaticMermaidRepairAttempt(storage, firstVersionKey, true)
  assert.equal(wasAutomaticMermaidRepairAttempted(storage, firstVersionKey), true)
  assert.equal(wasAutomaticMermaidRepairAttempted(storage, nextTranscriptKey), false)
  assert.equal(wasAutomaticMermaidRepairAttempted(storage, nextPromptKey), false)
  rememberAutomaticMermaidRepairAttempt(storage, firstVersionKey, false)
  assert.equal(wasAutomaticMermaidRepairAttempted(storage, firstVersionKey), false)
  process.stdout.write('Strict Mermaid structure checks passed.\n')
}

run()
