type StrictMermaidParser = (source: string) => Promise<boolean>

export type MermaidRecoveryAction = 'repair-once' | 'reject'

let parserPromise: Promise<StrictMermaidParser> | null = null

const FLOWCHART_HEADER = /^(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)\b/iu
const EDGE = /(?:-->|-\.->|==>|~~~|---)(?:\|[^|\r\n]+\|)?\s*[A-Za-z_][\w-]*/u
const EDGE_WITHOUT_TARGET = /(?:-->|-\.->|==>|~~~|---)(?:\|[^|\r\n]+\|)?\s*$/u
const NODE_OR_DIRECTIVE =
  /^(?:[A-Za-z_][\w-]*\s*(?:\[|\(|\{|>|@\{)|subgraph\b|end\b|direction\b|%%)/iu

const hasBalancedDelimiters = (source: string): boolean => {
  const closing = new Map([
    [')', '('],
    [']', '['],
    ['}', '{']
  ])
  const opening = new Set(closing.values())
  const stack: string[] = []
  let quote = ''
  let escaped = false
  for (const character of source) {
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote) {
      escaped = true
      continue
    }
    if (character === '"' || character === "'") {
      if (!quote) {
        quote = character
      } else if (quote === character) {
        quote = ''
      }
      continue
    }
    if (quote) {
      continue
    }
    if (opening.has(character)) {
      stack.push(character)
      continue
    }
    const expected = closing.get(character)
    if (expected && stack.pop() !== expected) {
      return false
    }
  }
  return !quote && stack.length === 0
}

/** Reject truncated or stray flowchart statements before invoking Mermaid's browser parser. */
export const validateLearningFlowchartStructure = (source: string): boolean => {
  const lines = source
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!(lines.length >= 2 && FLOWCHART_HEADER.test(lines[0]) && hasBalancedDelimiters(source))) {
    return false
  }
  let edgeCount = 0
  for (const line of lines.slice(1)) {
    if (EDGE_WITHOUT_TARGET.test(line)) {
      return false
    }
    if (EDGE.test(line)) {
      edgeCount += 1
      continue
    }
    if (!NODE_OR_DIRECTIVE.test(line)) {
      return false
    }
  }
  return edgeCount > 0
}

/** A failed diagram gets exactly one automatic repair attempt, never an infinite retry loop. */
export const decideMermaidRecoveryAction = (
  repairAlreadyAttempted: boolean
): MermaidRecoveryAction => (repairAlreadyAttempted ? 'reject' : 'repair-once')

const loadParser = (): Promise<StrictMermaidParser> => {
  parserPromise ??= import('mermaid').then(({ default: mermaid }) => {
    return async (source: string): Promise<boolean> =>
      Boolean(await mermaid.parse(source, { suppressErrors: true }))
  })
  return parserPromise
}

/** Use Mermaid's own grammar instead of a permissive SVG renderer as validation. */
export const strictParseLearningMermaid = async (source: string): Promise<boolean> =>
  validateLearningFlowchartStructure(source) && (await loadParser())(source)
