import type { LearningStoreDocument } from './normalization'

interface PersistWorkspaceDeletionInput {
  document: LearningStoreDocument
  downloadId: string
  persistDocument: (document: LearningStoreDocument) => Promise<void>
  pruneAttachments: (document: LearningStoreDocument) => Promise<void>
}

/**
 * Persist notebook deletion before best-effort orphan cleanup.
 *
 * The ordering is intentional: a failed atomic document write must leave every
 * attachment intact so the still-persisted notebook never points at a missing file.
 */
export const persistWorkspaceDeletion = async ({
  document,
  downloadId,
  persistDocument,
  pruneAttachments
}: PersistWorkspaceDeletionInput): Promise<boolean> => {
  const index = document.notebooks.findIndex((notebook) => notebook.downloadId === downloadId)
  if (index < 0) {
    return false
  }
  document.notebooks.splice(index, 1)
  await persistDocument(document)
  await pruneAttachments(document).catch(() => undefined)
  return true
}
