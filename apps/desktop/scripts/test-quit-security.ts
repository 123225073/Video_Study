import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  countActiveAiRuns,
  countActiveAiRunsByKind,
  registerActiveAiRun,
  stopAllActiveAiRuns
} from '../src/main/lib/ai-active-runs'
import { isSafeExternalUrl, isTrustedRendererNavigation } from '../src/main/lib/external-navigation'
import { createQuitConfirmationController } from '../src/main/lib/quit-confirmation'
import { secureWindowWebPreferences } from '../src/main/lib/window-security'

const flushMicrotasks = async (): Promise<void> => {
  await new Promise<void>((resolveFlush) => setTimeout(resolveFlush, 0))
}

const run = async (): Promise<void> => {
  const cancelled: string[] = []
  for (let index = 0; index < 4; index += 1) {
    registerActiveAiRun('prompt', () => cancelled.push(`prompt-${index}`))
  }
  registerActiveAiRun('image', () => cancelled.push('image-0'))

  assert.equal(countActiveAiRuns(), 5)
  assert.equal(countActiveAiRunsByKind('prompt'), 4)
  assert.equal(countActiveAiRunsByKind('image'), 1)

  let allowQuit = false
  let confirmedCount = 0
  let quitCalled = false
  const controller = createQuitConfirmationController({
    confirmQuit: async (count) => {
      confirmedCount = count
      return allowQuit
    },
    getInProgressCount: () => 2 + countActiveAiRuns(),
    quit: () => {
      stopAllActiveAiRuns()
      quitCalled = true
    }
  })

  assert.equal(controller.handleQuitAttempt(), 'defer')
  await flushMicrotasks()
  assert.equal(confirmedCount, 7)
  assert.equal(quitCalled, false)
  assert.equal(countActiveAiRuns(), 5)

  allowQuit = true
  assert.equal(controller.handleQuitAttempt(), 'defer')
  await flushMicrotasks()
  assert.equal(quitCalled, true)
  assert.equal(countActiveAiRuns(), 0)
  assert.equal(cancelled.length, 5)

  const preferences = secureWindowWebPreferences('preload.js')
  assert.deepEqual(preferences, {
    allowRunningInsecureContent: false,
    contextIsolation: true,
    nodeIntegration: false,
    preload: 'preload.js',
    sandbox: false,
    webSecurity: true
  })

  assert.equal(isSafeExternalUrl('https://example.com/learn?q=1'), true)
  assert.equal(isSafeExternalUrl('http://localhost:27101/help'), true)
  assert.equal(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe'), false)
  assert.equal(isSafeExternalUrl('fengsha-video://learning-attachments/example.png'), false)
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false)
  assert.equal(isSafeExternalUrl('https://user:password@example.com'), false)
  assert.equal(
    isTrustedRendererNavigation(
      'file:///C:/Program%20Files/Fengsha/resources/app.asar/out/renderer/index.html#/learning',
      'file:///C:/Program%20Files/Fengsha/resources/app.asar/out/renderer/index.html#/home'
    ),
    true
  )
  assert.equal(
    isTrustedRendererNavigation(
      'https://example.com/phishing',
      'file:///C:/Program%20Files/Fengsha/resources/app.asar/out/renderer/index.html'
    ),
    false
  )

  const rendererHtml = readFileSync(
    resolve(import.meta.dirname, '../src/renderer/index.html'),
    'utf8'
  )
  assert.match(rendererHtml, /default-src 'self'/u)
  assert.match(rendererHtml, /base-uri 'none'/u)
  assert.match(rendererHtml, /object-src 'none'/u)
  assert.match(rendererHtml, /media-src 'self' blob: file: fengsha-video:/u)
  assert.match(rendererHtml, /connect-src 'self' data: blob: file: fengsha-video:/u)
  assert.doesNotMatch(rendererHtml, /unsafe-eval/u)
  assert.doesNotMatch(rendererHtml, /rybbit\.102417\.xyz/u)

  const promptRunner = readFileSync(
    resolve(import.meta.dirname, '../src/main/lib/ai-prompt-runner.ts'),
    'utf8'
  )
  const imageRunner = readFileSync(
    resolve(import.meta.dirname, '../src/main/lib/ai-image-runner.ts'),
    'utf8'
  )
  assert.match(promptRunner, /registerActiveAiRun\('prompt'/u)
  assert.match(promptRunner, /quitRegistration\?\.finish\(\)/u)
  assert.match(imageRunner, /registerActiveAiRun\('image'/u)
  assert.match(imageRunner, /run\.snapshot\.status !== 'running'/u)
  assert.match(imageRunner, /quitRegistration\?\.finish\(\)/u)

  process.stdout.write('Quit guard and BrowserWindow security checks passed.\n')
}

void run()
