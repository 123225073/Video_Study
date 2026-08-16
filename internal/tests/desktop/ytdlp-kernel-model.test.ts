import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  getDenoReleaseAssetName,
  getRetryDelayMs,
  resolveKernelRelativePath
} from '@main/lib/ytdlp-kernel-model'
import { describe, expect, it } from 'vitest'

describe('getDenoReleaseAssetName', () => {
  it.each([
    ['win32', 'x64', 'deno-x86_64-pc-windows-msvc.zip'],
    ['win32', 'arm64', 'deno-aarch64-pc-windows-msvc.zip'],
    ['darwin', 'x64', 'deno-x86_64-apple-darwin.zip'],
    ['darwin', 'arm64', 'deno-aarch64-apple-darwin.zip'],
    ['linux', 'x64', 'deno-x86_64-unknown-linux-gnu.zip'],
    ['linux', 'arm64', 'deno-aarch64-unknown-linux-gnu.zip']
  ] as const)('maps %s/%s to its official release asset', (platform, arch, expected) => {
    expect(getDenoReleaseAssetName(platform, arch)).toBe(expected)
  })

  it('rejects unsupported platforms and architectures', () => {
    expect(() => getDenoReleaseAssetName('freebsd', 'x64')).toThrow('Unsupported platform')
    expect(() => getDenoReleaseAssetName('linux', 'ia32')).toThrow('Unsupported architecture')
  })
})

describe('getRetryDelayMs', () => {
  it('uses persisted exponential backoff capped at 24 hours', () => {
    expect([1, 2, 3, 4, 5, 6].map(getRetryDelayMs)).toEqual([
      3_600_000, 7_200_000, 14_400_000, 28_800_000, 86_400_000, 86_400_000
    ])
  })
})

describe('resolveKernelRelativePath', () => {
  it('resolves a relative path inside the kernel root', () => {
    const kernelRoot = resolve(tmpdir(), 'vidbee-kernel-root')
    const relativePath = join('bundles', 'current', 'yt-dlp')

    expect(resolveKernelRelativePath(kernelRoot, relativePath)).toBe(
      resolve(kernelRoot, relativePath)
    )
  })

  it('rejects absolute paths and directory traversal', () => {
    const kernelRoot = resolve(tmpdir(), 'vidbee-kernel-root')

    expect(() => resolveKernelRelativePath(kernelRoot, resolve(tmpdir(), 'yt-dlp'))).toThrow(
      'relative path'
    )
    expect(() => resolveKernelRelativePath(kernelRoot, join('..', 'yt-dlp'))).toThrow(
      'outside kernel root'
    )
  })
})
