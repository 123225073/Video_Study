import assert from 'node:assert/strict'
import {
  collectCollapsibleMindmapNodeIds,
  collectDefaultCollapsedMindmapNodeIds,
  layoutLearningMindmap,
  parseLearningMindmap
} from '../src/renderer/src/lib/learning-mindmap'

const parsed = parseLearningMindmap(`\`\`\`mermaid
mindmap
  root((视频学习))
    理论基础
      关键概念 [00:01:05]
      <img src=x onerror=alert(1)>
    实践方法
      步骤一 02:15
      步骤二
\`\`\``)

assert.equal(parsed.sourceFormat, 'mindmap')
assert.equal(parsed.root.label, '视频学习')
assert.equal(parsed.root.children.length, 2)
assert.equal(parsed.root.children[0]?.children[0]?.label, '关键概念')
assert.equal(parsed.root.children[0]?.children[0]?.timeMs, 65_000)
assert.equal(parsed.root.children[1]?.children[0]?.timeMs, 135_000)
assert.equal(
  parsed.root.children[0]?.children[1]?.label,
  '<img src=x onerror=alert(1)>',
  'labels remain inert text instead of becoming HTML'
)

const expanded = layoutLearningMindmap(parsed.root, new Set())
assert.equal(expanded.nodes.length, 7)
assert.equal(expanded.edges.length, 6)
const rootLayout = expanded.nodes.find((node) => node.id === parsed.root.id)
const firstBranches = parsed.root.children.map((branch) =>
  expanded.nodes.find((node) => node.id === branch.id)
)
assert.ok(rootLayout)
assert.ok(firstBranches.some((node) => node && node.x < (rootLayout?.x ?? 0)))
assert.ok(firstBranches.some((node) => node && node.x > (rootLayout?.x ?? 0)))

const firstBranchId = parsed.root.children[0]?.id ?? ''
assert.deepEqual(
  [...collectDefaultCollapsedMindmapNodeIds(parsed.root)].sort(),
  parsed.root.children.map((branch) => branch.id).sort()
)
const branchCollapsed = layoutLearningMindmap(parsed.root, new Set([firstBranchId]))
assert.equal(branchCollapsed.nodes.length, 5)
assert.equal(branchCollapsed.nodes.find((node) => node.id === firstBranchId)?.collapsed, true)
const allCollapsedIds = collectCollapsibleMindmapNodeIds(parsed.root)
assert.deepEqual(
  [...allCollapsedIds].sort(),
  [parsed.root.id, ...parsed.root.children.map((branch) => branch.id)].sort()
)
const fullyCollapsed = layoutLearningMindmap(parsed.root, allCollapsedIds)
assert.equal(fullyCollapsed.nodes.length, 1)
assert.equal(fullyCollapsed.edges.length, 0)

const legacy = parseLearningMindmap(`flowchart LR
  source[原始视频] --> concept[核心概念 00:45]
  concept --> apply[实践方法]
  concept --> review[复盘]`)
assert.equal(legacy.sourceFormat, 'legacy-flowchart')
assert.equal(legacy.root.label, '原始视频')
assert.equal(legacy.root.children[0]?.label, '核心概念')
assert.equal(legacy.root.children[0]?.timeMs, 45_000)
assert.deepEqual(
  legacy.root.children[0]?.children.map((node) => node.label),
  ['实践方法', '复盘']
)

assert.throws(
  () => parseLearningMindmap('mindmap\n  Root\n    click Child "https://example.com"'),
  /unsafe/u
)
assert.throws(() => parseLearningMindmap('mindmap\n  Root\n      Skipped level'), /jumps/u)
assert.throws(() => parseLearningMindmap('sequenceDiagram\n  A->>B: no'), /Unsupported/u)

process.stdout.write('Interactive learning mindmap checks passed.\n')
