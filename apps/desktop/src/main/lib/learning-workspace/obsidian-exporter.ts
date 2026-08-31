import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  LearningAiArtifactKind,
  LearningWorkspace,
  ObsidianAttachmentInput,
  ObsidianExportInput,
  ObsidianExportPreview,
  ObsidianExportResult
} from '../../../shared/learning-types'
import { normalizeNotebook } from './normalization'
import { materializeTranscript } from './transcript-overlay'

const DEFAULT_SOURCE_DIRECTORY = '视频学习/来源笔记'
const MANAGED_START_PREFIX = '<!-- FENGSHA-LEARNING:MANAGED:START:'
const MANAGED_END_PREFIX = '<!-- FENGSHA-LEARNING:MANAGED:END:'
const INVALID_FILE_CHARACTERS = /[<>:"/\\|?*]/gu
const INVALID_PATH_SEGMENT = /[<>:"|?*]/u
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[. ]*\..*)?$/iu
const MAX_ATTACHMENT_DATA_URL_LENGTH = 4 * 1024 * 1024
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([a-z\d+/=]+)$/iu

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

const exportWriteQueues = new Map<string, Promise<void>>()

class ConcurrentObsidianModificationError extends Error {}

const withTargetWriteLock = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const previous = exportWriteQueues.get(key) ?? Promise.resolve()
  let release = (): void => undefined
  const currentGate = new Promise<void>((resolve) => {
    release = resolve
  })
  const current = previous.catch(() => undefined).then(() => currentGate)
  exportWriteQueues.set(key, current)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (exportWriteQueues.get(key) === current) {
      exportWriteQueues.delete(key)
    }
  }
}

const quoteYaml = (value: string): string => JSON.stringify(value.replace(/\r?\n/gu, ' '))

const formatTime = (timestampMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

const timestampLink = (notebook: LearningWorkspace, timestampMs: number): string => {
  const label = formatTime(timestampMs)
  const sourceUrl = notebook.source.canonicalUrl ?? notebook.sourceUrl
  if (!sourceUrl) {
    return label
  }
  try {
    const url = new URL(sourceUrl)
    url.searchParams.set('t', Math.floor(timestampMs / 1000).toString())
    return `[${label}](${url.toString()})`
  } catch {
    return label
  }
}

export const safeObsidianFileName = (value: string): string => {
  const printableValue = Array.from(value, (character) =>
    character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127 ? character : ' '
  ).join('')
  const cleaned = printableValue
    .normalize('NFKC')
    .replace(INVALID_FILE_CHARACTERS, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim()
    .slice(0, 120)
  const safe = cleaned && !WINDOWS_RESERVED_NAMES.test(cleaned) ? cleaned : '未命名视频'
  return `${safe}.md`
}

export const resolvePathInsideVault = (vaultPath: string, relativePath: string): string => {
  const root = path.resolve(vaultPath)
  if (!(root && relativePath.trim()) || path.isAbsolute(relativePath)) {
    throw new Error('Obsidian export path must be relative to the vault')
  }
  const target = path.resolve(root, relativePath)
  const relative = path.relative(root, target)
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Obsidian export path escapes the selected vault')
  }
  return target
}

const assertUserContentPath = (relativePath: string): void => {
  const segments = relativePath.split(/[\\/]/u).filter(Boolean)
  const firstSegment = segments[0]?.toLocaleLowerCase()
  if (firstSegment === '.obsidian') {
    throw new Error('Learning exports cannot modify Obsidian configuration files')
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('Obsidian export relative path escapes the selected vault')
    }
    const containsControlCharacter = Array.from(segment).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
    if (
      segment.endsWith('.') ||
      segment.endsWith(' ') ||
      INVALID_PATH_SEGMENT.test(segment) ||
      WINDOWS_RESERVED_NAMES.test(segment) ||
      containsControlCharacter
    ) {
      throw new Error(`Invalid Obsidian export path segment: ${segment}`)
    }
  }
}

const resolveNoteRelativePath = (
  notebook: LearningWorkspace,
  input: ObsidianExportInput
): string => {
  const storedPath = input.relativePath?.trim() || notebook.obsidian.relativePath
  if (storedPath) {
    if (path.extname(storedPath).toLocaleLowerCase() !== '.md') {
      throw new Error('An Obsidian source note must use the .md extension')
    }
    assertUserContentPath(storedPath)
    return storedPath
  }
  const sourceDirectory = input.sourceDirectory?.trim() || DEFAULT_SOURCE_DIRECTORY
  const relativePath = path.join(sourceDirectory, safeObsidianFileName(notebook.title))
  assertUserContentPath(relativePath)
  return relativePath
}

