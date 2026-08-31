import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import { releasePlaybackMediaResources } from '@renderer/lib/transcript-playback'
import { removeDownloadAtom, removeHistoryRecordAtom } from '@renderer/store/downloads'
import {
  closePlaybackSessionAtom,
  playbackControlsAtom,
  playbackSessionAtom
} from '@renderer/store/transcript-playback'
import { removeTranscriptAtom } from '@renderer/store/transcripts'
import type { LearningWorkspaceDeleteResult } from '@shared/learning-types'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export interface LearningDeleteTarget {
  downloadId: string
  isLocalSource: boolean
  title: string
}

interface LearningDeleteDialogProps {
  onDeleted: (downloadId: string) => void
  onOpenChange: (open: boolean) => void
  target: LearningDeleteTarget | null
}

export function LearningDeleteDialog({
  onDeleted,
  onOpenChange,
  target
}: LearningDeleteDialogProps) {
  const { t } = useTranslation()
  const checkboxId = useId()
  const removeDownload = useSetAtom(removeDownloadAtom)
  const removeHistory = useSetAtom(removeHistoryRecordAtom)
  const removeTranscript = useSetAtom(removeTranscriptAtom)
  const closePlayback = useSetAtom(closePlaybackSessionAtom)
  const playbackControls = useAtomValue(playbackControlsAtom)
  const playbackSession = useAtomValue(playbackSessionAtom)
  const [busy, setBusy] = useState(false)
  const [deleteDownloadedMedia, setDeleteDownloadedMedia] = useState(true)

  useEffect(() => {
    if (target) {
      setDeleteDownloadedMedia(!target.isLocalSource)
    }
  }, [target])

  const confirmDelete = async (): Promise<void> => {
    if (!target || busy) {
      return
    }
    setBusy(true)
    try {
      if (playbackSession?.downloadId === target.downloadId) {
        playbackControls?.pause()
        releasePlaybackMediaResources()
        closePlayback()
        await ipcServices.player.detach()
      }
      const result = (await ipcServices.learning.deleteWorkspace({
        deleteDownloadedMedia: deleteDownloadedMedia && !target.isLocalSource,
        downloadId: target.downloadId
      })) as LearningWorkspaceDeleteResult
      removeDownload(target.downloadId)
      removeHistory(target.downloadId)
      removeTranscript(target.downloadId)
      onDeleted(target.downloadId)
      onOpenChange(false)
      if (result.downloadedMediaDeleteFailed) {
        toast.warning(t('learning.deleteDialog.mediaDeleteFailed'), {
          action: result.failedDownloadedMediaPath
            ? {
                label: t('learning.deleteDialog.openMediaLocation'),
                onClick: () => {
                  void ipcServices.fs.openFileLocation(result.failedDownloadedMediaPath ?? '')
                }
              }
            : undefined,
          duration: 12_000
        })
      } else {
        toast.success(
          result.preservedLocalSource
            ? t('learning.deleteDialog.localPreserved')
            : t('learning.deleteDialog.success')
        )
      }
    } catch (error) {
      logger.error('Failed to delete learning workspace', error)
      toast.error(t('learning.deleteDialog.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog onOpenChange={(open) => !busy && onOpenChange(open)} open={Boolean(target)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('learning.deleteDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('learning.deleteDialog.description', { title: target?.title ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {target?.isLocalSource ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground text-sm">
            {t('learning.deleteDialog.localHint')}
          </p>
        ) : (
          <div className="flex items-start gap-2">
            <Checkbox
              checked={deleteDownloadedMedia}
              id={checkboxId}
              onCheckedChange={(checked) => setDeleteDownloadedMedia(checked === true)}
            />
            <label className="text-sm leading-5" htmlFor={checkboxId}>
              {t('learning.deleteDialog.deleteDownloadedMedia')}
            </label>
          </div>
        )}
        <DialogFooter>
          <Button disabled={busy} onClick={() => onOpenChange(false)} variant="outline">
            {t('learning.deleteDialog.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void confirmDelete()} variant="destructive">
            {busy ? t('learning.deleteDialog.deleting') : t('learning.deleteDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
