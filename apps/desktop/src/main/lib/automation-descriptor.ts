/**
 * Desktop automation descriptor (NEX-131 §5.2 / §5.3).
 *
 * Writes a JSON pointer file at the platform-conventional path so the
 * `vidbee` CLI can locate and authenticate against the loopback API
 * without requiring user-supplied configuration.
 *
 * - macOS:   ~/Library/Application Support/VidBee/automation.json
 * - Linux:   ${XDG_CONFIG_HOME:-~/.config}/VidBee/automation.json
 * - Windows: %APPDATA%/VidBee/automation.json
 *
 * The descriptor never carries the bearer token — only sha256(token). It
 * carries a per-process handshake secret so only the local user that can read
 * this file can exchange it for a short-lived bearer token.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

import { scopedLoggers } from '../utils/logger'

const SCHEMA_VERSION = '1.1.0'
const DESCRIPTOR_FILE = 'automation.json'
const DIRNAME = 'VidBee'

interface DescriptorPayload {
  version: 1
  schemaVersion: string
  kind: 'desktop'
  host: string
  port: number
  handshakeSecret: string
  tokenHash: string | null
  tokenIssuedAt: number | null
  tokenExpiresAt: number | null
  pid: number
  pidStartedAt: number
  updatedAt: number
  appVersion: string
}

const resolveDescriptorPath = (): string => {
  const envOverride = process.env.VIDBEE_AUTOMATION_DESCRIPTOR?.trim()
  if (envOverride) {
    return envOverride
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', DIRNAME, DESCRIPTOR_FILE)
  }
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA?.trim()
    const base =
      appdata && appdata.length > 0 ? appdata : path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(base, DIRNAME, DESCRIPTOR_FILE)
  }
  // Linux + others: XDG_CONFIG_HOME
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config')
  return path.join(base, DIRNAME, DESCRIPTOR_FILE)
}

let cachedDescriptorPath: string | null = null
const DESCRIPTOR_PATH_GETTER = (): string => {
  if (!cachedDescriptorPath) {
    cachedDescriptorPath = resolveDescriptorPath()
  }
  return cachedDescriptorPath
}

let pidStartedAt = Date.now()

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true })
}

const writeWithMode = (file: string, payload: string): void => {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, payload, { encoding: 'utf-8' })
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      /* noop */
    }
  }
}

export const initAutomationDescriptor = (params: {
  handshakeSecret: string
  host: string
  port: number
}): DescriptorPayload => {
  pidStartedAt = Date.now()
  const payload: DescriptorPayload = {
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    kind: 'desktop',
    host: params.host,
    port: params.port,
    handshakeSecret: params.handshakeSecret,
    tokenHash: null,
    tokenIssuedAt: null,
    tokenExpiresAt: null,
    pid: process.pid,
    pidStartedAt,
    updatedAt: Date.now(),
    appVersion: safeAppVersion()
  }
  try {
    writeWithMode(DESCRIPTOR_PATH_GETTER(), JSON.stringify(payload, null, 2))
  } catch (err) {
    scopedLoggers.system.warn('automation-descriptor: failed to write:', err)
  }
  return payload
}

export const updateAutomationDescriptorToken = (params: {
  handshakeSecret: string
  host: string
  port: number
  token: string
  ttlMs: number
}): void => {
  const issuedAt = Date.now()
  const payload: DescriptorPayload = {
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    kind: 'desktop',
    host: params.host,
    port: params.port,
    handshakeSecret: params.handshakeSecret,
    tokenHash: `sha256:${createHash('sha256').update(params.token).digest('hex')}`,
    tokenIssuedAt: issuedAt,
    tokenExpiresAt: issuedAt + params.ttlMs,
    pid: process.pid,
    pidStartedAt,
    updatedAt: issuedAt,
    appVersion: safeAppVersion()
  }
  try {
    writeWithMode(DESCRIPTOR_PATH_GETTER(), JSON.stringify(payload, null, 2))
  } catch (err) {
    scopedLoggers.system.warn('automation-descriptor: failed to update token:', err)
  }
}

export const removeAutomationDescriptor = (): void => {
  try {
    fs.rmSync(DESCRIPTOR_PATH_GETTER(), { force: true })
  } catch {
    /* noop */
  }
}

export const getAutomationDescriptorPath = (): string => DESCRIPTOR_PATH_GETTER()

const safeAppVersion = (): string => {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}
