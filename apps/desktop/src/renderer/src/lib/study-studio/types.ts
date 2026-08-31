import type { ReactNode } from 'react'

export const STUDY_SCENES = ['watch', 'note', 'output'] as const

export type StudyScene = (typeof STUDY_SCENES)[number]

export interface StudyStudioLabels {
  regions: Record<'note' | 'output' | 'transcript' | 'video', string>
  sceneDescriptions: Record<StudyScene, string>
  scenes: Record<StudyScene, string>
}

export interface StudyStudioSlots {
  note: ReactNode
  output: ReactNode
  transcript: ReactNode
  video: ReactNode
}

export const TRANSCRIPT_SELECTION_INTENTS = [
  'seek',
  'copy',
  'highlight',
  'note',
  'reflection',
  'quote-card',
  'ask-ai'
] as const

export type TranscriptSelectionIntent = (typeof TRANSCRIPT_SELECTION_INTENTS)[number]

export interface TranscriptSelection {
  endMs?: number
  /** Character offset inside the final source segment. */
  sourceEndOffset?: number
  segmentIds?: string[]
  /** Character offset inside the first source segment. */
  sourceStartOffset?: number
  startMs: number
  text: string
}

export interface TranscriptSelectionAction {
  intent: TranscriptSelectionIntent
  selection: TranscriptSelection
}

export interface FloatingAnchorRect {
  height: number
  left: number
  top: number
  width: number
}

export const STUDY_NOTE_BLOCK_KINDS = [
  'paragraph',
  'quote',
  'screenshot',
  'reflection',
  'question',
  'mermaid',
  'ai'
] as const

export type StudyNoteBlockKind = (typeof STUDY_NOTE_BLOCK_KINDS)[number]

interface StudyNoteBlockBase {
  createdAt: number
  id: string
  kind: StudyNoteBlockKind
  updatedAt: number
}

export interface ParagraphStudyBlock extends StudyNoteBlockBase {
  kind: 'paragraph'
  markdown: string
}

export interface QuoteStudyBlock extends StudyNoteBlockBase {
  endMs?: number
  kind: 'quote'
  note?: string
  quote: string
  sourceUrl?: string
  startMs: number
}

export interface ScreenshotStudyBlock extends StudyNoteBlockBase {
  alt: string
  caption?: string
  imageSrc: string
  kind: 'screenshot'
  sourceUrl?: string
  timestampMs: number
}

export interface ReflectionStudyBlock extends StudyNoteBlockBase {
  kind: 'reflection'
  markdown: string
}

export interface QuestionStudyBlock extends StudyNoteBlockBase {
  kind: 'question'
  markdown: string
  resolved?: boolean
}

export interface MermaidStudyBlock extends StudyNoteBlockBase {
  code: string
  kind: 'mermaid'
  title?: string
}

export interface AiStudyBlock extends StudyNoteBlockBase {
  kind: 'ai'
  markdown: string
  model?: string
  promptLabel?: string
}

export type StudyNoteBlock =
  | AiStudyBlock
  | MermaidStudyBlock
  | ParagraphStudyBlock
  | QuestionStudyBlock
  | QuoteStudyBlock
  | ReflectionStudyBlock
  | ScreenshotStudyBlock

export interface StudyNoteDocument {
  blocks: StudyNoteBlock[]
  title: string
  version: 1
}

export interface StudyBlockEditorLabels {
  addBlock: string
  aiActions: Record<StudyNoteBlockKind, string>
  aiFailed: string
  aiGenerate: string
  aiGenerating: string
  aiRegenerate: string
  blockKinds: Record<StudyNoteBlockKind, string>
  blockDeleted: string
  deleteBlock: string
  emptyDescription: string
  emptyTitle: string
  fields: {
    alt: string
    caption: string
    content: string
    imageSrc: string
    mermaid: string
    model: string
    note: string
    prompt: string
    quote: string
    resolved: string
    sourceUrl: string
    timestamp: string
    title: string
  }
  moveDown: string
  moveUp: string
  markdownPreview: string
  mermaidPreview: string
  mermaidSource: string
  title: string
  undoDelete: string
}

export interface StudyMarkdownLabels {
  ai: string
  question: string
  reflection: string
  source: string
}

export const QUOTE_CARD_TEMPLATES = ['quote', 'visual-quote', 'quote-reflection'] as const
export const QUOTE_CARD_ASPECTS = ['square', 'portrait', 'story'] as const
export const QUOTE_CARD_THEMES = ['ink', 'paper', 'forest'] as const
export const QUOTE_CARD_FONT_SCALES = ['compact', 'balanced', 'large'] as const

export type QuoteCardTemplate = (typeof QUOTE_CARD_TEMPLATES)[number]
export type QuoteCardAspect = (typeof QUOTE_CARD_ASPECTS)[number]
export type QuoteCardTheme = (typeof QUOTE_CARD_THEMES)[number]
export type QuoteCardFontScale = (typeof QUOTE_CARD_FONT_SCALES)[number]

export interface QuoteCardDraft {
  aspect: QuoteCardAspect
  fontScale: QuoteCardFontScale
  imageSrc?: string
  quote: string
  reflection?: string
  showBrand: boolean
  showSource: boolean
  signature?: string
  sourceAuthor?: string
  sourceTitle?: string
  template: QuoteCardTemplate
  theme: QuoteCardTheme
  timestampLabel?: string
}

export interface QuoteCardStudioLabels {
  aspect: string
  aspects: Record<QuoteCardAspect, string>
  brand: string
  export: string
  exportFailed: string
  exporting: string
  fields: {
    imageSrc: string
    quote: string
    reflection: string
    signature: string
    sourceAuthor: string
    sourceTitle: string
    timestamp: string
  }
  fontScale: string
  fontScales: Record<QuoteCardFontScale, string>
  insightLabel: string
  preview: string
  showBrand: string
  showSource: string
  template: string
  templates: Record<QuoteCardTemplate, string>
  theme: string
  themes: Record<QuoteCardTheme, string>
  videoNoteLabel: string
}
