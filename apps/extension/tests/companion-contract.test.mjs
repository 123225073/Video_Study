import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import {
  BridgeRequestError,
  discoverBridge,
  pairBridge,
  postCapture
} from '../utils/bridge-client.ts'
import {
  buildCapturePayload,
  cleanHttpUrl,
  cleanText,
  isCapturePayloadSafe
} from '../utils/companion-contract.ts'

const makeSnapshot = () => ({
  captions: {
    renderedSegments: [{ endTime: 13, startTime: 12, text: ' rendered text ' }],
    tracks: [
      {
        cues: [{ endTime: 13, startTime: 12, text: ' first\ncaption ' }],
        kind: 'subtitles',
        label: 'Chinese',
        language: 'zh-CN',
        mode: 'showing'
      }
    ],
    visibleText: ''
  },
  capturedAt: '2026-08-31T00:00:00.000Z',
  page: {
    language: 'zh-CN',
    platform: 'youtube',
    selectedText: ' useful  quote ',
    title: ' A\nvideo title ',
    url: 'https://www.youtube.com/watch?v=test'
  },
  video: {
    currentTime: 12.25,
    duration: 120,
    found: true,
    paused: false,
    playbackRate: 1,
    rect: { height: 720, width: 1280, x: 0, y: 0 }
  },
  viewport: { height: 800, width: 1280 }
})

const withMockedFetch = async (replacement, action) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = replacement
  try {
    return await action()
  } finally {
    globalThis.fetch = originalFetch
  }
}

test('cleans control characters and repeated whitespace', () => {
  assert.equal(cleanText('  学习\u0000   视频\n笔记  '), '学习 视频 笔记')
})

test('accepts only HTTP and HTTPS page URLs', () => {
  assert.equal(
    cleanHttpUrl('https://www.bilibili.com/video/BV1'),
    'https://www.bilibili.com/video/BV1'
  )
  assert.equal(cleanHttpUrl('javascript:alert(1)'), '')
  assert.equal(cleanHttpUrl('file:///C:/private/video.mp4'), '')
})

test('builds a flat desktop bridge payload with sanitized captions', () => {
  const payload = buildCapturePayload('time-marker', makeSnapshot())
  assert.deepEqual(payload, {
    action: 'time-marker',
    captionCues: [{ endSeconds: 13, startSeconds: 12, text: 'first caption' }],
    captionLanguage: 'zh-CN',
    captionText: 'first caption',
    currentTimeSeconds: 12.25,
    durationSeconds: 120,
    pageUrl: 'https://www.youtube.com/watch?v=test',
    platform: 'youtube',
    selectedText: 'useful quote',
    title: 'A video title'
  })
  assert.equal(isCapturePayloadSafe(payload), true)
})

test('requires a valid cropped frame for frame captures', () => {
  const missingFrame = buildCapturePayload('frame', makeSnapshot())
  assert.equal(isCapturePayloadSafe(missingFrame), false)

  const withFrame = buildCapturePayload('frame', makeSnapshot(), {
    dataUrl: 'data:image/jpeg;base64,AAAA',
    height: 720,
    mimeType: 'image/jpeg',
    width: 1280
  })
  assert.equal(withFrame.screenshotDataUrl, 'data:image/jpeg;base64,AAAA')
  assert.equal(isCapturePayloadSafe(withFrame), true)
})

test('rejects unsafe source URLs after sanitization', () => {
  const snapshot = makeSnapshot()
  snapshot.page.url = 'chrome://settings'
  const payload = buildCapturePayload('open', snapshot)
  assert.equal(payload.pageUrl, '')
  assert.equal(isCapturePayloadSafe(payload), false)
})

