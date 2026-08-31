import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import type {
  CompanionCaptionCue,
  CompanionCapturePayload,
  CompanionPairingInfo
} from '@shared/companion-types'
import type { AddTaskRequest, Task, TaskInput, TaskQueueEvent } from '@vidbee/task-queue'
import { projectTaskToLegacy } from '@vidbee/task-queue'
import { app } from 'electron'
import log from 'electron-log/main'
import {
  getAutomationDescriptorPath,
  initAutomationDescriptor,
  removeAutomationDescriptor,
  updateAutomationDescriptorToken
} from './lib/automation-descriptor'
import { getDesktopSubscriptions, removeDesktopSubscription } from './lib/subscriptions-host'
import {
  getDesktopTaskQueue,
  isDesktopTaskQueuePersistent,
  startDesktopTaskQueue,
  stopDesktopTaskQueue
} from './lib/task-queue-host'

const PORT_RANGE_START = 27_100
const PORT_RANGE_END = 27_120

const AUTOMATION_TOKEN_TTL_MS = 60 * 60 * 1000

const AUTOMATION_PREFIX = '/automation/v1'
const AUTOMATION_SCHEMA_VERSION = '1.0.0'
const COMPANION_PREFIX = '/companion/v1'
const COMPANION_SCHEMA_VERSION = '1.0.0'
const COMPANION_MAX_BODY_BYTES = 6 * 1024 * 1024
const COMPANION_CODE_TTL_MS = 30 * 60 * 1000
const COMPANION_PAIR_ATTEMPT_WINDOW_MS = 60 * 1000
const COMPANION_MAX_PAIR_ATTEMPTS = 5
const COMPANION_CAPTURE_WINDOW_MS = 60 * 1000
const COMPANION_MAX_CAPTURES_PER_WINDOW = 120
const COMPANION_MAX_CLIENTS = 12
const MAX_CAPTION_CUES = 2000
const MAX_SCREENSHOT_DATA_URL_LENGTH = 5 * 1024 * 1024

interface AutomationTokenRecord {
  expiresAt: number
}

interface CompanionClientRecord {
  createdAt: number
  id: string
  lastUsedAt: number
  name: string
  tokenHash: string
}

interface CompanionPairingDocument {
  clients: CompanionClientRecord[]
  version: 1
}

let server: http.Server | null = null
const serverHost = '127.0.0.1'
let serverPort: number | null = null

let automationToken: string | null = null
let automationTokenRecord: AutomationTokenRecord | null = null
let automationHandshakeSecret = crypto.randomBytes(32).toString('hex')

let companionPairingCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
let companionPairingCodeIssuedAt = Date.now()
let companionCaptureHandler: ((payload: CompanionCapturePayload) => void) | null = null
const companionPairAttempts = new Map<string, { count: number; startedAt: number }>()
const companionCaptureAttempts = new Map<string, { count: number; startedAt: number }>()

const isLoopbackAddress = (address?: string | null): boolean => {
  if (!address) {
    return false
  }
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

const PRIVATE_RESPONSE = Symbol('private-response')
type LocalApiResponse = http.ServerResponse & { [PRIVATE_RESPONSE]?: boolean }

const writeJson = (res: LocalApiResponse, status: number, body: unknown): void => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
  if (!res[PRIVATE_RESPONSE]) {
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

const writeEmpty = (res: LocalApiResponse, status: number): void => {
  const headers: Record<string, string> = {}
  if (!res[PRIVATE_RESPONSE]) {
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  }
  res.writeHead(status, headers)
  res.end()
}

// ───────────── Automation token ─────────────

const rotateAutomationToken = (): { token: string; expiresAt: number } => {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + AUTOMATION_TOKEN_TTL_MS
  automationToken = token
  automationTokenRecord = { expiresAt }
  if (serverPort) {
    updateAutomationDescriptorToken({
      handshakeSecret: automationHandshakeSecret,
      host: serverHost,
      port: serverPort,
      token,
      ttlMs: AUTOMATION_TOKEN_TTL_MS
    })
  }
  return { token, expiresAt }
}

const validateAutomationBearer = (req: http.IncomingMessage): boolean => {
  if (!(automationToken && automationTokenRecord)) {
    return false
  }
  if (Date.now() > automationTokenRecord.expiresAt) {
    return false
  }
  const auth = req.headers.authorization?.trim()
  if (!auth?.toLowerCase().startsWith('bearer ')) {
    return false
  }
  return auth.slice('bearer '.length).trim() === automationToken
}

const hasValidAutomationHandshakeSecret = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false
  }
  const expected = Buffer.from(automationHandshakeSecret)
  const received = Buffer.from(value.trim())
  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

const isBrowserInitiatedRequest = (req: http.IncomingMessage): boolean =>
  // Node's standards-compliant fetch sends Sec-Fetch-Mode too, so it cannot
  // distinguish the CLI from a browser. Browsers expose cross-site context
  // through Origin and/or Sec-Fetch-Site.
  Boolean(req.headers.origin || req.headers['sec-fetch-site'])

// ───────────── JSON body reader ─────────────

const readJsonBody = (req: http.IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let total = 0
    let tooLarge = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength
      if (total > maxBytes) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        reject(new Error('Request body too large'))
        return
      }
      if (chunks.length === 0) {
        return resolve({})
      }
      try {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve(text.length === 0 ? {} : JSON.parse(text))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })

