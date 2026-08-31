import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { BrowserWindow } from 'electron'
import { classifyAiPromptError } from '../../shared/ai-run'
import type {
  AiImageRunContext,
  AiImageRunInput,
  AiImageRunSnapshot,
  AiPromptErrorCode
} from '../../shared/ai-types'
import { scopedLoggers } from '../utils/logger'
import { type ActiveAiRunRegistration, registerActiveAiRun } from './ai-active-runs'
import { aiStore, DEFAULT_IMAGE_MODEL_ID } from './ai-store'

const IMAGE_RUN_CHANNEL = 'ai:image-run'
const PARTIAL_IMAGE_COUNT = 2
const MAX_ERROR_BODY_CHARS = 4096
const MAX_PROMPT_CHARS = 32_000
const MAX_QUOTE_CHARS = 8000
// Keep the resulting base64 data URL below LearningAttachmentStore's 4 MiB handoff limit.
export const MAX_REMOTE_IMAGE_BYTES = 3 * 1024 * 1024 - 128
const IMAGE_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto'])
const IMAGE_QUALITIES = new Set(['low', 'medium', 'high', 'auto'])
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const REMOTE_IMAGE_REDIRECT_LIMIT = 4
const log = scopedLoggers.ai

const unsafeRemoteAddresses = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  unsafeRemoteAddresses.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  unsafeRemoteAddresses.addSubnet(network, prefix, 'ipv6')
}

export type ImageHostResolver = (hostname: string) => Promise<readonly string[]>

const resolveImageHost: ImageHostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((result) => result.address)

const assertSafeRemoteImageUrl = async (
  source: string | URL,
  resolveHost: ImageHostResolver
): Promise<URL> => {
  let url: URL
  try {
    url = source instanceof URL ? new URL(source.href) : new URL(source)
  } catch {
    throw new Error('Image API returned an invalid image URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Remote image URLs must use credential-free HTTPS')
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, '')
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isIP(hostname) !== 0
  ) {
    throw new Error('Remote image URL targets are not allowed on local or literal addresses')
  }
  let addresses: readonly string[]
  try {
    addresses = await resolveHost(hostname)
  } catch {
    throw new Error('Remote image host could not be resolved safely')
  }
  if (
    addresses.length === 0 ||
    addresses.some((address) => {
      const family = isIP(address)
      return family === 0 || unsafeRemoteAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6')
    })
  ) {
    throw new Error('Remote image host resolves to a private or unsafe network')
  }
  return url
}

interface ActiveImageRun {
  controller: AbortController
  discarded: boolean
  quitRegistration?: ActiveAiRunRegistration
  snapshot: AiImageRunSnapshot
}

interface ImageApiEvent {
  type?: string
  b64_json?: string
  partial_image_b64?: string
  partial_image_index?: number
  data?: Array<{ b64_json?: string; url?: string }>
  error?: { message?: string } | string
}

interface ImageCandidate {
  base64?: string
  index: number
  url?: string
}

const runs = new Map<string, ActiveImageRun>()

/** Empty state returned before a learning item has generated an image. */
export const idleImageRunSnapshot = (
  downloadId: string,
  now: number = Date.now()
): AiImageRunSnapshot => ({
  downloadId,
  runId: '',
  startedAt: now,
  status: 'idle',
  stage: 'idle',
  modelId: '',
  context: null,
  progressText: '',
  imageDataUrl: null,
  partialImageIndex: -1,
  error: null,
  errorCode: null,
  updatedAt: now
})

/** Remove secrets and binary blobs before an upstream error reaches logs or the renderer. */
const safeErrorMessage = (value: unknown, secrets: string[] = []): string => {
  const raw = value instanceof Error ? value.message : String(value || 'Image generation failed')
  let sanitized = raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9+/=]{256,}/g, '[binary omitted]')
  for (const secret of secrets) {
    if (secret.length >= 4) {
      sanitized = sanitized.replaceAll(secret, '[redacted]')
    }
  }
  return sanitized.slice(0, MAX_ERROR_BODY_CHARS)
}

