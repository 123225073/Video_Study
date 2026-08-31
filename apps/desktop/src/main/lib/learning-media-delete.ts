import fs from 'node:fs/promises'

interface MediaDeleteFileOps {
  lstat: (filePath: string) => Promise<{
    isFile: () => boolean
    isSymbolicLink: () => boolean
  }>
  unlink: (filePath: string) => Promise<void>
}

interface DeleteDownloadedMediaOptions {
  fileOps?: MediaDeleteFileOps
  retryDelayMs?: number
  retryLimit?: number
  wait?: (delayMs: number) => Promise<void>
}

export type DownloadedMediaDeleteStatus = 'deleted' | 'failed' | 'missing' | 'unsafe'

export interface DownloadedMediaDeleteResult {
  filePath: string
  status: DownloadedMediaDeleteStatus
}

const retryableWindowsFileError = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EPERM'
}

const delay = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })

/**
 * Delete one app-downloaded media file, retrying short-lived Windows player locks.
 */
export const deleteDownloadedMediaFile = async (
  filePath: string,
  options: DeleteDownloadedMediaOptions = {}
): Promise<DownloadedMediaDeleteResult> => {
  const fileOps = options.fileOps ?? fs
  const retryLimit = options.retryLimit ?? 4
  const retryDelayMs = options.retryDelayMs ?? 80
  const wait = options.wait ?? delay
  try {
    const stats = await fileOps.lstat(filePath)
    if (!(stats.isFile() && !stats.isSymbolicLink())) {
      return { filePath, status: 'unsafe' }
    }
  } catch (error) {
    return {
      filePath,
      status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'failed'
    }
  }

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      await fileOps.unlink(filePath)
      return { filePath, status: 'deleted' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { filePath, status: 'missing' }
      }
      if (!(retryableWindowsFileError(error) && attempt < retryLimit)) {
        return { filePath, status: 'failed' }
      }
      await wait(retryDelayMs * (attempt + 1))
    }
  }
  return { filePath, status: 'failed' }
}
