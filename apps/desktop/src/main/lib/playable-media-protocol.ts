import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { APP_PROTOCOL } from '../../shared/constants'

const MEDIA_HOST = 'media'
const activeMediaPaths = new Map<string, string>()

const normalizedMediaPath = (
  filePath: string,
  platform: NodeJS.Platform = process.platform
): string => {
  const resolved =
    platform === 'win32' ? path.win32.resolve(filePath) : path.posix.resolve(filePath)
  return platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved
}

/**
 * Match a deletion target to the current player without interrupting another lesson.
 */
export const matchesActiveMediaPath = (
  candidatePath: string,
  activeSourcePath: string | null,
  activePlayablePath: string | null,
  platform: NodeJS.Platform = process.platform
): boolean => {
  const candidate = normalizedMediaPath(candidatePath, platform)
  return [activeSourcePath, activePlayablePath].some(
    (activePath) => activePath && normalizedMediaPath(activePath, platform) === candidate
  )
}

/**
 * Grant the renderer a non-guessable app-protocol URL for one local media file.
 */
export const grantPlayableMediaUrl = (filePath: string): string => {
  const token = randomUUID()
  activeMediaPaths.set(token, filePath)
  const displayName = encodeURIComponent(path.basename(filePath))
  return `${APP_PROTOCOL}://${MEDIA_HOST}/${token}/${displayName}`
}

/**
 * Resolve an app-protocol media URL only when it was granted by the main process.
 */
export const resolvePlayableMediaUrl = (requestUrl: URL): string | null => {
  if (requestUrl.hostname !== MEDIA_HOST) {
    return null
  }
  const token = requestUrl.pathname.split('/').find(Boolean)
  return token ? (activeMediaPaths.get(token) ?? null) : null
}

/**
 * Revoke a previously granted media URL when its player session is detached.
 */
export const revokePlayableMediaUrl = (mediaUrl: string | null): void => {
  if (!mediaUrl) {
    return
  }
  try {
    const requestUrl = new URL(mediaUrl)
    if (requestUrl.hostname !== MEDIA_HOST) {
      return
    }
    const token = requestUrl.pathname.split('/').find(Boolean)
    if (token) {
      activeMediaPaths.delete(token)
    }
  } catch {
    // Ignore malformed stale values; there is no grant to revoke.
  }
}
