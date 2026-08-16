import { existsSync } from 'node:fs'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { getDenoReleaseAssetName } from '@main/lib/ytdlp-kernel-model'
import { type KernelCommandRunner, YtDlpKernelService } from '@main/lib/ytdlp-kernel-service'
import { afterEach, describe, expect, it, vi } from 'vitest'

const services: YtDlpKernelService[] = []
const TEST_PLATFORM = ['darwin', 'linux', 'win32'].includes(process.platform)
  ? process.platform
  : 'linux'
const TEST_YTDLP_NAME = TEST_PLATFORM === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
const TEST_DENO_NAME = TEST_PLATFORM === 'win32' ? 'deno.exe' : 'deno'
const TEST_DENO_CHECKSUM_ASSET = `${getDenoReleaseAssetName(TEST_PLATFORM, 'arm64')}.sha256sum`

/**
 * Create a fake binary whose file contents represent its version.
 */
async function createFakeBinary(directory: string, name: string, version: string): Promise<string> {
  const binaryPath = join(directory, name)
  await writeFile(binaryPath, version)
  await chmod(binaryPath, 0o755)
  return binaryPath
}

/**
 * Run fake version probes against text-backed test binaries.
 */
const runFakeCommand: KernelCommandRunner = async (executable, args) => {
  if (!args.includes('--version')) {
    return { stdout: '', stderr: '' }
  }
  const version = (await readFile(executable, 'utf8')).trim()
  return {
    stdout: basename(executable).startsWith('deno') ? `deno ${version}\n` : `${version}\n`,
    stderr: ''
  }
}

afterEach(() => {
  for (const service of services.splice(0)) {
    service.stop()
  }
})

