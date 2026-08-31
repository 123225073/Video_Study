import { languageList, languages, normalizeLanguageCode } from '@vidbee/i18n/languages'
import type { AiPrompt, AiPromptIconId } from './ai-types'

/** Replaced with the current UI language name before a prompt is shown or sent. */
export const AI_PROMPT_UI_LANGUAGE_TOKEN = '{{uiLanguage}}'

/** Sample text used when testing a prompt from settings. */
export const AI_PROMPT_SAMPLE_TRANSCRIPT =
  'This is an example of some transcribed text. The speaker mentions a 23% increase in sign-ups last quarter, then asks how the team should follow up. People sound excited, but there is also some anxiety about the deadline.'

interface AiPromptPresetSeed {
  id: string
  title: string
  icon: AiPromptIconId
  content: string
}

/** Shared Markdown hygiene appended to every built-in prompt. */
const PRESET_FORMAT_RULES =
  'Keep each list marker on the same line as the item text. Do not wrap the whole reply in a code fence. Do not add a preamble, closing remarks, or a heading that restates the task. Use the same language as the transcript.'

/**
 * Default transcript prompts. Titles are English seeds; the UI translates via
 * i18n keys under `settings.ai.presetPrompts`. `{{uiLanguage}}` is replaced
 * with the current interface language name before a prompt is shown or sent.
 */