const markers = (workspaceId: string): { end: string; start: string } => ({
  end: `${MANAGED_END_PREFIX}${workspaceId} -->`,
  start: `${MANAGED_START_PREFIX}${workspaceId} -->`
})

const renderFrontmatter = (notebook: LearningWorkspace): string => {
  const sourceUrl = notebook.source.canonicalUrl ?? notebook.sourceUrl ?? ''
  return [
    '---',
    'type: video-source',
    `fengsha_workspace_id: ${quoteYaml(notebook.workspaceId)}`,
    `title: ${quoteYaml(notebook.title)}`,
    `source: ${quoteYaml(sourceUrl)}`,
    `platform: ${quoteYaml(notebook.source.platform)}`,
    `author: ${quoteYaml(notebook.source.author)}`,
    `created: ${quoteYaml(new Date(notebook.createdAt).toISOString())}`,
    `updated: ${quoteYaml(new Date(notebook.updatedAt).toISOString())}`,
    'tags:',
    '  - 视频学习',
    '---'
  ].join('\n')
}

const renderArtifacts = (notebook: LearningWorkspace, kind: LearningAiArtifactKind): string => {
  const versions = notebook.aiArtifacts
    .filter((artifact) => artifact.kind === kind)
    .toSorted((left, right) => right.createdAt - left.createdAt)
  if (versions.length === 0) {
    return '_尚未生成_'
  }
  return versions
    .map((artifact, index) => {
      const heading = index === 0 ? '当前版本' : `历史版本 ${versions.length - index}`
      const metadata = `模型：${artifact.model || '未记录'} · 提示词 v${artifact.promptVersion} · 逐字稿 v${artifact.transcriptVersion}`
      const projection = notebook.blocks.find((block) => block.id === `artifact-${artifact.id}`)
      const editedContent = projection?.content.trim() || artifact.content
      const content =
        kind === 'mindmap' && !editedContent.includes('```mermaid')
          ? `\`\`\`mermaid\n${editedContent}\n\`\`\``
          : editedContent
      return `### ${heading}\n\n${metadata}\n\n${content}`
    })
    .join('\n\n')
}

const renderManagedContent = (notebook: LearningWorkspace): string => {
  const marker = markers(notebook.workspaceId)
  const transcript = notebook.transcript
    ? materializeTranscript(notebook.transcript)
        .map((segment) => {
          const translated = segment.translatedText ? `\n  - 译文：${segment.translatedText}` : ''
          return `- ${timestampLink(notebook, segment.startMs)} ${segment.correctedText}${translated}`
        })
        .join('\n')
    : '_尚无逐字稿_'
  const notes = notebook.notes.length
    ? notebook.notes
        .map((note) => {
          const color = note.highlightColor ? ` #highlight/${note.highlightColor}` : ''
          return `- ${timestampLink(notebook, note.timestampMs)} ${note.text}${color}${note.quote ? `\n  > ${note.quote}` : ''}`
        })
        .join('\n')
    : '_尚无原文备注_'
  // AI artifacts already have dedicated, versioned sections above. The output
  // editor projects them with artifact-* ids for editing, so do not export the
  // same summary or diagram a second time under generic content blocks.
  const userBlocks = notebook.blocks.filter((block) => !block.id.startsWith('artifact-'))
  const blocks = userBlocks.length
    ? userBlocks
        .map((block) => {
          const time =
            block.timestampMs === null ? '' : `${timestampLink(notebook, block.timestampMs)} `
          const attachment = block.attachmentPath
            ? `\n  ![[${block.attachmentPath.replaceAll('\\', '/')}]]`
            : ''
          return `- ${time}**${block.kind}** ${block.content}${block.quote ? `\n  > ${block.quote}` : ''}${attachment}`
        })
        .join('\n')
    : '_尚无块笔记_'
  return [
    marker.start,
    '# 视频学习来源',
    '',
    `- 历史学习目标：${notebook.goal || '未填写'}`,
    `- 来源：${notebook.source.canonicalUrl ?? notebook.sourceUrl ?? '本地文件'}`,
    `- 作者：${notebook.source.author || '未知'}`,
    `- 课程：${notebook.source.courseTitle || '未归类'}`,
    '',
    '## AI 总结',
    '',
    renderArtifacts(notebook, 'summary'),
    '',
    '## Mermaid 思维导图',
    '',
    renderArtifacts(notebook, 'mindmap'),
    '',
    '## AI 字幕翻译',
    '',
    renderArtifacts(notebook, 'translation'),
    '',
    '## AI 金句候选',
    '',
    renderArtifacts(notebook, 'quotes'),
    '',
    '## AI 学习心得',
    '',
    renderArtifacts(notebook, 'reflection'),
    '',
    '## 我的笔记',
    '',
    notebook.personalNote || '_尚无笔记_',
    '',
    '## 原文备注',
    '',
    notes,
    '',
    '## 内容块',
    '',
    blocks,
    '',
    '## 完整逐字稿',
    '',
    transcript,
    marker.end
  ].join('\n')
}

