import path from 'node:path'
import { app } from 'electron'
import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import type {
  LearningAiArtifactAppendInput,
  LearningAiWorkflowSettings,
  LearningBlockUpsertInput,
  LearningNotebook,
  LearningNotebookWriteInput,
  LearningNoteDeleteInput,
  LearningNoteUpsertInput,
  LearningSearchQuery,
  LearningSearchResult,
  LearningTranscriptCorrectionInput,
  LearningTranscriptRestoreInput,
  LearningTranscriptSourceRestoreInput,
  ObsidianExportInput,
  ObsidianExportPreview,
  ObsidianExportResult
} from '../../../shared/learning-types'
import { LEARNING_AI_PROMPT_METADATA } from '../../../shared/learning-workflow/ai-prompts'
import { aiStore } from '../../lib/ai-store'
import { LearningStore } from '../../lib/learning-store'
import { ObsidianExporter } from '../../lib/learning-workspace/obsidian-exporter'

let learningStore: LearningStore | null = null
const obsidianExporter = new ObsidianExporter()

const getLearningStore = (): LearningStore => {
  learningStore ??= new LearningStore(path.join(app.getPath('userData'), 'learning-notebooks.json'))
  return learningStore
}

const prepareObsidianInput = async (input: ObsidianExportInput): Promise<ObsidianExportInput> => {
  const attachments = await Promise.all(
    (input.attachments ?? []).map(async (attachment) => {
      const reference = attachment.sourcePath ?? attachment.dataUrl
      if (!reference || Boolean(attachment.sourcePath) === Boolean(attachment.dataUrl)) {
        throw new Error('An Obsidian attachment requires exactly one managed source')
      }
      return {
        relativePath: attachment.relativePath,
        sourcePath: await getLearningStore().resolveAttachmentSource(reference)
      }
    })
  )
  return { ...input, attachments }
}

const syncLearningAiPrompts = (settings: LearningAiWorkflowSettings): void => {
  for (const prompt of settings.prompts) {
    const metadata = LEARNING_AI_PROMPT_METADATA[prompt.id]
    const rule = settings.workflows.find((item) => item.id === prompt.id)
    aiStore.upsertPrompt({
      content: prompt.systemPrompt,
      enabled: rule?.enabled ?? false,
      icon: metadata.icon,
      id: metadata.promptId,
      title: metadata.title
    })
  }
  const snapshot = aiStore.getSnapshot()
  const activeProvider = snapshot.providers.find(
    (provider) => provider.id === snapshot.activeProviderId
  )
  const defaultModel = settings.defaultModel.trim()
  if (activeProvider && defaultModel && activeProvider.modelId !== defaultModel) {
    aiStore.upsertProvider({
      baseUrl: activeProvider.baseUrl,
      id: activeProvider.id,
      modelId: defaultModel,
      name: activeProvider.name,
      presetId: activeProvider.presetId
    })
  }
}

class LearningService extends IpcService {
  static readonly groupName = 'learning'

  @IpcMethod()
  list(_context: IpcContext): Promise<LearningNotebook[]> {
    return getLearningStore().list()
  }

  @IpcMethod()
  get(_context: IpcContext, downloadId: string): Promise<LearningNotebook | null> {
    return getLearningStore().get(downloadId)
  }

  @IpcMethod()
  save(_context: IpcContext, input: LearningNotebookWriteInput): Promise<LearningNotebook> {
    return getLearningStore().save(input)
  }

  @IpcMethod()
  upsertNote(_context: IpcContext, input: LearningNoteUpsertInput): Promise<LearningNotebook> {
    return getLearningStore().upsertNote(input)
  }

  @IpcMethod()
  deleteNote(_context: IpcContext, input: LearningNoteDeleteInput): Promise<LearningNotebook> {
    return getLearningStore().deleteNote(input)
  }

  @IpcMethod()
  upsertBlock(_context: IpcContext, input: LearningBlockUpsertInput): Promise<LearningNotebook> {
    return getLearningStore().upsertBlock(input)
  }

  @IpcMethod()
  applyCorrection(
    _context: IpcContext,
    input: LearningTranscriptCorrectionInput
  ): Promise<LearningNotebook> {
    return getLearningStore().applyCorrection(input)
  }

  @IpcMethod()
  restoreCorrection(
    _context: IpcContext,
    input: LearningTranscriptRestoreInput
  ): Promise<LearningNotebook> {
    return getLearningStore().restoreCorrection(input)
  }

  @IpcMethod()
  restoreTranscriptSource(
    _context: IpcContext,
    input: LearningTranscriptSourceRestoreInput
  ): Promise<LearningNotebook> {
    return getLearningStore().restoreTranscriptSource(input)
  }

  @IpcMethod()
  search(_context: IpcContext, input: LearningSearchQuery): Promise<LearningSearchResult[]> {
    return getLearningStore().search(input)
  }

  @IpcMethod()
  async getAiSettings(_context: IpcContext): Promise<LearningAiWorkflowSettings> {
    const settings = await getLearningStore().getAiSettings()
    syncLearningAiPrompts(settings)
    return settings
  }

  @IpcMethod()
  async saveAiSettings(
    _context: IpcContext,
    input: LearningAiWorkflowSettings
  ): Promise<LearningAiWorkflowSettings> {
    const settings = await getLearningStore().saveAiSettings(input)
    syncLearningAiPrompts(settings)
    return settings
  }

  @IpcMethod()
  appendAiArtifact(
    _context: IpcContext,
    input: LearningAiArtifactAppendInput
  ): Promise<LearningNotebook> {
    return getLearningStore().appendAiArtifact(input)
  }

  @IpcMethod()
  async previewObsidian(
    _context: IpcContext,
    input: ObsidianExportInput
  ): Promise<ObsidianExportPreview> {
    return obsidianExporter.preview(await prepareObsidianInput(input))
  }

  @IpcMethod()
  async writeObsidian(
    _context: IpcContext,
    input: ObsidianExportInput
  ): Promise<ObsidianExportResult> {
    return obsidianExporter.write(await prepareObsidianInput(input))
  }
}

export { LearningService }