/** Extract the useful message from an Image API error without retaining its whole body. */
const responseErrorMessage = async (
  response: Response,
  secrets: string[] = []
): Promise<string> => {
  const text = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS)
  const withStatus = (message: string): string => `HTTP ${response.status}: ${message}`
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    if (typeof parsed.error === 'string') {
      return safeErrorMessage(withStatus(parsed.error), secrets)
    }
    if (parsed.error?.message) {
      return safeErrorMessage(withStatus(parsed.error.message), secrets)
    }
    if (parsed.message) {
      return safeErrorMessage(withStatus(parsed.message), secrets)
    }
  } catch {
    // Some compatible endpoints return plain text.
  }
  return safeErrorMessage(withStatus(text || 'Image API request failed'), secrets)
}

/** Resolve the standard OpenAI-compatible image generation endpoint. */
export const resolveImageGenerationUrl = (baseUrl: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  const url = new URL(
    normalized.endsWith('/images/generations') ? normalized : `${normalized}/images/generations`
  )
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Image API base URL must use HTTP or HTTPS')
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '::1' ||
    /^127(?:\.\d{1,3}){3}$/u.test(url.hostname)
  if (url.protocol === 'http:' && !loopback) {
    throw new Error('Remote Image API base URLs must use HTTPS')
  }
  return url.toString()
}

