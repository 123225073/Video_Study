interface KeyValueStorage {
  getItem: (key: string) => string | null
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}

/** Scope the one-shot repair guard to the exact transcript and system-prompt versions. */
export const automaticMermaidRepairStorageKey = (
  downloadId: string,
  promptId: string,
  transcriptVersion: number,
  promptVersion: number
): string =>
  `fengsha-auto-mermaid-repair:${downloadId}:${promptId}:${transcriptVersion}:${promptVersion}`

export const wasAutomaticMermaidRepairAttempted = (
  storage: KeyValueStorage,
  key: string
): boolean => storage.getItem(key) === '1'

export const rememberAutomaticMermaidRepairAttempt = (
  storage: KeyValueStorage,
  key: string,
  attempted: boolean
): void => {
  if (attempted) {
    storage.setItem(key, '1')
  } else {
    storage.removeItem(key)
  }
}
