import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { LearningStore } from '../src/main/lib/learning-store'
import { ObsidianExporter } from '../src/main/lib/learning-workspace/obsidian-exporter'

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const screenshotBlock = (attachmentPath: string) => {
  const now = Date.now()
  return {
    attachmentPath,
    completed: false,
    content: '',
    createdAt: now,
    id: `screenshot-${now}`,
    kind: 'screenshot' as const,
    quote: '',
    sourceSegmentIds: [],
    timestampMs: 1000,
    updatedAt: now
  }
}

const main = async (): Promise<void> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fengsha-learning-test-'))
  const storePath = path.join(tempRoot, 'learning-notebooks.json')
  const vaultPath = path.join(tempRoot, 'vault')
  await fs.mkdir(vaultPath)

  try {
    const store = new LearningStore(storePath)
    const saved = await store.save({
      downloadId: 'lesson-1',
      goal: '掌握第一性原理',
      notes: [],
      personalNote: '## 我的理解\n\n保留 **Markdown** 和行尾。  ',
      sourceUrl: 'https://example.com/watch?v=1',
      title: '测试课程',
      transcript: {
        corrections: [],
        segments: [
          {
            endMs: 4000,
            id: 'segment-1',
            originalText: '这是原始逐字稿',
            speakerId: 'speaker-1',
            startMs: 1000,
            translatedText: ''
          }
        ],
        sourceVersionId: 'source-1',
        updatedAt: Date.now(),
        version: 1
      }
    })
    assert.equal(saved.version, 2)
    assert.equal(saved.personalNote, '## 我的理解\n\n保留 **Markdown** 和行尾。  ')

    const legacyNoteNotebook = await store.save({
      downloadId: 'legacy-note',
      notes: [
        {
          completed: false,
          createdAt: Date.now(),
          id: 'legacy-note-1',
          kind: 'bookmark',
          quote: '旧版原文',
          text: '旧版备注',
          timestampMs: 2500,
          updatedAt: Date.now()
        }
      ],
      title: '旧版笔记'
    })
    assert.equal(legacyNoteNotebook.personalNote, '')
    assert.equal(legacyNoteNotebook.notes[0]?.highlightColor, null)
    assert.deepEqual(legacyNoteNotebook.notes[0]?.sourceSegmentIds, [])

    const corrected = await store.applyCorrection({
      correctedText: '这是人工校对后的逐字稿',
      downloadId: 'lesson-1',
      segmentId: 'segment-1'
    })
    assert.equal(corrected.transcript?.corrections.at(-1)?.correctedText, '这是人工校对后的逐字稿')
    const restored = await store.restoreCorrection({
      downloadId: 'lesson-1',
      segmentId: 'segment-1'
    })
    assert.equal(restored.transcript?.corrections.at(-1)?.correctedText, '这是原始逐字稿')

    const results = await store.search({ query: '原始逐字稿' })
    assert.equal(results[0]?.downloadId, 'lesson-1')

    const beforeSettings = await store.getAiSettings()
    const defaultMindmapPrompt = beforeSettings.prompts.find((prompt) => prompt.id === 'mindmap')
    assert.equal(defaultMindmapPrompt?.version, 2)
    assert.match(defaultMindmapPrompt?.systemPrompt ?? '', /Mermaid flowchart/u)
    const editedSettings = await store.saveAiSettings({
      ...beforeSettings,
      prompts: beforeSettings.prompts.map((prompt) =>
        prompt.id === 'summary'
          ? { ...prompt, systemPrompt: `${prompt.systemPrompt}\n保留反例。` }
          : prompt
      )
    })
    assert.equal(
      editedSettings.prompts.find((prompt) => prompt.id === 'summary')?.version,
      (beforeSettings.prompts.find((prompt) => prompt.id === 'summary')?.version ?? 0) + 1
    )

    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        store.save({
          downloadId: `parallel-${index}`,
          goal: '',
          notes: [],
          sourceUrl: null,
          title: `并发课程 ${index}`
        })
      )
    )
    assert.equal((await store.list()).length, 42)

    const atomicCreatedAt = Date.now()
    const emptyCommentHighlight = {
      completed: false,
      createdAt: atomicCreatedAt,
      highlightColor: 'amber' as const,
      id: 'highlight-without-comment',
      kind: 'bookmark' as const,
      quote: '只高亮原文，不强迫用户同时填写备注',
      sourceEndOffset: 15,
      sourceSegmentIds: ['segment-highlight'],
      sourceStartOffset: 0,
      text: '',
      timestampMs: 3000,
      updatedAt: atomicCreatedAt
    }
    await store.upsertNote({
      downloadId: 'atomic-lesson',
      note: emptyCommentHighlight
    })
    const atomicNotes = Array.from({ length: 24 }, (_, index) => ({
      completed: false,
      createdAt: atomicCreatedAt + index + 1,
      highlightColor: 'blue' as const,
      id: `atomic-note-${index}`,
      kind: 'insight' as const,
      quote: `并发原文 ${index}`,
      sourceEndOffset: null,
      sourceSegmentIds: [`segment-${index}`],
      sourceStartOffset: null,
      text: `并发备注 ${index}`,
      timestampMs: index * 1000,
      updatedAt: atomicCreatedAt + index + 1
    }))
    const atomicBlocks = Array.from({ length: 24 }, (_, index) => ({
      attachmentPath: null,
      completed: false,
      content: `并发 AI 输出 ${index}`,
      createdAt: atomicCreatedAt + index + 1,
      id: `atomic-block-${index}`,
      kind: 'ai' as const,
      quote: `模块 ${index}`,
      sourceSegmentIds: [],
      timestampMs: null,
      updatedAt: atomicCreatedAt + index + 1
    }))
    const noteToUpdate = atomicNotes.at(1)
    const blockToUpdate = atomicBlocks.at(1)
    assert.ok(noteToUpdate)
    assert.ok(blockToUpdate)
    await Promise.all([
      ...atomicNotes.map((note) => store.upsertNote({ downloadId: 'atomic-lesson', note })),
      ...atomicBlocks.map((block) => store.upsertBlock({ block, downloadId: 'atomic-lesson' })),
      store.save({ downloadId: 'atomic-lesson', personalNote: '并发保存的个人 Markdown 笔记' })
    ])
    const afterAtomicWrites = await store.get('atomic-lesson')
    assert.equal(afterAtomicWrites?.notes.length, atomicNotes.length + 1)
    assert.equal(afterAtomicWrites?.blocks?.length, atomicBlocks.length)
    assert.equal(afterAtomicWrites?.personalNote, '并发保存的个人 Markdown 笔记')
    assert.equal(
      afterAtomicWrites?.notes.find((note) => note.id === emptyCommentHighlight.id)?.text,
      ''
    )
    assert.equal(
      afterAtomicWrites?.notes.find((note) => note.id === emptyCommentHighlight.id)?.quote,
      emptyCommentHighlight.quote
    )

    await Promise.all([
      store.deleteNote({ downloadId: 'atomic-lesson', noteId: 'atomic-note-0' }),
      store.upsertNote({
        downloadId: 'atomic-lesson',
        note: {
          ...noteToUpdate,
          text: '同 ID 原子更新后的备注',
          updatedAt: Date.now()
        }
      }),
      store.upsertBlock({
        block: {
          ...blockToUpdate,
          content: '同 ID 原子更新后的 AI 输出',
          updatedAt: Date.now()
        },
        downloadId: 'atomic-lesson'
      })
    ])
    const afterAtomicUpdates = await store.get('atomic-lesson')
    assert.equal(
      afterAtomicUpdates?.notes.some((note) => note.id === 'atomic-note-0'),
      false
    )
    assert.equal(
      afterAtomicUpdates?.notes.find((note) => note.id === 'atomic-note-1')?.text,
      '同 ID 原子更新后的备注'
    )
    assert.equal(
      afterAtomicUpdates?.blocks?.find((block) => block.id === 'atomic-block-1')?.content,
      '同 ID 原子更新后的 AI 输出'
    )

    const reloadedAtomicStore = new LearningStore(storePath)
    const reloadedAtomicNotebook = await reloadedAtomicStore.get('atomic-lesson')
    assert.equal(reloadedAtomicNotebook?.notes.length, atomicNotes.length)
    assert.equal(reloadedAtomicNotebook?.blocks?.length, atomicBlocks.length)
    assert.equal(
      reloadedAtomicNotebook?.notes.find((note) => note.id === emptyCommentHighlight.id)?.text,
      ''
    )

    const notesAfterPatch = [
      {
        completed: false,
        createdAt: Date.now(),
        highlightColor: 'blue' as const,
        id: 'note-owned-field',
        kind: 'insight' as const,
        quote: '',
        sourceEndOffset: 6,
        sourceSegmentIds: [],
        sourceStartOffset: 1,
        text: '这条笔记不能被输出区的旧快照覆盖',
        timestampMs: 1000,
        updatedAt: Date.now()
      }
    ]
    await store.save({ downloadId: 'lesson-1', goal: '新目标', notes: notesAfterPatch })
    await store.save({ blocks: [], downloadId: 'lesson-1', scene: 'output', title: '输出标题' })
    const afterIndependentPatches = await store.get('lesson-1')
    assert.equal(afterIndependentPatches?.goal, '新目标')
    assert.equal(afterIndependentPatches?.notes.length, 1)
    assert.equal(afterIndependentPatches?.notes[0]?.id, 'note-owned-field')
    assert.equal(afterIndependentPatches?.notes[0]?.text, notesAfterPatch[0]?.text)
    assert.equal(afterIndependentPatches?.notes[0]?.highlightColor, 'blue')
    assert.equal(afterIndependentPatches?.notes[0]?.sourceStartOffset, 1)
    assert.equal(afterIndependentPatches?.notes[0]?.sourceEndOffset, 6)
    assert.equal(
      afterIndependentPatches?.personalNote,
      '## 我的理解\n\n保留 **Markdown** 和行尾。  '
    )
    assert.equal(afterIndependentPatches?.title, '输出标题')
    assert.equal((await store.search({ query: 'Markdown' }))[0]?.field, 'note')

    const screenshotNotebook = await store.save({
      blocks: [screenshotBlock(ONE_PIXEL_PNG)],
      downloadId: 'screenshot-storage',
      goal: '',
      notes: [],
      title: '截图落盘测试'
    })
    const screenshotReference = screenshotNotebook.blocks[0]?.attachmentPath ?? ''
    assert.match(screenshotReference, /^fengsha-video:\/\/learning-attachments\/[a-f\d]{64}\.png$/u)
    const storedDocument = await fs.readFile(storePath, 'utf8')
    assert.doesNotMatch(storedDocument, /data:image\//u)
    const attachmentFiles = await fs.readdir(path.join(tempRoot, 'learning-attachments'))
    assert.equal(attachmentFiles.length, 1)

    const oversizedPng = `data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')}`
    await assert.rejects(
      store.save({
        blocks: [screenshotBlock(oversizedPng)],
        downloadId: 'screenshot-too-large',
        goal: '',
        notes: [],
        title: '超限截图测试'
      }),
      /attachment|image|limit|large|size/iu
    )

    const outsideAttachment = path.join(tempRoot, 'outside.png')
    await fs.writeFile(outsideAttachment, Buffer.from('not an attachment'))
    await assert.rejects(
      store.save({
        blocks: [screenshotBlock(pathToFileURL(outsideAttachment).href)],
        downloadId: 'screenshot-escape',
        goal: '',
        notes: [],
        title: '路径逃逸测试'
      }),
      /attachment|outside|path|reference/iu
    )

    const exporter = new ObsidianExporter()
    const artifactTime = Date.now()
    const artifactNotebook = {
      ...restored,
      aiArtifacts: [
        {
          content: '原始总结',
          createdAt: artifactTime,
          id: 'summary-v1',
          kind: 'summary' as const,
          model: 'test-model',
          prompt: 'summary prompt',
          promptVersion: 1,
          sourceSegmentIds: ['segment-1'],
          transcriptVersion: 1
        },
        {
          content: '完整翻译结果',
          createdAt: artifactTime + 1,
          id: 'translation-v1',
          kind: 'translation' as const,
          model: 'test-model',
          prompt: 'translation prompt',
          promptVersion: 1,
          sourceSegmentIds: ['segment-1'],
          transcriptVersion: 1
        },
        {
          content: '可分享金句候选',
          createdAt: artifactTime + 2,
          id: 'quotes-v1',
          kind: 'quotes' as const,
          model: 'test-model',
          prompt: 'quotes prompt',
          promptVersion: 1,
          sourceSegmentIds: ['segment-1'],
          transcriptVersion: 1
        },
        {
          content: '原始学习心得',
          createdAt: artifactTime + 3,
          id: 'reflection-v1',
          kind: 'reflection' as const,
          model: 'test-model',
          prompt: 'reflection prompt',
          promptVersion: 1,
          sourceSegmentIds: ['segment-1'],
          transcriptVersion: 1
        }
      ],
      blocks: [
        {
          attachmentPath: null,
          completed: false,
          content: '用户编辑后的总结',
          createdAt: artifactTime,
          id: 'artifact-summary-v1',
          kind: 'ai' as const,
          quote: '',
          sourceSegmentIds: [],
          timestampMs: null,
          updatedAt: artifactTime
        }
      ]
    }
    const artifactPreview = await exporter.preview({
      notebook: artifactNotebook,
      relativePath: '视频学习/来源笔记/AI产物验收.md',
      vaultPath
    })
    assert.match(artifactPreview.content, /用户编辑后的总结/u)
    assert.doesNotMatch(artifactPreview.content, /原始总结/u)
    assert.match(artifactPreview.content, /完整翻译结果/u)
    assert.match(artifactPreview.content, /可分享金句候选/u)
    assert.match(artifactPreview.content, /原始学习心得/u)
    assert.match(artifactPreview.content, /## 我的笔记/u)
    assert.match(artifactPreview.content, /保留 \*\*Markdown\*\*/u)
    assert.match(artifactPreview.content, /## 原文备注/u)

    const firstExport = await exporter.write({ notebook: restored, vaultPath })
    assert.equal(firstExport.status, 'written')
    const originalFile = await fs.readFile(firstExport.absolutePath, 'utf8')
    await fs.writeFile(firstExport.absolutePath, `${originalFile}\n用户手工补充`, 'utf8')
    const unchangedManaged = await exporter.write({
      expectedManagedHash: firstExport.managedHash,
      notebook: restored,
      relativePath: firstExport.relativePath,
      vaultPath
    })
    assert.ok(['unchanged', 'written'].includes(unchangedManaged.status))
    assert.match(await fs.readFile(firstExport.absolutePath, 'utf8'), /用户手工补充/u)

    const attachmentExport = await exporter.write({
      attachments: [
        {
          relativePath: '视频学习/附件/frame-1.png',
          sourcePath: await store.resolveAttachmentSource(screenshotReference)
        }
      ],
      expectedManagedHash: unchangedManaged.managedHash,
      notebook: restored,
      relativePath: firstExport.relativePath,
      vaultPath
    })
    assert.ok(['unchanged', 'written'].includes(attachmentExport.status))
    assert.ok((await fs.stat(path.join(vaultPath, '视频学习', '附件', 'frame-1.png'))).size > 0)

    const concurrentBase = await exporter.preview({
      notebook: restored,
      relativePath: firstExport.relativePath,
      vaultPath
    })
    const concurrentResults = await Promise.all([
      exporter.write({
        expectedManagedHash: concurrentBase.managedHash,
        notebook: { ...restored, goal: '并发目标甲', updatedAt: Date.now() },
        relativePath: firstExport.relativePath,
        vaultPath
      }),
      exporter.write({
        expectedManagedHash: concurrentBase.managedHash,
        notebook: { ...restored, goal: '并发目标乙', updatedAt: Date.now() + 1 },
        relativePath: firstExport.relativePath,
        vaultPath
      })
    ])
    assert.equal(concurrentResults.filter((result) => result.status === 'conflict').length, 1)
    assert.match(await fs.readFile(firstExport.absolutePath, 'utf8'), /用户手工补充/u)

    await assert.rejects(
      exporter.preview({ notebook: restored, relativePath: '../escape.md', vaultPath }),
      /escapes|relative/iu
    )

    const externalPath = path.join(tempRoot, 'outside-vault')
    const junctionPath = path.join(vaultPath, 'outside-link')
    await fs.mkdir(externalPath)
    await fs.writeFile(
      path.join(externalPath, 'existing.md'),
      'vault secret must not be read',
      'utf8'
    )
    await fs.symlink(externalPath, junctionPath, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(
      exporter.preview({
        notebook: restored,
        relativePath: 'outside-link/existing.md',
        vaultPath
      }),
      /outside/iu
    )
    await assert.rejects(
      exporter.preview({
        attachments: [{ dataUrl: ONE_PIXEL_PNG, relativePath: 'outside-link/leak.png' }],
        notebook: restored,
        relativePath: firstExport.relativePath,
        vaultPath
      }),
      /outside/iu
    )
    await assert.rejects(
      exporter.write({
        force: true,
        notebook: restored,
        relativePath: 'outside-link/new/note.md',
        vaultPath
      }),
      /outside/iu
    )
    await assert.rejects(fs.stat(path.join(externalPath, 'new')), { code: 'ENOENT' })

    const corruptStorePath = path.join(tempRoot, 'corrupt.json')
    await fs.writeFile(corruptStorePath, '{not-json', 'utf8')
    assert.deepEqual(await new LearningStore(corruptStorePath).list(), [])
    const recoveredFiles = await fs.readdir(tempRoot)
    assert.ok(recoveredFiles.some((name) => name.startsWith('corrupt.json.corrupt-')))

    process.stdout.write('Learning workspace smoke test passed.\n')
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true })
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
