const MAX_SOURCE_CHARS = 80_000
const MAX_NODES = 240
const MAX_DEPTH = 10
const MAX_LABEL_CHARS = 400
const FORBIDDEN_SOURCE =
  /(?:^|\n)\s*(?:click\s|%%\{|classDef\s|class\s|style\s|linkStyle\s)|(?:javascript:|data:text\/html|url\s*\()/iu
const CLOCK = /(?:[[(（]\s*)?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s*(?:\]|\)|）))?/u
const FLOW_EDGE = /\s*(?:-->|-\.->|==>|---)(?:\|[^|\r\n]*\|)?\s*/u

export interface LearningMindmapNode {
  children: LearningMindmapNode[]
  evidenceLabel: string | null
  id: string
  label: string
  timeMs: number | null
}

export interface LearningMindmapDocument {
  root: LearningMindmapNode
  sourceFormat: 'legacy-flowchart' | 'mindmap'
}

export interface LearningMindmapLayoutNode {
  childCount: number
  collapsed: boolean
  colorIndex: number
  id: string
  label: string
  timeMs: number | null
  evidenceLabel: string | null
  x: number
  y: number
}

export interface LearningMindmapLayoutEdge {
  from: string
  fromX: number
  fromY: number
  id: string
  side: -1 | 1
  to: string
  toX: number
  toY: number
}

export interface LearningMindmapLayout {
  edges: LearningMindmapLayoutEdge[]
  height: number
  nodes: LearningMindmapLayoutNode[]
  width: number
}

const cleanFence = (source: string): string => {
  const trimmed = source.trim()
  const fenced = trimmed.match(/^```(?:mermaid)?\s*\r?\n([\s\S]*?)```$/iu)
  return (fenced?.[1] ?? trimmed).trim()
}

const decodeLabel = (value: string): string =>
  value
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/u, '$2')
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#91;', '[')
    .replaceAll('&#93;', ']')
    .replaceAll('&amp;', '&')
    .replace(/\s+/gu, ' ')
    .trim()

const labelFromMindmapToken = (token: string): string => {
  const value = token
    .trim()
    .replace(/:::[\w-]+\s*$/u, '')
    .trim()
  const shaped = [
    /^[A-Za-z_][\w-]*\(\(([\s\S]*)\)\)$/u,
    /^[A-Za-z_][\w-]*\{\{([\s\S]*)\}\}$/u,
    /^[A-Za-z_][\w-]*\[\[([\s\S]*)\]\]$/u,
    /^[A-Za-z_][\w-]*\[([\s\S]*)\]$/u,
    /^[A-Za-z_][\w-]*\(([\s\S]*)\)$/u,
    /^[A-Za-z_][\w-]*\{([\s\S]*)\}$/u,
    /^\(\(([\s\S]*)\)\)$/u,
    /^\{\{([\s\S]*)\}\}$/u,
    /^\[\[([\s\S]*)\]\]$/u,
    /^\[([\s\S]*)\]$/u,
    /^\(([\s\S]*)\)$/u,
    /^\{([\s\S]*)\}$/u
  ].find((pattern) => pattern.test(value))
  const match = shaped?.exec(value)
  return decodeLabel(match?.[1] ?? value)
}

const clockToMs = (clock: string): number | null => {
  const parts = clock.split(':').map(Number)
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((part) => !Number.isInteger(part) || part < 0) ||
    (parts.at(-1) ?? 60) >= 60 ||
    (parts.length === 3 && (parts.at(-2) ?? 60) >= 60)
  ) {
    return null
  }
  return parts.reduce((total, part) => total * 60 + part, 0) * 1000
}

const labelWithEvidence = (
  rawLabel: string
): Pick<LearningMindmapNode, 'evidenceLabel' | 'label' | 'timeMs'> => {
  const label = decodeLabel(rawLabel)
  const match = CLOCK.exec(label)
  const evidenceLabel = match?.[1] ?? null
  const timeMs = evidenceLabel ? clockToMs(evidenceLabel) : null
  const withoutClock = match
    ? `${label.slice(0, match.index)} ${label.slice(match.index + match[0].length)}`
        .replace(/\s+/gu, ' ')
        .trim()
    : label
  return {
    evidenceLabel: timeMs === null ? null : evidenceLabel,
    label: withoutClock || label,
    timeMs
  }
}