test('never sends a stored bearer token while scanning unknown localhost ports', async () => {
  const requests = []
  await withMockedFetch(
    async (url, options = {}) => {
      requests.push({ headers: options.headers, url: String(url) })
      if (String(url).startsWith('http://127.0.0.1:27105')) {
        throw new TypeError('connection refused')
      }
      if (String(url).startsWith('http://127.0.0.1:27108')) {
        return new Response(
          JSON.stringify({ app: 'Fengsha AI Learning Platform', ok: true, schemaVersion: '1.0.0' }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200
          }
        )
      }
      throw new TypeError('connection refused')
    },
    async () => {
      const status = await discoverBridge({
        pairedAt: '2026-08-31T00:00:00.000Z',
        port: 27_105,
        token: 'this-token-must-not-leak'
      })
      assert.equal(status?.port, 27_108)
    }
  )
  const bearerRequests = requests.filter(({ headers }) =>
    String(JSON.stringify(headers)).includes('this-token-must-not-leak')
  )
  assert.equal(bearerRequests.length, 1)
  assert.match(bearerRequests[0].url, /:27105\//)
})

test('ignores a desktop status with an incompatible schema version', async () => {
  await withMockedFetch(
    async (url) => {
      if (String(url).startsWith('http://127.0.0.1:27100')) {
        return new Response(
          JSON.stringify({ app: 'Future Desktop', ok: true, schemaVersion: '2.0.0' }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200
          }
        )
      }
      throw new TypeError('connection refused')
    },
    async () => {
      assert.equal(await discoverBridge(), null)
    }
  )
})

test('accepts the current desktop pairing response and localized client name', async () => {
  let requestBody
  await withMockedFetch(
    async (_url, options = {}) => {
      requestBody = JSON.parse(String(options.body))
      return new Response(
        JSON.stringify({
          clientId: 'client-1',
          port: 27_100,
          schemaVersion: '1.0.0',
          token: 'a'.repeat(32)
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        }
      )
    },
    async () => {
      const record = await pairBridge(
        { baseUrl: 'http://127.0.0.1:27100', port: 27_100 },
        ' 824 196 ',
        '风沙浏览器学习伴侣'
      )
      assert.equal(record.port, 27_100)
      assert.equal(record.token, 'a'.repeat(32))
    }
  )
  assert.deepEqual(requestBody, {
    clientName: '风沙浏览器学习伴侣',
    code: '824 196'
  })
})

test('rejects a pairing response with an incompatible schema version', async () => {
  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({ port: 27_100, schemaVersion: '0.9.0', token: 'a'.repeat(32) }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      ),
    async () => {
      await assert.rejects(
        pairBridge({ baseUrl: 'http://127.0.0.1:27100', port: 27_100 }, '824196'),
        (error) =>
          error instanceof BridgeRequestError && error.message.includes('incompatible companion')
      )
    }
  )
})

test('validates the complete current desktop capture response', async () => {
  const payload = buildCapturePayload('open', makeSnapshot())
  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({
          accepted: true,
          action: 'open',
          clientName: '风沙浏览器学习伴侣',
          schemaVersion: '1.0.0'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 202 }
      ),
    async () => {
      const response = await postCapture(
        { baseUrl: 'http://127.0.0.1:27100', port: 27_100 },
        'a'.repeat(32),
        payload
      )
      assert.equal(response.accepted, true)
      assert.equal(response.action, payload.action)
    }
  )
})

test('rejects a capture response for a different action', async () => {
  const payload = buildCapturePayload('open', makeSnapshot())
  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({
          accepted: true,
          action: 'frame',
          clientName: '风沙浏览器学习伴侣',
          schemaVersion: '1.0.0'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 202 }
      ),
    async () => {
      await assert.rejects(
        postCapture({ baseUrl: 'http://127.0.0.1:27100', port: 27_100 }, 'a'.repeat(32), payload),
        (error) => error instanceof BridgeRequestError && error.message.includes('rejected')
      )
    }
  )
})

test('rejects a capture response with an incompatible schema version', async () => {
  const payload = buildCapturePayload('open', makeSnapshot())
  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({
          accepted: true,
          action: 'open',
          clientName: '风沙浏览器学习伴侣',
          schemaVersion: '2.0.0'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 202 }
      ),
    async () => {
      await assert.rejects(
        postCapture({ baseUrl: 'http://127.0.0.1:27100', port: 27_100 }, 'a'.repeat(32), payload),
        (error) => error instanceof BridgeRequestError && error.message.includes('rejected')
      )
    }
  )
})

test('keeps popup locale catalogs in sync and routes copy through browser i18n', async () => {
  const [englishSource, chineseSource, popupSource] = await Promise.all([
    fs.readFile(new URL('../public/_locales/en/messages.json', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/_locales/zh_CN/messages.json', import.meta.url), 'utf8'),
    fs.readFile(new URL('../entrypoints/popup/App.tsx', import.meta.url), 'utf8')
  ])
  const english = JSON.parse(englishSource)
  const chinese = JSON.parse(chineseSource)
  assert.deepEqual(Object.keys(chinese).sort(), Object.keys(english).sort())
  assert.match(popupSource, /browser\.i18n\.getMessage/)
  const usedKeys = [...popupSource.matchAll(/message\('([^']+)'/g)].map((match) => match[1])
  for (const key of usedKeys) {
    assert.ok(english[key]?.message, `Missing English message: ${key}`)
    assert.ok(chinese[key]?.message, `Missing Chinese message: ${key}`)
  }
})
