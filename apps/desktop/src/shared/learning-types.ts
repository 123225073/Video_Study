export type LearningNoteKind = 'action' | 'bookmark' | 'insight' | 'question'

export type LearningNoteHighlight = 'amber' | 'blue' | 'green' | 'pink' | 'purple'

export type LearningScene = 'note' | 'output' | 'watch'

export type LearningBlockKind =
  | 'ai'
  | 'heading'
  | 'mermaid'
  | 'note'
  | 'quote'
  | 'screenshot'
  | 'text'
  | 'todo'

export type LearningAiWorkflowId =
  | 'mindmap'
  | 'quote-candidates'
  | 'reflection'
  | 'summary'
  | 'translation'

export type LearningAiArtifactKind = 'mindmap' | 'quotes' | 'reflection' | 'summary' | 'translation'

export interface LearningNote {
  completed: boolean
  createdAt: number
  id: string
  /** Optional visual marker for the quoted transcript. Missing means the legacy/default style. */
  highlightColor?: LearningNoteHighlight | null
  kind: LearningNoteKind
  quote: string
  /** Transcript anchors are optional so notebooks created before v3.2 remain valid. */
  sourceEndOffset?: number | null
  sourceSegmentIds?: string[]
  sourceStartOffset?: number | null
  text: string
  timestampMs: number
  updatedAt: number
}

export interface LearningSourceMetadata {
  author: string
  canonicalUrl: string | null
  courseTitle: string
  durationMs: number
  importedAt: number
  localPath: string | null
  platform: string
  playlistId: string | null
  sourceId: string
  thumbnailUrl: string | null
  title: string
}

export interface LearningBlock {
  attachmentPath: string | null
  completed: boolean
  content: string
  createdAt: number
  id: string
  kind: LearningBlockKind
  quote: string
  sourceSegmentIds: string[]
  timestampMs: number | null
  updatedAt: number
}

export interface LearningTranscriptSegment {
  endMs: number
  id: string
  originalText: string
  speakerId: string | null
  startMs: number
  translatedText: string
}

export interface LearningTranscriptCorrection {
  correctedText: string
  createdAt: number
  id: string
  previousText: string
  reason: 'ai' | 'manual' | 'restore'
  segmentId: string
}

export interface LearningTranscriptRevision {
  corrections: LearningTranscriptCorrection[]
  segments: LearningTranscriptSegment[]
  sourceVersionId: string
  updatedAt: number
  version: number
}

export interface LearningTranscriptOverlay extends LearningTranscriptRevision {
  sourceHistory?: LearningTranscriptRevision[]
}

export interface LearningAiArtifact {
  content: string
  createdAt: number
  id: string
  kind: LearningAiArtifactKind
  model: string
  prompt: string
  promptVersion: number
  sourceSegmentIds: string[]
  transcriptVersion: number
}

export interface LearningAiArtifactAppendInput {
  artifact: LearningAiArtifact
  downloadId: string
}

export interface LearningNoteUpsertInput {
  downloadId: string
  note: LearningNote
}

export interface LearningNoteDeleteInput {
  downloadId: string
  noteId: string
}

export interface LearningBlockUpsertInput {
  block: LearningBlock
  downloadId: string
}

export interface LearningPromptDefinition {
  id: LearningAiWorkflowId
  systemPrompt: string
  updatedAt: number
  version: number
}

export interface LearningAiWorkflowRule {
  enabled: boolean
  id: LearningAiWorkflowId
  runOnTranscriptComplete: boolean
}

export interface LearningAiWorkflowSettings {
  defaultModel: string
  prompts: LearningPromptDefinition[]
  updatedAt: number
  version: 1
  workflows: LearningAiWorkflowRule[]
}

export interface LearningObsidianState {
  lastExportedAt: number | null
  managedHash: string | null
  relativePath: string | null
}

export interface LearningNotebook {
  aiArtifacts?: LearningAiArtifact[]
  blocks?: LearningBlock[]
  createdAt: number
  downloadId: string
  goal: string
  /** Legacy timestamped notes already copied into the unified notebook. */
  migratedLegacyNoteIds?: string[]
  notes: LearningNote[]
  /** Free-form Markdown written by the learner, independent from timestamped transcript notes. */
  personalNote?: string
  obsidian?: LearningObsidianState
  scene?: LearningScene
  source?: LearningSourceMetadata
  sourceUrl: string | null
  title: string
  transcript?: LearningTranscriptOverlay | null
  updatedAt: number
  version: 1 | 2
  workspaceId?: string
}

export interface LearningWorkspace extends LearningNotebook {
  aiArtifacts: LearningAiArtifact[]
  blocks: LearningBlock[]
  migratedLegacyNoteIds: string[]
  obsidian: LearningObsidianState
  personalNote: string
  scene: LearningScene
  source: LearningSourceMetadata
  transcript: LearningTranscriptOverlay | null
  version: 2
  workspaceId: string
}

export interface LearningNotebookWriteInput {
  aiArtifacts?: LearningAiArtifact[]
  blocks?: LearningBlock[]
  downloadId: string
  /** Patch semantics: omitted fields retain the latest persisted value. */
  goal?: string
  /** Patch semantics: omitted fields retain the latest persisted value. */
  migratedLegacyNoteIds?: string[]
  notes?: LearningNote[]
  /** Patch semantics: omitted fields retain the latest persisted value. */
  personalNote?: string
  obsidian?: LearningObsidianState
  scene?: LearningScene
  source?: Partial<LearningSourceMetadata>
  sourceUrl?: string | null
  title?: string
  transcript?: LearningTranscriptOverlay | null
  workspaceId?: string
}

export interface LearningWorkspaceDeleteInput {
  deleteDownloadedMedia?: boolean
  downloadId: string
}

export interface LearningWorkspaceDeleteResult {
  deletedDownloadedMedia: boolean
  deletedHistory: boolean
  deletedNotebook: boolean
  downloadedMediaDeleteFailed: boolean
  failedDownloadedMediaPath: string | null
  preservedLocalSource: boolean
}

export interface LearningTranscriptCorrectionInput {
  correctedText: string
  downloadId: string
  reason?: 'ai' | 'manual'
  segmentId: string
}

export interface LearningTranscriptRestoreInput {
  correctionId?: string | null
  downloadId: string
  segmentId: string
}

export interface LearningTranscriptSourceRestoreInput {
  downloadId: string
  sourceVersionId: string
}

export type LearningSearchField = 'ai' | 'note' | 'title' | 'transcript' | 'translation'

export interface LearningSearchQuery {
  downloadId?: string
  fields?: LearningSearchField[]
  limit?: number
  query: string
}

export interface LearningSearchResult {
  downloadId: string
  field: LearningSearchField
  id: string
  score: number
  snippet: string
  text: string
  timestampMs: number | null
  title: string
  workspaceId: string
}

export interface ObsidianAttachmentInput {
  dataUrl?: string
  relativePath: string
  sourcePath?: string
}

export interface ObsidianExportInput {
  attachments?: ObsidianAttachmentInput[]
  expectedManagedHash?: string | null
  force?: boolean
  notebook: LearningNotebook
  relativePath?: string
  sourceDirectory?: string
  vaultPath: string
}

export interface ObsidianExportPreview {
  absolutePath: string
  baseFileHash: string | null
  conflict: boolean
  conflictingAttachments: string[]
  content: string
  currentManagedHash: string | null
  managedHash: string
  relativePath: string
}

export interface ObsidianExportResult extends ObsidianExportPreview {
  attachmentsWritten: string[]
  status: 'conflict' | 'unchanged' | 'written'
}