const makeNode = (rawLabel: string, id: string): LearningMindmapNode => ({
  children: [],
  id,
  ...labelWithEvidence(rawLabel)
})

const assertSafeSource = (source: string): void => {
  if (!source || source.length > MAX_SOURCE_CHARS) {
    throw new Error('Mind map source is empty or too large.')
  }
  if (FORBIDDEN_SOURCE.test(source)) {
    throw new Error('Mind map source contains an unsafe Mermaid directive.')
  }
}

const parseMindmap = (source: string): LearningMindmapDocument => {
  const lines = source
    .split(/\r?\n/u)
    .filter((line) => line.trim() && !line.trim().startsWith('%%'))
  if (lines[0]?.trim().toLowerCase() !== 'mindmap') {
    throw new Error('Mind map source must start with mindmap.')
  }
  const body = lines.slice(1)
  if (body.length === 0) {
    throw new Error('Mind map has no root topic.')
  }
  const stack: LearningMindmapNode[] = []
  let root: LearningMindmapNode | null = null
  let rootIndent = -1
  let nodeCount = 0
  for (const [lineIndex, line] of body.entries()) {
    const whitespace = line.match(/^\s*/u)?.[0] ?? ''
    if (whitespace.includes('\t') || whitespace.length % 2 !== 0) {
      throw new Error(`Mind map indentation is invalid on line ${lineIndex + 2}.`)
    }
    rootIndent = rootIndent < 0 ? whitespace.length : rootIndent
    const relativeIndent = whitespace.length - rootIndent
    if (relativeIndent < 0 || relativeIndent % 2 !== 0) {
      throw new Error(`Mind map hierarchy is invalid on line ${lineIndex + 2}.`)
    }
    const depth = relativeIndent / 2
    if (depth > MAX_DEPTH || depth > stack.length) {
      throw new Error(`Mind map hierarchy jumps too deeply on line ${lineIndex + 2}.`)
    }
    const label = labelFromMindmapToken(line.trim())
    if (!label || label.length > MAX_LABEL_CHARS) {
      throw new Error(`Mind map node is empty on line ${lineIndex + 2}.`)
    }
    nodeCount += 1
    if (nodeCount > MAX_NODES) {
      throw new Error('Mind map contains too many nodes.')
    }
    const node = makeNode(label, `mindmap-${lineIndex}`)
    if (depth === 0) {
      if (root) {
        throw new Error('Mind map must contain exactly one root topic.')
      }
      root = node
    } else {
      const parent = stack[depth - 1]
      if (!parent) {
        throw new Error(`Mind map parent is missing on line ${lineIndex + 2}.`)
      }
      parent.children.push(node)
    }
    stack[depth] = node
    stack.length = depth + 1
  }
  if (!root) {
    throw new Error('Mind map has no root topic.')
  }
  return { root, sourceFormat: 'mindmap' }
}

interface LegacyNode {
  id: string
  label: string
}

const parseFlowNode = (token: string): LegacyNode | null => {
  const clean = token.trim().replace(/;$/u, '').trim()
  const id = clean.match(/^([A-Za-z_][\w-]*)/u)?.[1]
  if (!id) {
    return null
  }
  return { id, label: labelFromMindmapToken(clean) || id }
}