export const AI_PROMPT_PRESETS: readonly AiPromptPresetSeed[] = [
  {
    id: 'bullet-points',
    title: 'Bullet Points',
    icon: 'list',
    content: [
      'Turn this transcript into a scannable bullet summary.',
      '',
      'Output format:',
      '# {theme}',
      '- {point}',
      '',
      'Group related points under # headings. Use unordered lists only. Keep each bullet to one sentence. Skip empty sections.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'improve-grammar',
    title: 'Improve Grammar & Punctuation',
    icon: 'spell-check',
    content: [
      'Correct grammar, spelling, and punctuation so the transcript reads naturally and professionally. Keep the original meaning, speakers, and details. Do not add new facts.',
      '',
      'Output format:',
      '# {speaker or topic}',
      '{cleaned paragraphs}',
      '',
      'Use # headings for speaker changes or topic shifts. Write cleaned prose in paragraphs. Use an unordered or ordered list only when the original content is already a list.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'generate-faq',
    title: 'Generate FAQ',
    icon: 'message-circle-question',
    content: [
      'Generate a FAQ from this transcript. Write clear questions and concise answers grounded only in the transcript. If the transcript does not contain an answer, say so.',
      '',
      'Output format:',
      '# {question}',
      '{answer}',
      '',
      'Use one # heading per question. Put the answer as a short paragraph, or as an unordered list when there are several parts. Do not number the questions or add a FAQ title.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'extract-statistics',
    title: 'Extract Statistics',
    icon: 'chart-no-axes-column',
    content: [
      'Extract numbers, percentages, amounts, dates, and growth rates from this transcript.',
      '',
      'Output format:',
      '# Highlights',
      '- {statistic} — {what it refers to}',
      '# Details',
      '| Statistic | Refers to | Context |',
      '| --- | --- | --- |',
      '| ... | ... | ... |',
      '',
      'Use an unordered list for highlights and a Markdown table for details. If none are found, say so in one short sentence. Do not add a Statistics title.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'paraphrase-content',
    title: 'Paraphrase Content',
    icon: 'repeat-2',
    content: [
      'Paraphrase this transcript in a clear, natural style while keeping the original meaning. Do not add claims that are not in the source.',
      '',
      'Output format:',
      '# {section}',
      '{paraphrased paragraphs}',
      '',
      'Use # headings for topic shifts. Prefer short paragraphs. Use an unordered list for parallel takeaways and an ordered list for steps or ranked items.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'create-mindmap',
    title: 'Create a mindmap',
    icon: 'git-branch',
    content: [
      'Organize this transcript into a hierarchical mind map.',
      '',
      'Output format:',
      '```mermaid',
      'mindmap',
      '  {root topic}',
      '    {branch}',
      '      {leaf}',
      '      {leaf}',
      '    {branch}',
      '      {leaf}',
      '```',
      '',
      'Reply with one mermaid code fence only. Start the diagram with mindmap. Indent two spaces per level. Keep labels short. Wrap a label in double quotes if it contains parentheses, brackets, or colons. Do not use flowchart or graph syntax. Do not add a heading, preamble, or extra text outside the fence. Use the same language as the transcript.'
    ].join('\n')
  },
  {
    id: 'study-notes',
    title: 'Structured Study Notes',
    icon: 'rows-3',
    content: [
      'Turn this timestamped transcript into rigorous study notes. Preserve the source meaning and cite the most relevant timestamp for every important claim.',
      '',
      'Output format:',
      '# Core idea',
      '{one concise paragraph}',
      '# Key concepts',
      '- **{concept}** — {explanation} `[HH:MM:SS]`',
      '# Reasoning or process',
      '1. {step} `[HH:MM:SS]`',
      '# Examples and evidence',
      '- {example} `[HH:MM:SS]`',
      '# Practical takeaway',
      '- {actionable takeaway}',
      '',
      'Do not invent timestamps or facts. Skip any empty section.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'concept-glossary',
    title: 'Concept Glossary',
    icon: 'highlighter',
    content: [
      'Extract the domain terms, concepts, abbreviations, people, products, and frameworks a learner needs to understand this transcript.',
      '',
      'Output format:',
      '# {term}',
      '- Meaning: {plain-language definition}',
      '- In this video: {how it is used} `[HH:MM:SS]`',
      '- Related: {related concepts, when present}',
      '',
      'Order terms from foundational to advanced. Do not invent definitions that conflict with the transcript.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'active-recall',
    title: 'Active Recall Quiz',
    icon: 'circle-help',
    content: [
      'Create an active-recall quiz that tests understanding, not rote copying. Ground every answer in the transcript and cite the supporting timestamp.',
      '',
      'Output format:',
      '# Questions',
      '1. {question}',
      '# Answer key',
      '1. {answer} `[HH:MM:SS]`',
      '# Transfer challenge',
      '- {one scenario that asks the learner to apply the idea}',
      '',
      'Create 6 to 10 questions, moving from recall to application. Do not reveal answers in the question wording.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'learning-action-plan',
    title: 'Learning Action Plan',
    icon: 'sparkles',
    content: [
      'Convert this transcript into a concrete learning and practice plan. Separate what to remember, what to verify, and what to do next.',
      '',
      'Output format:',
      '# Remember',
      '- {durable principle} `[HH:MM:SS]`',
      '# Verify',
      '- [ ] {claim, assumption, or open question to check}',
      '# Practice',
      '- [ ] {specific exercise or workplace application}',
      '# Review schedule',
      '- Tomorrow: {short review task}',
      '- In 7 days: {retrieval or application task}',
      '',
      'Keep tasks specific and achievable. Do not add facts that are absent from the transcript.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'learning-diagram',
    title: 'Generate Learning Mindmap',
    icon: 'git-branch',
    content: [
      'Turn the timestamped transcript into one professional Mermaid mindmap. If AI_GENERATED_DRAFT and RENDER_ERROR are present in the user message, repair that draft instead of starting over.',
      '',
      'Diagram rules:',
      '- Start with `mindmap`; put one root topic at two-space indentation, then branches and leaves at two additional spaces per level.',
      '- Organize the meaning of the lesson, not the chronological order of every sentence.',
      '- Keep 8 to 24 useful nodes across three to four levels.',
      '- Quote labels containing parentheses, brackets, or colons.',
      '- Do not use flowchart, graph, click, external links, HTML, init directives, custom JavaScript, style, or classDef.',
      '- Preserve important source timestamps inside concise node labels when they materially help review.',
      '- Do not invent facts or relationships absent from the transcript.',
      '',
      'Output exactly one fenced Mermaid block. Do not output a heading, explanation, or any text outside the fence.'
    ].join('\n')
  },
  {
    id: 'shareable-quote',
    title: 'Select Shareable Quote',
    icon: 'highlighter',
    content: [
      "Select the single strongest shareable original sentence from the timestamped transcript. Preserve the speaker's meaning and wording; do not present an AI rewrite as a direct quote.",
      '',
      'Output exactly three lines:',
      '原句：{verbatim or minimally cleaned quote}',
      '时间：{HH:MM:SS}',
      '推荐语：{one short reason it is worth sharing}',
      '',
      'Do not add Markdown fences, bullets, headings, or extra commentary.'
    ].join('\n')
  },
  {
    id: 'learning-reflection-draft',
    title: 'Draft Learning Reflection',
    icon: 'sparkles',
    content: [
      'Draft a concise first-person learning reflection from the transcript and any selected passage or personal notes supplied in AI_GENERATION_CONTEXT.',
      '',
      "Separate the speaker's view from the learner's reflection. Cite the strongest supporting timestamp. Include one concrete way the learner could apply or verify the idea. If no personal notes are supplied, clearly write a draft that the learner can edit rather than inventing personal experience.",
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'screenshot-caption',
    title: 'Write Screenshot Caption',
    icon: 'rows-3',
    content: [
      'Write one accurate sentence that explains why the captured video frame matters, using only the nearby timestamped transcript and AI_GENERATION_CONTEXT.',
      'Do not claim to see visual details that were not supplied. Output the caption sentence only, without a heading or quotation marks.'
    ].join('\n')
  },
  {
    id: 'image-prompt-optimizer',
    title: 'Optimize Image Prompt',
    icon: 'sparkles',
    content: [
      'You are a visual prompt architect for GPT Image. Turn IMAGE_TYPE, SOURCE_TITLE, USER_REQUEST, and optional VIDEO_CONTEXT into one production-ready image-generation prompt.',
      '',
      'Requirements:',
      '- Preserve the user intent and any quoted Chinese copy exactly. Do not invent claims, logos, people, or source facts.',
      '- Specify composition, hierarchy, visual style, lighting or texture, color palette, typography, and aspect-ratio-aware placement.',
      '- For a learning logic diagram, make relationships and reading order visually explicit without relying on Mermaid syntax.',
      '- For a cover, reserve a clear title area and keep the composition legible at thumbnail size.',
      '- For a quote image, make the quote the primary visual and keep supporting decoration restrained.',
      '- Avoid vague praise words. Use concrete visual instructions and include negative constraints for clutter, illegible text, watermarks, and unrelated elements.',
      '',
      'Output the optimized prompt only. Use clear Markdown paragraphs or bullets, with no preamble or closing remarks. Use the same language as USER_REQUEST.'
    ].join('\n')
  },
  {
    id: 'learning-digest',
    title: 'Learning Digest',
    icon: 'highlighter',
    content: [
      'Create a fast but trustworthy digest from the timestamped transcript. Help the learner decide which parts deserve closer study.',
      '',
      'Output format:',
      '# 一句话看懂',
      '{one precise sentence}',
      '# 三分钟精华',
      '- **{idea}** — {explanation} `[HH:MM:SS]`',
      '# 最值得回看',
      '- `[HH:MM:SS]` {why this passage matters}',
      '# 需要保留的限制',
      '- {caveat or uncertainty}',
      '',
      'Use only facts in the transcript. Do not invent timestamps. Skip empty sections.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'learning-outline',
    title: 'Learning Outline',
    icon: 'rows-3',
    content: [
      'Turn the timestamped transcript into a clean hierarchical outline based on meaning rather than equal time slices.',
      '',
      'Output format:',
      '# {lesson theme}',
      '## {chapter} `[HH:MM:SS]`',
      '- {concept, method, example, or risk}',
      '  - {supporting detail}',
      '',
      'Keep two to four useful levels. Every chapter must include its earliest reliable source timestamp. Do not invent content.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'learning-template-summary',
    title: 'Template Summary',
    icon: 'sparkles',
    content: [
      'Generate a structured Markdown summary using the TEMPLATE and TEMPLATE_REQUIREMENTS supplied before the timestamped transcript.',
      'Follow the requested template closely while preserving source meaning and useful timestamps. Distinguish source claims from AI synthesis and skip sections unsupported by the transcript.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'learning-question',
    title: 'Ask This Lesson',
    icon: 'message-circle-question',
    content: [
      'Answer QUESTION using only VIDEO_TRANSCRIPT and optional PERSONAL_NOTES supplied by the user.',
      'Cite the strongest supporting timestamps as clickable-looking Markdown labels such as `[00:12:35]`. If the material does not support an answer, say what is missing instead of guessing.',
      'Use concise Markdown with a direct answer, supporting evidence, and one optional follow-up angle.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'learning-podcast-script',
    title: 'Learning Podcast',
    icon: 'message-circle-question',
    content: [
      'Turn the timestamped transcript into a concise two-host review podcast script. Host A explains the structure; Host B asks useful questions, challenges unclear claims, and connects examples.',
      '',
      'Output format:',
      '# 播客标题',
      '{title}',
      '# 对谈脚本',
      '**主持人 A：** {line}',
      '**主持人 B：** {line}',
      '',
      'Aim for 8 to 16 exchanges. Preserve source facts and mention important timestamps naturally. Do not invent personal experiences, sponsors, or closing promotions.',
      PRESET_FORMAT_RULES
    ].join('\n')
  },
  {
    id: 'translate',
    title: 'Translate',
    icon: 'languages',
    content: [
      `Translate this transcript into ${AI_PROMPT_UI_LANGUAGE_TOKEN}. If it is already in ${AI_PROMPT_UI_LANGUAGE_TOKEN}, rewrite it clearly without changing the meaning.`,
      '',
      'Output format:',
      '# {section}',
      '{translated paragraphs}',
      '',
      'Use # headings for speaker changes or topic shifts. Write translated prose in paragraphs. Use an unordered or ordered list only when the original content is already a list. Keep the original speakers, meaning, and details. Do not add claims that are not in the source. Keep each list marker on the same line as the item text. Do not wrap the whole reply in a code fence. Do not add a preamble, closing remarks, or a heading that restates the task.'
    ].join('\n')
  }
] as const

const PRESET_IDS = new Set(AI_PROMPT_PRESETS.map((prompt) => prompt.id))
const PRESET_SEED_BY_ID = new Map<string, AiPromptPresetSeed>(
  AI_PROMPT_PRESETS.map((preset) => [preset.id, preset])
)

/** Built-in prompts that should no longer be seeded or restored. */
const DEPRECATED_PRESET_IDS = new Set([
  'extract-questions',
  'highlight-key-points',
  'identify-emotions',
  'split-paragraphs'
])

/** Format rules used by the first structured official bodies. */
const SUPERSEDED_FORMAT_RULES =
  'Keep each list marker on the same line as the item text. Do not wrap the whole reply in a code fence. Do not add a preamble or closing remarks. Use the same language as the transcript.'

/** Older official bodies that should be replaced with the current seed. */
const SUPERSEDED_PRESET_CONTENT: Record<string, readonly string[]> = {
  'bullet-points': [
    'Turn this transcript into a bullet point summary. Group related points. Keep each bullet short and easy to scan. Use the same language as the transcript.',
    [
      'Turn this transcript into a scannable bullet summary.',
      '',
      'Output format:',
      '# {title}',
      '## {theme}',
      '- {point}',
      '',
      'Group related points under ## headings. Use unordered lists only. Keep each bullet to one sentence. Skip empty sections.',
      SUPERSEDED_FORMAT_RULES
    ].join('\n')
  ],
  'improve-grammar': [
    'Correct grammar, spelling, and punctuation so the transcript reads naturally and professionally. Keep the original meaning, speakers, and details. Do not add new facts. Use the same language as the transcript.',
    [
      'Correct grammar, spelling, and punctuation so the transcript reads naturally and professionally. Keep the original meaning, speakers, and details. Do not add new facts.',
      '',
      'Output format:',
      '# {title}',
      '## {speaker or topic}',
      '{cleaned paragraphs}',
      '',
      'Use ## headings for speaker changes or topic shifts. Write cleaned prose in paragraphs. Use an unordered or ordered list only when the original content is already a list.',
      SUPERSEDED_FORMAT_RULES
    ].join('\n')
  ],
  'generate-faq': [
    'Generate a FAQ from this transcript. Write clear questions and concise answers grounded only in the transcript. If the transcript does not contain an answer, say so. Use the same language as the transcript.',
    [
      'Generate a FAQ from this transcript. Write clear questions and concise answers grounded only in the transcript. If the transcript does not contain an answer, say so.',
      '',
      'Output format:',
      '# FAQ',
      '## {question}',
      '{answer}',
      '',
      'Use one ## heading per question. Put the answer as a short paragraph, or as an unordered list when there are several parts. Do not number the questions.',
      SUPERSEDED_FORMAT_RULES
    ].join('\n')
  ],
  'extract-statistics': [
    'Extract numbers, percentages, amounts, dates, and growth rates from this transcript. Present them as a Markdown table with columns for the statistic, what it refers to, and the surrounding context. If none are found, say so. Use the same language as the transcript.',
    [
      'Extract numbers, percentages, amounts, dates, and growth rates from this transcript.',
      '',
      'Output format:',
      '# Statistics',
      '## Highlights',
      '- {statistic} — {what it refers to}',
      '## Details',
      '| Statistic | Refers to | Context |',
      '| --- | --- | --- |',
      '| ... | ... | ... |',
      '',
      'Use an unordered list for highlights and a Markdown table for details. If none are found, say so under # Statistics.',
      SUPERSEDED_FORMAT_RULES
    ].join('\n')
  ],
  'paraphrase-content': [
    'Paraphrase this transcript in a clear, natural style while keeping the original meaning. Do not add claims that are not in the source. Use the same language as the transcript.',
    [
      'Paraphrase this transcript in a clear, natural style while keeping the original meaning. Do not add claims that are not in the source.',
      '',
      'Output format:',
      '# {title}',
      '## {section}',
      '{paraphrased paragraphs}',
      '',
      'Use ## headings for topic shifts. Prefer short paragraphs. Use an unordered list for parallel takeaways and an ordered list for steps or ranked items.',
      SUPERSEDED_FORMAT_RULES
    ].join('\n')
  ],
  'create-mindmap': [
    'Organize this transcript into a hierarchical mind map. Reply with nested Markdown lists only: a root topic, then branches, then leaves. Keep labels short. Use the same language as the transcript.',
    [
      'Organize this transcript into a hierarchical mind map.',
      '',
      'Output format:',
      '# {root topic}',
      '- {branch}',
      '  - {leaf}',
      '  - {leaf}',
      '- {branch}',
      '  - {leaf}',
      '',
      'Use a # title and nested unordered lists only. Keep labels short. Do not use numbered lists or extra commentary.',
      SUPERSEDED_FORMAT_RULES
    ].join('\n'),
    [
      'Organize this transcript into a hierarchical mind map.',
      '',
      'Output format:',
      '# {root topic}',
      '- {branch}',
      '  - {leaf}',
      '  - {leaf}',
      '- {branch}',
      '  - {leaf}',
      '',
      'Use a # heading for the root topic and nested unordered lists for branches. Keep labels short. Do not use numbered lists, extra commentary, or a Mindmap title.',
      PRESET_FORMAT_RULES
    ].join('\n')
  ]
}

/**
 * Native name of a VidBee UI language, used inside built-in prompts.
 *
 * @param languageCode Saved or i18n language tag.
 */
export const aiPromptUiLanguageName = (languageCode: string): string =>
  languages[normalizeLanguageCode(languageCode)].name

/**
 * Replace {{uiLanguage}} with the current interface language name.
 *
 * @param content Prompt body from storage.
 * @param languageCode Saved or i18n language tag.
 */
export const resolveAiPromptContent = (content: string, languageCode: string): string =>
  content.replaceAll(AI_PROMPT_UI_LANGUAGE_TOKEN, aiPromptUiLanguageName(languageCode))

/**
 * Keep {{uiLanguage}} in storage when the user saved a resolved built-in body
 * without otherwise editing it, so a later language switch still applies.
 *
 * @param promptId Prompt id from storage.
 * @param content Prompt body from the editor.
 */
export const canonicalizeAiPromptContent = (promptId: string, content: string): string => {
  const seed = PRESET_SEED_BY_ID.get(promptId)
  if (!seed || content === seed.content) {
    return content
  }
  const matchesSeed = languageList.some(
    (language) => content === resolveAiPromptContent(seed.content, language.value)
  )
  return matchesSeed ? seed.content : content
}

/**
 * True when a prompt id ships with VidBee.
 *
 * @param id Prompt id from storage or the UI.
 */
export const isAiPromptPresetId = (id: string): boolean => PRESET_IDS.has(id)

/**
 * Build the default prompt list used on first launch.
 *
 * @param now Timestamp written onto createdAt/updatedAt.
 */
export const createDefaultAiPrompts = (now: number = Date.now()): AiPrompt[] =>
  AI_PROMPT_PRESETS.map((preset, index) => ({
    id: preset.id,
    title: preset.title,
    icon: preset.icon,
    content: preset.content,
    enabled: true,
    isPreset: true,
    sortOrder: index,
    createdAt: now,
    updatedAt: now
  }))

/**
 * Replace a stored built-in prompt body when it still matches an older official seed.
 *
 * @param prompt Prompt loaded from storage.
 * @param now Timestamp written onto updatedAt when the body changes.
 */
const withCurrentPresetContent = (prompt: AiPrompt, now: number): AiPrompt => {
  if (!prompt.isPreset) {
    return prompt
  }
  const seed = PRESET_SEED_BY_ID.get(prompt.id)
  const oldBodies = SUPERSEDED_PRESET_CONTENT[prompt.id]
  if (!(seed && oldBodies?.includes(prompt.content)) || prompt.content === seed.content) {
    return prompt
  }
  return { ...prompt, content: seed.content, updatedAt: now }
}

/**
 * Re-insert any missing built-in prompts without overwriting user edits,
 * refresh unedited official prompt bodies to the current seed, and drop
 * retired built-in ids so they are not restored.
 *
 * @param existing Prompts already in storage.
 * @param now Timestamp for newly inserted or refreshed presets.
 */
export const mergeDefaultAiPrompts = (
  existing: AiPrompt[],
  now: number = Date.now()
): AiPrompt[] => {
  const kept = existing.filter((prompt) => !DEPRECATED_PRESET_IDS.has(prompt.id))
  const present = new Set(kept.map((prompt) => prompt.id))
  const missing = createDefaultAiPrompts(now).filter((prompt) => !present.has(prompt.id))
  const refreshed = kept.map((prompt) => withCurrentPresetContent(prompt, now))
  const contentChanged = refreshed.some((prompt, index) => prompt !== kept[index])
  if (missing.length === 0 && kept.length === existing.length && !contentChanged) {
    return existing
  }
  const nextSort = refreshed.reduce((max, prompt) => Math.max(max, prompt.sortOrder), -1) + 1
  return [
    ...refreshed,
    ...missing.map((prompt, index) => ({ ...prompt, sortOrder: nextSort + index }))
  ]
}
