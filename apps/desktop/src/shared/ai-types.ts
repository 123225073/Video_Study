/** Built-in LLM provider ids shown on the settings catalog. */
export type AiProviderPresetId =
  | 'anthropic'
  | 'azure'
  | 'custom'
  | 'deepseek'
  | 'google'
  | 'groq'
  | 'huggingface'
  | 'lmstudio'
  | 'ollama'
  | 'openai'
  | 'openrouter'
  | 'xai'

/** Lucide icon names stored with a prompt. */
export type AiPromptIconId =
  | 'list'
  | 'spell-check'
  | 'rows-3'
  | 'highlighter'
  | 'circle-help'
  | 'smile'
  | 'message-circle-question'
  | 'chart-no-axes-column'
  | 'repeat-2'
  | 'git-branch'
  | 'languages'
  | 'sparkles'

/** Catalog entry for a built-in provider. */
export interface AiProviderPreset {
  id: AiProviderPresetId
  defaultModel: string
  needsApiKey: boolean
  requiresBaseUrl: boolean
  baseUrl?: string
}

/** Persisted provider configuration. The API key never leaves the main process. */
export interface AiProviderConfig {
  id: string
  presetId: AiProviderPresetId
  name: string
  baseUrl: string
  modelId: string
  hasApiKey: boolean
  createdAt: number
  updatedAt: number
}

/** Payload used to create or update a provider from the renderer. */
export interface AiProviderWriteInput {
  id?: string
  presetId: AiProviderPresetId
  name?: string
  baseUrl?: string
  modelId: string
  apiKey?: string
}

/** Authentication supported by OpenAI-compatible image endpoints. */
export type AiImageAuthType = 'bearer' | 'api-key' | 'none'

/** Public image-generation configuration. Its API key stays in the main process. */
export interface AiImageProviderConfig {
  provider: 'openai' | 'openai-compatible'
  baseUrl: string
  modelId: string
  authType: AiImageAuthType
  apiKeyHeader: string
  hasApiKey: boolean
  updatedAt: number
}

/** Renderer payload for the independent image-generation provider. */
export interface AiImageProviderWriteInput {
  provider: 'openai' | 'openai-compatible'
  baseUrl: string
  modelId: string
  authType: AiImageAuthType
  apiKeyHeader?: string
  /** Empty on update keeps the sealed key already stored by the main process. */
  apiKey?: string
}

/** User-editable prompt used with a transcript. */
export interface AiPrompt {
  id: string
  title: string
  icon: AiPromptIconId
  content: string
  enabled: boolean
  isPreset: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** Payload used to create or update a prompt from the renderer. */
export interface AiPromptWriteInput {
  id?: string
  title: string
  icon: AiPromptIconId
  content: string
  enabled?: boolean
}

/** Lifecycle of a prompt run that lives in the main process. */
export type AiPromptRunStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error'

/** Why a prompt run failed, used to pick setup guidance in the UI. */
export type AiPromptErrorCode =
  | 'no-provider'
  | 'missing-api-key'
  | 'missing-model'
  | 'unknown-prompt'
  | 'empty-transcript'
  | 'auth'
  | 'network'
  | 'empty-output'
  | 'unknown'

/** Result of a one-shot ping that checks whether a provider can run. */
export interface AiProviderTestResult {
  ok: boolean
  text: string
  error: string | null
  errorCode: AiPromptErrorCode | null
}

/** Snapshot a renderer can restore after navigating away. */
export interface AiPromptRunSnapshot {
  downloadId: string
  promptId: string
  /** Immutable start time used to reject stale completion events and metadata races. */
  startedAt: number
  status: AiPromptRunStatus
  text: string
  /** Model reasoning, shown in ThinkingSteps instead of Streamdown. */
  thinking: string
  /** Milliseconds spent reasoning, so the header keeps its duration on reload. */
  thinkingMs: number
  error: string | null
  errorCode: AiPromptErrorCode | null
  updatedAt: number
}

/** Input required to start a prompt run. */
export interface AiPromptRunInput {
  downloadId: string
  promptId: string
  /** Optional user-maintained instruction for learning workflows. */
  promptContent?: string
  transcriptText: string
  /** UI language tag; built-in translate prompts resolve {{uiLanguage}} from this. */
  uiLanguage?: string
}

/** Image sizes supported by GPT Image models and compatible endpoints. */
export type AiImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto'

/** Image quality accepted by the OpenAI Image API. */
export type AiImageQuality = 'low' | 'medium' | 'high' | 'auto'

/** Coarse progress stages shown while an image request is running. */
export type AiImageRunStage = 'idle' | 'requesting' | 'generating' | 'partial' | 'completed'

/** Immutable user intent captured when an image run starts. */
export interface AiImageRunContext {
  /** Exact user-facing ratio; the renderer crops the compatible API size to this ratio. */
  aspectRatio?: '1:1' | '3:4' | '4:5' | '9:16' | '16:9'
  kind: 'cover' | 'logic' | 'quote'
  optimizedPrompt: string
  quote: string
}

/** Input for one Image API generation. Only one image run is active per download. */
export interface AiImageRunInput {
  downloadId: string
  context: AiImageRunContext
  size?: AiImageSize
  quality?: AiImageQuality
}

/** Restorable in-process snapshot broadcast on `ai:image-run`. */
export interface AiImageRunSnapshot {
  downloadId: string
  /** Changes for every start so renderers can ignore events from replaced runs. */
  runId: string
  startedAt: number
  status: AiPromptRunStatus
  stage: AiImageRunStage
  modelId: string
  /** Frozen start-time intent so tab changes cannot relabel a completed image. */
  context: AiImageRunContext | null
  /** Short Markdown-safe progress text; image bytes are never included here. */
  progressText: string
  /** Latest partial image while running, and final image once completed. */
  imageDataUrl: string | null
  partialImageIndex: number
  error: string | null
  errorCode: AiPromptErrorCode | null
  updatedAt: number
}

/** Providers and prompts returned together for settings pages. */
export interface AiSettingsSnapshot {
  activeProviderId: string | null
  imageProvider: AiImageProviderConfig
  providers: AiProviderConfig[]
  prompts: AiPrompt[]
}
