import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/**
 * Directory of the platform-specific sherpa-onnx shared libraries.
 * On macOS the worker must set DYLD_LIBRARY_PATH to this folder.
 */
export function resolveSherpaLibraryDir(): string | null {
  const id = `sherpa-onnx-${process.platform}-${process.arch}`
  const names = [id, 'sherpa-onnx-darwin-arm64', 'sherpa-onnx-darwin-x64']
  for (const name of names) {
    try {
      return dirname(require.resolve(`${name}/package.json`))
    } catch {
      /* try next */
    }
  }
  try {
    const nodeDir = dirname(require.resolve('sherpa-onnx-node/package.json'))
    for (const name of names) {
      const sibling = join(nodeDir, '..', name)
      if (existsSync(join(sibling, 'package.json'))) {
        return sibling
      }
    }
  } catch {
    /* not installed */
  }
  return null
}

export { resolveWorkerExecPath } from './runtime'

export function sherpaWorkerEnv(
  extra?: NodeJS.ProcessEnv,
  opts?: { electronAsNode?: boolean }
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra
  }
  if (opts?.electronAsNode !== false) {
    env.ELECTRON_RUN_AS_NODE = '1'
  }
  const libDir = resolveSherpaLibraryDir()
  if (!libDir) {
    return env
  }
  if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = [libDir, env.DYLD_LIBRARY_PATH].filter(Boolean).join(':')
  }
  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  }
  if (process.platform === 'win32') {
    env.PATH = [libDir, env.PATH].filter(Boolean).join(';')
  }
  return env
}