// ───────────── Automation add boundary ─────────────

const AUTOMATION_ADD_KINDS = new Set(['video', 'audio', 'playlist', 'subscription-item'])
const AUTOMATION_ADD_BODY_KEYS = new Set([
  'input',
  'priority',
  'groupKey',
  'parentId',
  'maxAttempts'
])
const AUTOMATION_ADD_INPUT_KEYS = new Set([
  'url',
  'kind',
  'title',
  'thumbnail',
  'subscriptionId',
  'playlistId',
  'playlistIndex',
  'options'
])
const AUTOMATION_ADD_OPTION_KEYS = new Set([
  'type',
  'format',
  'audioFormat',
  'audioFormatIds',
  'startTime',
  'endTime',
  'containerFormat'
])
const AUTOMATION_CONTAINER_FORMATS = new Set(['auto', 'mp4', 'mkv', 'webm', 'original'])

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const assertOnlyKeys = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string
): void => {
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key))
  if (unsupported.length > 0) {
    throw new Error(`${label} contains unsupported field(s): ${unsupported.join(', ')}`)
  }
}

const optionalBoundedString = (
  value: Record<string, unknown>,
  key: string,
  maxLength: number
): string | undefined => {
  const candidate = value[key]
  if (candidate === undefined) {
    return undefined
  }
  if (typeof candidate !== 'string') {
    throw new Error(`${key} must be a string`)
  }
  const trimmed = candidate.trim()
  if (trimmed.length > maxLength) {
    throw new Error(`${key} is too long`)
  }
  return trimmed
}

const normalizeAutomationOptions = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (!isPlainRecord(value)) {
    throw new Error('input.options must be an object')
  }
  assertOnlyKeys(value, AUTOMATION_ADD_OPTION_KEYS, 'input.options')
  const options: Record<string, unknown> = {}
  const type = optionalBoundedString(value, 'type', 10)
  if (type !== undefined) {
    if (!(type === 'video' || type === 'audio')) {
      throw new Error('input.options.type must be video or audio')
    }
    options.type = type
  }
  for (const [key, limit] of [
    ['format', 500],
    ['audioFormat', 50],
    ['startTime', 32],
    ['endTime', 32]
  ] as const) {
    const normalized = optionalBoundedString(value, key, limit)
    if (normalized !== undefined) {
      options[key] = normalized
    }
  }
  if (value.audioFormatIds !== undefined) {
    if (
      !Array.isArray(value.audioFormatIds) ||
      value.audioFormatIds.length > 32 ||
      value.audioFormatIds.some((item) => typeof item !== 'string' || item.length > 100)
    ) {
      throw new Error('input.options.audioFormatIds must be an array of short strings')
    }
    options.audioFormatIds = value.audioFormatIds.map((item) => item.trim())
  }
  const containerFormat = optionalBoundedString(value, 'containerFormat', 20)
  if (containerFormat !== undefined) {
    if (!AUTOMATION_CONTAINER_FORMATS.has(containerFormat)) {
      throw new Error('input.options.containerFormat is unsupported')
    }
    options.containerFormat = containerFormat
  }
  return Object.keys(options).length > 0 ? options : undefined
}

