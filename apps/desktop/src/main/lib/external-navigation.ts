const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])
const MAX_EXTERNAL_URL_LENGTH = 4096

/** Only ordinary web URLs may leave the Electron renderer for the OS browser. */
export const isSafeExternalUrl = (value: string): boolean => {
  const input = value.trim()
  const hasControlCharacters = [...input].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127
  })
  if (!input || input.length > MAX_EXTERNAL_URL_LENGTH || hasControlCharacters) {
    return false
  }
  try {
    const url = new URL(input)
    return (
      EXTERNAL_PROTOCOLS.has(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

/** Keep the main window on the exact renderer document; hash routing remains unaffected. */
export const isTrustedRendererNavigation = (target: string, current: string): boolean => {
  try {
    const nextUrl = new URL(target)
    const currentUrl = new URL(current)
    return (
      nextUrl.protocol === currentUrl.protocol &&
      nextUrl.host === currentUrl.host &&
      nextUrl.pathname === currentUrl.pathname
    )
  } catch {
    return false
  }
}
