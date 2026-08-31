import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(desktopRoot, '..', '..')
const outputPath = path.join(workspaceRoot, 'output', 'e2e-learning-studio')
const packagedExecutable = process.env.VIDBEE_E2E_EXECUTABLE
  ? path.resolve(process.env.VIDBEE_E2E_EXECUTABLE)
  : null
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fengsha-learning-e2e-'))
const descriptorPath = path.join(tempRoot, 'automation.json')
const productionDescriptorPath = path.join(
  process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming'),
  'VidBee',
  'automation.json'
)

assert.notEqual(
  path.resolve(descriptorPath),
  path.resolve(productionDescriptorPath),
  'E2E automation descriptor must not use the production path'
)

const assertContained = async (child, parent, label) => {
  const [childBox, parentBox] = await Promise.all([child.boundingBox(), parent.boundingBox()])
  assert.ok(childBox, `${label} has no visible bounds`)
  assert.ok(parentBox, `${label} container has no visible bounds`)
  assert.ok(childBox.x >= parentBox.x - 1, `${label} clips on the left`)
  assert.ok(
    childBox.x + childBox.width <= parentBox.x + parentBox.width + 1,
    `${label} clips on the right`
  )
}

const dismissTransientToasts = async (page) => {
  const closeButtons = page.locator('[data-sonner-toast] [data-close-button]')
  for (let index = (await closeButtons.count()) - 1; index >= 0; index -= 1) {
    await closeButtons.nth(index).click({ force: true })
  }
  await page
    .locator('[data-sonner-toast][data-visible="true"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => undefined)
}

const waitForClipboardText = async (app, expected) => {
  const deadline = Date.now() + 2000
  let actual = ''
  while (Date.now() < deadline) {
    actual = (await app.evaluate(({ clipboard }) => clipboard.readText())).replaceAll('\r\n', '\n')
    if (actual === expected) {
      return actual
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return actual
}

await fs.mkdir(outputPath, { recursive: true })
const fixtureNow = Date.now()
await fs.writeFile(
  path.join(tempRoot, 'ai.json'),
  `${JSON.stringify(
    {
      activeProviderId: 'e2e-local-model',
      imageProvider: {
        apiKeyHeader: 'api-key',
        apiKeySealed: '',
        authType: 'none',
        baseUrl: 'http://127.0.0.1:34123/v1',
        hasApiKey: false,
        modelId: 'gpt-image-2',
        provider: 'openai-compatible',
        updatedAt: fixtureNow
      },
      prompts: [],
      providers: [
        {
          apiKeySealed: '',
          baseUrl: 'http://127.0.0.1:1234/v1',
          createdAt: fixtureNow,
          hasApiKey: false,
          id: 'e2e-local-model',
          modelId: 'local-study-model',
          name: '本地测试模型',
          presetId: 'lmstudio',
          updatedAt: fixtureNow
        }
      ]
    },
    null,
    2
  )}\n`,
  'utf8'
)
await fs.writeFile(
  path.join(tempRoot, 'learning-notebooks.json'),
  `${JSON.stringify(
    {
      notebooks: [
        {
          aiArtifacts: [],
          blocks: [
            {
              attachmentPath: null,
              completed: false,
              content: 'flowchart LR\n  A[Source] --> B[Insight]',
              createdAt: fixtureNow,
              id: 'legacy-placeholder',
              kind: 'mermaid',
              quote: '',
              sourceSegmentIds: [],
              timestampMs: null,
              updatedAt: fixtureNow
            },
            {
              attachmentPath: null,
              completed: false,
              content:
                '```mermaid\nmindmap\n  root((视频学习))\n    证据链\n      原始证据 00:00:05\n      深层结论\n    形成可复用洞察\n```',
              createdAt: fixtureNow + 1,
              id: 'validated-learning-diagram',
              kind: 'ai',
              quote: '思维导图',
              sourceSegmentIds: ['ai-module:diagram'],
              timestampMs: null,
              updatedAt: fixtureNow + 1
            },
            {
              attachmentPath:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              completed: false,
              content: '端到端测试生成图',
              createdAt: fixtureNow + 2,
              id: 'generated-learning-image',
              kind: 'screenshot',
              quote: 'AI 生成的学习图片',
              sourceSegmentIds: ['generated-image:visual'],
              timestampMs: null,
              updatedAt: fixtureNow + 2
            }
          ],
          createdAt: fixtureNow,
          downloadId: 'fengsha-e2e-lesson',
          goal: '验证 AI 优先的视频学习输出闭环',
          notes: [],
          obsidian: { lastExportedAt: null, managedHash: null, relativePath: null },
          scene: 'output',
          source: {
            author: '风沙',
            canonicalUrl: 'https://www.youtube.com/watch?v=fengsha-e2e',
            courseTitle: '端到端测试',
            durationMs: 60_000,
            importedAt: fixtureNow,
            localPath: null,
            platform: 'youtube',
            playlistId: null,
            sourceId: 'source-fengsha-e2e',
            thumbnailUrl: null,
            title: 'AI 优先学习工作台验收'
          },
          sourceUrl: 'https://www.youtube.com/watch?v=fengsha-e2e',
          title: 'AI 优先学习工作台验收',
          transcript: {
            corrections: [],
            segments: [
              {
                endMs: 30_000,
                id: 'segment-1',
                originalText: '学习视频不应该看完就忘，而应该留下可以搜索并跳回原片的逐字稿。',
                speakerId: 'speaker-1',
                startMs: 0,
                translatedText: ''
              },
              {
                endMs: 60_000,
                id: 'segment-2',
                originalText:
                  '重要概念应由 AI 整理成总结、问题、金句和可视化图解，再由学习者修改。',
                speakerId: 'speaker-1',
                startMs: 30_000,
                translatedText: ''
              }
            ],
            sourceHistory: [],
            sourceVersionId: 'source-fengsha-e2e-v1',
            updatedAt: fixtureNow,
            version: 1
          },
          updatedAt: fixtureNow,
          version: 2,
          workspaceId: 'workspace-fengsha-e2e'
        }
      ],
      version: 2
    },
    null,
    2
  )}\n`,
  'utf8'
)

const fixtureDatabase = new Database(path.join(tempRoot, 'vidbee.db'))
fixtureDatabase.exec(`
  CREATE TABLE transcripts (
    id TEXT PRIMARY KEY,
    download_task_id TEXT NOT NULL,
    transcription_task_id TEXT NOT NULL,
    result_kind TEXT NOT NULL,
    model_version TEXT NOT NULL,
    asr_tier TEXT,
    language TEXT,
    source_file_path TEXT,
    source_kind TEXT,
    superseded_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE transcript_speakers (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    sort_index INTEGER NOT NULL
  );
  CREATE TABLE transcript_segments (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker_id TEXT,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    words_json TEXT,
    confidence REAL,
    sort_index INTEGER NOT NULL
  );
`)
fixtureDatabase
  .prepare(
    `INSERT INTO transcripts (
      id, download_task_id, transcription_task_id, result_kind, model_version, asr_tier,
      language, source_file_path, source_kind, superseded_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(
    'transcript-fengsha-e2e',
    'fengsha-e2e-lesson',
    'transcription-fengsha-e2e',
    'transcript',
    'e2e-word-timing-v1',
    'balanced',
    'zh',
    null,
    'asr',
    null,
    fixtureNow,
    fixtureNow
  )
fixtureDatabase
  .prepare(
    'INSERT INTO transcript_speakers (id, transcript_id, speaker_key, display_name, sort_index) VALUES (?, ?, ?, ?, ?)'
  )
  .run('speaker-1', 'transcript-fengsha-e2e', 'speaker-1', 'Speaker 1', 0)
const insertFixtureSegment = fixtureDatabase.prepare(
  `INSERT INTO transcript_segments (
    id, transcript_id, speaker_id, start_ms, end_ms, text, words_json, confidence, sort_index
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
insertFixtureSegment.run(
  'segment-1',
  'transcript-fengsha-e2e',
  'speaker-1',
  0,
  30_000,
  '学习视频不应该看完就忘，而应该留下可以搜索并跳回原片的逐字稿。',
  JSON.stringify([
    { endMs: 5000, startMs: 0, text: '学习视频' },
    { endMs: 9000, startMs: 5000, text: '不应该' },
    { endMs: 14_000, startMs: 9000, text: '看完就忘，' },
    { endMs: 20_000, startMs: 14_000, text: '而应该留下' },
    { endMs: 30_000, startMs: 20_000, text: '可以搜索并跳回原片的逐字稿。' }
  ]),
  0.98,
  0
)
insertFixtureSegment.run(
  'segment-2',
  'transcript-fengsha-e2e',
  'speaker-1',
  30_000,
  60_000,
  '重要概念应由 AI 整理成总结、问题、金句和可视化图解，再由学习者修改。',
  JSON.stringify([
    { endMs: 36_000, startMs: 30_000, text: '重要概念' },
    { endMs: 44_000, startMs: 36_000, text: '应由 AI 整理成' },
    { endMs: 52_000, startMs: 44_000, text: '总结、问题、金句和可视化图解，' },
    { endMs: 60_000, startMs: 52_000, text: '再由学习者修改。' }
  ]),
  0.97,
  1
)
fixtureDatabase.close()

let app
let descriptorRemovedOnQuit = false
try {
  app = await electron.launch({
    args: packagedExecutable ? [] : ['.'],
    cwd: desktopRoot,
    env: {
      ...process.env,
      VIDBEE_AUTOMATION_DESCRIPTOR: descriptorPath,
      VIDBEE_E2E: '1',
      VIDBEE_E2E_USER_DATA: tempRoot
    },
    executablePath: packagedExecutable ?? electronPath,
    timeout: 60_000
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const pageErrors = []
  page.on('pageerror', (error) =>
    pageErrors.push({ message: error.message, name: error.name, stack: error.stack })
  )
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(900, 700)
    window?.show()
    window?.focus()
  })
  await page.waitForLoadState('domcontentloaded')

  await page.getByText('创建学习资料', { exact: true }).waitFor({ timeout: 30_000 })
  const homeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  assert.ok(homeOverflow <= 1, `900px home horizontal overflow: ${homeOverflow}px`)
  const homeHero = page.locator('.learning-home-shell')
  await assertContained(
    page.getByRole('heading', { name: /今天想从什么开始学/u }),
    homeHero,
    'home title'
  )
  await assertContained(page.getByText(/选择一个来源/u), homeHero, 'home description')
  await assertContained(
    page.getByRole('button', { name: '学习资料库' }),
    homeHero,
    'home learning button'
  )
  await page.screenshot({ fullPage: true, path: path.join(outputPath, '00-home-900.png') })

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000)
  })
  await page.waitForTimeout(100)

  await page.evaluate(() => {
    window.location.hash = '#/learning'
  })
  await page.getByRole('heading', { name: '学习资料库' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(100)
  await page.screenshot({ fullPage: true, path: path.join(outputPath, '01-learning-center.png') })

  await page.evaluate(() => {
    window.location.hash = '#/settings?tab=learning-automation'
  })
  await page.getByText('学习 AI 工作流', { exact: true }).waitFor({ timeout: 30_000 })
  assert.equal(await page.locator('textarea[id^="learning-prompt-"]').count(), 5)
  await page.screenshot({ fullPage: true, path: path.join(outputPath, '02-ai-workflows.png') })

  await page.evaluate(() => {
    window.location.hash = '#/settings?tab=providers'
  })
  await page.getByText('文字模型', { exact: true }).waitFor({ timeout: 30_000 })
  await page.getByText('图片模型', { exact: true }).waitFor({ timeout: 30_000 })
  await page.screenshot({ fullPage: true, path: path.join(outputPath, '03-ai-providers.png') })

  await page.evaluate(() => {
    window.location.hash = '#/settings?tab=companion'
  })
  await page.getByText('浏览器学习助手', { exact: true }).waitFor({ timeout: 30_000 })
  const pairingCode = (await page.locator('code').first().textContent())?.trim() ?? ''
  assert.match(pairingCode, /^\d{6}$/u)
  const portText =
    (await page
      .getByText(/本机端口/u)
      .first()
      .textContent()) ?? ''
  const port = Number(portText.match(/\d{5}/u)?.[0])
  assert.ok(port >= 27_100 && port <= 27_120)
  const automationDescriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'))
  assert.equal(automationDescriptor.port, port)
  await page.screenshot({ fullPage: true, path: path.join(outputPath, '04-browser-companion.png') })

  const baseUrl = `http://127.0.0.1:${port}/companion/v1`
  const forbiddenOrigin = await fetch(`${baseUrl}/status`, {
    headers: { Origin: 'https://attacker.example' }
  })
  assert.equal(forbiddenOrigin.status, 403)
  const badPair = await fetch(`${baseUrl}/pair`, {
    body: JSON.stringify({ clientName: 'E2E', code: '000000' }),
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdefghijklmnop' },
    method: 'POST'
  })
  assert.equal(badPair.status, 401)
  const paired = await fetch(`${baseUrl}/pair`, {
    body: JSON.stringify({ clientName: 'E2E browser companion', code: pairingCode }),
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdefghijklmnop' },
    method: 'POST'
  })
  assert.equal(paired.status, 200)
  const { token } = await paired.json()
  assert.equal(typeof token, 'string')
  const captured = await fetch(`${baseUrl}/capture`, {
    body: JSON.stringify({
      action: 'time-marker',
      captionCues: [{ endSeconds: 14, startSeconds: 12, text: '测试字幕' }],
      captionLanguage: 'zh-CN',
      captionText: '测试字幕',
      currentTimeSeconds: 12,
      durationSeconds: 60,
      pageUrl: 'https://www.youtube.com/watch?v=fengsha-e2e',
      platform: 'youtube',
      screenshotDataUrl: null,
      selectedText: '第一性原理',
      title: '浏览器桥接测试'
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'chrome-extension://abcdefghijklmnop'
    },
    method: 'POST'
  })
  assert.equal(captured.status, 202)
  const reusedCode = await fetch(`${baseUrl}/pair`, {
    body: JSON.stringify({ clientName: 'Reused code', code: pairingCode }),
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdefghijklmnop' },
    method: 'POST'
  })
  assert.equal(reusedCode.status, 401)

  await page.evaluate(() => {
    window.location.hash = '#/learning'
  })
  const continueButton = page.getByRole('button', { name: /AI 优先学习工作台验收/u }).first()
  await continueButton.waitFor({ timeout: 30_000 })
  let studioOpened = false
  {
    await continueButton.focus()
    await page.keyboard.press('Enter')
    await page.locator('[data-study-scene]').waitFor({ timeout: 30_000 })
    await dismissTransientToasts(page)
    studioOpened = true
    await page.locator('[data-study-region="video"]:visible').waitFor()
    await page.locator('[data-study-region="transcript"]:visible').waitFor()
    await page.locator('[data-study-region="note"]:visible').waitFor()
    await page.locator('[data-study-region="output"]:visible').waitFor()

    const outputRegion = page.locator('[data-study-region="output"]:visible')
    const noteRegion = page.locator('[data-study-region="note"]:visible')
    await page.getByRole('button', { exact: true, name: '隐藏学习笔记' }).click()
    await page.locator('[data-study-region="note"]:visible').waitFor({ state: 'hidden' })
    await page.getByRole('button', { exact: true, name: '展开学习笔记' }).click()
    await noteRegion.waitFor()
    await page.getByRole('button', { exact: true, name: '隐藏 AI 工作区' }).click()
    await page.locator('[data-study-region="output"]:visible').waitFor({ state: 'hidden' })
    await page.getByRole('button', { exact: true, name: '展开 AI 工作区' }).click()
    await outputRegion.waitFor()
    const outputWidthBeforeNudge = (await outputRegion.boundingBox())?.width ?? 0
    const storedOutputWidthBeforeNudge = await page.evaluate(() => {
      const value = JSON.parse(
        window.localStorage.getItem('fengsha-study-studio-layout-v1') ?? '{}'
      )
      return Number(value.leftWidth)
    })
    const outputResizeHandle = page.getByRole('button', {
      exact: true,
      name: '调整 AI 工作区宽度'
    })
    await outputResizeHandle.focus()
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      '调整 AI 工作区宽度'
    )
    const outputResizeKey = storedOutputWidthBeforeNudge >= 600 ? 'ArrowLeft' : 'ArrowRight'
    await page.keyboard.press(outputResizeKey)
    await page.waitForFunction(
      (before) => {
        const value = JSON.parse(
          window.localStorage.getItem('fengsha-study-studio-layout-v1') ?? '{}'
        )
        return Number(value.leftWidth) !== before
      },
      storedOutputWidthBeforeNudge,
      { timeout: 2000 }
    )
    const outputWidthAfterNudge = (await outputRegion.boundingBox())?.width ?? 0
    const storedOutputWidthAfterNudge = await page.evaluate(() => {
      const value = JSON.parse(
        window.localStorage.getItem('fengsha-study-studio-layout-v1') ?? '{}'
      )
      return Number(value.leftWidth)
    })
    assert.ok(
      outputResizeKey === 'ArrowRight'
        ? storedOutputWidthAfterNudge > storedOutputWidthBeforeNudge
        : storedOutputWidthAfterNudge < storedOutputWidthBeforeNudge,
      'keyboard resizing should persist the requested AI workspace width'
    )
    assert.ok(
      outputResizeKey === 'ArrowRight'
        ? outputWidthAfterNudge >= outputWidthBeforeNudge
        : outputWidthAfterNudge <= outputWidthBeforeNudge,
      'keyboard resizing must visually follow the requested direction'
    )

    const tokenTabStops = await page
      .locator('[data-caption-token="true"]')
      .evaluateAll(
        (tokens) =>
          tokens.filter((token) => token instanceof HTMLElement && token.tabIndex !== -1).length
      )
    assert.equal(tokenTabStops, 0, 'word-level transcript tokens must not flood the tab order')
    const segmentTabStops = await page
      .locator('[data-segment-id]')
      .evaluateAll((segments) =>
        segments.map((segment) => segment.querySelectorAll('button:not([tabindex="-1"])').length)
      )
    assert.ok(segmentTabStops.length > 0, 'at least one transcript segment should be rendered')
    assert.ok(
      segmentTabStops.every((count) => count === 2),
      `each rendered transcript segment should expose row and edit keyboard entries: ${segmentTabStops.join(',')}`
    )
    const firstTimedTokens = page.locator(
      '[data-segment-id="segment-1"]:visible [data-caption-token="true"]'
    )
    assert.ok((await firstTimedTokens.count()) > 1, 'segment-1 must exercise stored word timings')
    assert.equal(
      (await firstTimedTokens.allTextContents()).join(''),
      '学习视频不应该看完就忘，而应该留下可以搜索并跳回原片的逐字稿。'
    )

    const selectTranscriptOffsets = async (startRow, startOffset, endRow, endOffset) => {
      await page.locator('[data-testid="transcript-captions-list"]').evaluate((list) => {
        list.scrollTop = 0
        list.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await page.locator('[data-transcript-text="true"]:visible').first().waitFor()
      await page.evaluate(
        ({ endOffset, endRow, startOffset, startRow }) => {
          const rows = [...document.querySelectorAll('[data-transcript-text="true"]')].filter(
            (row) => row.getClientRects().length > 0
          )
          if (!rows[endRow] && endRow === 1 && rows[0]) {
            const clone = rows[0].cloneNode(true)
            clone.setAttribute('data-native-selection-test-clone', 'true')
            document.querySelector('[data-testid="transcript-captions-list"]')?.append(clone)
            rows.push(clone)
          }
          const endpoint = (root, offset) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            let remaining = offset
            let node = walker.nextNode()
            while (node) {
              if (remaining <= node.textContent.length) {
                return { node, offset: remaining }
              }
              remaining -= node.textContent.length
              node = walker.nextNode()
            }
            throw new Error('Transcript selection offset is outside rendered text')
          }
          const start = endpoint(rows[startRow], startOffset)
          const end = endpoint(rows[endRow], endOffset)
          const range = document.createRange()
          range.setStart(start.node, start.offset)
          range.setEnd(end.node, end.offset)
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
          document
            .querySelector('[data-testid="transcript-captions-list"]')
            .dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
        },
        { endOffset, endRow, startOffset, startRow }
      )
      await page.locator('[data-testid="transcript-selection-toolbar"]').waitFor()
    }
    await selectTranscriptOffsets(0, 0, 0, 4)
    const movableToolbar = page.locator('[data-testid="transcript-selection-toolbar"]')
    const toolbarBeforeDrag = await movableToolbar.boundingBox()
    assert.ok(toolbarBeforeDrag, 'selection toolbar should have visible bounds before dragging')
    const viewportSize = await page.evaluate(() => ({ height: innerHeight, width: innerWidth }))
    const dragX = toolbarBeforeDrag.x > viewportSize.width / 2 ? -80 : 80
    const dragY = toolbarBeforeDrag.y > viewportSize.height / 2 ? -40 : 40
    await page.mouse.move(toolbarBeforeDrag.x + 12, toolbarBeforeDrag.y + 18)
    await page.mouse.down()
    await page.mouse.move(toolbarBeforeDrag.x + 12 + dragX, toolbarBeforeDrag.y + 18 + dragY, {
      steps: 5
    })
    await page.mouse.up()
    const toolbarAfterDrag = await movableToolbar.boundingBox()
    assert.ok(toolbarAfterDrag, 'selection toolbar should remain visible after dragging')
    assert.ok(
      Math.abs(toolbarAfterDrag.x - toolbarBeforeDrag.x) > 30 ||
        Math.abs(toolbarAfterDrag.y - toolbarBeforeDrag.y) > 20,
      'selection toolbar should move when dragged'
    )
    await page.locator('.study-studio-header').click({ position: { x: 20, y: 20 } })
    await movableToolbar.waitFor({ state: 'detached' })
    await selectTranscriptOffsets(0, 2, 0, 5)
    await page
      .locator('[data-testid="transcript-selection-toolbar"]')
      .getByRole('button', { exact: true, name: '复制' })
      .click()
    assert.equal(await waitForClipboardText(app, '视频不'), '视频不')
    await page.waitForTimeout(100)
    await selectTranscriptOffsets(0, 2, 0, 5)
    await page
      .locator('[data-testid="transcript-selection-toolbar"]')
      .getByRole('button', { exact: true, name: '高亮' })
      .click()
    const exactHighlight = page.locator(
      '[data-segment-id="segment-1"]:visible [data-transcript-highlight="true"]'
    )
    await exactHighlight.first().waitFor()
    assert.equal((await exactHighlight.allTextContents()).join(''), '视频不')
    const exactHighlightRanges = await exactHighlight.evaluateAll((marks) =>
      marks.map((mark) => [
        Number(mark.getAttribute('data-highlight-start')),
        Number(mark.getAttribute('data-highlight-end'))
      ])
    )
    assert.equal(exactHighlightRanges[0]?.[0], 2)
    assert.equal(exactHighlightRanges.at(-1)?.[1], 5)
    assert.ok(
      exactHighlightRanges.every(
        (range, index) => index === 0 || exactHighlightRanges[index - 1]?.[1] === range[0]
      ),
      'karaoke token highlight slices must cover one continuous source range'
    )
    assert.ok(
      (
        await page
          .locator('[data-segment-id="segment-1"]:visible [data-transcript-text="true"]')
          .innerText()
      ).length > '视频不'.length,
      'an exact highlight must not paint the whole transcript row'
    )
    await selectTranscriptOffsets(0, 2, 1, 3)
    await page
      .locator('[data-testid="transcript-selection-toolbar"]')
      .getByRole('button', { exact: true, name: '复制' })
      .click()
    assert.equal(
      await waitForClipboardText(
        app,
        '视频不应该看完就忘，而应该留下可以搜索并跳回原片的逐字稿。\n重要概'
      ),
      '视频不应该看完就忘，而应该留下可以搜索并跳回原片的逐字稿。\n重要概'
    )
    await selectTranscriptOffsets(0, 2, 1, 3)
    await page
      .locator('[data-testid="transcript-selection-toolbar"]')
      .getByRole('button', { exact: true, name: '高亮' })
      .click()
    const crossLineEndHighlight = page.locator(
      '[data-segment-id="segment-2"]:visible [data-transcript-highlight="true"]'
    )
    await crossLineEndHighlight.first().waitFor()
    assert.equal((await crossLineEndHighlight.allTextContents()).join(''), '重要概')
    assert.equal(
      (
        await page
          .locator('[data-segment-id="segment-1"]:visible [data-transcript-highlight="true"]')
          .allTextContents()
      ).join(''),
      '视频不应该看完就忘，而应该留下可以搜索并跳回原片的逐字稿。'
    )
    await page.locator('[data-native-selection-test-clone="true"]').evaluateAll((clones) => {
      for (const clone of clones) {
        clone.remove()
      }
    })

    const firstTranscriptRow = page.locator('[data-segment-id="segment-1"]:visible').first()
    await firstTranscriptRow
      .getByTestId('transcript-caption-edit')
      .evaluate((button) => button.click())
    const correction = '学习视频要留下可搜索、可跳转的逐字稿。'
    await firstTranscriptRow.getByTestId('transcript-caption-editor').fill(correction)
    await firstTranscriptRow.getByTestId('transcript-caption-editor').press('Enter')
    await firstTranscriptRow.getByText(correction, { exact: true }).waitFor()
    const correctedTokens = firstTranscriptRow.locator('[data-caption-token="true"]')
    assert.ok((await correctedTokens.count()) > 1)
    assert.equal((await correctedTokens.allTextContents()).join(''), correction)
    assert.equal(
      await correctedTokens.filter({ hasText: '不应该' }).count(),
      0,
      'corrected FollowText must not retain tokens from the original ASR words'
    )
    const personalNote = '立即离开页面也不能丢失这条个人 Markdown 笔记。'
    await noteRegion.getByLabel('我的笔记').fill(personalNote)
    await dismissTransientToasts(page)
    await selectTranscriptOffsets(0, 0, 0, 4)
    await page
      .locator('[data-testid="transcript-selection-toolbar"]')
      .getByRole('button', { exact: true, name: '加入笔记' })
      .click()
    const visibleNotebookEditor = noteRegion.getByTestId('learning-notebook-editor')
    const noteDeadline = Date.now() + 10_000
    let capturedNotebookValue = ''
    while (Date.now() < noteDeadline) {
      capturedNotebookValue = await visibleNotebookEditor.inputValue()
      if (
        capturedNotebookValue.includes('立即离开页面') &&
        capturedNotebookValue.includes('[▶ 0:00]') &&
        capturedNotebookValue.includes('> 学习视频')
      ) {
        break
      }
      await page.waitForTimeout(100)
    }
    assert.ok(
      capturedNotebookValue.includes('立即离开页面') &&
        capturedNotebookValue.includes('[▶ 0:00]') &&
        capturedNotebookValue.includes('> 学习视频'),
      `visible notebook did not receive the selected transcript quote: ${capturedNotebookValue}`
    )
    await noteRegion.getByRole('button', { exact: true, name: '预览' }).click()
    await page.getByText(personalNote, { exact: true }).waitFor()
    await page.getByText('学习视频', { exact: true }).waitFor()
    await page.screenshot({ fullPage: true, path: path.join(outputPath, '04-note-scene.png') })

    await outputRegion.waitFor()
    for (const moduleName of [
      '思维导图',
      '精华速览',
      '完整总结',
      '模板总结',
      'AI 学习',
      '文字大纲',
      'AI 播客',
      '翻译润色',
      '一图胜千言'
    ]) {
      await outputRegion.getByRole('button', { exact: true, name: moduleName }).waitFor()
    }
    await outputRegion.getByRole('button', { exact: true, name: '思维导图' }).click()
    const mindmap = outputRegion.getByTestId('interactive-learning-mindmap')
    await mindmap.waitFor({ timeout: 15_000 })
    await mindmap.getByRole('button', { exact: true, name: '展开“证据链”' }).waitFor()
    const collapsedNodeCount = await mindmap.locator('[data-mindmap-node-id]').count()
    assert.equal(
      await mindmap.getByText('深层结论', { exact: true }).count(),
      0,
      'deeper nodes should stay hidden until the learner expands a branch'
    )
    await mindmap.getByRole('button', { exact: true, name: '展开“证据链”' }).click()
    await mindmap.getByText('深层结论', { exact: true }).waitFor()
    const expandedNodeCount = await mindmap.locator('[data-mindmap-node-id]').count()
    assert.ok(
      expandedNodeCount > collapsedNodeCount,
      'expanding a mind-map branch should reveal deeper nodes'
    )
    await mindmap.getByRole('button', { exact: true, name: '收起“证据链”' }).click()
    await page.waitForTimeout(100)
    assert.ok(
      (await mindmap.locator('[data-mindmap-node-id]').count()) < expandedNodeCount,
      'collapsing a mind-map branch should hide deeper nodes'
    )
    await mindmap.getByRole('button', { exact: true, name: '展开“证据链”' }).click()
    await mindmap.getByText('深层结论', { exact: true }).waitFor()
    await page.screenshot({ fullPage: true, path: path.join(outputPath, '04b-mindmap.png') })
    await outputRegion.getByRole('button', { exact: true, name: '一图胜千言' }).click()
    await outputRegion.getByLabel('这张图需要表达什么？').fill('黑金编辑风，留出中文排版安全区。')
    await outputRegion.getByRole('button', { exact: true, name: '16:9 画面比例' }).click()
    assert.equal(
      await outputRegion
        .getByRole('button', { exact: true, name: '16:9 画面比例' })
        .getAttribute('aria-pressed'),
      'true'
    )
    await outputRegion.getByRole('button', { name: /AI 提示词优化/u }).waitFor()
    await outputRegion.getByRole('button', { exact: true, name: '打开生成图片查看器' }).click()
    const imageViewer = page.getByRole('dialog')
    await imageViewer.waitFor()
    await imageViewer.getByRole('button', { exact: true, name: '放大' }).click()
    await imageViewer.getByText('125%', { exact: true }).waitFor()
    await page.screenshot({ fullPage: true, path: path.join(outputPath, '05-image-viewer.png') })
    await page.keyboard.press('Escape')
    await imageViewer.waitFor({ state: 'hidden' })
    await page.screenshot({ fullPage: true, path: path.join(outputPath, '05-output-scene.png') })

    await page.evaluate(() => {
      window.location.hash = '#/learning'
    })
    await page.getByRole('heading', { name: '学习资料库' }).waitFor({ timeout: 30_000 })
    await page
      .getByRole('button', { name: /AI 优先学习工作台验收/u })
      .first()
      .click()
    await page.locator('[data-study-scene]').waitFor({ timeout: 30_000 })
    const reopenedNoteRegion = page.locator('[data-study-region="note"]:visible')
    await reopenedNoteRegion.getByLabel('我的笔记').waitFor({ timeout: 10_000 })
    assert.match(await reopenedNoteRegion.getByLabel('我的笔记').inputValue(), /立即离开页面/u)
    assert.match(await reopenedNoteRegion.getByLabel('我的笔记').inputValue(), /> 学习视频/u)
    await reopenedNoteRegion.getByRole('button', { exact: true, name: '预览' }).click()
    await page.getByText(personalNote, { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByText('学习视频', { exact: true }).waitFor({ timeout: 10_000 })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(100)
    await page.screenshot({
      fullPage: true,
      path: path.join(outputPath, '12-study-studio-dark.png')
    })
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
  }

  await page.evaluate(() => {
    window.location.hash = '#/learning'
  })
  await page.getByRole('heading', { name: '学习资料库' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(100)
  const lightOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  assert.ok(lightOverflow <= 1, `learning center horizontal overflow: ${lightOverflow}px`)

  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(100)
  await page.screenshot({
    fullPage: true,
    path: path.join(outputPath, '06-learning-center-dark.png')
  })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.unmaximize()
    window?.setSize(900, 700)
  })
  await page.waitForTimeout(250)
  const compactOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  assert.ok(compactOverflow <= 1, `compact learning center overflow: ${compactOverflow}px`)
  await page.screenshot({
    fullPage: true,
    path: path.join(outputPath, '07-learning-center-compact.png')
  })

  const compactContinue = page.getByRole('button', { name: /AI 优先学习工作台验收/u }).first()
  await compactContinue.waitFor({ timeout: 30_000 })
  {
    await compactContinue.click()
    await page.locator('[data-study-scene]').waitFor({ timeout: 30_000 })
    const compactShell = page.locator('[data-study-scene]')
    const compactWatch = page.locator('[data-scene="watch"]:visible')
    const compactNoteScene = page.locator('[data-scene="note"]:visible')
    await compactWatch.click()
    await compactShell.evaluate((element) => {
      element.scrollTop = 0
    })
    await compactWatch.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-scene') === 'note')
    assert.equal(await compactNoteScene.getAttribute('aria-selected'), 'true')
    const compactNote = page.locator('[data-study-region="note"]:visible')
    await compactNote.waitFor()
    const compactNoteBox = await compactNote.boundingBox()
    assert.ok(compactNoteBox && compactNoteBox.y >= 0 && compactNoteBox.y < 700)
    await page.screenshot({
      fullPage: true,
      path: path.join(outputPath, '08-note-scene-compact.png')
    })
    await page.locator('[data-scene="output"]:visible').click()
    const compactOutput = page.locator('[data-study-region="output"]:visible')
    await compactOutput.waitFor()
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-study-region') === 'output'
    )
    const compactOutputBox = await compactOutput.boundingBox()
    assert.ok(compactOutputBox && compactOutputBox.y >= 0 && compactOutputBox.y < 700)
    const compactStudioOverflow = await compactShell.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    )
    assert.ok(compactStudioOverflow <= 1, `compact studio overflow: ${compactStudioOverflow}px`)
    await page.screenshot({
      fullPage: true,
      path: path.join(outputPath, '09-output-scene-compact.png')
    })

    await compactOutput.getByRole('button', { exact: true, name: '一图胜千言' }).click()
    await compactOutput.getByLabel('这张图需要表达什么？').waitFor()
  }

  assert.deepEqual(pageErrors, [])
  process.stdout.write(
    `${JSON.stringify({
      outputPath,
      pairingPort: port,
      studioOpened
    })}\n`
  )
} finally {
  if (app) {
    const appProcess = app.process()
    const exited = new Promise((resolve) => appProcess.once('exit', resolve))
    await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined)
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))])
    await app.close().catch(() => undefined)
  }
  descriptorRemovedOnQuit = await fs.stat(descriptorPath).then(
    () => false,
    (error) => error?.code === 'ENOENT'
  )
  await fs.rm(tempRoot, { force: true, maxRetries: 10, recursive: true, retryDelay: 200 })
}

assert.equal(descriptorRemovedOnQuit, true, 'temporary automation descriptor must be removed')
