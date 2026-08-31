import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { idlePromptRunSnapshot } from '@shared/ai-run'
import type { AiPromptRunSnapshot } from '@shared/ai-types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Subscribe to a main-process prompt run so navigating away does not abort it.
 *
 * @param downloadId Download or settings-test id.
 * @param promptId Prompt id, or null when no prompt is selected.
 */
export const usePromptRun = (
  downloadId: string,
  promptId: string | null
): {
  hydrated: boolean
  run: AiPromptRunSnapshot
  start: (transcriptText: string, promptContent?: string) => Promise<void>
  stop: () => Promise<void>
} => {
  const { i18n } = useTranslation()
  const [run, setRun] = useState<AiPromptRunSnapshot>(() =>
    idlePromptRunSnapshot(downloadId, promptId ?? '')
  )
  const [hydrated, setHydrated] = useState(false)
  const identity = `${downloadId}\u0000${promptId ?? ''}`
  const identityStateRef = useRef({ generation: 0, identity })
  const operationRef = useRef(0)
  const eventRevisionRef = useRef(0)
  if (identityStateRef.current.identity !== identity) {
    identityStateRef.current = {
      generation: identityStateRef.current.generation + 1,
      identity
    }
    operationRef.current += 1
    eventRevisionRef.current += 1
  }

  useEffect(() => {
    if (!promptId) {
      setRun(idlePromptRunSnapshot(downloadId, ''))
      setHydrated(true)
      return
    }
    let cancelled = false
    const effectGeneration = identityStateRef.current.generation
    const hydrationEventRevision = eventRevisionRef.current
    setRun(idlePromptRunSnapshot(downloadId, promptId))
    setHydrated(false)
    void ipcServices.ai
      .getPromptRun({ downloadId, promptId })
      .then((snapshot) => {
        if (
          !cancelled &&
          identityStateRef.current.generation === effectGeneration &&
          eventRevisionRef.current === hydrationEventRevision
        ) {
          setRun(snapshot)
          setHydrated(true)
        }
      })
      .catch((error) => {
        logger.error('Failed to load prompt run', error)
        if (!cancelled && identityStateRef.current.generation === effectGeneration) {
          setHydrated(true)
        }
      })
    const off = ipcEvents.on('ai:prompt-run', (...args: unknown[]) => {
      const snapshot = args[0] as AiPromptRunSnapshot
      if (
        identityStateRef.current.generation === effectGeneration &&
        snapshot?.downloadId === downloadId &&
        snapshot.promptId === promptId
      ) {
        eventRevisionRef.current += 1
        operationRef.current += 1
        setRun(snapshot)
        setHydrated(true)
      }
    })
    return () => {
      cancelled = true
      ipcEvents.removeListener('ai:prompt-run', off as (...args: unknown[]) => void)
    }
  }, [downloadId, promptId])

  /**
   * Start or restart the prompt against the enabled provider.
   *
   * @param transcriptText Transcript or sample text.
   */
  const start = useCallback(
    async (transcriptText: string, promptContent?: string): Promise<void> => {
      if (!promptId) {
        return
      }
      const requestGeneration = identityStateRef.current.generation
      const operation = operationRef.current + 1
      operationRef.current = operation
      eventRevisionRef.current += 1
      try {
        const snapshot = await ipcServices.ai.startPrompt({
          downloadId,
          promptId,
          promptContent,
          transcriptText,
          uiLanguage: i18n.language
        })
        if (
          identityStateRef.current.generation === requestGeneration &&
          operationRef.current === operation
        ) {
          setRun(snapshot)
          setHydrated(true)
        }
      } catch (error) {
        logger.error('Failed to start prompt run', error)
        if (
          identityStateRef.current.generation === requestGeneration &&
          operationRef.current === operation
        ) {
          setRun({
            downloadId,
            promptId,
            startedAt: Date.now(),
            status: 'error',
            text: '',
            thinking: '',
            thinkingMs: 0,
            error: error instanceof Error ? error.message : 'Prompt failed',
            errorCode: 'unknown',
            updatedAt: Date.now()
          })
          setHydrated(true)
        }
      }
    },
    [downloadId, i18n.language, promptId]
  )

  /**
   * Abort the in-flight stream without leaving the page.
   */
  const stop = useCallback(async (): Promise<void> => {
    if (!promptId) {
      return
    }
    const requestGeneration = identityStateRef.current.generation
    const operation = operationRef.current + 1
    operationRef.current = operation
    eventRevisionRef.current += 1
    try {
      const snapshot = await ipcServices.ai.stopPrompt({ downloadId, promptId })
      if (
        identityStateRef.current.generation === requestGeneration &&
        operationRef.current === operation
      ) {
        setRun(snapshot)
        setHydrated(true)
      }
    } catch (error) {
      logger.error('Failed to stop prompt run', error)
      if (
        identityStateRef.current.generation === requestGeneration &&
        operationRef.current === operation
      ) {
        setHydrated(true)
      }
    }
  }, [downloadId, promptId])

  return { hydrated, run, start, stop }
}
