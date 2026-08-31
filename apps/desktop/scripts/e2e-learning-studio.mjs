import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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
  await page.locator('[data-sonner-toast]').evaluateAll((toasts) => {
    for (const toast of toasts) {
      toast.querySelector('[data-close-button]')?.click()
      toast.remove()
    }
  })
}

await fs.mkdir(outputPath, { recursive: true })
const fixtureNow = Date.now()
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
                '```mermaid\nflowchart LR\n  source["原始证据 [00:00:05]"] --> insight["形成可复用洞察"]\n```',
              createdAt: fixtureNow + 1,
              id: 'validated-learning-diagram',
              kind: 'ai',
              quote: '学习图谱',
              sourceSegmentIds: ['ai-module:diagram'],
              timestampMs: null,
              updatedAt: fixtureNow + 1
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
  await page.screenshot({ fullPage: true, path: path.join(outputPath, '03-browser-companion.png') })

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
      segmentTabStops.every((count) => count === 1),
      `each rendered transcript segment should expose one keyboard entry: ${segmentTabStops.join(',')}`
    )
    const personalNote = '立即离开页面也不能丢失这条个人 Markdown 笔记。'
    await page.getByLabel('我的笔记').fill(personalNote)
    await page.getByRole('button', { exact: true, name: '预览' }).click()
    await page.getByText(personalNote, { exact: true }).waitFor()
    await page.getByRole('button', { exact: true, name: '编辑' }).click()
    await page.getByPlaceholder('写下你对这段原文的备注……').fill('这段原文需要保留时间依据。')
    await page.getByRole('button', { name: /保存原文备注/u }).click()
    await page.getByText('这段原文需要保留时间依据。', { exact: true }).waitFor()
    await page.screenshot({ fullPage: true, path: path.join(outputPath, '04-note-scene.png') })

    const outputRegion = page.locator('[data-study-region="output"]:visible')
    await outputRegion.waitFor()
    for (const moduleName of [
      '学习图谱',
      '精华速览',
      '完整总结',
      '模板总结',
      'AI 学习',
      '文字大纲',
      'AI 播客',
      '翻译润色',
      'AI 生图'
    ]) {
      await outputRegion.getByRole('button', { exact: true, name: moduleName }).waitFor()
    }
    await outputRegion.getByRole('button', { exact: true, name: '学习图谱' }).click()
    await outputRegion
      .locator('svg')
      .filter({ hasText: /原始证据/u })
      .waitFor({ timeout: 15_000 })
    await outputRegion.getByRole('button', { exact: true, name: 'AI 生图' }).click()
    await outputRegion.getByLabel('图片需求').waitFor()
    await outputRegion.getByRole('tab', { exact: true, name: '金句图' }).click()
    await outputRegion.getByLabel('金句原文').fill('真正的学习，是随时能回到原始证据。')
    await outputRegion.getByLabel('图片需求').fill('黑金编辑风，留出中文排版安全区。')
    await outputRegion.getByRole('button', { exact: true, name: 'AI 优化提示词' }).waitFor()
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
    await page.getByText(personalNote, { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByText('这段原文需要保留时间依据。', { exact: true }).waitFor({ timeout: 10_000 })
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
    BrowserWindow.getAllWindows()[0]?.setSize(900, 700)
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
    const compactWatch = page.locator('[data-scene="watch"]')
    const compactNoteScene = page.locator('[data-scene="note"]')
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
    await page.locator('[data-scene="output"]').click()
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

    await compactOutput.getByRole('button', { exact: true, name: 'AI 生图' }).click()
    await compactOutput.getByLabel('图片需求').waitFor()
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