export const normalizeAutomationAddRequest = (value: unknown): AddTaskRequest => {
  if (!isPlainRecord(value)) {
    throw new Error('Automation add payload must be an object')
  }
  assertOnlyKeys(value, AUTOMATION_ADD_BODY_KEYS, 'Automation add payload')
  if (!isPlainRecord(value.input)) {
    throw new Error('input must be an object')
  }
  if (Object.hasOwn(value.input, 'rawArgs')) {
    throw new Error('input.rawArgs is forbidden over HTTP automation')
  }
  assertOnlyKeys(value.input, AUTOMATION_ADD_INPUT_KEYS, 'input')

  const kind = value.input.kind
  if (kind === 'yt-dlp-forward') {
    throw new Error('yt-dlp-forward is forbidden over HTTP automation')
  }
  if (typeof kind !== 'string' || !AUTOMATION_ADD_KINDS.has(kind)) {
    throw new Error('input.kind is not allowed over HTTP automation')
  }
  if (typeof value.input.url !== 'string' || value.input.url.length > 16_384) {
    throw new Error('input.url must be a valid HTTP(S) URL')
  }
  let url: URL
  try {
    url = new URL(value.input.url.trim())
  } catch {
    throw new Error('input.url must be a valid HTTP(S) URL')
  }
  if (!(url.protocol === 'http:' || url.protocol === 'https:')) {
    throw new Error('input.url must use http or https')
  }

  const input: TaskInput = { kind: kind as TaskInput['kind'], url: url.toString() }
  for (const [key, limit] of [
    ['title', 500],
    ['thumbnail', 16_384],
    ['subscriptionId', 200],
    ['playlistId', 200]
  ] as const) {
    const normalized = optionalBoundedString(value.input, key, limit)
    if (normalized !== undefined) {
      input[key] = normalized
    }
  }
  if (value.input.playlistIndex !== undefined) {
    if (
      typeof value.input.playlistIndex !== 'number' ||
      !Number.isSafeInteger(value.input.playlistIndex) ||
      value.input.playlistIndex < 0
    ) {
      throw new Error('input.playlistIndex must be a non-negative integer')
    }
    input.playlistIndex = value.input.playlistIndex
  }
  const options = normalizeAutomationOptions(value.input.options)
  if (options) {
    input.options = options
  }

  const request: AddTaskRequest = { input }
  if (value.priority !== undefined) {
    if (!(value.priority === 0 || value.priority === 10 || value.priority === 20)) {
      throw new Error('priority must be 0, 10, or 20')
    }
    request.priority = value.priority
  }
  const groupKey = optionalBoundedString(value, 'groupKey', 200)
  if (groupKey !== undefined) {
    request.groupKey = groupKey
  }
  if (value.parentId !== undefined) {
    if (value.parentId !== null && typeof value.parentId !== 'string') {
      throw new Error('parentId must be a string or null')
    }
    if (typeof value.parentId === 'string' && value.parentId.length > 200) {
      throw new Error('parentId is too long')
    }
    request.parentId = value.parentId
  }
  if (value.maxAttempts !== undefined) {
    if (
      typeof value.maxAttempts !== 'number' ||
      !Number.isSafeInteger(value.maxAttempts) ||
      value.maxAttempts < 0 ||
      value.maxAttempts > 20
    ) {
      throw new Error('maxAttempts must be an integer between 0 and 20')
    }
    request.maxAttempts = value.maxAttempts
  }
  return request
}

// ───────────── Browser companion pairing ─────────────

const companionPairingPath = (): string =>
  path.join(app.getPath('userData'), 'browser-companion-pairings.json')

const readCompanionPairings = (): CompanionPairingDocument => {
  try {
    const parsed = JSON.parse(fs.readFileSync(companionPairingPath(), 'utf8')) as {
      clients?: unknown
    }
    if (!Array.isArray(parsed.clients)) {
      return { clients: [], version: 1 }
    }
    const clients = parsed.clients.flatMap((value): CompanionClientRecord[] => {
      if (!value || typeof value !== 'object') {
        return []
      }
      const candidate = value as Partial<CompanionClientRecord>
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.tokenHash !== 'string'
      ) {
        return []
      }
      return [
        {
          createdAt: Number(candidate.createdAt) || Date.now(),
          id: candidate.id,
          lastUsedAt: Number(candidate.lastUsedAt) || 0,
          name: candidate.name.slice(0, 80),
          tokenHash: candidate.tokenHash
        }
      ]
    })
    return { clients, version: 1 }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      log.warn('Failed to read browser companion pairings:', error)
    }
    return { clients: [], version: 1 }
  }
}

