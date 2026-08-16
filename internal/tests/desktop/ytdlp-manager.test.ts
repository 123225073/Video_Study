import { YtDlpManager } from '@main/lib/ytdlp-manager'
import { describe, expect, it, vi } from 'vitest'

const silentLogger = { info: vi.fn(), warn: vi.fn() }

describe('YtDlpManager', () => {
  it('requires explicit activation before use', () => {
    const manager = new YtDlpManager(silentLogger)

    expect(manager.isReady()).toBe(false)
    expect(() => manager.getPath()).toThrow('not activated')
    expect(() => manager.getInstance()).toThrow('not activated')
  })

  it('binds yt-dlp and Deno as one active pair', () => {
    const manager = new YtDlpManager(silentLogger)
    manager.activate({ denoPath: '/kernel/one/deno', ytDlpPath: '/kernel/one/yt-dlp' })

    expect(manager.isReady()).toBe(true)
    expect(manager.getPath()).toBe('/kernel/one/yt-dlp')
    expect(manager.getJsRuntimeArgs()).toEqual(['--js-runtimes', 'deno:/kernel/one/deno'])
  })

  it('rebuilds the wrapper when a new bundle is activated', () => {
    const manager = new YtDlpManager(silentLogger)
    manager.activate({ denoPath: '/kernel/one/deno', ytDlpPath: '/kernel/one/yt-dlp' })
    const firstInstance = manager.getInstance()

    manager.activate({ denoPath: '/kernel/two/deno', ytDlpPath: '/kernel/two/yt-dlp' })

    expect(manager.getInstance()).not.toBe(firstInstance)
    expect(manager.getPath()).toBe('/kernel/two/yt-dlp')
  })
})
