const assert = require('node:assert/strict') as typeof import('node:assert/strict')
const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
const { rm } = require('node:fs/promises') as typeof import('node:fs/promises')
const { createServer } = require('node:http') as typeof import('node:http')
const { tmpdir } = require('node:os') as typeof import('node:os')
const { join } = require('node:path') as typeof import('node:path')
const { app } = require('electron') as typeof import('electron')

type AiImageRunSnapshot = import('../src/shared/ai-types').AiImageRunSnapshot
type AiImageRunInput = import('../src/shared/ai-types').AiImageRunInput

const TEST_API_KEY = 'local-image-test-key'
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const imageBase64 = (label: string): string =>
  Buffer.concat([PNG_SIGNATURE, Buffer.from(label)]).toString('base64')
const imageInput = (
  downloadId: string,
  prompt: string,
  kind: AiImageRunInput['context']['kind'] = 'logic',
  quote = ''
): AiImageRunInput => ({
  context: { kind, optimizedPrompt: prompt, quote },
  downloadId
})
const resolvePublicHost = async (): Promise<readonly string[]> => ['93.184.216.34']

/** Read the small JSON request sent by the local test client. */
const readJson = async (
  request: import('node:http').IncomingMessage
): Promise<Record<string, unknown>> => {
  let text = ''
  request.setEncoding('utf8')
  for await (const chunk of request) {
    text += chunk
  }
  return JSON.parse(text) as Record<string, unknown>
}