const imageMimeFromSignature = (data: Uint8Array): string | null => {
  if (
    data.length >= 8 &&
    Buffer.from(data.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) {
    return 'image/jpeg'
  }
  if (
    data.length >= 12 &&
    Buffer.from(data.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(data.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

const validatedImageDataUrl = (data: Uint8Array, declaredMime?: string): string => {
  if (data.byteLength === 0 || data.byteLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error(`Image content must be between 1 byte and ${MAX_REMOTE_IMAGE_BYTES} bytes`)
  }
  const signatureMime = imageMimeFromSignature(data)
  const normalizedMime = declaredMime?.split(';')[0].trim().toLowerCase()
  if (!signatureMime || (normalizedMime && normalizedMime !== signatureMime)) {
    throw new Error('Image content type does not match its file signature')
  }
  return `data:${signatureMime};base64,${Buffer.from(data).toString('base64')}`
}

/** Securely localize a remote image before any renderer or notebook can persist it. */
export const localizeRemoteImage = async (
  source: string,
  fetchImage: typeof fetch = fetch,
  resolveHost: ImageHostResolver = resolveImageHost
): Promise<string> => {
  let currentUrl = await assertSafeRemoteImageUrl(source, resolveHost)
  let response: Response | null = null
  for (let redirectCount = 0; redirectCount <= REMOTE_IMAGE_REDIRECT_LIMIT; redirectCount += 1) {
    response = await fetchImage(currentUrl, {
      headers: { Accept: 'image/png,image/jpeg,image/webp' },
      redirect: 'manual'
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      break
    }
    if (redirectCount === REMOTE_IMAGE_REDIRECT_LIMIT) {
      throw new Error('Remote image exceeded the safe redirect limit')
    }
    const location = response.headers.get('location')
    if (!location) {
      throw new Error('Remote image redirect is missing its destination')
    }
    currentUrl = await assertSafeRemoteImageUrl(new URL(location, currentUrl), resolveHost)
  }
  if (!response) {
    throw new Error('Remote image download failed')
  }
  if (!response.ok) {
    throw new Error(`Remote image download failed (HTTP ${response.status})`)
  }
  await assertSafeRemoteImageUrl(response.url || currentUrl, resolveHost)
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  if (!IMAGE_MIME_TYPES.has(contentType)) {
    throw new Error('Remote image has an unsupported Content-Type')
  }
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error(`Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES} byte limit`)
  }
  if (!response.body) {
    throw new Error('Remote image response is empty')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    received += value.byteLength
    if (received > MAX_REMOTE_IMAGE_BYTES) {
      await reader.cancel()
      throw new Error(`Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES} byte limit`)
    }
    chunks.push(value)
  }
  const data = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return validatedImageDataUrl(data, contentType)
}

/** Pull an image and partial index out of either stream events or JSON responses. */
const imageFromEvent = (event: ImageApiEvent, fallbackIndex: number): ImageCandidate | null => {
  const base64 = event.b64_json?.trim() || event.partial_image_b64?.trim()
  if (base64) {
    return {
      base64,
      index: Number.isFinite(event.partial_image_index)
        ? Number(event.partial_image_index)
        : fallbackIndex
    }
  }
  const first = event.data?.[0]
  if (first?.b64_json?.trim()) {
    return { base64: first.b64_json.trim(), index: fallbackIndex }
  }
  if (first?.url?.trim()) {
    return { index: fallbackIndex, url: first.url.trim() }
  }
  return null
}

const localizeImageCandidate = async (candidate: ImageCandidate): Promise<string> => {
  if (candidate.base64) {
    const normalized = candidate.base64.replace(/\s+/gu, '')
    const data = Buffer.from(normalized, 'base64')
    if (data.toString('base64').replace(/[=]+$/u, '') !== normalized.replace(/[=]+$/u, '')) {
      throw new Error('Image API returned malformed base64 image data')
    }
    return validatedImageDataUrl(data)
  }
  if (candidate.url) {
    return localizeRemoteImage(candidate.url)
  }
  throw new Error('Image API returned no image')
}

/** Parse one SSE data payload, ignoring keep-alives and completion sentinels. */
const parseSseData = (frame: string): ImageApiEvent | null => {
  const trimmedFrame = frame.trim()
  if (trimmedFrame.startsWith('{')) {
    return JSON.parse(trimmedFrame) as ImageApiEvent
  }
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()
  if (!data || data === '[DONE]') {
    return null
  }
  return JSON.parse(data) as ImageApiEvent
}

/** Consume an Image API SSE response and expose every partial image immediately. */
const consumeImageStream = async (
  response: Response,
  onImage: (dataUrl: string, index: number) => void,
  secrets: string[] = []
): Promise<string> => {
  if (!response.body) {
    throw new Error('Image API returned an empty stream')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let latestImage = ''
  let fallbackIndex = 0

  const acceptFrame = async (frame: string): Promise<void> => {
    const event = parseSseData(frame)
    if (!event) {
      return
    }
    if (event.error) {
      const message = typeof event.error === 'string' ? event.error : event.error.message
      throw new Error(safeErrorMessage(message || 'Image generation failed', secrets))
    }
    const image = imageFromEvent(event, fallbackIndex)
    if (!image) {
      return
    }
    fallbackIndex = Math.max(fallbackIndex + 1, image.index + 1)
    latestImage = await localizeImageCandidate(image)
    onImage(latestImage, image.index)
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      await acceptFrame(frame)
    }
    if (done) {
      break
    }
  }
  if (buffer.trim()) {
    await acceptFrame(buffer)
  }
  if (!latestImage) {
    throw new Error('Image API returned no image')
  }
  return latestImage
}

/** True when a compatible endpoint rejected only the optional streaming fields. */
const canRetryWithoutStreaming = (status: number, message: string): boolean =>
  [400, 404, 405, 422, 501].includes(status) &&
  /stream|partial[_ -]?images?|unknown (field|parameter)|unsupported|not implemented/i.test(message)

/** Send the latest snapshot to every live renderer window. */
const broadcastImageRun = (snapshot: AiImageRunSnapshot): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IMAGE_RUN_CHANNEL, snapshot)
    }
  }
}

/** Update and broadcast a live run unless it was replaced by a newer one. */
const emit = (run: ActiveImageRun, update: Partial<AiImageRunSnapshot>): void => {
  if (run.discarded) {
    return
  }
  run.snapshot = { ...run.snapshot, ...update, updatedAt: Date.now() }
  broadcastImageRun(run.snapshot)
  if (run.snapshot.status !== 'running') {
    run.quitRegistration?.finish()
  }
}

/** Start an image request and return immediately; progress arrives on `ai:image-run`. */
export const startImageRun = (input: AiImageRunInput): AiImageRunSnapshot => {
  const prompt = input.context.optimizedPrompt.trim().slice(0, MAX_PROMPT_CHARS)
  const context: AiImageRunContext = Object.freeze({
    kind: input.context.kind,
    optimizedPrompt: prompt,
    quote: input.context.quote.trim().slice(0, MAX_QUOTE_CHARS)
  })
  const active = aiStore.getImageProviderSecret()
  const now = Date.now()
  const runId = randomUUID()
  const fail = (message: string, code: AiPromptErrorCode): AiImageRunSnapshot => {
    const snapshot: AiImageRunSnapshot = {
      downloadId: input.downloadId,
      runId,
      startedAt: now,
      status: 'error',
      stage: 'idle',
      modelId: active.provider.modelId || DEFAULT_IMAGE_MODEL_ID,
      context,
      progressText: '图片生成失败。',
      imageDataUrl: null,
      partialImageIndex: -1,
      error: message,
      errorCode: code,
      updatedAt: now
    }
    const previous = runs.get(input.downloadId)
    if (previous) {
      previous.discarded = true
      previous.quitRegistration?.finish()
      previous.controller.abort()
    }
    runs.set(input.downloadId, {
      controller: new AbortController(),
      discarded: false,
      snapshot
    })
    broadcastImageRun(snapshot)
    return snapshot
  }

  if (!input.downloadId.trim()) {
    return fail('Download id is required', 'unknown')
  }
  if (!prompt) {
    return fail('Image prompt is empty', 'empty-output')
  }
  if (!['cover', 'logic', 'quote'].includes(context.kind)) {
    return fail('Unknown image generation type', 'unknown')
  }
  if (active.provider.authType !== 'none' && !active.apiKey) {
    return fail('The image provider is missing an API key', 'missing-api-key')
  }
  const modelId = active.provider.modelId.trim() || DEFAULT_IMAGE_MODEL_ID
  if (!modelId) {
    return fail('The enabled provider is missing an image model id', 'missing-model')
  }
  let endpoint: string
  try {
    endpoint = resolveImageGenerationUrl(active.provider.baseUrl)
  } catch {
    return fail('The enabled provider has an invalid Image API base URL', 'network')
  }

  const previous = runs.get(input.downloadId)
  if (previous) {
    previous.discarded = true
    previous.quitRegistration?.finish()
    previous.controller.abort()
  }
  const controller = new AbortController()
  const snapshot: AiImageRunSnapshot = {
    downloadId: input.downloadId,
    runId,
    startedAt: now,
    status: 'running',
    stage: 'requesting',
    modelId,
    context,
    progressText: '正在连接图片模型…',
    imageDataUrl: null,
    partialImageIndex: -1,
    error: null,
    errorCode: null,
    updatedAt: now
  }
  const run: ActiveImageRun = { controller, discarded: false, snapshot }
  runs.set(input.downloadId, run)
  run.quitRegistration = registerActiveAiRun('image', () => {
    stopImageRun(input.downloadId)
  })
  broadcastImageRun(snapshot)
  log.info('ai image run started', { downloadId: input.downloadId, runId, modelId })

  void (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (active.provider.authType === 'bearer') {
      headers.Authorization = `Bearer ${active.apiKey}`
    } else if (active.provider.authType === 'api-key') {
      headers[active.provider.apiKeyHeader] = active.apiKey
    }
    const commonBody = {
      model: modelId,
      prompt,
      n: 1,
      size: input.size && IMAGE_SIZES.has(input.size) ? input.size : '1024x1024',
      quality: input.quality && IMAGE_QUALITIES.has(input.quality) ? input.quality : 'auto'
    }
    emit(run, { stage: 'generating', progressText: '图片模型正在构图…' })

    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...commonBody, stream: true, partial_images: PARTIAL_IMAGE_COUNT }),
      signal: controller.signal
    })
    if (!response.ok) {
      const message = await responseErrorMessage(response, [active.apiKey])
      if (!canRetryWithoutStreaming(response.status, message)) {
        throw new Error(message)
      }
      emit(run, {
        stage: 'generating',
        progressText: '当前接口不支持局部图片流，已切换兼容模式继续生成…'
      })
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(commonBody),
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, [active.apiKey]))
      }
      const result = (await response.json()) as ImageApiEvent
      const image = imageFromEvent(result, 0)
      if (!image) {
        throw new Error('Image API returned no image')
      }
      if (run.snapshot.status !== 'running') {
        return
      }
      const localized = await localizeImageCandidate(image)
      emit(run, {
        status: 'completed',
        stage: 'completed',
        progressText: '图片生成完成。',
        imageDataUrl: localized,
        partialImageIndex: image.index
      })
      return
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('application/json')) {
      const result = (await response.json()) as ImageApiEvent
      const image = imageFromEvent(result, 0)
      if (!image) {
        throw new Error('Image API returned no image')
      }
      if (run.snapshot.status !== 'running') {
        return
      }
      const localized = await localizeImageCandidate(image)
      emit(run, {
        status: 'completed',
        stage: 'completed',
        progressText: '图片生成完成。',
        imageDataUrl: localized,
        partialImageIndex: image.index
      })
      return
    }

    const finalImage = await consumeImageStream(
      response,
      (dataUrl, index) => {
        emit(run, {
          stage: 'partial',
          progressText: `已收到第 ${index + 1} 张渐进预览，模型仍在完善细节…`,
          imageDataUrl: dataUrl,
          partialImageIndex: index
        })
      },
      [active.apiKey]
    )
    if (run.snapshot.status !== 'running') {
      return
    }
    emit(run, {
      status: 'completed',
      stage: 'completed',
      progressText: '图片生成完成。',
      imageDataUrl: finalImage
    })
  })()
    .then(() => {
      if (!run.discarded && run.snapshot.status === 'completed') {
        log.info('ai image run completed', { downloadId: input.downloadId, runId, modelId })
      }
    })
    .catch((error: unknown) => {
      if (run.discarded || run.snapshot.status === 'aborted') {
        return
      }
      const message = safeErrorMessage(error, [active.apiKey])
      const errorCode = classifyAiPromptError(message)
      emit(run, {
        status: 'error',
        progressText: '图片生成失败。',
        error: message,
        errorCode
      })
      log.warn('ai image run failed', {
        downloadId: input.downloadId,
        runId,
        modelId,
        error: message,
        errorCode
      })
    })

  return snapshot
}