const extractManagedContent = (
  content: string,
  workspaceId: string
): { content: string; end: number; start: number } | null => {
  const marker = markers(workspaceId)
  const start = content.indexOf(marker.start)
  const endMarkerIndex = content.indexOf(marker.end, Math.max(0, start))
  if (start < 0 || endMarkerIndex < 0) {
    return null
  }
  const end = endMarkerIndex + marker.end.length
  return { content: content.slice(start, end), end, start }
}

const mergeManagedContent = (existing: string | null, notebook: LearningWorkspace): string => {
  const managed = renderManagedContent(notebook)
  if (existing === null) {
    return `${renderFrontmatter(notebook)}\n\n${managed}\n\n## 我的补充\n\n`
  }
  const current = extractManagedContent(existing, notebook.workspaceId)
  if (current) {
    return `${existing.slice(0, current.start)}${managed}${existing.slice(current.end)}`
  }
  return `${existing.trimEnd()}\n\n${managed}\n`
}

const readUtf8IfPresent = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

const writeFileAtomically = async (
  filePath: string,
  content: string | Buffer,
  options: { expectedFileHash?: string | null } = {}
): Promise<void> => {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, content)
    if ('expectedFileHash' in options) {
      const current = await fs.readFile(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null
        }
        throw error
      })
      const currentHash = current === null ? null : sha256(current)
      if (currentHash !== options.expectedFileHash) {
        throw new ConcurrentObsidianModificationError(
          'The Obsidian note changed while it was being exported'
        )
      }
    }
    await fs.rename(temporaryPath, filePath)
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

const assertVault = async (vaultPath: string): Promise<string> => {
  const resolved = path.resolve(vaultPath)
  const stats = await fs.stat(resolved)
  if (!stats.isDirectory()) {
    throw new Error('The selected Obsidian vault is not a directory')
  }
  return fs.realpath(resolved)
}

const assertExistingPathInsideVault = async (
  vaultPath: string,
  targetPath: string
): Promise<void> => {
  const realVault = await fs.realpath(vaultPath)
  const assertInside = (candidate: string): void => {
    const relative = path.relative(realVault, candidate)
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('Obsidian export target resolves outside the selected vault')
    }
  }

  let existingPath = targetPath
  while (true) {
    try {
      await fs.lstat(existingPath)
      assertInside(await fs.realpath(existingPath))
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      const next = path.dirname(existingPath)
      if (next === existingPath) {
        throw new Error('Unable to find an existing Obsidian vault parent')
      }
      existingPath = next
    }
  }
}

const assertRealParentInsideVault = async (
  vaultPath: string,
  targetPath: string
): Promise<void> => {
  const parent = path.dirname(targetPath)
  await assertExistingPathInsideVault(vaultPath, parent)
  await fs.mkdir(parent, { recursive: true })
  await assertExistingPathInsideVault(vaultPath, parent)
}

const attachmentConflicts = async (
  vaultPath: string,
  attachments: ObsidianAttachmentInput[],
  protectedTarget: string
): Promise<string[]> => {
  const conflicts: string[] = []
  const seenTargets = new Set<string>()
  for (const attachment of attachments) {
    assertUserContentPath(attachment.relativePath)
    const target = resolvePathInsideVault(vaultPath, attachment.relativePath)
    const comparableTarget = process.platform === 'win32' ? target.toLocaleLowerCase() : target
    const comparableProtected =
      process.platform === 'win32' ? protectedTarget.toLocaleLowerCase() : protectedTarget
    if (comparableTarget === comparableProtected) {
      throw new Error('An attachment cannot overwrite the Obsidian source note')
    }
    if (seenTargets.has(comparableTarget)) {
      throw new Error(`Duplicate Obsidian attachment target: ${attachment.relativePath}`)
    }
    seenTargets.add(comparableTarget)
    await assertExistingPathInsideVault(vaultPath, target)
    const [source, existing] = await Promise.all([
      readAttachment(attachment),
      fs.readFile(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null
        }
        throw error
      })
    ])
    if (existing && sha256(existing) !== sha256(source)) {
      conflicts.push(attachment.relativePath)
    }
  }
  return conflicts
}

const readAttachment = async (attachment: ObsidianAttachmentInput): Promise<Buffer> => {
  const hasSourcePath = Boolean(attachment.sourcePath)
  const hasDataUrl = Boolean(attachment.dataUrl)
  if (hasSourcePath === hasDataUrl) {
    throw new Error('An Obsidian attachment requires exactly one source')
  }
  if (attachment.sourcePath) {
    return fs.readFile(path.resolve(attachment.sourcePath))
  }
  const dataUrl = attachment.dataUrl ?? ''
  if (dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
    throw new Error('The Obsidian attachment data URL is too large')
  }
  const match = dataUrl.match(IMAGE_DATA_URL)
  if (!match) {
    throw new Error('The Obsidian attachment must be a PNG, JPEG, or WebP data URL')
  }
  return Buffer.from(match[1], 'base64')
}