/** Wait for an image snapshot condition with a short deterministic timeout. */
const waitFor = async (
  read: () => AiImageRunSnapshot,
  predicate: (snapshot: AiImageRunSnapshot) => boolean,
  timeoutMs = 3000
): Promise<AiImageRunSnapshot> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = read()
    if (predicate(snapshot)) {
      return snapshot
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for image run; latest=${JSON.stringify(read())}`)
}

const writeSse = (
  response: import('node:http').ServerResponse,
  event: Record<string, unknown>
): void => {
  response.write(`data: ${JSON.stringify(event)}\n\n`)
}

const userData = mkdtempSync(join(tmpdir(), 'fengsha-ai-image-test-'))
app.setPath('userData', userData)

const runTests = async (): Promise<void> => {
  process.stdout.write('AI image test: Electron ready\n')
  let oldRequestStarted: (() => void) | null = null
  const oldRequestReady = new Promise<void>((resolve) => {
    oldRequestStarted = resolve
  })

  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.url, '/v1/images/generations')
      const body = await readJson(request)
      assert.equal(body.model, 'gpt-image-2')
      assert.equal(body.size, '1024x1024')
      assert.equal(body.quality, 'auto')
      const prompt = String(body.prompt)
      if (prompt === 'header-test') {
        assert.equal(request.headers['x-image-key'], TEST_API_KEY)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ data: [{ b64_json: imageBase64('header') }] }))
        return
      }
      assert.equal(request.headers.authorization, `Bearer ${TEST_API_KEY}`)

      if (prompt === 'stream-test') {
        assert.equal(body.stream, true)
        assert.equal(body.partial_images, 2)
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        writeSse(response, {
          type: 'image_generation.partial_image',
          partial_image_index: 0,
          b64_json: imageBase64('partial')
        })
        setTimeout(() => {
          writeSse(response, {
            type: 'image_generation.partial_image',
            partial_image_index: 1,
            b64_json: imageBase64('final')
          })
          response.end('data: [DONE]\n\n')
        }, 120)
        return
      }

      if (prompt === 'fallback-test') {
        if (body.stream === true) {
          response.writeHead(400, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ error: { message: 'Unsupported parameter: stream' } }))
          return
        }
        assert.equal(body.partial_images, undefined)
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ data: [{ b64_json: imageBase64('fallback') }] }))
        }, 120)
        return
      }

      if (prompt === 'cancel-test') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write(': generating\n\n')
        setTimeout(() => {
          if (!response.destroyed) {
            writeSse(response, { partial_image_index: 0, b64_json: imageBase64('late') })
            response.end()
          }
        }, 300)
        return
      }

      if (prompt === 'old-test') {
        oldRequestStarted?.()
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        setTimeout(() => {
          if (!response.destroyed) {
            writeSse(response, { partial_image_index: 0, b64_json: imageBase64('old') })
            response.end()
          }
        }, 250)
        return
      }

      if (prompt === 'new-test') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ data: [{ b64_json: imageBase64('new') }] }))
        return
      }

      if (prompt === 'error-test') {
        response.writeHead(401, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: `Rejected ${TEST_API_KEY}` } }))
        return
      }

      if (prompt === 'remote-unsafe-test') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({ data: [{ url: 'https://127.0.0.1/internal-generated.png' }] })
        )
        return
      }

      response.writeHead(404)
      response.end()
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          error: { message: error instanceof Error ? error.message : String(error) }
        })
      )
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.stdout.write('AI image test: local server ready\n')
  const address = server.address()
  assert(address && typeof address !== 'string')

  let exitCode = 0
  try {
    const { aiStore, DEFAULT_IMAGE_MODEL_ID } =
      require('../src/main/lib/ai-store') as typeof import('../src/main/lib/ai-store')
    const { countActiveAiRunsByKind } =
      require('../src/main/lib/ai-active-runs') as typeof import('../src/main/lib/ai-active-runs')
    const {
      deleteImageRunForDownload,
      getImageRunSnapshot,
      localizeRemoteImage,
      MAX_REMOTE_IMAGE_BYTES,
      resolveImageGenerationUrl,
      startImageRun,
      stopImageRun
    } =
      require('../src/main/lib/ai-image-runner') as typeof import('../src/main/lib/ai-image-runner')

    assert.equal(DEFAULT_IMAGE_MODEL_ID, 'gpt-image-2')
    assert.equal(
      resolveImageGenerationUrl('https://api.openai.com/v1/'),
      'https://api.openai.com/v1/images/generations'
    )
    assert.equal(
      resolveImageGenerationUrl('https://api.openai.com/v1/images/generations'),
      'https://api.openai.com/v1/images/generations'
    )

    const provider = aiStore.upsertProvider({
      presetId: 'deepseek',
      name: 'Independent text provider',
      modelId: 'deepseek-chat',
      apiKey: TEST_API_KEY
    })
    assert.equal(provider.presetId, 'deepseek')
    const unconfigured = startImageRun(imageInput('unconfigured', 'must-not-call-text-provider'))
    assert.equal(unconfigured.status, 'error')
    assert.equal(unconfigured.errorCode, 'missing-api-key')

    const imageProvider = aiStore.upsertImageProvider({
      apiKey: TEST_API_KEY,
      authType: 'bearer',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      modelId: 'gpt-image-2',
      provider: 'openai-compatible'
    })
    assert.equal(imageProvider.modelId, 'gpt-image-2')
    const publicSnapshot = aiStore.getSnapshot()
    assert.equal(publicSnapshot.activeProviderId, provider.id)
    assert.equal(JSON.stringify(publicSnapshot).includes(TEST_API_KEY), false)

    const streamStart = startImageRun(imageInput('stream', 'stream-test', 'cover'))
    assert.equal(streamStart.status, 'running')
    assert.equal(countActiveAiRunsByKind('image'), 1)
    const partial = await waitFor(
      () => getImageRunSnapshot('stream'),
      (snapshot) => snapshot.stage === 'partial'
    )
    assert.equal(partial.imageDataUrl, `data:image/png;base64,${imageBase64('partial')}`)
    const streamed = await waitFor(
      () => getImageRunSnapshot('stream'),
      (snapshot) => snapshot.status === 'completed'
    )
    assert.equal(streamed.partialImageIndex, 1)
    assert.equal(streamed.imageDataUrl, `data:image/png;base64,${imageBase64('final')}`)
    assert.deepEqual(streamed.context, {
      kind: 'cover',
      optimizedPrompt: 'stream-test',
      quote: ''
    })
    assert.equal(countActiveAiRunsByKind('image'), 0)
    assert.equal(deleteImageRunForDownload('stream'), true)
    const deletedCompleted = getImageRunSnapshot('stream')
    assert.equal(deletedCompleted.status, 'idle')
    assert.equal(deletedCompleted.imageDataUrl, null)
    process.stdout.write('AI image test: SSE passed\n')

    startImageRun(imageInput('fallback', 'fallback-test'))
    await waitFor(
      () => getImageRunSnapshot('fallback'),
      (snapshot) => snapshot.progressText.includes('兼容模式')
    )
    const fallback = await waitFor(
      () => getImageRunSnapshot('fallback'),
      (snapshot) => snapshot.status === 'completed'
    )
    assert.equal(fallback.imageDataUrl, `data:image/png;base64,${imageBase64('fallback')}`)
    process.stdout.write('AI image test: fallback passed\n')

    startImageRun(imageInput('delete-running', 'cancel-test'))
    await waitFor(
      () => getImageRunSnapshot('delete-running'),
      (snapshot) => snapshot.stage === 'generating'
    )
    assert.equal(deleteImageRunForDownload('delete-running'), true)
    assert.equal(countActiveAiRunsByKind('image'), 0)
    assert.equal(getImageRunSnapshot('delete-running').status, 'idle')
    await new Promise((resolve) => setTimeout(resolve, 350))
    assert.equal(getImageRunSnapshot('delete-running').status, 'idle')
    process.stdout.write('AI image test: running deletion passed\n')

    startImageRun(imageInput('cancel', 'cancel-test'))
    await waitFor(
      () => getImageRunSnapshot('cancel'),
      (snapshot) => snapshot.stage === 'generating'
    )
    assert.equal(stopImageRun('cancel').status, 'aborted')
    assert.equal(countActiveAiRunsByKind('image'), 0)
    await new Promise((resolve) => setTimeout(resolve, 350))
    assert.equal(getImageRunSnapshot('cancel').status, 'aborted')
    process.stdout.write('AI image test: cancellation passed\n')

    startImageRun(imageInput('replace', 'old-test', 'cover'))
    await oldRequestReady
    const replacement = startImageRun(imageInput('replace', 'new-test', 'quote', '不可串到封面图'))
    assert.equal(countActiveAiRunsByKind('image'), 1)
    const replaced = await waitFor(
      () => getImageRunSnapshot('replace'),
      (snapshot) => snapshot.status === 'completed'
    )
    assert.equal(replaced.runId, replacement.runId)
    assert.equal(replaced.imageDataUrl, `data:image/png;base64,${imageBase64('new')}`)
    assert.deepEqual(replaced.context, {
      kind: 'quote',
      optimizedPrompt: 'new-test',
      quote: '不可串到封面图'
    })
    assert.equal(countActiveAiRunsByKind('image'), 0)
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(getImageRunSnapshot('replace').runId, replacement.runId)
    process.stdout.write('AI image test: replacement passed\n')

    startImageRun(imageInput('error', 'error-test'))
    const failed = await waitFor(
      () => getImageRunSnapshot('error'),
      (snapshot) => snapshot.status === 'error'
    )
    assert.equal(failed.errorCode, 'auth')
    assert.equal(failed.error?.includes(TEST_API_KEY), false)
    assert.match(failed.error ?? '', /\[redacted\]/)

    startImageRun(imageInput('remote-unsafe', 'remote-unsafe-test'))
    const unsafeRemote = await waitFor(
      () => getImageRunSnapshot('remote-unsafe'),
      (snapshot) => snapshot.status === 'error'
    )
    assert.match(unsafeRemote.error ?? '', /local or literal/u)
    assert.equal(countActiveAiRunsByKind('image'), 0)

    aiStore.upsertImageProvider({
      apiKeyHeader: 'x-image-key',
      authType: 'api-key',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      modelId: 'gpt-image-2',
      provider: 'openai-compatible'
    })
    startImageRun(imageInput('header', 'header-test'))
    const headerAuth = await waitFor(
      () => getImageRunSnapshot('header'),
      (snapshot) => snapshot.status === 'completed'
    )
    assert.equal(headerAuth.status, 'completed')

    const localized = await localizeRemoteImage(
      'https://cdn.example.test/generated.png',
      async () => {
        const response = new Response(Buffer.concat([PNG_SIGNATURE, Buffer.from('remote')]), {
          headers: { 'Content-Type': 'image/png' },
          status: 200
        })
        Object.defineProperty(response, 'url', {
          value: 'https://cdn.example.test/generated.png'
        })
        return response
      },
      resolvePublicHost
    )
    assert.equal(localized, `data:image/png;base64,${imageBase64('remote')}`)
    await assert.rejects(
      localizeRemoteImage(
        'https://cdn.example.test/wrong.png',
        async () => {
          const response = new Response('not-an-image', {
            headers: { 'Content-Type': 'image/png' },
            status: 200
          })
          Object.defineProperty(response, 'url', { value: 'https://cdn.example.test/wrong.png' })
          return response
        },
        resolvePublicHost
      ),
      /signature/u
    )
    await assert.rejects(
      localizeRemoteImage(
        'https://cdn.example.test/large.png',
        async () => {
          const response = new Response(PNG_SIGNATURE, {
            headers: {
              'Content-Length': String(MAX_REMOTE_IMAGE_BYTES + 1),
              'Content-Type': 'image/png'
            },
            status: 200
          })
          Object.defineProperty(response, 'url', { value: 'https://cdn.example.test/large.png' })
          return response
        },
        resolvePublicHost
      ),
      /exceeds/u
    )
    await assert.rejects(
      localizeRemoteImage('https://127.0.0.1/generated.png', fetch, resolvePublicHost),
      /local or literal/u
    )
    await assert.rejects(
      localizeRemoteImage('https://metadata.example.test/generated.png', fetch, async () => [
        '169.254.169.254'
      ]),
      /private or unsafe/u
    )
    let redirectFetches = 0
    await assert.rejects(
      localizeRemoteImage(
        'https://cdn.example.test/redirect.png',
        async () => {
          redirectFetches += 1
          return Response.redirect('https://metadata.example.test/latest/meta-data', 302)
        },
        async (hostname) =>
          hostname === 'metadata.example.test' ? ['10.0.0.8'] : ['93.184.216.34']
      ),
      /private or unsafe/u
    )
    assert.equal(redirectFetches, 1)

    console.log('AI image runner protocol tests passed')
  } catch (error) {
    exitCode = 1
    console.error(error)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(userData, { recursive: true, force: true })
    app.exit(exitCode)
  }
}

void app.whenReady().then(runTests)