const writeCompanionPairings = (document: CompanionPairingDocument): void => {
  const filePath = companionPairingPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(document, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

const hashCompanionToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

const secureTextEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const rotateCompanionCode = (): string => {
  companionPairingCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  companionPairingCodeIssuedAt = Date.now()
  return companionPairingCode
}

const currentCompanionCode = (): string => {
  if (Date.now() - companionPairingCodeIssuedAt > COMPANION_CODE_TTL_MS) {
    rotateCompanionCode()
  }
  return companionPairingCode
}

const consumeRateLimit = (
  records: Map<string, { count: number; startedAt: number }>,
  key: string,
  limit: number,
  windowMs: number
): boolean => {
  const now = Date.now()
  const existing = records.get(key)
  if (!existing || now - existing.startedAt >= windowMs) {
    records.set(key, { count: 1, startedAt: now })
    return true
  }
  existing.count += 1
  return existing.count <= limit
}

const isTrustedCompanionOrigin = (req: http.IncomingMessage): boolean => {
  const origin = req.headers.origin?.trim()
  if (!origin) {
    return true
  }
  return /^(?:chrome|moz)-extension:\/\/[a-z0-9-]+$/iu.test(origin)
}

const issueCompanionPairing = (clientName: string): { token: string; clientId: string } => {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = Date.now()
  const client: CompanionClientRecord = {
    createdAt: now,
    id: crypto.randomUUID(),
    lastUsedAt: now,
    name: clientName.trim().slice(0, 80) || 'Browser companion',
    tokenHash: hashCompanionToken(token)
  }
  const document = readCompanionPairings()
  document.clients = document.clients
    .filter((entry) => entry.name !== client.name)
    .toSorted((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, COMPANION_MAX_CLIENTS - 1)
  document.clients.push(client)
  writeCompanionPairings(document)
  rotateCompanionCode()
  return { clientId: client.id, token }
}

const validateCompanionBearer = (req: http.IncomingMessage): CompanionClientRecord | null => {
  const authorization = req.headers.authorization?.trim()
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null
  }
  const token = authorization.slice('bearer '.length).trim()
  if (!token) {
    return null
  }
  const tokenHash = hashCompanionToken(token)
  const document = readCompanionPairings()
  const client = document.clients.find((entry) => secureTextEquals(entry.tokenHash, tokenHash))
  if (!client) {
    return null
  }
  client.lastUsedAt = Date.now()
  writeCompanionPairings(document)
  return client
}

const finiteNonNegative = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback
}

const optionalFiniteNonNegative = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null
}

const normalizedCompanionUrl = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('pageUrl is required')
  }
  const parsed = new URL(value.trim())
  if (!(parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    throw new Error('pageUrl must use http or https')
  }
  return parsed.toString()
}

const normalizeCaptionCues = (value: unknown): CompanionCaptionCue[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.slice(0, MAX_CAPTION_CUES).flatMap((item): CompanionCaptionCue[] => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const candidate = item as Record<string, unknown>
    const text = typeof candidate.text === 'string' ? candidate.text.trim().slice(0, 4000) : ''
    if (!text) {
      return []
    }
    const startSeconds = finiteNonNegative(candidate.startSeconds, 0)
    return [
      {
        endSeconds: Math.max(startSeconds, finiteNonNegative(candidate.endSeconds, startSeconds)),
        startSeconds,
        text
      }
    ]
  })
}

const normalizeCompanionCapture = (value: unknown): CompanionCapturePayload => {
  if (!value || typeof value !== 'object') {
    throw new Error('Capture payload must be an object')
  }
  const candidate = value as Record<string, unknown>
  const screenshot =
    typeof candidate.screenshotDataUrl === 'string' ? candidate.screenshotDataUrl : ''
  if (screenshot.length > MAX_SCREENSHOT_DATA_URL_LENGTH) {
    throw new Error('Screenshot is too large')
  }
  if (screenshot && !/^data:image\/(?:jpeg|png|webp);base64,/i.test(screenshot)) {
    throw new Error('Screenshot must be a PNG, JPEG, or WebP data URL')
  }
  const rawPlatform = candidate.platform
  const platform =
    rawPlatform === 'youtube' || rawPlatform === 'bilibili' ? rawPlatform : ('other' as const)
  const rawAction = candidate.action
  const action =
    rawAction === 'frame' || rawAction === 'time-marker' ? rawAction : ('open' as const)
  return {
    action,
    captionCues: normalizeCaptionCues(candidate.captionCues),
    captionLanguage:
      typeof candidate.captionLanguage === 'string'
        ? candidate.captionLanguage.trim().slice(0, 40) || null
        : null,
    captionText:
      typeof candidate.captionText === 'string'
        ? candidate.captionText.trim().slice(0, 500_000)
        : '',
    currentTimeSeconds: finiteNonNegative(candidate.currentTimeSeconds, 0),
    durationSeconds: optionalFiniteNonNegative(candidate.durationSeconds),
    pageUrl: normalizedCompanionUrl(candidate.pageUrl),
    platform,
    screenshotDataUrl: screenshot || null,
    selectedText:
      typeof candidate.selectedText === 'string'
        ? candidate.selectedText.trim().slice(0, 20_000)
        : '',
    title: typeof candidate.title === 'string' ? candidate.title.trim().slice(0, 500) : ''
  }
}

const handleCompanionRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> => {
  if (!isTrustedCompanionOrigin(req)) {
    writeJson(res, 403, { error: 'Browser companion requests must come from an extension' })
    return
  }

  if (pathname === `${COMPANION_PREFIX}/status`) {
    if (req.method !== 'GET') {
      writeJson(res, 405, { error: 'Method not allowed' })
      return
    }
    writeJson(res, 200, {
      app: 'Fengsha AI Learning Platform',
      ok: true,
      pairedClientCount: readCompanionPairings().clients.length,
      schemaVersion: COMPANION_SCHEMA_VERSION
    })
    return
  }

  if (pathname === `${COMPANION_PREFIX}/pair`) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const rateLimitKey = req.socket.remoteAddress ?? 'loopback'
    if (
      !consumeRateLimit(
        companionPairAttempts,
        rateLimitKey,
        COMPANION_MAX_PAIR_ATTEMPTS,
        COMPANION_PAIR_ATTEMPT_WINDOW_MS
      )
    ) {
      writeJson(res, 429, { error: 'Too many pairing attempts. Try again in one minute.' })
      return
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const code = typeof body.code === 'string' ? body.code.trim() : ''
      if (!secureTextEquals(code, currentCompanionCode())) {
        writeJson(res, 401, { error: 'Invalid pairing code' })
        return
      }
      const pairing = issueCompanionPairing(
        typeof body.clientName === 'string' ? body.clientName : 'Browser companion'
      )
      writeJson(res, 200, { ...pairing, port: serverPort, schemaVersion: COMPANION_SCHEMA_VERSION })
    } catch (error) {
      writeJson(res, 400, {
        error: error instanceof Error ? error.message : 'Invalid pairing request'
      })
    }
    return
  }

  if (pathname === `${COMPANION_PREFIX}/capture`) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const client = validateCompanionBearer(req)
    if (!client) {
      writeJson(res, 401, { error: 'Pair the browser companion again' })
      return
    }
    if (
      !consumeRateLimit(
        companionCaptureAttempts,
        client.id,
        COMPANION_MAX_CAPTURES_PER_WINDOW,
        COMPANION_CAPTURE_WINDOW_MS
      )
    ) {
      writeJson(res, 429, { error: 'Too many captures. Slow down and try again.' })
      return
    }
    if (!companionCaptureHandler) {
      writeJson(res, 503, { error: 'Desktop workspace is not ready' })
      return
    }
    try {
      const payload = normalizeCompanionCapture(await readJsonBody(req, COMPANION_MAX_BODY_BYTES))
      companionCaptureHandler(payload)
      writeJson(res, 202, {
        accepted: true,
        action: payload.action,
        clientName: client.name,
        schemaVersion: COMPANION_SCHEMA_VERSION
      })
    } catch (error) {
      writeJson(res, 400, {
        error: error instanceof Error ? error.message : 'Invalid capture request'
      })
    }
    return
  }

  writeJson(res, 404, { error: 'Not found' })
}

// ───────────── Automation /events SSE ─────────────

const automationSseClients = new Set<http.ServerResponse>()
let unsubscribeFromTaskQueue: (() => void) | null = null
let heartbeatTimer: NodeJS.Timeout | null = null

const SSE_HEARTBEAT_MS = 15_000

const sseSubscribeIfNeeded = (): void => {
  if (unsubscribeFromTaskQueue) {
    return
  }
  const queue = getDesktopTaskQueue()
  unsubscribeFromTaskQueue = queue.subscribe((event: TaskQueueEvent) => {
    if (automationSseClients.size === 0) {
      return
    }
    const data = JSON.stringify(serializeEventForWire(event))
    const message = `event: ${event.type}\ndata: ${data}\n\n`
    for (const client of automationSseClients) {
      client.write(message)
    }
  })
}