const copyAttachmentIfChanged = async (source: Buffer, targetPath: string): Promise<boolean> => {
  const existing = await fs.readFile(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (existing && sha256(existing) === sha256(source)) {
    return false
  }
  await writeFileAtomically(targetPath, source, {
    expectedFileHash: existing === null ? null : sha256(existing)
  })
  return true
}

export class ObsidianExporter {
  async preview(input: ObsidianExportInput): Promise<ObsidianExportPreview> {
    const notebook = normalizeNotebook(input.notebook)
    if (!notebook) {
      throw new Error('The learning notebook is invalid')
    }
    const vaultPath = await assertVault(input.vaultPath)
    const relativePath = resolveNoteRelativePath(notebook, input)
    const absolutePath = resolvePathInsideVault(vaultPath, relativePath)
    await assertExistingPathInsideVault(vaultPath, absolutePath)
    const existing = await readUtf8IfPresent(absolutePath)
    const currentManaged = existing
      ? (extractManagedContent(existing, notebook.workspaceId)?.content ?? null)
      : null
    const currentManagedHash = currentManaged ? sha256(currentManaged) : null
    const content = mergeManagedContent(existing, notebook)
    const managed = extractManagedContent(content, notebook.workspaceId)
    if (!managed) {
      throw new Error('Failed to build Obsidian managed content')
    }
    const conflictingAttachments = await attachmentConflicts(
      vaultPath,
      input.attachments ?? [],
      absolutePath
    )
    const unmanagedOrDifferentWorkspace = existing !== null && currentManaged === null
    const expectedManagedHash =
      input.expectedManagedHash === undefined
        ? notebook.obsidian.managedHash
        : input.expectedManagedHash
    const managedChangedSincePreview = expectedManagedHash !== currentManagedHash
    return {
      absolutePath,
      baseFileHash: existing === null ? null : sha256(existing),
      conflict:
        unmanagedOrDifferentWorkspace ||
        managedChangedSincePreview ||
        conflictingAttachments.length > 0,
      conflictingAttachments,
      content,
      currentManagedHash,
      managedHash: sha256(managed.content),
      relativePath
    }
  }

  async write(input: ObsidianExportInput): Promise<ObsidianExportResult> {
    const notebook = normalizeNotebook(input.notebook)
    if (!notebook) {
      throw new Error('The learning notebook is invalid')
    }
    const vaultPath = await assertVault(input.vaultPath)
    const relativePath = resolveNoteRelativePath(notebook, input)
    const targetKey = resolvePathInsideVault(vaultPath, relativePath)
    return withTargetWriteLock(targetKey, async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const preview = await this.preview({ ...input, vaultPath })
        if (preview.conflict && !input.force) {
          return { ...preview, attachmentsWritten: [], status: 'conflict' }
        }
        const attachments = input.attachments ?? []
        const contentChanged = preview.baseFileHash !== sha256(preview.content)
        try {
          if (contentChanged) {
            await assertRealParentInsideVault(vaultPath, preview.absolutePath)
            await assertExistingPathInsideVault(vaultPath, preview.absolutePath)
            await writeFileAtomically(preview.absolutePath, preview.content, {
              expectedFileHash: preview.baseFileHash
            })
          }
          const attachmentsWritten: string[] = []
          for (const attachment of attachments) {
            const target = resolvePathInsideVault(vaultPath, attachment.relativePath)
            await assertRealParentInsideVault(vaultPath, target)
            await assertExistingPathInsideVault(vaultPath, target)
            const source = await readAttachment(attachment)
            const sourcePath = attachment.sourcePath ? path.resolve(attachment.sourcePath) : null
            if (sourcePath !== target && (await copyAttachmentIfChanged(source, target))) {
              attachmentsWritten.push(attachment.relativePath)
            }
          }
          return {
            ...preview,
            attachmentsWritten,
            status: contentChanged || attachmentsWritten.length > 0 ? 'written' : 'unchanged'
          }
        } catch (error) {
          if (!(error instanceof ConcurrentObsidianModificationError)) {
            throw error
          }
          if (attempt > 0) {
            const latest = await this.preview({ ...input, vaultPath })
            return { ...latest, attachmentsWritten: [], status: 'conflict' }
          }
        }
      }
      const latest = await this.preview({ ...input, vaultPath })
      return { ...latest, attachmentsWritten: [], status: 'conflict' }
    })
  }
}
