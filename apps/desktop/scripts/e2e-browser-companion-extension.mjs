import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const workspaceRoot = path.resolve(import.meta.dirname, '../../..')
const extensionDir = path.join(workspaceRoot, 'apps/extension/.output/chrome-mv3')
const outputDir = path.join(workspaceRoot, 'output/e2e-browser-companion')
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fengsha-companion-edge-'))

await fs.mkdir(outputDir, { recursive: true })

let context
try {
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  })
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto('chrome://extensions')
  const item = page
    .locator('extensions-item')
    .filter({ hasText: /Fengsha|风沙/ })
    .first()
  await item.waitFor({ state: 'visible', timeout: 15_000 })
  const extensionId = await item.getAttribute('id')
  assert.match(extensionId ?? '', /^[a-p]{32}$/)

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page
    .getByText(/^(?:风沙浏览器学习伴侣|Fengsha AI Learning Companion)$/u)
    .waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: /^(?:重新读取当前页|Read this page again)$/u }).waitFor()
  await page.screenshot({
    path: path.join(outputDir, 'extension-popup.png'),
    fullPage: true
  })

  process.stdout.write(`${JSON.stringify({ extensionId, loaded: true, outputDir })}\n`)
} finally {
  await context?.close().catch(() => undefined)
  await fs.rm(profileDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 250 })
}