const parseLegacyFlowchart = (source: string): LearningMindmapDocument => {
  const lines = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!/^(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)\b/iu.test(lines[0] ?? '')) {
    throw new Error('Unsupported Mermaid diagram type.')
  }
  const nodes = new Map<string, LegacyNode>()
  const edges = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const statement of lines
    .slice(1)
    .flatMap((line) => line.split(';'))
    .map((line) => line.trim())) {
    if (!statement || /^(?:subgraph|end\b|direction\b)/iu.test(statement)) {
      continue
    }
    const parts = statement.split(FLOW_EDGE)
    const parsed = parts.map(parseFlowNode).filter((node): node is LegacyNode => Boolean(node))
    for (const node of parsed) {
      if (node.label.length > MAX_LABEL_CHARS) {
        throw new Error('Legacy Mermaid node label is too large.')
      }
      nodes.set(node.id, node.label === node.id ? (nodes.get(node.id) ?? node) : node)
      indegree.set(node.id, indegree.get(node.id) ?? 0)
    }
    for (let index = 0; index < parsed.length - 1; index += 1) {
      const from = parsed[index]
      const to = parsed[index + 1]
      if (!(from && to) || from.id === to.id) {
        continue
      }
      const children = edges.get(from.id) ?? []
      if (!children.includes(to.id)) {
        children.push(to.id)
        edges.set(from.id, children)
        indegree.set(to.id, (indegree.get(to.id) ?? 0) + 1)
      }
    }
  }
  if (nodes.size === 0 || nodes.size > MAX_NODES) {
    throw new Error('Legacy Mermaid diagram has no usable nodes or is too large.')
  }
  const roots = [...nodes.keys()].filter((id) => (indegree.get(id) ?? 0) === 0)
  const rootIds = roots.length > 0 ? roots : [[...nodes.keys()][0] as string]
  const claimed = new Set<string>()
  const build = (id: string, path: string[], depth: number): LearningMindmapNode => {
    const legacy = nodes.get(id)
    const node = makeNode(legacy?.label ?? id, `legacy-${[...path, id].join('-')}`)
    claimed.add(id)
    if (depth >= MAX_DEPTH) {
      return node
    }
    const active = new Set(path)
    active.add(id)
    node.children = (edges.get(id) ?? [])
      .filter((childId) => !(active.has(childId) || claimed.has(childId)))
      .map((childId) => build(childId, [...path, id], depth + 1))
    return node
  }
  if (rootIds.length === 1) {
    return { root: build(rootIds[0] as string, [], 0), sourceFormat: 'legacy-flowchart' }
  }
  const root = makeNode('Overview', 'legacy-overview')
  root.children = rootIds.map((id) => build(id, [], 1))
  return { root, sourceFormat: 'legacy-flowchart' }
}

/** Parse safe AI mindmaps and historical flowcharts into one inert tree model. */
export const parseLearningMindmap = (rawSource: string): LearningMindmapDocument => {
  const source = cleanFence(rawSource)
  assertSafeSource(source)
  return /^mindmap\s*$/iu.test(source.split(/\r?\n/u)[0]?.trim() ?? '')
    ? parseMindmap(source)
    : parseLegacyFlowchart(source)
}