describe('YtDlpKernelService.prepare', () => {
  it('copies and atomically activates the bundled kernel on first run', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'user-data', 'kernels', 'yt-dlp')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const activate = vi.fn()
    const statusEvents: string[] = []
    const progressEvents: Array<number | null> = []
    const service = new YtDlpKernelService({
      activate,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(service)
    service.on('status', (status) => {
      statusEvents.push(`${status.state}:${status.preparationStep}`)
      progressEvents.push(status.progress)
    })

    await expect(service.prepare()).resolves.toBe(true)

    expect(activate).toHaveBeenCalledOnce()
    const activated = activate.mock.calls[0]?.[0] as { denoPath: string; ytDlpPath: string }
    expect(activated.ytDlpPath).not.toBe(bundledYtDlpPath)
    expect(activated.denoPath).not.toBe(bundledDenoPath)
    expect(await readFile(activated.ytDlpPath, 'utf8')).toBe('2026.06.09')
    expect(await readFile(activated.denoPath, 'utf8')).toBe('2.8.3')
    expect(service.getStatus()).toMatchObject({
      denoVersion: '2.8.3',
      ready: true,
      source: 'managed',
      state: 'up-to-date',
      ytDlpVersion: '2026.06.09'
    })
    expect(statusEvents).toContain('preparing:copying')
    expect(statusEvents).toContain('preparing:validating')
    expect(statusEvents).toContain('preparing:finalizing')
    expect(progressEvents).toContain(100)

    const state = JSON.parse(await readFile(join(kernelRoot, 'state.json'), 'utf8')) as {
      active: { deno: { sha256: string }; ytDlp: { sha256: string } }
      previous: unknown
      schemaVersion: number
    }
    expect(state.schemaVersion).toBe(1)
    expect(state.previous).toBeNull()
    expect(state.active.ytDlp.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(state.active.deno.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reuses a verified active bundle without depending on packaged resources', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const firstActivation = vi.fn()
    const firstService = new YtDlpKernelService({
      activate: firstActivation,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(firstService)
    await firstService.prepare()
    firstService.stop()
    await rm(resourcesPath, { force: true, recursive: true })

    const secondActivation = vi.fn()
    const secondService = new YtDlpKernelService({
      activate: secondActivation,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(secondService)

    await expect(secondService.prepare()).resolves.toBe(true)
    expect(secondActivation).toHaveBeenCalledWith(firstActivation.mock.calls[0]?.[0])
    expect(secondService.getStatus()).toMatchObject({ ready: true, source: 'managed' })
  })

  it('removes cold-start staging directories and bundles outside active and previous', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const options = {
      activate: vi.fn(),
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    }
    const firstService = new YtDlpKernelService(options)
    services.push(firstService)
    await firstService.prepare()
    firstService.stop()

    const state = JSON.parse(await readFile(join(kernelRoot, 'state.json'), 'utf8')) as {
      active: { id: string }
    }
    const activePath = join(kernelRoot, 'bundles', state.active.id)
    const orphanPath = join(kernelRoot, 'bundles', 'orphan')
    const stagingPath = join(kernelRoot, '.staging-crash')
    await Promise.all([
      mkdir(orphanPath, { recursive: true }),
      mkdir(stagingPath, { recursive: true })
    ])

    const secondService = new YtDlpKernelService(options)
    services.push(secondService)
    let stagingPresentWhenReady: boolean | null = null
    secondService.on('status', (status) => {
      if (status.ready) {
        stagingPresentWhenReady = existsSync(stagingPath)
      }
    })
    await secondService.prepare()

    expect(stagingPresentWhenReady).toBe(false)
    await expect(access(activePath)).resolves.toBeUndefined()
    await expect(access(orphanPath)).rejects.toThrow()
    await expect(access(stagingPath)).rejects.toThrow()
  })

  it('rejects an escaping active path and atomically recovers the previous bundle', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const firstActivation = vi.fn()
    const baseOptions = {
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    }
    const firstService = new YtDlpKernelService({ ...baseOptions, activate: firstActivation })
    services.push(firstService)
    await firstService.prepare()
    firstService.stop()

    const statePath = join(kernelRoot, 'state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      active: {
        deno: { relativePath: string; sha256: string; version: string }
        id: string
        ytDlp: { relativePath: string; sha256: string; version: string }
      }
      previous: unknown
    }
    const verifiedBundle = structuredClone(state.active)
    state.previous = verifiedBundle
    state.active = {
      ...verifiedBundle,
      id: 'escaping-active',
      ytDlp: { ...verifiedBundle.ytDlp, relativePath: '../../outside-yt-dlp' }
    }
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)

    const recoveredActivation = vi.fn()
    const recoveredService = new YtDlpKernelService({
      ...baseOptions,
      activate: recoveredActivation
    })
    services.push(recoveredService)

    await expect(recoveredService.prepare()).resolves.toBe(true)

    expect(recoveredActivation).toHaveBeenCalledWith(firstActivation.mock.calls[0]?.[0])
    const recoveredState = JSON.parse(await readFile(statePath, 'utf8')) as {
      active: { id: string }
      previous: unknown
    }
    expect(recoveredState.active.id).toBe(verifiedBundle.id)
    expect(recoveredState.previous).toBeNull()
  })

  it('uses the bundled pair when the managed cache cannot be created', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const bundledYtDlpPath = await createFakeBinary(testRoot, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(testRoot, TEST_DENO_NAME, '2.8.3')
    const blockedKernelRoot = join(testRoot, 'not-a-directory')
    await writeFile(blockedKernelRoot, 'blocked')
    const activate = vi.fn()
    const service = new YtDlpKernelService({
      activate,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot: blockedKernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(service)

    await expect(service.prepare()).resolves.toBe(true)

    expect(activate).toHaveBeenCalledWith({
      denoPath: bundledDenoPath,
      ytDlpPath: bundledYtDlpPath
    })
    expect(service.getStatus()).toMatchObject({
      ready: true,
      source: 'bundled',
      state: 'bundled-fallback'
    })
  })

  it('reports unavailable when neither the cache nor bundled pair is usable', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const service = new YtDlpKernelService({
      activate: vi.fn(),
      arch: 'arm64',
      bundledDenoPath: join(testRoot, 'missing-deno'),
      bundledYtDlpPath: join(testRoot, 'missing-yt-dlp'),
      fetch: vi.fn(),
      kernelRoot: join(testRoot, 'kernel'),
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(service)

    await expect(service.prepare()).resolves.toBe(false)
    expect(service.getStatus()).toMatchObject({ ready: false, source: null, state: 'unavailable' })
  })

  it('keeps the bundled fallback ready while retrying writable preparation', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const bundledYtDlpPath = await createFakeBinary(testRoot, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(testRoot, TEST_DENO_NAME, '2.8.3')
    const blockedKernelRoot = join(testRoot, 'not-a-directory')
    await writeFile(blockedKernelRoot, 'blocked')
    const service = new YtDlpKernelService({
      activate: vi.fn(),
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot: blockedKernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(service)
    await service.prepare()
    const retryStatuses: boolean[] = []
    service.on('status', (status) => retryStatuses.push(status.ready))

    await service.checkForUpdates()

    expect(retryStatuses.length).toBeGreaterThan(0)
    expect(retryStatuses.every(Boolean)).toBe(true)
    expect(service.getStatus()).toMatchObject({ ready: true, state: 'bundled-fallback' })
  })
})

describe('YtDlpKernelService.checkForUpdates', () => {
  it('coalesces concurrent checks into one official update run', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    let finishUpdate: (() => void) | undefined
    const updateGate = new Promise<void>((resolve) => {
      finishUpdate = resolve
    })
    let updateCalls = 0
    const runCommand: KernelCommandRunner = async (executable, args, options) => {
      if (args.includes('--update-to')) {
        updateCalls += 1
        await updateGate
        return { stdout: 'Already up to date', stderr: '' }
      }
      return runFakeCommand(executable, args, options)
    }
    const service = new YtDlpKernelService({
      activate: vi.fn(),
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ assets: [], tag_name: 'v2.8.3' }), { status: 200 })
        ),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand
    })
    services.push(service)
    await service.prepare()

    const firstCheck = service.checkForUpdates()
    const secondCheck = service.checkForUpdates()

    expect(secondCheck).toBe(firstCheck)
    await vi.waitFor(() => expect(updateCalls).toBe(1))
    finishUpdate?.()
    await Promise.all([firstCheck, secondCheck])
    expect(updateCalls).toBe(1)
  })

  it('aborts an in-flight candidate process when the service stops', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    let updateStarted = false
    let updateAborted = false
    const runCommand: KernelCommandRunner = async (executable, args, options) => {
      if (args.includes('--update-to')) {
        updateStarted = true
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              updateAborted = true
              reject(new Error('aborted'))
            },
            { once: true }
          )
        })
      }
      return runFakeCommand(executable, args, options)
    }
    const service = new YtDlpKernelService({
      activate: vi.fn(),
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: vi.fn(),
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand
    })
    services.push(service)
    await service.prepare()

    const check = service.checkForUpdates()
    await vi.waitFor(() => expect(updateStarted).toBe(true))
    service.stop()
    await check

    expect(updateAborted).toBe(true)
  })

  it('aborts a stalled official request at the shared update deadline', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          const rejectAbort = (): void => {
            reject(signal?.reason ?? new Error('aborted'))
          }
          if (signal?.aborted) {
            rejectAbort()
            return
          }
          signal?.addEventListener('abort', rejectAbort, { once: true })
        })
    )
    const activate = vi.fn()
    const service = new YtDlpKernelService({
      activate,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: fetchMock,
      kernelRoot,
      platform: TEST_PLATFORM,
      runCommand: runFakeCommand
    })
    services.push(service)
    await service.prepare()

    vi.useFakeTimers()
    try {
      const check = service.checkForUpdates()
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      await check

      expect(activate).toHaveBeenCalledOnce()
      expect(service.getStatus()).toMatchObject({ ready: true, state: 'retry-scheduled' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('activates yt-dlp and Deno together after both candidates validate', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const commands: string[][] = []
    const runCommand: KernelCommandRunner = async (executable, args, options) => {
      commands.push([executable, ...args])
      if (args.includes('--update-to')) {
        await writeFile(executable, '2026.07.01')
        return { stdout: 'Updated yt-dlp', stderr: '' }
      }
      if (args[0] === 'upgrade') {
        const outputIndex = args.indexOf('--output')
        await writeFile(args[outputIndex + 1] as string, '2.9.0')
        return { stdout: 'Upgrade done successfully', stderr: '' }
      }
      return runFakeCommand(executable, args, options)
    }
    const denoAssetName = TEST_DENO_CHECKSUM_ASSET
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            assets: [
              {
                browser_download_url: `https://github.test/${denoAssetName}`,
                name: denoAssetName
              }
            ],
            tag_name: 'v2.9.0'
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(`${'a'.repeat(64)}  deno.zip\n`, { status: 200 }))
    const activate = vi.fn()
    const service = new YtDlpKernelService({
      activate,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: fetchMock,
      kernelRoot,
      now: () => 1_000_000,
      platform: TEST_PLATFORM,
      random: () => 0,
      runCommand
    })
    services.push(service)
    await service.prepare()
    const initialState = JSON.parse(await readFile(join(kernelRoot, 'state.json'), 'utf8')) as {
      active: { id: string }
    }

    await service.checkForUpdates()

    expect(activate).toHaveBeenCalledTimes(2)
    const updatedPaths = activate.mock.calls[1]?.[0] as { denoPath: string; ytDlpPath: string }
    expect(await readFile(updatedPaths.ytDlpPath, 'utf8')).toBe('2026.07.01')
    expect(await readFile(updatedPaths.denoPath, 'utf8')).toBe('2.9.0')
    expect(
      commands.some((command) => command.includes('--update-to') && command.includes('stable'))
    ).toBe(true)
    expect(
      commands.some(
        (command) =>
          command.includes('--no-delta') &&
          command.includes('--checksum') &&
          command.includes('2.9.0')
      )
    ).toBe(true)
    const updatedState = JSON.parse(await readFile(join(kernelRoot, 'state.json'), 'utf8')) as {
      active: { id: string }
      failureCount: number
      nextCheckAt: number
      previous: { id: string }
    }
    expect(updatedState.active.id).not.toBe(initialState.active.id)
    expect(updatedState.previous.id).toBe(initialState.active.id)
    expect(updatedState.failureCount).toBe(0)
    expect(updatedState.nextCheckAt).toBe(1_000_000 + 86_400_000)
    expect(service.getStatus()).toMatchObject({
      denoVersion: '2.9.0',
      ready: true,
      state: 'up-to-date',
      ytDlpVersion: '2026.07.01'
    })
  })

  it.each([
    {
      denoVersion: '2.8.3',
      label: 'yt-dlp only',
      ytDlpVersion: '2026.07.01'
    },
    {
      denoVersion: '2.9.0',
      label: 'Deno only',
      ytDlpVersion: '2026.06.09'
    }
  ])(
    'commits a complete bundle when only $label changes',
    async ({ denoVersion, ytDlpVersion }) => {
      const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
      const resourcesPath = join(testRoot, 'resources')
      const kernelRoot = join(testRoot, 'kernel')
      await mkdir(resourcesPath, { recursive: true })
      const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
      const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
      const runCommand: KernelCommandRunner = async (executable, args, options) => {
        if (args.includes('--update-to')) {
          await writeFile(executable, ytDlpVersion)
          return { stdout: 'yt-dlp update complete', stderr: '' }
        }
        if (args[0] === 'upgrade') {
          const outputIndex = args.indexOf('--output')
          await writeFile(args[outputIndex + 1] as string, denoVersion)
          return { stdout: 'Deno upgrade complete', stderr: '' }
        }
        return runFakeCommand(executable, args, options)
      }
      const denoAssetName = TEST_DENO_CHECKSUM_ASSET
      const releaseResponse = new Response(
        JSON.stringify({
          assets:
            denoVersion === '2.8.3'
              ? []
              : [
                  {
                    browser_download_url: 'https://github.test/checksum',
                    name: denoAssetName
                  }
                ],
          tag_name: `v${denoVersion}`
        }),
        { status: 200 }
      )
      const fetchMock = vi.fn().mockResolvedValueOnce(releaseResponse)
      if (denoVersion !== '2.8.3') {
        fetchMock.mockResolvedValueOnce(
          new Response(`${'a'.repeat(64)}  deno.zip\n`, { status: 200 })
        )
      }
      const activate = vi.fn()
      const service = new YtDlpKernelService({
        activate,
        arch: 'arm64',
        bundledDenoPath,
        bundledYtDlpPath,
        fetch: fetchMock,
        kernelRoot,
        platform: TEST_PLATFORM,
        runCommand
      })
      services.push(service)
      await service.prepare()

      await service.checkForUpdates()

      expect(activate).toHaveBeenCalledTimes(2)
      const updatedPaths = activate.mock.calls[1]?.[0] as { denoPath: string; ytDlpPath: string }
      expect(await readFile(updatedPaths.ytDlpPath, 'utf8')).toBe(ytDlpVersion)
      expect(await readFile(updatedPaths.denoPath, 'utf8')).toBe(denoVersion)
      expect(service.getStatus()).toMatchObject({ denoVersion, ytDlpVersion })
    }
  )

  it('keeps the active pair when one candidate fails and persists retry backoff', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'vidbee-kernel-'))
    const resourcesPath = join(testRoot, 'resources')
    const kernelRoot = join(testRoot, 'kernel')
    await mkdir(resourcesPath, { recursive: true })
    const bundledYtDlpPath = await createFakeBinary(resourcesPath, TEST_YTDLP_NAME, '2026.06.09')
    const bundledDenoPath = await createFakeBinary(resourcesPath, TEST_DENO_NAME, '2.8.3')
    const runCommand: KernelCommandRunner = async (executable, args, options) => {
      if (args.includes('--update-to')) {
        await writeFile(executable, '2026.07.01')
        return { stdout: 'Updated yt-dlp', stderr: '' }
      }
      if (args[0] === 'upgrade') {
        throw new Error('Deno download failed')
      }
      return runFakeCommand(executable, args, options)
    }
    const denoAssetName = TEST_DENO_CHECKSUM_ASSET
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            assets: [{ browser_download_url: 'https://github.test/checksum', name: denoAssetName }],
            tag_name: 'v2.9.0'
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(`${'a'.repeat(64)}  deno.zip\n`, { status: 200 }))
    const activate = vi.fn()
    const service = new YtDlpKernelService({
      activate,
      arch: 'arm64',
      bundledDenoPath,
      bundledYtDlpPath,
      fetch: fetchMock,
      kernelRoot,
      now: () => 2_000_000,
      platform: TEST_PLATFORM,
      random: () => 0,
      runCommand
    })
    services.push(service)
    await service.prepare()
    const initialState = await readFile(join(kernelRoot, 'state.json'), 'utf8')

    await expect(service.checkForUpdates()).resolves.toBeUndefined()

    expect(activate).toHaveBeenCalledTimes(1)
    const failedState = JSON.parse(await readFile(join(kernelRoot, 'state.json'), 'utf8')) as {
      active: { id: string }
      failureCount: number
      nextCheckAt: number
    }
    expect(failedState.active.id).toBe(
      (JSON.parse(initialState) as { active: { id: string } }).active.id
    )
    expect(failedState.failureCount).toBe(1)
    expect(failedState.nextCheckAt).toBe(2_000_000 + 3_600_000)
    expect(service.getStatus()).toMatchObject({ ready: true, state: 'retry-scheduled' })
  })
})
