import type {
  LearningAiWorkflowId,
  LearningAiWorkflowSettings,
  LearningPromptDefinition
} from '../learning-types'

const SUMMARY_PROMPT = `你是一名严谨的视频学习助理。请只依据提供的逐字稿生成结构化总结，不得补写逐字稿没有表达的事实。

要求：
1. 先用三到五句话说明视频解决的问题、核心结论和适用对象。
2. 按内容逻辑分章，每章保留关键事实、方法、例子、限制和风险，不要为了简短而丢失重要步骤。
3. 每个关键结论后标注来源时间，例如 [00:12:35]；没有可靠时间时不要伪造。
4. 区分讲者原意、你的归纳和仍需验证的内容。
5. 去除寒暄、重复和营销话术，但保留会影响理解的上下文。
6. 最后列出“值得回看”和“可以行动”两个部分；没有行动项时明确写“无”。
7. 使用清晰的 Markdown，默认输出中文。`

const LEGACY_MINDMAP_PROMPT = `你是一名知识结构设计师。请只依据逐字稿，输出一段可直接渲染的 Mermaid mindmap 代码。

要求：
1. 根节点使用视频主题，向下组织为主要章节、核心概念、方法步骤、案例、风险和行动。
2. 层级以三到四层为宜，同级节点避免重复，节点文字简洁但不能只剩空泛关键词。
3. 不得加入来源中没有出现的观点。
4. 在重要叶子节点末尾保留时间标记，例如 关键步骤 [00:08:20]。
5. 只输出一个 mermaid 代码块，不要输出解释文字。`

const LEGACY_FLOWCHART_PROMPT = `你是一名严谨的学习图解设计师。请只依据逐字稿，输出一段可直接渲染的 Mermaid flowchart 代码。如果输入中包含 AI_GENERATED_DRAFT 和 RENDER_ERROR，请修复原草稿，不要重新改变内容主旨。

要求：
1. 概念关系使用 flowchart TD，明确的顺序流程使用 flowchart LR；控制在 6 到 20 个节点。
2. 节点 ID 只能使用短英文和数字，中文文字必须放在双引号标签中，例如 step1["关键步骤 [00:08:20]"]。
3. 围绕视频主题组织核心概念、方法步骤、案例、风险和行动；关系线上使用简短动词，避免堆砌。
4. 不得加入逐字稿中没有出现的观点；重要节点尽量保留可靠时间标记。
5. 禁止 click、HTML、init、style、classDef 和外部链接。
6. 只输出一个 mermaid 代码块，代码块外不得有解释文字。`

const MINDMAP_PROMPT = `你是一名严谨的学习思维导图设计师。请只依据逐字稿，输出一段可直接渲染的 Mermaid mindmap 代码。如果输入中包含 AI_GENERATED_DRAFT 和 RENDER_ERROR，请修复原草稿，不要改变内容主旨。

要求：
1. 第一行必须是 mindmap，根节点使用视频主题；使用两个空格表示一级缩进。
2. 按知识关系组织为三到五条主分支，例如核心概念、论证或步骤、案例、限制风险、行动启发；不要机械照搬时间顺序。
3. 总节点控制在 8 到 24 个，层级以三到四层为宜；同级节点避免重复，标签简洁但不能只剩空泛关键词。
4. 标签包含括号、方括号或冒号时使用双引号包裹；不得加入逐字稿中没有出现的观点。
5. 重要叶子节点尽量保留可靠时间标记，例如 "关键步骤 [00:08:20]"；没有可靠时间时不要伪造。
6. 禁止 click、HTML、init、style、classDef、外部链接以及 flowchart 或 graph 语法。
7. 只输出一个 mermaid 代码块，代码块外不得有解释文字。`

const MINDMAP_OUTPUT_CONTRACT = `【系统输出契约（优先级高于上方的用户自定义提示词）】
你必须输出 Mermaid mindmap，而不是 flowchart、graph 或其他图表语法。第一行必须是 mindmap；只输出一个 mermaid 代码块，代码块外不得有任何文字。`

const TRANSLATION_PROMPT =
  '你是一名专业字幕译者。请结合相邻字幕上下文翻译当前片段，保持术语、人物名和产品名一致。保留原时间轴，不增删事实，不覆盖用户人工校对的译文。'

const QUOTE_PROMPT =
  '请从逐字稿中挑选适合分享的原句。每条必须忠实保留原意并附时间点；不要把 AI 改写冒充讲者原话。可以另给一版明确标记为“润色”的短句。'

const REFLECTION_PROMPT =
  '请基于用户选中的原文和个人笔记，协助整理一份第一人称学习心得。区分视频观点与用户观点，保留来源时间点，并提出可由用户自行取舍的表达建议。'

const PROMPT_TEXT: Record<LearningAiWorkflowId, string> = {
  mindmap: MINDMAP_PROMPT,
  'quote-candidates': QUOTE_PROMPT,
  reflection: REFLECTION_PROMPT,
  summary: SUMMARY_PROMPT,
  translation: TRANSLATION_PROMPT
}

const WORKFLOW_IDS = [
  'summary',
  'mindmap',
  'translation',
  'quote-candidates',
  'reflection'
] as const satisfies readonly LearningAiWorkflowId[]

/** Detect only prompts shipped unchanged by the previous release, preserving user customizations. */
export const isLegacyDefaultLearningPrompt = (
  id: LearningAiWorkflowId,
  systemPrompt: string
): boolean =>
  id === 'mindmap' && [LEGACY_MINDMAP_PROMPT, LEGACY_FLOWCHART_PROMPT].includes(systemPrompt.trim())

/** Preserve user customization while enforcing the renderer's required output grammar at runtime. */
export const applyLearningWorkflowOutputContract = (
  id: LearningAiWorkflowId,
  systemPrompt: string
): string =>
  id === 'mindmap' ? `${systemPrompt.trim()}\n\n${MINDMAP_OUTPUT_CONTRACT}` : systemPrompt.trim()

export const createDefaultLearningAiSettings = (now = Date.now()): LearningAiWorkflowSettings => ({
  defaultModel: '',
  prompts: WORKFLOW_IDS.map(
    (id): LearningPromptDefinition => ({
      id,
      systemPrompt: PROMPT_TEXT[id],
      updatedAt: now,
      version: id === 'mindmap' ? 3 : 1
    })
  ),
  updatedAt: now,
  version: 1,
  workflows: WORKFLOW_IDS.map((id) => ({
    enabled: id === 'summary' || id === 'mindmap',
    id,
    runOnTranscriptComplete: id === 'summary' || id === 'mindmap'
  }))
})

export const LEARNING_AI_WORKFLOW_IDS = WORKFLOW_IDS
