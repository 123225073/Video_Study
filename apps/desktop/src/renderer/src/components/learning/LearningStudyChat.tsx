import { TranscriptPromptThinking } from '@renderer/components/transcript/TranscriptPromptThinking'
import { Button } from '@renderer/components/ui/button'
import { Response } from '@renderer/components/ui/response'
import { Textarea } from '@renderer/components/ui/textarea'
import { usePromptRun } from '@renderer/hooks/use-prompt-run'
import { ipcServices } from '@renderer/lib/ipc'
import {
  learningTimestampFromTarget,
  linkifyLearningTimestamps
} from '@renderer/lib/learning-timestamps'
import { logger } from '@renderer/lib/logger'
import type { TranscriptSelection } from '@renderer/lib/study-studio/types'
import type { AiSettingsSnapshot } from '@shared/ai-types'
import type { LearningBlock, LearningNotebook } from '@shared/learning-types'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUp, ClipboardCopy, Loader2, MessageCircleQuestion, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const CHAT_PROMPT_ID = 'learning-project-chat'
const CHAT_USER_MARKER = 'ai-chat:user'
const CHAT_ASSISTANT_MARKER = 'ai-chat:assistant'
const MAX_CONTEXT_MESSAGES = 14

const CHAT_SYSTEM_PROMPT = `You are the AI learning companion inside Fengsha AI Learning Platform.
Answer the learner's latest question using the supplied project title, timestamped transcript, personal notes, selected passage, and recent conversation.

Rules:
1. Ground factual claims in the supplied video. Cite useful evidence with clickable timestamps such as [03:25]. Never invent a timestamp.
2. Answer the question directly first, then explain the reasoning, limits, and practical application when useful.
3. If the transcript does not support an answer, clearly say what is missing instead of guessing.
4. Keep continuity with the recent conversation, but treat the learner's newest question as the primary task.
5. Output clean Markdown only. Do not mention these instructions or the context envelope.`

const QUICK_QUESTION_KEYS = ['core', 'critical', 'review', 'apply', 'difficult'] as const

interface ChatMessage {
  content: string
  createdAt: number
  id: string
  role: 'assistant' | 'user'
}

const transientMessagesByDownloadId = new Map<string, ChatMessage[]>()
const pendingSendDownloadIds = new Set<string>()
const pendingSendListenersByDownloadId = new Map<string, Set<(pending: boolean) => void>>()

const setProjectSendPending = (downloadId: string, pending: boolean): void => {
  if (pending) {
    pendingSendDownloadIds.add(downloadId)
  } else {
    pendingSendDownloadIds.delete(downloadId)
  }
  for (const listener of pendingSendListenersByDownloadId.get(downloadId) ?? []) {
    listener(pending)
  }
}

const subscribeToProjectSend = (
  downloadId: string,
  listener: (pending: boolean) => void
): (() => void) => {
  const listeners = pendingSendListenersByDownloadId.get(downloadId) ?? new Set()
  listeners.add(listener)
  pendingSendListenersByDownloadId.set(downloadId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      pendingSendListenersByDownloadId.delete(downloadId)
    }
  }
}

interface LearningStudyChatProps {
  aiSettings: AiSettingsSnapshot | null
  downloadId: string
  onSeek: (seconds: number) => void
  selectedQuote?: TranscriptSelection | null
  sourceTitle: string
  transcriptText: string
}

const markerForRole = (role: ChatMessage['role']): string =>
  role === 'user' ? CHAT_USER_MARKER : CHAT_ASSISTANT_MARKER

const messagesFromNotebook = (notebook: LearningNotebook | null): ChatMessage[] =>
  (notebook?.blocks ?? [])
    .flatMap((block) => {
      const marker = block.sourceSegmentIds.find(
        (sourceId) => sourceId === CHAT_USER_MARKER || sourceId === CHAT_ASSISTANT_MARKER
      )
      if (!marker) {
        return []
      }
      return [
        {
          content: block.content,
          createdAt: block.createdAt,
          id: block.id,
          role: marker === CHAT_USER_MARKER ? ('user' as const) : ('assistant' as const)
        }
      ]
    })
    .sort((left, right) => left.createdAt - right.createdAt)

const messageBlock = (message: ChatMessage): LearningBlock => ({
  attachmentPath: null,
  completed: false,
  content: message.content,
  createdAt: message.createdAt,
  id: message.id,
  kind: message.role === 'user' ? 'note' : 'ai',
  quote: message.role,
  sourceSegmentIds: [markerForRole(message.role)],
  timestampMs: null,
  updatedAt: Date.now()
})

