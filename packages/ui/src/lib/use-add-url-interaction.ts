import { useCallback, useState } from 'react'
import { isPlaylistLikeUrl } from './url-kind'

const isLikelyUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

interface UseAddUrlInteractionOptions {
  activeTab: 'single' | 'playlist'
  isOneClickDownloadEnabled: boolean
  isPlaylistBusy: boolean
  onEmptyUrl: () => void
  onInvalidUrl: () => void
  onOneClickDownload: (url: string) => Promise<void> | void
  onParsePlaylist: (url: string) => Promise<void> | void
  onParseSingle: (url: string) => Promise<void> | void
}

interface UseAddUrlInteractionResult {
  addUrlPopoverOpen: boolean
  addUrlValue: string
  canConfirmAddUrl: boolean
  hasAddUrlValue: boolean
  handleConfirmAddUrl: () => Promise<void>
  handleOpenAddUrlPopover: () => Promise<void>
  setAddUrlPopoverOpen: (open: boolean) => void
  setAddUrlValue: (value: string) => void
  submitUrl: (rawUrl: string) => Promise<void>
}

export const useAddUrlInteraction = ({
  activeTab,
  isOneClickDownloadEnabled,
  isPlaylistBusy,
  onEmptyUrl,
  onInvalidUrl,
  onOneClickDownload,
  onParsePlaylist,
  onParseSingle
}: UseAddUrlInteractionOptions): UseAddUrlInteractionResult => {
  const [addUrlPopoverOpen, setAddUrlPopoverOpen] = useState(false)
  const [addUrlValue, setAddUrlValue] = useState('')

  const trimmedAddUrlValue = addUrlValue.trim()
  const hasAddUrlValue = trimmedAddUrlValue.length > 0
  const canConfirmAddUrl = hasAddUrlValue && isLikelyUrl(trimmedAddUrlValue)

  const handleOpenAddUrlPopover = useCallback(async () => {
    setAddUrlPopoverOpen(true)
    if (!navigator.clipboard?.readText) {
      setAddUrlValue('')
      return
    }

    try {
      const text = await navigator.clipboard.readText()
      const trimmedUrl = text.trim()
      setAddUrlValue(isLikelyUrl(trimmedUrl) ? trimmedUrl : '')
    } catch {
      setAddUrlValue('')
    }
  }, [])

  /**
   * Route a confirmed URL into one-click download or the parse dialog.
   */
  const submitUrl = useCallback(
    async (rawUrl: string) => {
      const trimmedUrl = rawUrl.trim()
      if (!trimmedUrl) {
        onEmptyUrl()
        return
      }
      if (!isLikelyUrl(trimmedUrl)) {
        onInvalidUrl()
        return
      }

      setAddUrlPopoverOpen(false)

      if (isPlaylistLikeUrl(trimmedUrl)) {
        if (isPlaylistBusy) {
          return
        }
        await onParsePlaylist(trimmedUrl)
        return
      }

      if (activeTab === 'playlist') {
        if (isPlaylistBusy) {
          return
        }
        await onParsePlaylist(trimmedUrl)
        return
      }

      if (isOneClickDownloadEnabled) {
        await onOneClickDownload(trimmedUrl)
        return
      }

      await onParseSingle(trimmedUrl)
    },
    [
      activeTab,
      isOneClickDownloadEnabled,
      isPlaylistBusy,
      onEmptyUrl,
      onInvalidUrl,
      onOneClickDownload,
      onParsePlaylist,
      onParseSingle
    ]
  )

  const handleConfirmAddUrl = useCallback(async () => {
    await submitUrl(addUrlValue)
  }, [addUrlValue, submitUrl])

  return {
    addUrlPopoverOpen,
    addUrlValue,
    canConfirmAddUrl,
    hasAddUrlValue,
    handleConfirmAddUrl,
    handleOpenAddUrlPopover,
    setAddUrlPopoverOpen,
    setAddUrlValue,
    submitUrl
  }
}
