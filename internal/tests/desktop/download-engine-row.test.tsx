// @vitest-environment jsdom

import { DownloadEngineRow } from '@renderer/components/kernel/DownloadEngineRow'
import type { YtDlpKernelStatus } from '@shared/types'
import { cleanup, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

/**
 * Create a complete status for About-page engine tests.
 */
function createStatus(overrides: Partial<YtDlpKernelStatus> = {}): YtDlpKernelStatus {
  return {
    denoVersion: '2.8.3',
    preparationStep: null,
    progress: null,
    ready: true,
    source: 'managed',
    state: 'up-to-date',
    ytDlpVersion: '2026.06.09',
    ...overrides
  }
}

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          about: {
            downloadEngine: {
              description: 'The download engine updates independently in the background.',
              status: {
                'bundled-fallback': 'Bundled fallback',
                checking: 'Checking',
                installing: 'Installing',
                preparing: 'Preparing',
                'retry-scheduled': 'Retry scheduled',
                unavailable: 'Unavailable',
                'up-to-date': 'Up to date'
              },
              title: 'Download engine',
              versions: 'yt-dlp {{ytDlpVersion}} · Deno {{denoVersion}}'
            }
          }
        }
      }
    },
    showSupportNotice: false
  })
})

afterEach(cleanup)

describe('DownloadEngineRow', () => {
  it('shows both active component versions and a textual status', () => {
    render(<DownloadEngineRow status={createStatus()} />)

    expect(screen.getByText('Download engine')).toBeTruthy()
    expect(screen.getByText('yt-dlp 2026.06.09 · Deno 2.8.3')).toBeTruthy()
    expect(screen.getByText('Up to date')).toBeTruthy()
  })

  it('announces background activity without relying on animation', () => {
    render(<DownloadEngineRow status={createStatus({ state: 'checking' })} />)

    expect(screen.getByRole('status').textContent).toContain('Checking')
  })

  it.each([
    ['preparing', 'Preparing'],
    ['checking', 'Checking'],
    ['installing', 'Installing'],
    ['up-to-date', 'Up to date'],
    ['retry-scheduled', 'Retry scheduled'],
    ['bundled-fallback', 'Bundled fallback'],
    ['unavailable', 'Unavailable']
  ] as const)('shows a textual badge for the %s state', (state, label) => {
    render(<DownloadEngineRow status={createStatus({ state })} />)

    expect(screen.getByText(label)).toBeTruthy()
  })
})
