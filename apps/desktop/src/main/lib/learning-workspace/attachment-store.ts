import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { APP_PROTOCOL, APP_PROTOCOL_SCHEME } from '../../../shared/constants'
import type { LearningBlock } from '../../../shared/learning-types'
import type { LearningStoreDocument } from './normalization'

const ATTACHMENT_DIRECTORY = 'learning-attachments'
const MAX_ATTACHMENT_DATA_URL_LENGTH = 4 * 1024 * 1024
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([a-z\d+/]+={0,2})$/iu
const STORED_FILE_NAME = /^([a-f\d]{64})\.(jpg|png|webp)$/u

const isPathInside = (rootPath: string, targetPath: string): boolean => {
  const relativePath = path.relative(rootPath, targetPath)
  return !(
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  )
}

const hasExpectedSignature = (mimeType: string, data: Buffer): boolean => {
  if (mimeType === 'png') {
    return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  if (mimeType === 'jpeg') {
    return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255
  }
  return (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

const decodedImage = (dataUrl: string): { data: Buffer; extension: string } => {
  if (dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
    throw new Error('The learning screenshot attachment exceeds the 4 MB data URL limit')
  }
  const match = dataUrl.match(IMAGE_DATA_URL)
  if (!match) {
    throw new Error('The learning screenshot attachment must be a PNG, JPEG, or WebP data URL')
  }
  const data = Buffer.from(match[2], 'base64')
  const normalizedInput = match[2].replace(/[=]+$/u, '')
  const normalizedDecoded = data.toString('base64').replace(/[=]+$/u, '')
  if (
    normalizedInput !== normalizedDecoded ||
    !hasExpectedSignature(match[1].toLowerCase(), data)
  ) {
    throw new Error('The learning screenshot attachment content does not match its image type')
  }
  return { data, extension: match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase() }
}

export class LearningAttachmentStore {
  private readonly basePath: string
  private readonly rootPath: string

  constructor(learningDocumentPath: string) {
    this.basePath = path.resolve(path.dirname(learningDocumentPath))
    this.rootPath = path.join(this.basePath, ATTACHMENT_DIRECTORY)
  }

  async materializeDocument(document: LearningStoreDocument): Promise<boolean> {
    let changed = false
    for (const notebook of document.notebooks) {
      for (const block of notebook.blocks) {
        const nextReference = await this.materializeBlockAttachment(block)
        if (nextReference !== block.attachmentPath) {
          block.attachmentPath = nextReference
          changed = true
        }
      }
    }
    return changed
  }

  async resolveAttachmentSource(reference: string): Promise<string> {
    const storedReference = await this.materializeReference(reference)
    if (!storedReference.startsWith(APP_PROTOCOL_SCHEME)) {
      throw new Error('The attachment source is not managed by the learning workspace')
    }
    const targetPath = await this.targetFromReference(storedReference)
    const stats = await fs.lstat(targetPath)
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error('The learning attachment reference is not a regular file')
    }
    const [realRoot, realTarget] = await Promise.all([
      fs.realpath(this.rootPath),
      fs.realpath(targetPath)
    ])
    if (!isPathInside(realRoot, realTarget)) {
      throw new Error('The learning attachment reference resolves outside its storage directory')
    }
    return realTarget
  }

  private async materializeBlockAttachment(block: LearningBlock): Promise<string | null> {
    if (!block.attachmentPath) {
      return null
    }
    return this.materializeReference(block.attachmentPath)
  }

  private async materializeReference(reference: string): Promise<string> {
    const value = reference.trim()
    if (value.startsWith('data:')) {
      return this.storeDataUrl(value)
    }
    if (value.startsWith(APP_PROTOCOL_SCHEME)) {
      await this.targetFromReference(value)
      return value
    }
    if (/^https?:\/\//iu.test(value)) {
      return new URL(value).href
    }
    throw new Error('The learning attachment path is not a supported managed reference')
  }

  private async storeDataUrl(dataUrl: string): Promise<string> {
    const { data, extension } = decodedImage(dataUrl)
    await this.ensureSafeRoot()
    const digest = createHash('sha256').update(data).digest('hex')
    const fileName = `${digest}.${extension}`
    const targetPath = path.join(this.rootPath, fileName)
    try {
      await fs.writeFile(targetPath, data, { flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      const existing = await fs.readFile(targetPath)
      if (createHash('sha256').update(existing).digest('hex') !== digest) {
        throw new Error('The existing learning attachment does not match its content hash')
      }
    }
    return `${APP_PROTOCOL_SCHEME}${ATTACHMENT_DIRECTORY}/${fileName}`
  }

  private async ensureSafeRoot(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true })
    const realBase = await fs.realpath(this.basePath)
    await fs.mkdir(this.rootPath, { recursive: true })
    const realRoot = await fs.realpath(this.rootPath)
    if (!isPathInside(realBase, realRoot)) {
      throw new Error('The learning attachment directory resolves outside the user data directory')
    }
  }

  private async targetFromReference(reference: string): Promise<string> {
    await this.ensureSafeRoot()
    let parsed: URL
    try {
      parsed = new URL(reference)
    } catch {
      throw new Error('The learning attachment reference is invalid')
    }
    const fileName = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/gu, '')
    if (
      parsed.protocol !== `${APP_PROTOCOL}:` ||
      parsed.hostname !== ATTACHMENT_DIRECTORY ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash ||
      !STORED_FILE_NAME.test(fileName)
    ) {
      throw new Error('The learning attachment reference is outside the managed storage directory')
    }
    const targetPath = path.resolve(this.rootPath, fileName)
    if (!isPathInside(this.rootPath, targetPath)) {
      throw new Error('The learning attachment path escapes its managed storage directory')
    }
    return targetPath
  }
}
