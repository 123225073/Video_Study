import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const desktopRoot = resolve(repositoryRoot, 'apps/desktop')

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  root: repositoryRoot,
  resolve: {
    alias: {
      '@main': resolve(desktopRoot, 'src/main'),
      '@renderer': resolve(desktopRoot, 'src/renderer/src'),
      '@shared': resolve(desktopRoot, 'src/shared'),
      '@testing-library/react': resolve(desktopRoot, 'node_modules/@testing-library/react'),
      i18next: resolve(desktopRoot, 'node_modules/i18next'),
      'react-i18next': resolve(desktopRoot, 'node_modules/react-i18next'),
      react: resolve(desktopRoot, 'node_modules/react'),
      'react-dom': resolve(desktopRoot, 'node_modules/react-dom')
    }
  },
  test: {
    environment: 'node',
    include: ['internal/tests/desktop/**/*.test.{ts,tsx}'],
    testTimeout: 10_000
  }
})
