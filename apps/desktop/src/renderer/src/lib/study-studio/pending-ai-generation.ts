import type { StudyNoteBlockKind } from './types'

const STORAGE_PREFIX = 'fengsha:pending-learning-ai:'
const MAX_PENDING_INPUT_LENGTH = 2_000_000

export interface PendingAiGeneration {
  attempt: number
  blockId: string | null
  busyKey: string
  input: string
  kind: StudyNoteBlockKind
  promptId: string
}

const isPendingAiGeneration = (value: unknown): value is PendingAiGeneration => {
  if (!(value && typeof value === 'object')) {
    return false
  }
  const candidate = value as Partial<PendingAiGeneration>
  return (
    (candidate.attempt === 0 || candidate.attempt === 1) &&
    (candidate.blockId === null || typeof candidate.blockId === 'string') &&
    typeof candidate.busyKey === 'string' &&
    typeof candidate.input === 'string' &&
    candidate.input.length <= MAX_PENDING_INPUT_LENGTH &&
    typeof candidate.kind === 'string' &&
    typeof candidate.promptId === 'string'
  )
}

const storageKey = (downloadId: string): string => `${STORAGE_PREFIX}${downloadId}`

/** Restore enough local context to project a completed main-process AI run after navigation. */
export const loadPendingAiGenerations = (
  downloadId: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage
): Map<string, PendingAiGeneration> => {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(downloadId)) ?? '[]') as unknown
    if (!Array.isArray(parsed)) {
      return new Map()
    }
    return new Map(
      parsed
        .filter(isPendingAiGeneration)
        .map((pending): [string, PendingAiGeneration] => [pending.promptId, pending])
    )
  } catch {
    return new Map()
  }
}

/** Keep pending projection metadata local so route changes cannot orphan an AI answer. */
export const savePendingAiGenerations = (
  downloadId: string,
  pending: Map<string, PendingAiGeneration>,
  storage: Pick<Storage, 'removeItem' | 'setItem'> = window.localStorage
): void => {
  const key = storageKey(downloadId)
  if (pending.size === 0) {
    storage.removeItem(key)
    return
  }
  storage.setItem(key, JSON.stringify([...pending.values()]))
}
