// @vitest-environment jsdom

import { KernelPreparationScreen } from '@renderer/components/kernel/KernelPreparationScreen'
import type { YtDlpKernelStatus } from '@shared/types'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    keySeparator: false,
    showSupportNotice: false,
    resources: {
      en: {
        translation: {
          'kernelPreparation.copying': 'Copying the download engine',
          'kernelPreparation.description':
            'VidBee is preparing the components required for downloads.',
          'kernelPreparation.errorDescription': 'The download engine could not be prepared.',
          'kernelPreparation.errorTitle': 'Download engine unavailable',
          'kernelPreparation.finalizing': 'Finishing setup',
          'kernelPreparation.retry': 'Retry',
          'kernelPreparation.retrying': 'Retrying',
          'kernelPreparation.title': 'Preparing download engine',
          'kernelPreparation.validating': 'Verifying the download engine'
        }
      }
    }
  })
})

afterEach(cleanup)

/**
 * Build a preparation status with concise per-test overrides.
 */
function createStatus(overrides: Partial<YtDlpKernelStatus> = {}): YtDlpKernelStatus {
  return {
    denoVersion: null,
    preparationStep: 'copying',
    progress: 40,
    ready: false,
    source: null,
    state: 'preparing',
    ytDlpVersion: null,
    ...overrides
  }
}

describe('KernelPreparationScreen', () => {
  it('announces the current phase and exposes determinate progress', () => {
    render(<KernelPreparationScreen onRetry={vi.fn()} status={createStatus()} />)

    expect(screen.getByRole('heading', { name: 'Copying the download engine' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Copying the download engine')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40')
    expect(
      screen.queryByText('VidBee is preparing the components required for downloads.')
    ).toBeNull()
  })

  it('shows a retry action only when preparation is unavailable', async () => {
    let finishRetry: (() => void) | undefined
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRetry = resolve
        })
    )
    render(
      <KernelPreparationScreen
        onRetry={retry}
        status={createStatus({ preparationStep: null, progress: null, state: 'unavailable' })}
      />
    )

    expect(screen.getByRole('alert').textContent).toContain('Download engine unavailable')
    expect(screen.queryByAltText('VidBee')).toBeNull()
    const button = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(button)

    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Retrying' }).hasAttribute('disabled')).toBe(true)
    finishRetry?.()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry' }).hasAttribute('disabled')).toBe(false)
    )
  })
})
