import { ipcEvents, ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { AiImageRunInput, AiImageRunSnapshot } from '@shared/ai-types'
import { useCallback, useEffect, useState } from 'react'

const idleImageRun = (downloadId: string): AiImageRunSnapshot => ({
  downloadId,
  context: null,
  error: null,
  errorCode: null,
  imageDataUrl: null,
  modelId: '',
  partialImageIndex: 0,
  progressText: '',
  runId: '',
  stage: 'idle',
  startedAt: 0,
  status: 'idle',
  updatedAt: 0
})

/** Subscribe to the main-process image job so navigation never hides its progress. */
export const useImageRun = (
  downloadId: string
): {
  hydrated: boolean
  run: AiImageRunSnapshot
  start: (input: Omit<AiImageRunInput, 'downloadId'>) => Promise<void>
  stop: () => Promise<void>
} => {
  const [run, setRun] = useState<AiImageRunSnapshot>(() => idleImageRun(downloadId))
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHydrated(false)
    void ipcServices.ai
      .getImageRun(downloadId)
      .then((snapshot) => {
        if (!cancelled) {
          setRun(snapshot)
          setHydrated(true)
        }
      })
      .catch((error) => {
        logger.error('Failed to restore image run', error)
        if (!cancelled) {
          setHydrated(true)
        }
      })
    const subscription = ipcEvents.on('ai:image-run', (...args: unknown[]) => {
      const snapshot = args[0] as AiImageRunSnapshot | undefined
      if (snapshot?.downloadId === downloadId) {
        setRun((current) => {
          if (
            current.runId &&
            snapshot.runId !== current.runId &&
            snapshot.startedAt < current.startedAt
          ) {
            return current
          }
          return snapshot
        })
      }
    })
    return () => {
      cancelled = true
      ipcEvents.removeListener('ai:image-run', subscription)
    }
  }, [downloadId])

  const start = useCallback(
    async (input: Omit<AiImageRunInput, 'downloadId'>): Promise<void> => {
      try {
        setRun(await ipcServices.ai.startImage({ ...input, downloadId }))
      } catch (error) {
        logger.error('Failed to start image run', error)
        setRun({
          ...idleImageRun(downloadId),
          error: error instanceof Error ? error.message : 'Image generation failed',
          errorCode: 'unknown',
          runId: `failed-${Date.now()}`,
          startedAt: Date.now(),
          status: 'error',
          updatedAt: Date.now()
        })
      }
    },
    [downloadId]
  )

  const stop = useCallback(async (): Promise<void> => {
    try {
      setRun(await ipcServices.ai.stopImage(downloadId))
    } catch (error) {
      logger.error('Failed to stop image run', error)
    }
  }, [downloadId])

  return { hydrated, run, start, stop }
}
