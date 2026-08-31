import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deleteDownloadedMediaFile } from '../src/main/lib/learning-media-delete'
import { LearningStore } from '../src/main/lib/learning-store'
import { persistWorkspaceDeletion } from '../src/main/lib/learning-workspace/delete-workspace'
import { normalizeStoreDocument } from '../src/main/lib/learning-workspace/normalization'

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const screenshotBlock = (attachmentPath: string, id: string) => ({
  attachmentPath,
  completed: false,
  content: '',
  createdAt: Date.now(),
  id,
  kind: 'screenshot' as const,
  quote: '',
  sourceSegmentIds: [],
  timestampMs: 1000,
  updatedAt: Date.now()
})

const main = async (): Promise<void> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fengsha-learning-delete-test-'))
  try {
    const store = new LearningStore(path.join(tempRoot, 'learning-notebooks.json'))
    const first = await store.save({
      blocks: [screenshotBlock(ONE_PIXEL_PNG, 'first-image')],
      downloadId: 'lesson-first',
      title: 'First lesson'
    })
    const reference = first.blocks[0]?.attachmentPath ?? ''
    const attachmentPath = await store.resolveAttachmentSource(reference)
    await store.save({
      blocks: [screenshotBlock(reference, 'shared-image')],
      downloadId: 'lesson-shared',
      title: 'Shared lesson'
    })

    assert.equal(await store.deleteWorkspace('lesson-first'), true)
    assert.ok((await fs.stat(attachmentPath)).isFile(), 'A shared attachment must be preserved')
    assert.equal(await store.deleteWorkspace('lesson-shared'), true)
    await assert.rejects(fs.stat(attachmentPath), { code: 'ENOENT' })
    assert.equal(await store.deleteWorkspace('not-found'), false)
    assert.ok(await store.getAiSettings(), 'Global AI settings must survive lesson deletion')
    assert.deepEqual(await store.list(), [])

    const attachmentSurvivingFailedWrite = path.join(tempRoot, 'failed-write-attachment.png')
    await fs.writeFile(attachmentSurvivingFailedWrite, Buffer.from('attachment'))
    const failedWriteDocument = normalizeStoreDocument({
      notebooks: [
        {
          downloadId: 'write-failure',
          notes: [],
          title: 'Write failure lesson',
          version: 2
        }
      ]
    })
    let pruneCalled = false
    await assert.rejects(
      persistWorkspaceDeletion({
        document: failedWriteDocument,
        downloadId: 'write-failure',
        persistDocument: () => Promise.reject(new Error('simulated atomic write failure')),
        pruneAttachments: async () => {
          pruneCalled = true
          await fs.unlink(attachmentSurvivingFailedWrite)
        }
      }),
      /simulated atomic write failure/u
    )
    assert.equal(pruneCalled, false, 'Attachment cleanup must run only after the document commit')
    assert.ok((await fs.stat(attachmentSurvivingFailedWrite)).isFile())

    let unlinkAttempts = 0
    const busyError = Object.assign(new Error('file is busy'), { code: 'EBUSY' })
    const lockedMediaPath = 'C:\\Downloads\\lesson.mp4'
    const lockedMediaResult = await deleteDownloadedMediaFile(lockedMediaPath, {
      fileOps: {
        lstat: () =>
          Promise.resolve({
            isFile: () => true,
            isSymbolicLink: () => false
          }),
        unlink: () => {
          unlinkAttempts += 1
          return Promise.reject(busyError)
        }
      },
      retryDelayMs: 0,
      retryLimit: 2,
      wait: () => Promise.resolve()
    })
    assert.equal(lockedMediaResult.status, 'failed')
    assert.equal(
      lockedMediaResult.filePath,
      lockedMediaPath,
      'A partial failure must retain the exact path so the user can recover the orphaned file'
    )
    assert.equal(unlinkAttempts, 3, 'A busy Windows file should be retried before partial failure')

    process.stdout.write('Learning deletion regression test passed\n')
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true })
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
