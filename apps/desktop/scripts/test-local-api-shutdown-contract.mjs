import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const sourcePath = path.resolve(import.meta.dirname, '../src/main/local-api.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const functionStart = source.indexOf('export async function stopExtensionApiServer')
const functionEnd = source.indexOf('\n}', functionStart)
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'stopExtensionApiServer must exist')

const functionSource = source.slice(functionStart, functionEnd)
const descriptorRemoval = functionSource.indexOf('removeAutomationDescriptor()')
const firstAsyncWait = functionSource.indexOf('\n  await ')
assert.ok(descriptorRemoval >= 0, 'stopExtensionApiServer must remove the automation descriptor')
assert.ok(
  firstAsyncWait < 0 || descriptorRemoval < firstAsyncWait,
  'automation descriptor removal must happen before the first asynchronous wait'
)

process.stdout.write('local API shutdown contract check passed\n')
