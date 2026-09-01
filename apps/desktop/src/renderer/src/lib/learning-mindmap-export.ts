import {
  type LearningMindmapDocument,
  type LearningMindmapLayoutNode,
  layoutLearningMindmap,
  parseLearningMindmap
} from './learning-mindmap'

const NODE_WIDTH = 176
const ROOT_WIDTH = 208
const NODE_HEIGHT = 62
const LINE_LENGTH = 14
const LINE_HEIGHT = 18
const NODE_VERTICAL_PADDING = 28
const ROW_GAP = 24
const XML_ESCAPE = /[&<>"']/gu
const XML_REPLACEMENTS: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&apos;',
  '<': '&lt;',
  '>': '&gt;'
}

const escapeXml = (value: string): string =>
  value.replace(XML_ESCAPE, (character) => XML_REPLACEMENTS[character] ?? character)

const splitLabel = (value: string): string[] => {
  const characters = [...value]
  const lines: string[] = []
  for (let index = 0; index < characters.length; index += LINE_LENGTH) {
    lines.push(characters.slice(index, index + LINE_LENGTH).join(''))
  }
  return lines.length > 0 ? lines : ['']
}

interface ExportNode {
  height: number
  lines: string[]
  node: LearningMindmapLayoutNode
  y: number
}

const renderNode = ({ height, lines, node, y }: ExportNode, rootId: string): string => {
  const isRoot = node.id === rootId
  const width = isRoot ? ROOT_WIDTH : NODE_WIDTH
  const firstY = y - ((lines.length - 1) * LINE_HEIGHT) / 2
  const text = lines
    .map(
      (line, index) =>
        `<tspan x="${node.x}" y="${firstY + index * LINE_HEIGHT}">${escapeXml(line)}</tspan>`
    )
    .join('')
  const fill = isRoot
    ? '#18181b'
    : ['#fffbeb', '#f0f9ff', '#ecfdf5', '#f5f3ff'][node.colorIndex % 4]
  const stroke = isRoot
    ? '#18181b'
    : ['#f59e0b', '#38bdf8', '#34d399', '#a78bfa'][node.colorIndex % 4]
  const color = isRoot ? '#ffffff' : '#1c1917'
  return [
    `<g data-node-id="${escapeXml(node.id)}">`,
    `<rect x="${node.x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
    `<text text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="13" font-weight="${isRoot ? 700 : 500}" fill="${color}">${text}</text>`,
    '</g>'
  ].join('')
}

/** Build a portable, fully expanded SVG from the safe mindmap model. */
export const buildLearningMindmapSvg = (source: string): string => {
  const document = parseLearningMindmap(source)
  const layout = layoutLearningMindmap(document.root, new Set())
  const measured = layout.nodes.map((node) => {
    const lines = splitLabel(node.label)
    return {
      height: Math.max(NODE_HEIGHT, lines.length * LINE_HEIGHT + NODE_VERTICAL_PADDING),
      lines,
      node
    }
  })
  const rows = [...new Set(measured.map(({ node }) => node.y))]
    .sort((left, right) => left - right)
    .map((originalY) => ({
      height: Math.max(
        ...measured.filter(({ node }) => node.y === originalY).map(({ height }) => height)
      ),
      originalY
    }))
  const rowY = new Map<number, number>()
  let cursorY = 32
  for (const row of rows) {
    rowY.set(row.originalY, cursorY + row.height / 2)
    cursorY += row.height + ROW_GAP
  }
  const exportNodes: ExportNode[] = measured.map((item) => ({
    ...item,
    y: rowY.get(item.node.y) ?? item.node.y
  }))
  const nodeY = new Map(exportNodes.map((item) => [item.node.id, item.y]))
  const exportHeight = Math.max(320, cursorY - ROW_GAP + 32)
  const edges = layout.edges
    .map((edge) => {
      const fromY = nodeY.get(edge.from) ?? edge.fromY
      const toY = nodeY.get(edge.to) ?? edge.toY
      const midpoint = (edge.fromX + edge.toX) / 2
      return `<path d="M ${edge.fromX} ${fromY} C ${midpoint} ${fromY}, ${midpoint} ${toY}, ${edge.toX} ${toY}" fill="none" stroke="#d6a54a" stroke-width="2" stroke-linecap="round"/>`
    })
    .join('')
  const nodes = exportNodes.map((node) => renderNode(node, document.root.id)).join('')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${exportHeight}" viewBox="0 0 ${layout.width} ${exportHeight}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    edges,
    nodes,
    '</svg>'
  ].join('')
}

/** Serialize the parsed tree for interoperable backups. */
export const buildLearningMindmapJson = (source: string): string =>
  JSON.stringify(parseLearningMindmap(source) satisfies LearningMindmapDocument, null, 2)

/** Convert an SVG string to a high-resolution PNG in the renderer. */
export const mindmapSvgToPng = async (svg: string): Promise<ArrayBuffer> => {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'sync'
    image.src = url
    await image.decode()
    const scale = Math.min(2, 3200 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas is unavailable')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG export failed'))))
    })
    return png.arrayBuffer()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Keep suggested filenames safe and readable across desktop platforms. */
export const learningMindmapFileStem = (
  title: string,
  fallbackTitle = 'learning-mindmap'
): string =>
  [...(title.trim() || fallbackTitle)]
    .map((character) =>
      (character.codePointAt(0) ?? 0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character
    )
    .join('')
    .slice(0, 80)
