// @vitest-environment jsdom

import type { YtDlpKernelStatus } from '@shared/types'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  getYtDlpKernelStatus: vi.fn(),
  listenerToken: vi.fn(),
  removeListener: vi.fn(),
  retryYtDlpKernelPreparation: vi.fn(),
  statusListener: undefined as ((status: YtDlpKernelStatus) => void) | undefined
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipcEvents: {
    on: vi.fn((_channel: string, callback: (status: YtDlpKernelStatus) => void) => {
      mocks.callOrder.push('subscribe')
      mocks.statusListener = callback
      return mocks.listenerToken
    }),
    removeListener: mocks.removeListener
  },
  ipcServices: {
    app: {
      getYtDlpKernelStatus: mocks.getYtDlpKernelStatus,
      retryYtDlpKernelPreparation: mocks.retryYtDlpKernelPreparation
    }
  }
}))

import { useYtDlpKernelStatus } from '@renderer/store/ytdlp-kernel'

/**
 * Build a complete kernel status for renderer-store tests.
 */
function createStatus(overrides: Partial<YtDlpKernelStatus> = {}): YtDlpKernelStatus {
  return {
    denoVersion: '2.8.3',
    preparationStep: 'copying',
    progress: 10,
    ready: false,
    source: 'managed',
    state: 'preparing',
    ytDlpVersion: '2026.06.09',
    ...overrides
  }
}

afterEach(() => {
  cleanup()
  mocks.callOrder.length = 0
  mocks.statusListener = undefined
  vi.clearAllMocks()
})

describe('useYtDlpKernelStatus', () => {
  it('subscribes before reading a snapshot and accepts live updates', async () => {
    mocks.getYtDlpKernelStatus.mockImplementation(async () => {
      mocks.callOrder.push('snapshot')
      return createStatus({ ready: true, state: 'up-to-date' })
    })
    const { result, unmount } = renderHook(() => useYtDlpKernelStatus())

    await waitFor(() => expect(result.current.status.ready).toBe(true))
    expect(mocks.callOrder).toEqual(['subscribe', 'snapshot'])

    act(() => mocks.statusListener?.(createStatus({ progress: 70 })))
    expect(result.current.status.progress).toBe(70)

    unmount()
    expect(mocks.removeListener).toHaveBeenCalledWith('ytdlp-kernel:status', mocks.listenerToken)
  })

  it('writes the status returned by retry preparation', async () => {
    mocks.getYtDlpKernelStatus.mockImplementation(async () => {
      mocks.callOrder.push('snapshot')
      return createStatus({ ready: true, state: 'up-to-date' })
    })
    mocks.retryYtDlpKernelPreparation.mockResolvedValue(
      createStatus({ ready: true, source: 'bundled', state: 'bundled-fallback' })
    )
    const { result } = renderHook(() => useYtDlpKernelStatus())
    await waitFor(() => expect(result.current.status.ready).toBe(true))

    await act(async () => result.current.retry())

    expect(mocks.retryYtDlpKernelPreparation).toHaveBeenCalledOnce()
    expect(result.current.status).toMatchObject({ source: 'bundled', state: 'bundled-fallback' })
  })

  it('does not overwrite a live event with an older snapshot response', async () => {
    let finishSnapshot: ((status: YtDlpKernelStatus) => void) | undefined
    mocks.getYtDlpKernelStatus.mockImplementation(
      () =>
        new Promise<YtDlpKernelStatus>((resolve) => {
          mocks.callOrder.push('snapshot')
          finishSnapshot = resolve
        })
    )
    const { result } = renderHook(() => useYtDlpKernelStatus())
    await waitFor(() => expect(mocks.statusListener).toBeTypeOf('function'))

    act(() => mocks.statusListener?.(createStatus({ progress: 70 })))
    await act(async () => {
      finishSnapshot?.(createStatus({ progress: 10 }))
    })

    expect(result.current.status.progress).toBe(70)
  })
})