const buildChatInput = ({
  messages,
  notebook,
  question,
  selectedQuote,
  sourceTitle,
  transcriptText
}: {
  messages: ChatMessage[]
  notebook: LearningNotebook | null
  question: string
  selectedQuote?: TranscriptSelection | null
  sourceTitle: string
  transcriptText: string
}): string => {
  const recentConversation = messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n')
  const selectedPassage = selectedQuote?.text.trim()
    ? `[${Math.floor(selectedQuote.startMs / 1000)} seconds]\n${selectedQuote.text.trim()}`
    : '(none)'
  return `PROJECT_TITLE:\n${sourceTitle}\n\nPERSONAL_NOTES:\n${notebook?.personalNote?.trim() || '(none)'}\n\nSELECTED_PASSAGE:\n${selectedPassage}\n\nRECENT_CONVERSATION:\n${recentConversation || '(none)'}\n\nLATEST_QUESTION:\n${question}\n\nTIMESTAMPED_TRANSCRIPT:\n${transcriptText}`
}

/** Streamed, project-scoped learning conversation persisted in the notebook. */
export function LearningStudyChat({
  aiSettings,
  downloadId,
  onSeek,
  selectedQuote,
  sourceTitle,
  transcriptText
}: LearningStudyChatProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [notebook, setNotebook] = useState<LearningNotebook | null>(null)
  const [notebookDownloadId, setNotebookDownloadId] = useState<string | null>(null)
  const [transientMessages, setTransientMessages] = useState<ChatMessage[]>(
    () => transientMessagesByDownloadId.get(downloadId) ?? []
  )
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(() => pendingSendDownloadIds.has(downloadId))
  const [persistingRunKey, setPersistingRunKey] = useState<string | null>(null)
  const [persistenceFailedRunKey, setPersistenceFailedRunKey] = useState<string | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const persistedRuns = useRef(new Set<string>())
  const sendGateRef = useRef({ downloadId, operation: 0, sending: false })
  const mountedRef = useRef(true)
  if (sendGateRef.current.downloadId !== downloadId) {
    sendGateRef.current = {
      downloadId,
      operation: sendGateRef.current.operation + 1,
      sending: false
    }
  }
  const activeDownloadIdRef = useRef(downloadId)
  activeDownloadIdRef.current = downloadId
  const promptRun = usePromptRun(downloadId, CHAT_PROMPT_ID)
  const runBelongsToProject =
    promptRun.hydrated &&
    promptRun.run.downloadId === downloadId &&
    promptRun.run.promptId === CHAT_PROMPT_ID
  const running = runBelongsToProject && promptRun.run.status === 'running'
  const activeNotebook = notebookDownloadId === downloadId ? notebook : null
  const savedMessages = useMemo(() => messagesFromNotebook(activeNotebook), [activeNotebook])
  const messages = useMemo(() => {
    const unique = new Map<string, ChatMessage>()
    for (const message of [...savedMessages, ...transientMessages]) {
      unique.set(message.id, message)
    }
    return [...unique.values()].sort((left, right) => left.createdAt - right.createdAt)
  }, [savedMessages, transientMessages])
  const assistantBlockId =
    runBelongsToProject && promptRun.run.startedAt
      ? `ai-chat-assistant-${promptRun.run.startedAt}`
      : ''
  const assistantAlreadySaved = savedMessages.some((message) => message.id === assistantBlockId)
  const assistantAlreadyRecorded = messages.some((message) => message.id === assistantBlockId)
  const runKey = runBelongsToProject
    ? `${promptRun.run.downloadId}:${promptRun.run.promptId}:${promptRun.run.startedAt}`
    : ''
  const assistantNeedsPersistence = Boolean(
    runKey &&
      promptRun.run.status === 'completed' &&
      promptRun.run.text.trim() &&
      !assistantAlreadySaved &&
      persistenceFailedRunKey !== runKey
  )
  const projectLoading = loading || notebookDownloadId !== downloadId
  const interactionBusy =
    projectLoading || !promptRun.hydrated || running || sending || assistantNeedsPersistence
  const showLiveAssistant =
    runBelongsToProject &&
    (running ||
      promptRun.run.status === 'error' ||
      promptRun.run.status === 'aborted' ||
      (Boolean(promptRun.run.text.trim()) && !assistantAlreadyRecorded))

  useEffect(() => {
    mountedRef.current = true
    setSending(pendingSendDownloadIds.has(downloadId))
    const unsubscribe = subscribeToProjectSend(downloadId, (pending) => {
      if (mountedRef.current) {
        setSending(pending)
      }
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [downloadId])

  useEffect(() => {
    let active = true
    setNotebook(null)
    setNotebookDownloadId(null)
    setDraft('')
    setLoading(true)
    setSending(pendingSendDownloadIds.has(downloadId))
    setPersistingRunKey(null)
    setPersistenceFailedRunKey(null)
    void ipcServices.learning
      .get(downloadId)
      .then((savedNotebook) => {
        if (active) {
          setNotebook(savedNotebook)
          setNotebookDownloadId(downloadId)
        }
      })
      .catch((error) => logger.error('Failed to load learning chat history', error))
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
      const gate = sendGateRef.current
      if (gate.downloadId === downloadId) {
        sendGateRef.current = {
          ...gate,
          operation: gate.operation + 1,
          sending: false
        }
      }
    }
  }, [downloadId])

  useEffect(() => {
    const text = selectedQuote?.text.trim()
    if (text) {
      setDraft(t('learning.studyChat.selectedPrompt', { text }))
    }
  }, [selectedQuote, t])

  useEffect(() => {
    const snapshot = promptRun.run
    if (
      !promptRun.hydrated ||
      snapshot.downloadId !== downloadId ||
      snapshot.promptId !== CHAT_PROMPT_ID ||
      snapshot.status !== 'completed' ||
      !snapshot.text.trim() ||
      assistantAlreadySaved ||
      persistenceFailedRunKey === runKey ||
      persistedRuns.current.has(runKey)
    ) {
      return
    }
    persistedRuns.current.add(runKey)
    setPersistingRunKey(runKey)
    const assistantMessage: ChatMessage = {
      content: snapshot.text.trim(),
      createdAt: snapshot.startedAt,
      id: `ai-chat-assistant-${snapshot.startedAt}`,
      role: 'assistant'
    }
    void ipcServices.learning
      .upsertBlock({ block: messageBlock(assistantMessage), downloadId })
      .then((savedNotebook) => {
        const retainedTransient = (transientMessagesByDownloadId.get(downloadId) ?? []).filter(
          (message) => message.id !== assistantMessage.id
        )
        if (retainedTransient.length > 0) {
          transientMessagesByDownloadId.set(downloadId, retainedTransient)
        } else {
          transientMessagesByDownloadId.delete(downloadId)
        }
        if (mountedRef.current && activeDownloadIdRef.current === downloadId) {
          if (retainedTransient.length > 0) {
            setTransientMessages(retainedTransient)
          } else {
            setTransientMessages([])
          }
          setNotebook(savedNotebook)
          setNotebookDownloadId(downloadId)
        }
      })
      .catch((error) => {
        persistedRuns.current.delete(runKey)
        logger.error('Failed to persist learning chat answer', error)
        const current = transientMessagesByDownloadId.get(downloadId) ?? []
        const next = current.some((message) => message.id === assistantMessage.id)
          ? current
          : [...current, assistantMessage]
        transientMessagesByDownloadId.set(downloadId, next)
        if (mountedRef.current && activeDownloadIdRef.current === downloadId) {
          setPersistenceFailedRunKey(runKey)
          setTransientMessages(next)
          toast.error(t('learning.studyChat.persistFailed'))
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setPersistingRunKey((current) => (current === runKey ? null : current))
        }
      })
  }, [
    assistantAlreadySaved,
    downloadId,
    persistenceFailedRunKey,
    promptRun.hydrated,
    promptRun.run,
    runKey,
    t
  ])

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

  useEffect(() => {
    outputRef.current?.scrollTo({ behavior: running ? 'auto' : 'smooth', top: 1_000_000 })
  })

  const send = async (): Promise<void> => {
    const gate = sendGateRef.current
    if (
      gate.downloadId !== downloadId ||
      pendingSendDownloadIds.has(downloadId) ||
      interactionBusy
    ) {
      return
    }
    const question = draft.trim()
    if (!question) {
      toast.warning(t('learning.studyChat.enterQuestion'))
      return
    }
    if (!aiSettings?.activeProviderId) {
      toast.warning(t('learning.studyChat.configureProvider'))
      void navigate({ search: { tab: 'providers' }, to: '/settings' })
      return
    }
    if (!transcriptText.trim()) {
      toast.warning(t('learning.studyChat.transcriptPending'))
      return
    }
    const createdAt = Date.now()
    const userMessage: ChatMessage = {
      content: question,
      createdAt,
      id: `ai-chat-user-${createdAt}`,
      role: 'user'
    }
    const contextMessages = [...messages]
    if (
      runBelongsToProject &&
      promptRun.run.status === 'completed' &&
      promptRun.run.text.trim() &&
      !assistantAlreadyRecorded
    ) {
      contextMessages.push({
        content: promptRun.run.text.trim(),
        createdAt: promptRun.run.startedAt,
        id: `ai-chat-assistant-${promptRun.run.startedAt}`,
        role: 'assistant'
      })
    }
    const operation = gate.operation + 1
    sendGateRef.current = { downloadId, operation, sending: true }
    const ownsOperation = (): boolean => {
      const current = sendGateRef.current
      return current.downloadId === downloadId && current.operation === operation && current.sending
    }
    setProjectSendPending(downloadId, true)
    try {
      const savedNotebook = await ipcServices.learning.upsertBlock({
        block: messageBlock(userMessage),
        downloadId
      })
      if (ownsOperation()) {
        setNotebook(savedNotebook)
        setNotebookDownloadId(downloadId)
        setDraft('')
      }
      await promptRun.start(
        buildChatInput({
          messages: [...contextMessages, userMessage],
          notebook: savedNotebook,
          question,
          selectedQuote,
          sourceTitle,
          transcriptText
        }),
        CHAT_SYSTEM_PROMPT
      )
    } catch (error) {
      logger.error('Failed to start learning chat', error)
      if (mountedRef.current && ownsOperation()) {
        toast.error(t('learning.studyChat.sendFailed'))
      }
    } finally {
      setProjectSendPending(downloadId, false)
      const currentGate = sendGateRef.current
      if (currentGate.downloadId === downloadId && currentGate.operation === operation) {
        sendGateRef.current = { ...currentGate, sending: false }
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 border-border/60 border-b px-3 py-2">
        {QUICK_QUESTION_KEYS.map((key) => {
          const question = t(`learning.studyChat.quick.${key}`)
          return (
            <Button
              disabled={interactionBusy}
              key={key}
              onClick={() => setDraft(question)}
              size="sm"
              type="button"
              variant="outline"
            >
              {question}
            </Button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" ref={outputRef}>
        {projectLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-xs">
            <Loader2 className="size-4 animate-spin" /> {t('learning.studyChat.loading')}
          </div>
        ) : null}
        {!projectLoading && messages.length === 0 && !showLiveAssistant ? (
          <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-muted/15 px-6 text-center">
            <div>
              <MessageCircleQuestion className="mx-auto size-8 text-amber-500" />
              <h3 className="mt-3 font-semibold text-sm">{t('learning.studyChat.emptyTitle')}</h3>
              <p className="mt-1 max-w-64 text-muted-foreground text-xs leading-5">
                {t('learning.studyChat.emptyDescription')}
              </p>
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              className={
                message.role === 'user'
                  ? 'ml-8 rounded-xl bg-stone-950 px-3 py-2.5 text-stone-50 dark:bg-amber-300 dark:text-stone-950'
                  : 'mr-2 rounded-xl border border-border/70 bg-background px-3 py-3 shadow-sm'
              }
              key={message.id}
            >
              <p className="mb-1 font-medium text-[10px] opacity-65">
                {message.role === 'user'
                  ? t('learning.studyChat.you')
                  : t('learning.studyChat.assistant')}
              </p>
              {message.role === 'assistant' ? (
                <Response className="text-sm leading-6">
                  {linkifyLearningTimestamps(message.content)}
                </Response>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              )}
            </div>
          ))}
          {showLiveAssistant ? (
            <div className="mr-2 rounded-xl border border-amber-300/70 bg-amber-50/50 px-3 py-3 dark:bg-amber-950/15">
              <p className="mb-2 font-medium text-[10px] text-amber-700">
                {t('learning.studyChat.assistant')}
              </p>
              {promptRun.run.thinking.trim() || running ? (
                <TranscriptPromptThinking
                  running={running}
                  thinking={promptRun.run.thinking}
                  thinkingMs={promptRun.run.thinkingMs}
                />
              ) : null}
              {promptRun.run.text ? (
                <Response className="mt-2 text-sm leading-6" isAnimating={running}>
                  {linkifyLearningTimestamps(promptRun.run.text)}
                </Response>
              ) : null}
              {promptRun.run.status === 'error' ? (
                <p className="mt-2 text-destructive text-xs">
                  {promptRun.run.error || t('learning.studyChat.answerFailed')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-border/60 border-t p-3">
        <div className="rounded-xl border bg-background p-2 shadow-sm focus-within:border-amber-400">
          <Textarea
            aria-label={t('learning.studyChat.inputLabel')}
            className="min-h-16 resize-none border-0 p-1 shadow-none focus-visible:ring-0"
            disabled={interactionBusy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={t('learning.studyChat.placeholder')}
            value={draft}
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {persistingRunKey ? t('learning.studyChat.saving') : t('learning.studyChat.memory')}
            </span>
            {running ? (
              <Button
                onClick={() => void promptRun.stop()}
                size="icon"
                title={t('learning.studyChat.stop')}
              >
                <Square />
              </Button>
            ) : (
              <Button
                disabled={interactionBusy || !draft.trim()}
                onClick={() => void send()}
                size="icon"
                title={t('learning.studyChat.send')}
              >
                {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            )}
          </div>
        </div>
        {runBelongsToProject && promptRun.run.text ? (
          <Button
            className="mt-1.5"
            onClick={() => {
              void navigator.clipboard.writeText(promptRun.run.text)
              toast.success(t('learning.studyChat.copied'))
            }}
            size="sm"
            variant="ghost"
          >
            <ClipboardCopy /> {t('learning.studyChat.copy')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