const encodeMindmapLabel = (node: LearningMindmapNode): string => {
  const label = node.evidenceLabel ? `${node.label} [${node.evidenceLabel}]` : node.label
  return label.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/** Serialize either supported source format into the editable safe mindmap grammar. */
export const serializeLearningMindmapDocument = (document: LearningMindmapDocument): string => {
  const lines = ['mindmap']
  let nodeIndex = 0
  const visit = (node: LearningMindmapNode, depth: number): void => {
    const nodeId = `n${nodeIndex}`
    nodeIndex += 1
    lines.push(`${'  '.repeat(depth + 1)}${nodeId}["${encodeMindmapLabel(node)}"]`)
    node.children.forEach((child) => {
      visit(child, depth + 1)
    })
  }
  visit(document.root, 0)
  return lines.join('\n')
}

/** Collect stable ids for every branch that can be collapsed. */
export const collectCollapsibleMindmapNodeIds = (root: LearningMindmapNode): Set<string> => {
  const ids = new Set<string>()
  const visit = (node: LearningMindmapNode): void => {
    if (node.children.length > 0) {
      ids.add(node.id)
      node.children.forEach(visit)
    }
  }
  visit(root)
  return ids
}

/** Keep the overview readable first; learners expand first-level branches for deeper detail. */
export const collectDefaultCollapsedMindmapNodeIds = (root: LearningMindmapNode): Set<string> =>
  new Set(root.children.filter((node) => node.children.length > 0).map((node) => node.id))

const leafCount = (node: LearningMindmapNode, collapsed: ReadonlySet<string>): number => {
  if (collapsed.has(node.id) || node.children.length === 0) {
    return 1
  }
  return node.children.reduce((total, child) => total + leafCount(child, collapsed), 0)
}

/** Create a deterministic bilateral layout with the root in the center. */
export const layoutLearningMindmap = (
  root: LearningMindmapNode,
  collapsed: ReadonlySet<string>
): LearningMindmapLayout => {
  const horizontalGap = 220
  const verticalGap = 86
  const padding = 130
  const rawNodes: LearningMindmapLayoutNode[] = []
  const rawEdges: LearningMindmapLayoutEdge[] = []
  const positions = new Map<string, { x: number; y: number }>()

  const sides: Array<{ children: LearningMindmapNode[]; direction: -1 | 1 }> = [
    { children: root.children.filter((_, index) => index % 2 === 1), direction: -1 },
    { children: root.children.filter((_, index) => index % 2 === 0), direction: 1 }
  ]
  for (const side of sides) {
    const leaves = side.children.reduce((total, child) => total + leafCount(child, collapsed), 0)
    let cursorY = -((Math.max(1, leaves) - 1) * verticalGap) / 2
    const place = (node: LearningMindmapNode, depth: number, colorIndex: number): number => {
      const visibleChildren = collapsed.has(node.id) ? [] : node.children
      let y = cursorY
      if (visibleChildren.length === 0) {
        cursorY += verticalGap
      } else {
        const childYs = visibleChildren.map((child) => place(child, depth + 1, colorIndex))
        y = childYs.reduce((total, childY) => total + childY, 0) / childYs.length
      }
      const x = side.direction * depth * horizontalGap
      positions.set(node.id, { x, y })
      rawNodes.push({
        childCount: node.children.length,
        collapsed: collapsed.has(node.id),
        colorIndex,
        evidenceLabel: node.evidenceLabel,
        id: node.id,
        label: node.label,
        timeMs: node.timeMs,
        x,
        y
      })
      for (const child of visibleChildren) {
        const target = positions.get(child.id)
        if (target) {
          rawEdges.push({
            from: node.id,
            fromX: x,
            fromY: y,
            id: `${node.id}:${child.id}`,
            side: side.direction,
            to: child.id,
            toX: target.x,
            toY: target.y
          })
        }
      }
      return y
    }
    side.children.forEach((child, index) => {
      place(child, 1, index)
    })
  }

  rawNodes.push({
    childCount: root.children.length,
    collapsed: collapsed.has(root.id),
    colorIndex: 0,
    evidenceLabel: root.evidenceLabel,
    id: root.id,
    label: root.label,
    timeMs: root.timeMs,
    x: 0,
    y: 0
  })
  if (collapsed.has(root.id)) {
    rawNodes.splice(0, rawNodes.length - 1)
    rawEdges.length = 0
  } else {
    for (const child of root.children) {
      const target = positions.get(child.id)
      if (target) {
        rawEdges.push({
          from: root.id,
          fromX: 0,
          fromY: 0,
          id: `${root.id}:${child.id}`,
          side: target.x < 0 ? -1 : 1,
          to: child.id,
          toX: target.x,
          toY: target.y
        })
      }
    }
  }

  const minX = Math.min(...rawNodes.map((node) => node.x)) - padding
  const maxX = Math.max(...rawNodes.map((node) => node.x)) + padding
  const minY = Math.min(...rawNodes.map((node) => node.y)) - padding / 2
  const maxY = Math.max(...rawNodes.map((node) => node.y)) + padding / 2
  const width = Math.max(520, maxX - minX)
  const height = Math.max(320, maxY - minY)
  const offsetX = (width - (maxX - minX)) / 2 - minX
  const offsetY = (height - (maxY - minY)) / 2 - minY
  return {
    edges: rawEdges.map((edge) => ({
      ...edge,
      fromX: edge.fromX + offsetX,
      fromY: edge.fromY + offsetY,
      toX: edge.toX + offsetX,
      toY: edge.toY + offsetY
    })),
    height,
    nodes: rawNodes.map((node) => ({ ...node, x: node.x + offsetX, y: node.y + offsetY })),
    width
  }
}