const startSseHeartbeat = (): void => {
  if (heartbeatTimer) {
    return
  }
  heartbeatTimer = setInterval(() => {
    if (automationSseClients.size === 0) {
      return
    }
    for (const client of automationSseClients) {
      client.write(': heartbeat\n\n')
    }
  }, SSE_HEARTBEAT_MS)
}

const stopSseHeartbeat = (): void => {
  if (!heartbeatTimer) {
    return
  }
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

const serializeEventForWire = (event: TaskQueueEvent): unknown => {
  if (
    (event.type === 'snapshot-changed' || event.type === 'progress') &&
    event.type === 'snapshot-changed'
  ) {
    return { ...event, projection: projectTaskToLegacy(event.task) }
  }
  return event
}

// ───────────── Automation request dispatch ─────────────

const handleAutomationRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> => {
  if (pathname === `${AUTOMATION_PREFIX}/health`) {
    if (req.method !== 'GET') {
      return writeJson(res, 405, { error: 'Method not allowed' })
    }
    return writeJson(res, 200, {
      ok: true,
      schemaVersion: AUTOMATION_SCHEMA_VERSION,
      persistent: isDesktopTaskQueuePersistent()
    })
  }

  if (pathname === `${AUTOMATION_PREFIX}/handshake`) {
    if (req.method !== 'POST') {
      return writeJson(res, 405, { error: 'Method not allowed' })
    }
    // PID identity verification (per design §5.3) is best-effort here; the
    // request is already loopback-only via the outer guard.
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid request body'
      return writeJson(res, 400, { error: message })
    }
    const handshakeSecret =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).handshakeSecret
        : undefined
    if (!hasValidAutomationHandshakeSecret(handshakeSecret)) {
      return writeJson(res, 401, { error: 'Invalid automation handshake secret' })
    }
    const { token, expiresAt } = rotateAutomationToken()
    return writeJson(res, 200, {
      token,
      expiresAt,
      ttlMs: AUTOMATION_TOKEN_TTL_MS,
      schemaVersion: AUTOMATION_SCHEMA_VERSION
    })
  }

  if (pathname === `${AUTOMATION_PREFIX}/events`) {
    if (req.method !== 'GET') {
      return writeJson(res, 405, { error: 'Method not allowed' })
    }
    if (!validateAutomationBearer(req)) {
      return writeJson(res, 401, { error: 'Unauthorized' })
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('event: connected\ndata: {"ok":true}\n\n')
    automationSseClients.add(res)
    sseSubscribeIfNeeded()
    startSseHeartbeat()
    req.on('close', () => {
      automationSseClients.delete(res)
      if (automationSseClients.size === 0) {
        stopSseHeartbeat()
      }
    })
    return
  }

  // taskQueueContract methods (POST /automation/v1/{add|get|list|cancel|...}).
  if (req.method === 'GET' && pathname === `${AUTOMATION_PREFIX}/stats`) {
    if (!validateAutomationBearer(req)) {
      return writeJson(res, 401, { error: 'Unauthorized' })
    }
    return writeJson(res, 200, getDesktopTaskQueue().stats())
  }

  if (req.method !== 'POST') {
    return writeJson(res, 404, { error: 'Not found' })
  }
  if (!validateAutomationBearer(req)) {
    return writeJson(res, 401, { error: 'Unauthorized' })
  }

  // subscriptionContract methods are nested under /automation/v1/subscriptions/<op>
  // (NEX-132 Phase B). The CLI forwards `vidbee :rss <verb>` calls here.
  const SUBSCRIPTIONS_PREFIX = `${AUTOMATION_PREFIX}/subscriptions/`
  if (pathname.startsWith(SUBSCRIPTIONS_PREFIX)) {
    return handleAutomationSubscriptions(pathname.slice(SUBSCRIPTIONS_PREFIX.length), req, res)
  }

  const op = pathname.slice(`${AUTOMATION_PREFIX}/`.length)
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (err) {
    return writeJson(res, 400, {
      error: err instanceof Error ? err.message : 'Invalid request body'
    })
  }

  let addRequest: AddTaskRequest | null = null
  if (op === 'add') {
    try {
      addRequest = normalizeAutomationAddRequest(body)
    } catch (err) {
      return writeJson(res, 400, {
        error: err instanceof Error ? err.message : 'Invalid automation add payload'
      })
    }
  }
  if (!isPlainRecord(body)) {
    return writeJson(res, 400, { error: 'Automation payload must be an object' })
  }

  try {
    const queue = getDesktopTaskQueue()
    switch (op) {
      case 'add': {
        if (!addRequest) {
          return writeJson(res, 400, { error: 'Invalid automation add payload' })
        }
        const result = await queue.add(addRequest)
        return writeJson(res, 200, result)
      }
      case 'get': {
        const task = queue.get(body.id as string)
        return writeJson(res, 200, taskOrProjection(task))
      }
      case 'list': {
        const page = queue.list({
          status: body.status as never,
          groupKey: body.groupKey as never,
          parentId: body.parentId as never,
          limit: body.limit as never,
          cursor: (body.cursor as string | undefined) ?? null
        })
        return writeJson(res, 200, {
          tasks: page.tasks.map(taskOrProjection),
          nextCursor: page.nextCursor
        })
      }
      case 'cancel':
        await queue.cancel(body.id as string)
        return writeJson(res, 200, { ok: true })
      case 'pause':
        await queue.pause(body.id as string, body.reason as string | undefined)
        return writeJson(res, 200, { ok: true })
      case 'resume':
        await queue.resume(body.id as string)
        return writeJson(res, 200, { ok: true })
      case 'retry':
        await queue.retryManual(body.id as string)
        return writeJson(res, 200, { ok: true })
      case 'setMaxConcurrency':
        await queue.setMaxConcurrency(body.n as number)
        return writeJson(res, 200, { ok: true })
      case 'setMaxPerGroup':
        await queue.setMaxPerGroup(body.groupKey as string, (body.n as number | null) ?? null)
        return writeJson(res, 200, { ok: true })
      case 'removeFromHistory':
        await queue.removeFromHistory(body.id as string)
        return writeJson(res, 200, { ok: true })
      default:
        return writeJson(res, 404, { error: `Unknown automation op: ${op}` })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Automation handler failed'
    return writeJson(res, 500, { error: message })
  }
}

const taskOrProjection = (task: Readonly<Task> | undefined): unknown => {
  if (!task) {
    return null
  }
  return { task, projection: projectTaskToLegacy(task) }
}

const handleAutomationSubscriptions = async (
  op: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  let body: Record<string, unknown> = {}
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>
  } catch (err) {
    return writeJson(res, 400, {
      error: err instanceof Error ? err.message : 'Invalid request body'
    })
  }
  const api = getDesktopSubscriptions()
  try {
    switch (op) {
      case 'list':
        return writeJson(res, 200, await api.list())
      case 'get':
        return writeJson(res, 200, await api.get({ id: String(body.id ?? '') }))
      case 'resolve':
        return writeJson(res, 200, api.resolve({ rawUrl: String(body.rawUrl ?? '') }))
      case 'add':
        return writeJson(res, 200, await api.add(body as never))
      case 'update':
        return writeJson(res, 200, await api.update(body as never))
      case 'remove':
        await removeDesktopSubscription(String(body.id ?? ''))
        return writeJson(res, 200, {})
      case 'refresh':
        return writeJson(res, 200, await api.refresh({ id: String(body.id ?? '') }))
      case 'itemsList':
        return writeJson(
          res,
          200,
          await api.itemsList(body as { subscriptionId: string; limit?: number; offset?: number })
        )
      case 'itemsQueue':
        return writeJson(
          res,
          200,
          await api.itemsQueue({
            subscriptionId: String(body.subscriptionId ?? ''),
            itemId: String(body.itemId ?? '')
          })
        )
      default:
        return writeJson(res, 404, { error: `Unknown subscriptions op: ${op}` })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subscriptions handler failed'
    return writeJson(res, 500, { error: message })
  }
}

// ───────────── Top-level request handler ─────────────

const handleRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  try {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      writeJson(res, 403, { error: 'Forbidden' })
      return
    }

    if (!req.url) {
      writeJson(res, 400, { error: 'Missing URL' })
      return
    }

    const requestUrl = new URL(req.url, 'http://127.0.0.1')
    const pathname = requestUrl.pathname

    const isAutomationPath =
      pathname.startsWith(`${AUTOMATION_PREFIX}/`) || pathname === AUTOMATION_PREFIX
    if (isAutomationPath) {
      const localResponse = res as LocalApiResponse
      localResponse[PRIVATE_RESPONSE] = true
      if (req.method === 'OPTIONS' || isBrowserInitiatedRequest(req)) {
        writeJson(localResponse, 403, { error: 'Browser access to automation is forbidden' })
        return
      }
      await handleAutomationRequest(req, localResponse, pathname)
      return
    }

    if (req.method === 'OPTIONS') {
      if (pathname.startsWith(`${COMPANION_PREFIX}/`) && !isTrustedCompanionOrigin(req)) {
        writeJson(res, 403, { error: 'Forbidden origin' })
        return
      }
      writeEmpty(res, 204)
      return
    }

    if (pathname.startsWith(`${COMPANION_PREFIX}/`) || pathname === COMPANION_PREFIX) {
      await handleCompanionRequest(req, res, pathname)
      return
    }

    if (req.method !== 'GET') {
      writeJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (pathname === '/status') {
      writeJson(res, 200, { ok: true })
      return
    }

    writeJson(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unhandled request error'
    writeJson(res, 500, { error: message })
  }
}

const startServerOnPort = (port: number): Promise<http.Server> =>
  new Promise((resolve, reject) => {
    const httpServer = http.createServer((req, res) => {
      void handleRequest(req, res)
    })

    httpServer.once('error', (error) => {
      httpServer.close()
      reject(error)
    })

    httpServer.listen(port, '127.0.0.1', () => resolve(httpServer))
  })

export const getCompanionPairingInfo = (): CompanionPairingInfo => {
  const clients = readCompanionPairings().clients
  return {
    clientNames: clients.map((client) => client.name),
    code: currentCompanionCode(),
    codeExpiresAt: companionPairingCodeIssuedAt + COMPANION_CODE_TTL_MS,
    pairedClientCount: clients.length,
    port: serverPort
  }
}

export const resetCompanionPairings = (): CompanionPairingInfo => {
  writeCompanionPairings({ clients: [], version: 1 })
  rotateCompanionCode()
  companionPairAttempts.clear()
  companionCaptureAttempts.clear()
  return getCompanionPairingInfo()
}

export const setCompanionCaptureHandler = (
  handler: ((payload: CompanionCapturePayload) => void) | null
): void => {
  companionCaptureHandler = handler
}

export async function startExtensionApiServer(): Promise<number | null> {
  if (server && serverPort) {
    return serverPort
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
    try {
      server = await startServerOnPort(port)
      const address = server.address() as AddressInfo | null
      serverPort = address?.port ?? port
      automationHandshakeSecret = crypto.randomBytes(32).toString('hex')
      log.info(`Extension API listening on 127.0.0.1:${serverPort}`)

      // Boot the desktop TaskQueue + write descriptor so CLI can see us.
      try {
        await startDesktopTaskQueue()
      } catch (err) {
        log.warn('startExtensionApiServer: TaskQueue failed to start:', err)
      }
      try {
        initAutomationDescriptor({
          handshakeSecret: automationHandshakeSecret,
          host: serverHost,
          port: serverPort
        })
        log.info(`Automation descriptor written at ${getAutomationDescriptorPath()}`)
      } catch (err) {
        log.warn('startExtensionApiServer: failed to write descriptor:', err)
      }
      return serverPort
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== 'EADDRINUSE') {
        log.warn('Extension API failed to start on port:', port, err)
      }
    }
  }

  log.error(`Extension API failed to bind any port in range ${PORT_RANGE_START}-${PORT_RANGE_END}`)
  return null
}

export async function stopExtensionApiServer(): Promise<void> {
  // Electron does not await will-quit listeners. Remove the discovery pointer
  // synchronously before the first asynchronous shutdown step.
  removeAutomationDescriptor()

  if (!server) {
    return
  }

  if (unsubscribeFromTaskQueue) {
    try {
      unsubscribeFromTaskQueue()
    } catch {
      /* noop */
    }
    unsubscribeFromTaskQueue = null
  }
  stopSseHeartbeat()
  for (const client of automationSseClients) {
    try {
      client.end()
    } catch {
      /* noop */
    }
  }
  automationSseClients.clear()

  await new Promise<void>((resolve) => {
    server?.close(() => resolve())
  })

  server = null
  serverPort = null
  automationToken = null
  automationTokenRecord = null
  await stopDesktopTaskQueue().catch(() => {
    /* noop */
  })
}
