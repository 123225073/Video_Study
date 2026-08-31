import assert from 'node:assert/strict'

import { AutomationClient } from '../../cli/src/transport/automation-client'
import { readDescriptor } from '../../cli/src/transport/descriptor'
import {
  AI_SECRET_ENCRYPTED_PREFIX,
  type AiSecretCodec,
  openAiSecret,
  sealAiSecret
} from '../src/main/lib/ai-secrets'

const descriptorSecret = 'a'.repeat(43)
const descriptorDocument = JSON.stringify({
  appVersion: '3.1.0',
  handshakeSecret: descriptorSecret,
  host: '127.0.0.1',
  kind: 'desktop',
  pid: process.pid,
  pidStartedAt: Date.now(),
  port: 27_100,
  schemaVersion: '1.1.0',
  tokenExpiresAt: null,
  tokenHash: null,
  tokenIssuedAt: null,
  updatedAt: Date.now(),
  version: 1
})

const descriptor = readDescriptor({
  exists: () => true,
  pathOverride: 'automation.json',
  readFile: () => descriptorDocument
})
assert.equal(descriptor.ok, true)
if (descriptor.ok) {
  assert.equal(descriptor.descriptor.handshakeSecret, descriptorSecret)
}

const legacyDescriptor = readDescriptor({
  exists: () => true,
  pathOverride: 'automation.json',
  readFile: () => JSON.stringify({ ...JSON.parse(descriptorDocument), handshakeSecret: undefined })
})
assert.equal(legacyDescriptor.ok, false)

const testHandshake = async (): Promise<void> => {
  let handshakeBody: unknown
  const client = new AutomationClient({
    baseUrl: 'http://127.0.0.1:27100',
    handshakeSecret: descriptorSecret,
    fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
      handshakeBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(
        JSON.stringify({
          expiresAt: Date.now() + 60_000,
          schemaVersion: '1.0.0',
          token: 'bearer-token',
          ttlMs: 60_000
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }) as typeof fetch
  })
  await client.handshake()
  assert.deepEqual(handshakeBody, { handshakeSecret: descriptorSecret })
}

const encryptedCodec: AiSecretCodec = {
  decryptString: (buffer) => Buffer.from(buffer.toString('utf8'), 'base64').toString('utf8'),
  encryptString: (plain) => Buffer.from(Buffer.from(plain).toString('base64')),
  isEncryptionAvailable: () => true
}
const sealed = sealAiSecret(' secret-key ', encryptedCodec)
assert.ok(sealed.startsWith(AI_SECRET_ENCRYPTED_PREFIX))
assert.equal(openAiSecret(sealed, encryptedCodec), 'secret-key')
assert.equal(
  openAiSecret('plain:legacy-key', {
    ...encryptedCodec,
    isEncryptionAvailable: () => false
  }),
  'legacy-key'
)
assert.throws(
  () =>
    sealAiSecret('must-not-be-plaintext', {
      ...encryptedCodec,
      isEncryptionAvailable: () => false
    }),
  /not saved/iu
)

void testHandshake().then(() => {
  console.log('security boundary unit checks passed')
})