/** Return the current in-process image run for a learning item. */
export const getImageRunSnapshot = (downloadId: string): AiImageRunSnapshot =>
  runs.get(downloadId)?.snapshot ?? idleImageRunSnapshot(downloadId)

/**
 * Permanently discard every image-generation state owned by a deleted learning item.
 * This differs from stopImageRun: completed/error snapshots may contain large base64 images
 * and must not remain addressable after their workspace has been deleted.
 */
export const deleteImageRunForDownload = (downloadId: string): boolean => {
  const run = runs.get(downloadId)
  if (!run) {
    return false
  }
  run.discarded = true
  if (run.snapshot.status === 'running') {
    run.controller.abort()
  }
  run.quitRegistration?.finish()
  run.snapshot = idleImageRunSnapshot(downloadId)
  runs.delete(downloadId)
  broadcastImageRun(run.snapshot)
  return true
}

/** Abort the current image run without affecting completed images. */
export const stopImageRun = (downloadId: string): AiImageRunSnapshot => {
  const run = runs.get(downloadId)
  if (run?.snapshot.status !== 'running') {
    return run?.snapshot ?? idleImageRunSnapshot(downloadId)
  }
  run.controller.abort()
  emit(run, {
    status: 'aborted',
    progressText: '已停止图片生成。',
    error: null,
    errorCode: null
  })
  return run.snapshot
}
