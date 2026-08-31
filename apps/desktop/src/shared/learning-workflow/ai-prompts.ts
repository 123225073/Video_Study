import type { AiPromptIconId } from '../ai-types'
import type { LearningAiWorkflowId } from '../learning-types'

export interface LearningAiPromptMetadata {
  icon: AiPromptIconId
  promptId: string
  title: string
}

export const LEARNING_AI_PROMPT_METADATA: Record<LearningAiWorkflowId, LearningAiPromptMetadata> = {
  mindmap: {
    icon: 'git-branch',
    promptId: 'fengsha-learning-mindmap',
    title: '风沙学习 · 思维导图'
  },
  'quote-candidates': {
    icon: 'highlighter',
    promptId: 'fengsha-learning-quote-candidates',
    title: '风沙学习 · 金句候选'
  },
  reflection: {
    icon: 'sparkles',
    promptId: 'fengsha-learning-reflection',
    title: '风沙学习 · 学习心得'
  },
  summary: {
    icon: 'rows-3',
    promptId: 'fengsha-learning-summary',
    title: '风沙学习 · 深度总结'
  },
  translation: {
    icon: 'languages',
    promptId: 'fengsha-learning-translation',
    title: '风沙学习 · 字幕翻译'
  }
}

export const learningWorkflowIdForPrompt = (promptId: string): LearningAiWorkflowId | null => {
  const entry = Object.entries(LEARNING_AI_PROMPT_METADATA).find(
    ([, metadata]) => metadata.promptId === promptId
  )
  return (entry?.[0] as LearningAiWorkflowId | undefined) ?? null
}
