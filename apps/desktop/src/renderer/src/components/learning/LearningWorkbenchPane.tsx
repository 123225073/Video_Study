import { InteractiveLearningMindmap } from '@renderer/components/learning/InteractiveLearningMindmap'
import { LearningImageStudio } from '@renderer/components/learning/LearningImageStudio'
import { LearningStudyChat } from '@renderer/components/learning/LearningStudyChat'
import { TranscriptPromptThinking } from '@renderer/components/transcript/TranscriptPromptThinking'
import { Button } from '@renderer/components/ui/button'
import { Response } from '@renderer/components/ui/response'
import { usePromptRun } from '@renderer/hooks/use-prompt-run'
import { validateGeneratedLearningMermaid } from '@renderer/lib/beautiful-mermaid-plugin'
import { ipcServices } from '@renderer/lib/ipc'
import {
  parseLearningMindmap,
  serializeLearningMindmapDocument
} from '@renderer/lib/learning-mindmap'
import {
  learningTimestampFromTarget,
  linkifyLearningTimestamps
} from '@renderer/lib/learning-timestamps'
import { logger } from '@renderer/lib/logger'
import { decideMermaidRecoveryAction } from '@renderer/lib/strict-mermaid-parser'
import { parseGeneratedLearningMermaid } from '@renderer/lib/study-studio/ai-generation'
import type { TranscriptSelection } from '@renderer/lib/study-studio/types'
import type { AiSettingsSnapshot } from '@shared/ai-types'
import type { CompanionCapturePayload } from '@shared/companion-types'
import { APP_PROTOCOL } from '@shared/constants'
import type {
  LearningAiWorkflowId,
  LearningAiWorkflowSettings,
  LearningBlock,
  LearningNotebook,
  ObsidianAttachmentInput
} from '@shared/learning-types'
import { useNavigate } from '@tanstack/react-router'
import {
  ClipboardCopy,
  Database,
  FileText,
  GitBranch,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  ScanText,
  Settings2,
  Sparkles,
  Square
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

type LearningModuleId = 'diagram' | 'digest' | 'image' | 'question' | 'summary' | 'template'

interface LearningModuleDefinition {
  description: string
  icon: typeof Sparkles
  id: LearningModuleId
  label: string
  promptId: string | null
  workflowId?: LearningAiWorkflowId
}

const MODULES: LearningModuleDefinition[] = [
  {
    description: 'Mermaid 完整思维导图',
    icon: GitBranch,
    id: 'diagram',
    label: '思维导图',
    promptId: 'create-mindmap',
    workflowId: 'mindmap'
  },
  {
    description: '快速判断值得回看的部分',
    icon: ScanText,
    id: 'digest',
    label: '精华速览',
    promptId: 'learning-digest'
  },
  {
    description: '完整、可靠的文字总结',
    icon: FileText,
    id: 'summary',
    label: '完整总结',
    promptId: 'study-notes',
    workflowId: 'summary'
  },
  {
    description: '按场景套用结构',
    icon: LayoutTemplate,
    id: 'template',
    label: '模板总结',
    promptId: 'learning-template-summary'
  },
  {
    description: '基于原文证据回答',
    icon: MessageCircleQuestion,
    id: 'question',
    label: 'AI 学习',
    promptId: null
  },
  {
    description: '按用途、风格和比例生成一张可直接使用的图片',
    icon: ImageIcon,
    id: 'image',
    label: '一图胜千言',
    promptId: null
  }
]

const TEMPLATE_OPTIONS = {
  course: {
    label: '课程学习',
    requirements: '核心概念、论证结构、案例证据、可实践方法、仍需核实的问题'
  },
  meeting: {
    label: '会议复盘',
    requirements: '背景与目标、关键讨论、明确结论、责任人和下一步、分歧与风险'
  },
  technical: {
    label: '技术教程',
    requirements: '前置条件、核心原理、操作步骤、关键参数、常见错误、验证方式'
  },
  content: {
    label: '内容分析',
    requirements: '核心主张、受众与目的、内容结构、论据质量、表达策略、可迁移启发'
  }
} as const

type TemplateId = keyof typeof TEMPLATE_OPTIONS

interface LearningWorkbenchPaneProps {
  capturedFrame?: CompanionCapturePayload | null
  downloadId: string
  onSeek: (seconds: number) => void
  selectedQuote?: TranscriptSelection | null
  selectionIntent?: 'quote-card' | 'reflection' | null
  sourceTitle: string
  transcriptText: string
}

const moduleMarker = (moduleId: LearningModuleId): string => `ai-module:${moduleId}`
const diagramRepairStorageKey = (downloadId: string): string =>
  `fengsha.learning.diagram-repair:${downloadId}`

const readDiagramRepairAttempted = (downloadId: string): boolean => {
  try {
    return globalThis.localStorage?.getItem(diagramRepairStorageKey(downloadId)) === '1'
  } catch {
    return false
  }
}

const rememberDiagramRepairAttempted = (downloadId: string, attempted: boolean): void => {
  try {
    if (attempted) {
      globalThis.localStorage?.setItem(diagramRepairStorageKey(downloadId), '1')
    } else {
      globalThis.localStorage?.removeItem(diagramRepairStorageKey(downloadId))
    }
  } catch {
    // A disabled storage partition must not prevent diagram generation.
  }
}

const prepareObsidianNotebook = (
  notebook: LearningNotebook
): { attachments: ObsidianAttachmentInput[]; notebook: LearningNotebook } => {
  const attachments: ObsidianAttachmentInput[] = []
  const blocks = (notebook.blocks ?? []).map((block) => {
    const dataUrlMatch = block.attachmentPath?.match(/^data:image\/(jpeg|png|webp);base64,/iu)
    let storedMatch: RegExpMatchArray | null = null
    if (block.attachmentPath?.startsWith(`${APP_PROTOCOL}://`)) {
      try {
        const storedUrl = new URL(block.attachmentPath)
        if (storedUrl.hostname === 'learning-attachments') {
          storedMatch = storedUrl.pathname.match(/^\/[a-f\d]{64}\.(jpg|png|webp)$/u)
        }
      } catch {
        storedMatch = null
      }
    }
    if (!(block.attachmentPath && (dataUrlMatch || storedMatch))) {
      return block
    }
    const rawExtension = dataUrlMatch?.[1] ?? storedMatch?.[1] ?? 'png'
    const extension = rawExtension.toLowerCase() === 'jpeg' ? 'jpg' : rawExtension.toLowerCase()
    const safeId = block.id.replace(/[^a-z\d_-]+/giu, '-').slice(0, 80) || `${block.createdAt}`
    const workspaceId = notebook.workspaceId ?? notebook.downloadId
    const relativePath = `attachments/${workspaceId}-${safeId}.${extension}`
    attachments.push(
      dataUrlMatch
        ? { dataUrl: block.attachmentPath, relativePath }
        : { relativePath, sourcePath: block.attachmentPath }
    )
    return { ...block, attachmentPath: relativePath }
  })
  return { attachments, notebook: { ...notebook, blocks } }
}

const sourceArtifactForModule = (
  notebook: LearningNotebook | null,
  moduleId: LearningModuleId
): string => {
  const savedBlock = [...(notebook?.blocks ?? [])]
    .filter((block) => block.sourceSegmentIds.includes(moduleMarker(moduleId)))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  if (savedBlock?.content.trim()) {
    return savedBlock.content
  }
  const artifactKind =
    moduleId === 'diagram'
      ? 'mindmap'
      : moduleId === 'summary' || moduleId === 'digest'
        ? 'summary'
        : null
  return (
    [...(notebook?.aiArtifacts ?? [])]
      .filter((artifact) => artifact.kind === artifactKind)
      .sort((left, right) => right.createdAt - left.createdAt)[0]?.content ?? ''
  )
}

const buildRunInput = ({
  moduleId,
  selectedQuote,
  templateId,
  transcriptText
}: {
  moduleId: LearningModuleId
  selectedQuote?: TranscriptSelection | null
  templateId: TemplateId
  transcriptText: string
}): string => {
  const selectedContext = selectedQuote?.text.trim()
    ? `\n\nSELECTED_PASSAGE_AT_${Math.floor(selectedQuote.startMs / 1000)}S:\n${selectedQuote.text.trim()}`
    : ''
  if (moduleId === 'template') {
    const template = TEMPLATE_OPTIONS[templateId]
    return `TEMPLATE: ${template.label}\nTEMPLATE_REQUIREMENTS: ${template.requirements}\n\nVIDEO_TRANSCRIPT:\n${transcriptText}${selectedContext}`
  }
  return `${transcriptText}${selectedContext}`
}

const emptyState = (module: LearningModuleDefinition): ReactNode => (
  <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-muted/15 px-6 text-center">
    <div>
      <module.icon className="mx-auto size-8 text-amber-500" />
      <h3 className="mt-3 font-semibold text-sm">{module.label}</h3>
      <p className="mt-1 max-w-56 text-muted-foreground text-xs leading-5">
        {module.description}。结果会流式显示，时间标记可直接跳回原视频。
      </p>
    </div>
  </div>
)

export function LearningWorkbenchPane({
  capturedFrame,
  downloadId,
  onSeek,
  selectedQuote,
  selectionIntent,
  sourceTitle,
  transcriptText
}: LearningWorkbenchPaneProps) {
  const navigate = useNavigate()
  const [moduleId, setModuleId] = useState<LearningModuleId>('diagram')
  const [templateId, setTemplateId] = useState<TemplateId>('course')
  const [notebook, setNotebook] = useState<LearningNotebook | null>(null)
  const [aiSettings, setAiSettings] = useState<AiSettingsSnapshot | null>(null)
  const [workflowSettings, setWorkflowSettings] = useState<LearningAiWorkflowSettings | null>(null)
  const [validatedDiagramOutput, setValidatedDiagramOutput] = useState('')
  const [diagramValidationError, setDiagramValidationError] = useState<string | null>(null)
  const diagramRepairAttempted = useRef(readDiagramRepairAttempted(downloadId))
  const persistedRuns = useRef(new Set<string>())
  const outputRef = useRef<HTMLDivElement>(null)
  const module = MODULES.find((item) => item.id === moduleId) ?? MODULES[0]
  const promptRun = usePromptRun(downloadId, module.promptId)

  useEffect(() => {
    diagramRepairAttempted.current = readDiagramRepairAttempted(downloadId)
    setDiagramValidationError(null)
    setValidatedDiagramOutput('')
  }, [downloadId])

  useEffect(() => {
    let active = true
    void Promise.all([
      ipcServices.learning.get(downloadId),
      ipcServices.ai.getSnapshot(),
      ipcServices.learning.getAiSettings()
    ])
      .then(([savedNotebook, settings, savedWorkflowSettings]) => {
        if (active) {
          setNotebook(savedNotebook)
          setAiSettings(settings)
          setWorkflowSettings(savedWorkflowSettings)
        }
      })
      .catch((error) => logger.error('Failed to load learning AI workbench', error))
    return () => {
      active = false
    }
  }, [downloadId])

  useEffect(() => {
    if (!(selectedQuote?.text.trim() && selectionIntent)) {
      return
    }
    if (selectionIntent === 'quote-card') {
      setModuleId('image')
      return
    }
    setModuleId('question')
  }, [selectedQuote, selectionIntent])

  useEffect(() => {
    if (capturedFrame?.action === 'frame' && capturedFrame.screenshotDataUrl) {
      setModuleId('image')
    }
  }, [capturedFrame])

  useEffect(() => {
    const snapshot = promptRun.run
    const runKey = `${snapshot.promptId}:${snapshot.startedAt}`
    const targetModule = MODULES.find((item) => item.promptId === snapshot.promptId)
    if (
      !targetModule ||
      snapshot.status !== 'completed' ||
      !snapshot.text.trim() ||
      persistedRuns.current.has(runKey)
    ) {
      return
    }
    persistedRuns.current.add(runKey)
    void (async () => {
      try {
        let content = snapshot.text.trim()
        if (targetModule.id === 'diagram') {
          try {
            const code = parseGeneratedLearningMermaid(content)
            await validateGeneratedLearningMermaid(code)
            content = `\`\`\`mermaid\n${code}\n\`\`\``
            setValidatedDiagramOutput(content)
            setDiagramValidationError(null)
            diagramRepairAttempted.current = false
            rememberDiagramRepairAttempted(downloadId, false)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const recoveryAction = decideMermaidRecoveryAction(diagramRepairAttempted.current)
            if (recoveryAction === 'repair-once') {
              diagramRepairAttempted.current = true
              rememberDiagramRepairAttempted(downloadId, true)
              setDiagramValidationError('图谱语法未通过，AI 正在根据渲染错误自动修复一次。')
              await promptRun.start(
                `${transcriptText}\n\nAI_GENERATED_DRAFT (repair this data):\n${snapshot.text}\n\nRENDER_ERROR:\n${message}`,
                workflowSettings?.prompts.find((item) => item.id === 'mindmap')?.systemPrompt
              )
              return
            }
            setValidatedDiagramOutput('')
            setDiagramValidationError(`自动修复后仍无法渲染：${message}`)
            return
          }
        }
        const marker = moduleMarker(targetModule.id)
        const block: LearningBlock = {
          attachmentPath: null,
          completed: false,
          content,
          createdAt: snapshot.startedAt,
          id: `ai-module-${targetModule.id}-${snapshot.startedAt}`,
          kind: 'ai',
          quote: targetModule.label,
          sourceSegmentIds: [marker],
          timestampMs: null,
          updatedAt: snapshot.updatedAt
        }
        const saved = await ipcServices.learning.upsertBlock({
          block,
          downloadId
        })
        setNotebook(saved)
      } catch (error) {
        persistedRuns.current.delete(runKey)
        logger.error('Failed to persist learning AI result', error)
      }
    })()
  }, [downloadId, promptRun.run, promptRun.start, transcriptText, workflowSettings])

  const fallbackOutput = useMemo(
    () => sourceArtifactForModule(notebook, moduleId),
    [moduleId, notebook]
  )
  const running = promptRun.run.status === 'running'
  const output =
    moduleId === 'diagram'
      ? running
        ? promptRun.run.text
        : validatedDiagramOutput || fallbackOutput
      : promptRun.run.text || fallbackOutput
  const displayOutput = moduleId === 'diagram' ? output : linkifyLearningTimestamps(output)
  const activeProvider = aiSettings?.providers.find(
    (provider) => provider.id === aiSettings.activeProviderId
  )

  useEffect(() => {
    const outputElement = outputRef.current
    if (!outputElement) {
      return
    }
    const seekFromOutput = (event: globalThis.MouseEvent): void => {
      const seconds = learningTimestampFromTarget(event.target as HTMLElement)
      if (seconds === null) {
        return
      }
      event.preventDefault()
      onSeek(seconds)
    }
    outputElement.addEventListener('click', seekFromOutput)
    return () => outputElement.removeEventListener('click', seekFromOutput)
  }, [onSeek])

  const start = async (): Promise<void> => {
    if (!aiSettings?.activeProviderId) {
      toast.warning('请先在设置中配置默认 AI 模型')
      void navigate({ search: { tab: 'providers' }, to: '/settings' })
      return
    }
    if (!transcriptText.trim()) {
      toast.warning('逐字稿尚未就绪')
      return
    }
    if (moduleId === 'diagram') {
      diagramRepairAttempted.current = false
      rememberDiagramRepairAttempted(downloadId, false)
      setDiagramValidationError(null)
      setValidatedDiagramOutput('')
    }
    await promptRun.start(
      buildRunInput({ moduleId, selectedQuote, templateId, transcriptText }),
      module.workflowId
        ? workflowSettings?.prompts.find((item) => item.id === module.workflowId)?.systemPrompt
        : undefined
    )
  }

  const copyOutput = async (): Promise<void> => {
    if (!output.trim()) {
      return
    }
    await navigator.clipboard.writeText(output)
    toast.success('已复制 Markdown')
  }

  const saveDiagramSource = async (source: string): Promise<void> => {
    const document = parseLearningMindmap(source)
    const normalizedSource =
      document.sourceFormat === 'legacy-flowchart'
        ? serializeLearningMindmapDocument(document)
        : source
    const code = parseGeneratedLearningMermaid(normalizedSource)
    await validateGeneratedLearningMermaid(code)
    const content = `\`\`\`mermaid\n${code}\n\`\`\``
    const marker = moduleMarker('diagram')
    const previous = [...(notebook?.blocks ?? [])]
      .reverse()
      .find((block) => block.sourceSegmentIds.includes(marker))
    const now = Date.now()
    const saved = await ipcServices.learning.upsertBlock({
      block: {
        attachmentPath: null,
        completed: previous?.completed ?? false,
        content,
        createdAt: previous?.createdAt ?? now,
        id: previous?.id ?? `ai-module-diagram-${now}`,
        kind: 'ai',
        quote: previous?.quote ?? module.label,
        sourceSegmentIds: [marker],
        timestampMs: null,
        updatedAt: now
      },
      downloadId
    })
    setNotebook(saved)
    setValidatedDiagramOutput(content)
    setDiagramValidationError(null)
  }

  const exportObsidian = async (): Promise<void> => {
    try {
      const latest = await ipcServices.learning.get(downloadId)
      if (!latest) {
        toast.warning('学习资料尚未保存')
        return
      }
      const vaultPath = await ipcServices.fs.selectDirectory()
      if (!vaultPath) {
        return
      }
      const prepared = prepareObsidianNotebook(latest)
      const result = await ipcServices.learning.writeObsidian({
        attachments: prepared.attachments,
        expectedManagedHash: latest.obsidian?.managedHash,
        notebook: prepared.notebook,
        relativePath: latest.obsidian?.relativePath ?? undefined,
        vaultPath
      })
      if (result.status === 'conflict') {
        toast.warning('Obsidian 中的笔记已被修改，为保护你的内容，本次没有覆盖')
        return
      }
      const saved = await ipcServices.learning.save({
        downloadId,
        obsidian: {
          lastExportedAt: Date.now(),
          managedHash: result.managedHash,
          relativePath: result.relativePath
        }
      })
      setNotebook(saved)
      toast.success(`已写入 Obsidian：${result.relativePath}`)
      void ipcServices.fs.openFileLocation(result.absolutePath)
    } catch (error) {
      logger.error('Failed to export learning workspace to Obsidian', error)
      toast.error('写入 Obsidian 失败，请确认选择的是有效资料库')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-border/60 border-b px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-sm">AI 学习拓展</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {activeProvider
                ? `${activeProvider.name} · ${activeProvider.modelId}`
                : '尚未配置默认模型'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label="写入 Obsidian"
              onClick={() => void exportObsidian()}
              size="icon"
              title="写入 Obsidian"
              variant="ghost"
            >
              <Database />
            </Button>
            <Button
              aria-label="配置 AI 模型"
              onClick={() => void navigate({ search: { tab: 'providers' }, to: '/settings' })}
              size="icon"
              title="配置 AI 模型"
              variant="ghost"
            >
              <Settings2 />
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {MODULES.map((item) => {
            const Icon = item.icon
            const active = item.id === moduleId
            return (
              <button
                aria-pressed={active}
                className={`min-h-12 rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  active
                    ? 'border-stone-900 bg-stone-950 text-stone-50 shadow-sm dark:border-amber-300 dark:bg-amber-300 dark:text-stone-950'
                    : 'border-border/70 bg-background hover:border-amber-400/70 hover:bg-amber-50/70 dark:hover:bg-amber-950/20'
                }`}
                key={item.id}
                onClick={() => setModuleId(item.id)}
                title={item.description}
                type="button"
              >
                <Icon
                  className={`size-4 ${active ? 'text-amber-300 dark:text-stone-950' : 'text-amber-600'}`}
                />
                <span className="mt-1 block font-medium text-[11px] leading-4">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {moduleId === 'image' ? (
        <div className="min-h-0 flex-1">
          <LearningImageStudio
            capturedFrame={capturedFrame}
            downloadId={downloadId}
            key={downloadId}
            selectedQuote={selectionIntent === 'quote-card' ? selectedQuote : null}
            sourceTitle={sourceTitle}
            transcriptText={transcriptText}
          />
        </div>
      ) : moduleId === 'question' ? (
        <div className="min-h-0 flex-1">
          <LearningStudyChat
            aiSettings={aiSettings}
            downloadId={downloadId}
            key={downloadId}
            onSeek={onSeek}
            selectedQuote={selectionIntent === 'reflection' ? selectedQuote : null}
            sourceTitle={sourceTitle}
            transcriptText={transcriptText}
          />
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-border/60 border-b px-3 py-3">
            {moduleId === 'template' ? (
              <label className="block text-muted-foreground text-xs">
                总结模板
                <select
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-foreground text-sm"
                  onChange={(event) => setTemplateId(event.target.value as TemplateId)}
                  value={templateId}
                >
                  {Object.entries(TEMPLATE_OPTIONS).map(([id, option]) => (
                    <option key={id} value={id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <Button onClick={() => void promptRun.stop()} size="sm" variant="outline">
                  <Square /> 停止生成
                </Button>
              ) : (
                <Button onClick={() => void start()} size="sm">
                  {output ? <RefreshCw /> : <Sparkles />}
                  {output ? '重新生成' : `生成${module.label}`}
                </Button>
              )}
              {output ? (
                <Button onClick={() => void copyOutput()} size="sm" variant="ghost">
                  <ClipboardCopy /> 复制
                </Button>
              ) : null}
              {running ? (
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Loader2 className="size-3.5 animate-spin" /> AI 正在流式生成
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {promptRun.run.thinking.trim() || running ? (
              <TranscriptPromptThinking
                running={running}
                thinking={promptRun.run.thinking}
                thinkingMs={promptRun.run.thinkingMs}
              />
            ) : null}
            {promptRun.run.status === 'error' ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs">
                {promptRun.run.error || 'AI 生成失败'}
              </div>
            ) : null}
            {moduleId === 'diagram' && diagramValidationError ? (
              <div className="mb-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-amber-900 text-xs dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-200">
                {diagramValidationError}
              </div>
            ) : null}
            <div ref={outputRef}>
              {moduleId === 'diagram' && output && !running && !diagramValidationError ? (
                <InteractiveLearningMindmap
                  onSeek={onSeek}
                  onSourceChange={saveDiagramSource}
                  source={output}
                  sourceTitle={sourceTitle}
                />
              ) : output ? (
                <div className="learning-ai-output rounded-xl border border-border/70 bg-background p-4 shadow-sm [&_a]:cursor-pointer [&_a]:text-amber-700 [&_a]:underline-offset-4 hover:[&_a]:underline">
                  <Response className="text-sm leading-6" isAnimating={running}>
                    {displayOutput}
                  </Response>
                </div>
              ) : (
                emptyState(module)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
