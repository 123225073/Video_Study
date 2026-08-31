import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fengsha-local-api-security-'))
const descriptorPath = path.join(tempRoot, 'automation.json')

const waitForDescriptor = async () => {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(descriptorPath, 'utf8'))
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('automation descriptor was not created')
}

let app
let descriptorRemovedOnQuit = false
try {
  app = await electron.launch({
    args: ['.'],
    cwd: desktopRoot,
    env: {
      ...process.env,
      VIDBEE_AUTOMATION_DESCRIPTOR: descriptorPath,
      VIDBEE_E2E: '1',
      VIDBEE_E2E_USER_DATA: tempRoot
    },
    executablePath: electronPath,
    timeout: 60_000
  })

  const descriptor = await waitForDescriptor()
  assert.equal(typeof descriptor.handshakeSecret, 'string')
  assert.ok(descriptor.handshakeSecret.length >= 32)
  const baseUrl = `http://${descriptor.host}:${descriptor.port}`

  const browserRequest = await fetch(`${baseUrl}/automation/v1/health`, {
    headers: { Origin: 'https://attacker.example' }
  })
  assert.equal(browserRequest.status, 403)
  assert.equal(browserRequest.headers.get('access-control-allow-origin'), null)

  const browserPreflight = await fetch(`${baseUrl}/automation/v1/handshake`, {
    headers: {
      'Access-Control-Request-Method': 'POST',
      Origin: 'https://attacker.example'
    },
    method: 'OPTIONS'
  })
  assert.equal(browserPreflight.status, 403)
  assert.equal(browserPreflight.headers.get('access-control-allow-origin'), null)

  const unauthenticatedHandshake = await fetch(`${baseUrl}/automation/v1/handshake`, {
    body: '{}',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  assert.equal(unauthenticatedHandshake.status, 401)

  const authenticatedHandshake = await fetch(`${baseUrl}/automation/v1/handshake`, {
    body: JSON.stringify({ handshakeSecret: descriptor.handshakeSecret }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  assert.equal(authenticatedHandshake.status, 200)
  const { token } = await authenticatedHandshake.json()
  assert.equal(typeof token, 'string')

  const forbiddenForward = await fetch(`${baseUrl}/automation/v1/add`, {
    body: JSON.stringify({
      input: {
        kind: 'yt-dlp-forward',
        rawArgs: ['--exec', 'echo should-not-run'],
        url: 'https://example.com/video'
      }
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
  assert.equal(forbiddenForward.status, 400)
  assert.match((await forbiddenForward.json()).error, /rawArgs|yt-dlp-forward/iu)

  const forbiddenOutputOverride = await fetch(`${baseUrl}/automation/v1/add`, {
    body: JSON.stringify({
      input: {
        kind: 'video',
        options: { customDownloadPath: 'C:\\Windows\\Temp' },
        url: 'https://example.com/video'
      }
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
  assert.equal(forbiddenOutputOverride.status, 400)
  assert.match((await forbiddenOutputOverride.json()).error, /unsupported field/iu)

  assert.equal((await fetch(`${baseUrl}/token`)).status, 404)
  assert.equal((await fetch(`${baseUrl}/video-info?url=https://example.com`)).status, 404)

  console.log('local API security integration checks passed')
} finally {
  await app?.close().catch(() => undefined)
  descriptorRemovedOnQuit = await fs.stat(descriptorPath).then(
    () => false,
    (error) => error?.code === 'ENOENT'
  )
  const expectedPrefix = `${path.resolve(os.tmpdir())}${path.sep}fengsha-local-api-security-`
  if (path.resolve(tempRoot).startsWith(expectedPrefix)) {
    await fs.rm(tempRoot, { force: true, recursive: true })
  }
}

assert.equal(descriptorRemovedOnQuit, true, 'automation descriptor must be removed on app quit')
