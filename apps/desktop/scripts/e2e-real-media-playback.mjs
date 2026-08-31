import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const desktopRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(desktopRoot, '..', '..')
const sourceUserData = path.resolve(
  process.env.VIDBEE_E2E_SOURCE_USER_DATA ||
    path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'fengsha-video-learning'
    )
)
const targetTitle = process.env.VIDBEE_E2E_MEDIA_TITLE || '2026年AI前沿部署工程师'
const packagedExecutable = process.env.VIDBEE_E2E_EXECUTABLE
  ? path.resolve(process.env.VIDBEE_E2E_EXECUTABLE)
  : null
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fengsha-media-e2e-'))
const outputPath = path.join(workspaceRoot, 'output', 'e2e-real-media')
const descriptorPath = path.join(tempRoot, 'automation.json')

assert.equal(
  path.dirname(tempRoot),
  path.resolve(os.tmpdir()),
  'The isolated media acceptance directory must stay inside the OS temp directory'
)

const copyIfPresent = async (source, destination) => {
  try {
    await fs.copyFile(source, destination)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}

let app
try {
  await fs.mkdir(outputPath, { recursive: true })
  const sourceDbPath = path.join(sourceUserData, 'vidbee.db')
  const targetDbPath = path.join(tempRoot, 'vidbee.db')
  const sourceDb = new Database(sourceDbPath, { readonly: true })
  try {
    await sourceDb.backup(targetDbPath)
  } finally {
    sourceDb.close()
  }
  await copyIfPresent(
    path.join(sourceUserData, 'learning-notebooks.json'),
    path.join(tempRoot, 'learning-notebooks.json')
  )
  await fs.cp(path.join(sourceUserData, 'html5-preview'), path.join(tempRoot, 'html5-preview'), {
    recursive: true
  })

  const learningDocument = JSON.parse(
    await fs.readFile(path.join(tempRoot, 'learning-notebooks.json'), 'utf8')
  )
  const notebook = learningDocument.notebooks?.find((item) => item.title?.includes(targetTitle))
  assert.ok(notebook?.downloadId, `No isolated learning record matched: ${targetTitle}`)

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
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate((downloadId) => {
    window.location.hash = `#/downloads/${encodeURIComponent(downloadId)}/transcript`
  }, notebook.downloadId)
  await page.locator('[data-study-region="video"]:visible').waitFor({ timeout: 60_000 })
  const video = page.locator('video').first()
  await video.waitFor({ state: 'attached', timeout: 60_000 })
  const playback = await video.evaluate(async (element) => {
    const waitFor = (eventName, timeoutMs) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${eventName}`)),
          timeoutMs
        )
        element.addEventListener(
          eventName,
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true }
        )
      })
    if (!(Number.isFinite(element.duration) && element.duration > 0)) {
      await waitFor('loadedmetadata', 60_000)
    }
    const duration = element.duration
    const source = element.currentSrc || element.src
    element.muted = true
    await element.play()
    await new Promise((resolve) => setTimeout(resolve, 500))
    const playedTime = element.currentTime
    const seekTarget = Math.min(Math.max(1, duration / 3), Math.max(1, duration - 1))
    element.currentTime = seekTarget
    await waitFor('seeked', 15_000)
    element.pause()
    return { currentTime: element.currentTime, duration, playedTime, seekTarget, source }
  })
  assert.ok(playback.duration > 0, `Expected positive media duration, got ${playback.duration}`)
  assert.match(playback.source, /^fengsha-video:\/\/media\//u)
  assert.ok(playback.playedTime > 0, `Expected playback to advance, got ${playback.playedTime}`)
  assert.ok(
    Math.abs(playback.currentTime - playback.seekTarget) < 1,
    `Expected seek to ${playback.seekTarget}, got ${playback.currentTime}`
  )
  await page.screenshot({
    fullPage: true,
    path: path.join(outputPath, 'real-local-media-playing.png')
  })
  process.stdout.write(`${JSON.stringify({ downloadId: notebook.downloadId, playback })}\n`)
} finally {
  if (app) {
    await app.close().catch(() => undefined)
  }
  await fs.rm(tempRoot, { force: true, recursive: true })
}
