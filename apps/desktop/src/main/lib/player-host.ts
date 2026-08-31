import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PlayerAttachInput, PlayerAttachResult } from '@shared/types/player'
import { app } from 'electron'
import { isNativelyPlayableAudio } from '../../shared/utils/native-playable'
import { scopedLoggers } from '../utils/logger'
import { ffmpegManager } from './ffmpeg-manager'
import { preparePlayableMedia } from './playable-media'
import {
  grantPlayableMediaUrl,
  matchesActiveMediaPath,
  revokePlayableMediaUrl
} from './playable-media-protocol'

const logger = scopedLoggers.player

/**
 * Directory for remuxed/transcoded previews.
 */
const previewCacheDir = (): string => path.join(app.getPath('userData'), 'html5-preview')

/**
 * Prepare a Chromium-playable local file for the in-page Video.js player.
 */
class PlayerHost {
  private attachGeneration = 0
  private activeMediaUrl: string | null = null
  private activePlayablePath: string | null = null
  private activeSourcePath: string | null = null

  private publishPlayablePath(
    filePath: string,
    sourcePath: string,
    generation: number
  ): PlayerAttachResult {
    if (generation !== this.attachGeneration) {
      throw new Error('Media player attach was superseded')
    }
    const mediaUrl = grantPlayableMediaUrl(filePath)
    revokePlayableMediaUrl(this.activeMediaUrl)
    this.activeMediaUrl = mediaUrl
    this.activePlayablePath = filePath
    this.activeSourcePath = sourcePath
    return { playablePath: mediaUrl }
  }

  /**
   * Remux or transcode a local file so Video.js can play it in-page.
   */
  async attach(input: PlayerAttachInput): Promise<PlayerAttachResult> {
    const generation = ++this.attachGeneration
    if (!existsSync(input.filePath)) {
      throw new Error(`Media file is missing: ${input.filePath}`)
    }
    if (isNativelyPlayableAudio(input.filePath)) {
      logger.info('Prepared in-page media:', 'original', input.filePath)
      return this.publishPlayablePath(input.filePath, input.filePath, generation)
    }

    await ffmpegManager.ensureInitialized()
    try {
      const prepared = await preparePlayableMedia(ffmpegManager.getPath(), input.filePath, {
        cacheDir: previewCacheDir()
      })
      if (generation !== this.attachGeneration) {
        return this.publishPlayablePath(prepared.playablePath, input.filePath, generation)
      }
      logger.info('Prepared in-page media:', prepared.mode, prepared.playablePath)
      return this.publishPlayablePath(prepared.playablePath, input.filePath, generation)
    } catch (error) {
      logger.warn('Failed to prepare in-page media:', input.filePath, error)
      throw error
    }
  }

  /**
   * Cancel an in-flight prepare when leaving the transcript page.
   */
  async detach(): Promise<void> {
    this.attachGeneration += 1
    revokePlayableMediaUrl(this.activeMediaUrl)
    this.activeMediaUrl = null
    this.activePlayablePath = null
    this.activeSourcePath = null
  }

  /**
   * Detach only when the deletion target belongs to the active player session.
   */
  async detachIfPlaying(filePath: string): Promise<boolean> {
    if (!matchesActiveMediaPath(filePath, this.activeSourcePath, this.activePlayablePath)) {
      return false
    }
    await this.detach()
    return true
  }

  /**
   * Cancel work during app shutdown.
   */
  async dispose(): Promise<void> {
    await this.detach()
  }
}

let playerHost: PlayerHost | null = null

/**
 * Return the process-wide player host, creating it on first use.
 */
export const getPlayerHost = (): PlayerHost => {
  if (!playerHost) {
    playerHost = new PlayerHost()
  }
  return playerHost
}

/**
 * Dispose the process-wide player host during app shutdown.
 */
export const stopPlayerHost = async (): Promise<void> => {
  const host = playerHost
  playerHost = null
  await host?.dispose()
}
