import { isAbsolute, relative, resolve } from 'node:path'

const HOUR_MS = 60 * 60 * 1000
const MAX_RETRY_DELAY_MS = 24 * HOUR_MS

/**
 * Return the official Deno release archive name for a supported target.
 */
export function getDenoReleaseAssetName(platform: string, arch: string): string {
  if (!['win32', 'darwin', 'linux'].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  const targetArch = arch === 'arm64' ? 'aarch64' : 'x86_64'
  const targetPlatform =
    platform === 'win32'
      ? 'pc-windows-msvc'
      : platform === 'darwin'
        ? 'apple-darwin'
        : 'unknown-linux-gnu'
  return `deno-${targetArch}-${targetPlatform}.zip`
}

/**
 * Return the persisted exponential retry delay for a one-based failure count.
 */
export function getRetryDelayMs(failureCount: number): number {
  const exponent = Math.max(0, Math.floor(failureCount) - 1)
  if (exponent >= 4) {
    return MAX_RETRY_DELAY_MS
  }
  return Math.min(2 ** exponent * HOUR_MS, MAX_RETRY_DELAY_MS)
}

/**
 * Resolve a state-file path while preventing absolute paths and traversal.
 */
export function resolveKernelRelativePath(kernelRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error('Kernel state must contain a relative path')
  }

  const resolvedRoot = resolve(kernelRoot)
  const resolvedPath = resolve(resolvedRoot, relativePath)
  const pathFromRoot = relative(resolvedRoot, resolvedPath)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error('Kernel state path resolves outside kernel root')
  }
  return resolvedPath
}
