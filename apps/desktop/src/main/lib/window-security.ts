import type { WebPreferences } from 'electron'

/**
 * Security boundary shared by every main application window.
 *
 * Keeping this pure makes the production defaults directly testable without
 * launching Electron. Local media remains available through `file:` and the
 * privileged `fengsha-video:` protocol allowed by the renderer CSP.
 *
 * `sandbox` stays disabled until the existing decorator/toolkit preload can be
 * migrated: enabling it currently prevents the production renderer from
 * mounting in the learning-studio E2E. Context isolation, no Node integration,
 * CSP, and web security remain enforced independently.
 */
export const secureWindowWebPreferences = (preload: string): WebPreferences => ({
  allowRunningInsecureContent: false,
  contextIsolation: true,
  nodeIntegration: false,
  preload,
  sandbox: false,
  webSecurity: true
})
