import { Button } from '@renderer/components/ui/button'
import { Response } from '@renderer/components/ui/response'
import { Textarea } from '@renderer/components/ui/textarea'
import { ipcServices } from '@renderer/lib/ipc'
import {
  appendTranscriptQuoteToNotebook,
  buildLearningNotebookMarkdown,
  migrateLegacyNotesToNotebook,
  safeLearningFileName
} from '@renderer/lib/learning-notebook'
import { logger } from '@renderer/lib/logger'
import type { LearningNotebook, LearningNoteKind } from '@shared/learning-types'
import {
  Check,
  ClipboardCopy,
  Download,
  Edit3,
  Eye,
  FileText,
  Link2,
  NotebookPen
} from 'lucide-react'
import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface LearningNotebookPaneProps {
  capture?: {
    id: string
    kind: LearningNoteKind
    quote: string
    text: string
    timestampMs: number
  } | null
  downloadId: string
  onSeek: (seconds: number) => void
  sourceTitle?: string
  sourceUrl?: string | null
}

const pendingNotebookDrafts = new Map<string, LearningNotebook>()

const emptyNotebook = (
  downloadId: string,
  title: string,
  sourceUrl?: string | null
): LearningNotebook => {
  const now = Date.now()
  return {
    createdAt: now,
    downloadId,
    goal: '',
    migratedLegacyNoteIds: [],
    notes: [],
    personalNote: '',
    sourceUrl: sourceUrl ?? null,
    title: title || 'Untitled lesson',
    updatedAt: now,
    version: 2
  }
}

export function LearningNotebookPane({
  capture,
  downloadId,
  onSeek,
  sourceTitle,
  sourceUrl
}: LearningNotebookPaneProps) {
  const { t } = useTranslation()
  const [notebook, setNotebook] = useState<LearningNotebook>(() =>
    emptyNotebook(downloadId, sourceTitle ?? '', sourceUrl)
  )
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [hydrated, setHydrated] = useState(false)
  const [mutationRevision, setMutationRevision] = useState(0)
  const hydratedRef = useRef(false)
  const dirtyRef = useRef(false)
  const notebookRef = useRef(notebook)
  const saveTimerRef = useRef<number | null>(null)
  const mutationRevisionRef = useRef(0)
  const handledCaptureIdRef = useRef<string | null>(null)
  notebookRef.current = notebook

  const persistNotebook = useCallback(
    async (snapshot: LearningNotebook, revision: number, updateUi: boolean): Promise<void> => {
      if (updateUi) {
        setSaveState('saving')
      }
      try {
        await ipcServices.learning.save({
          downloadId: snapshot.downloadId,
          migratedLegacyNoteIds: snapshot.migratedLegacyNoteIds ?? [],
          personalNote: snapshot.personalNote ?? ''
        })
        if (pendingNotebookDrafts.get(snapshot.downloadId)?.updatedAt === snapshot.updatedAt) {
          pendingNotebookDrafts.delete(snapshot.downloadId)
        }
        if (revision === mutationRevisionRef.current) {
          dirtyRef.current = false
          if (updateUi) {
            setSaveState('saved')
          }
        }
      } catch (error) {
        logger.error('Failed to save learning notebook', error)
        if (updateUi) {
          setSaveState('idle')
          toast.error(t('learning.saveFailed'))
        }
      }
    },
    [t]
  )

  const flushPendingSave = useCallback(
    (updateUi: boolean): void => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (hydratedRef.current && dirtyRef.current) {
        void persistNotebook(notebookRef.current, mutationRevisionRef.current, updateUi)
      }
    },
    [persistNotebook]
  )

  const mutate = useCallback((update: (current: LearningNotebook) => LearningNotebook): void => {
    dirtyRef.current = true
    mutationRevisionRef.current += 1
    setMutationRevision(mutationRevisionRef.current)
    setSaveState('saving')
    setNotebook((current) => {
      const updated = { ...update(current), updatedAt: Date.now() }
      notebookRef.current = updated
      pendingNotebookDrafts.set(updated.downloadId, updated)
      return updated
    })
  }, [])

  useEffect(() => {
    void loadAttempt
    let active = true
    setLoading(true)
    setLoadError(false)
    setSaveState('idle')
    hydratedRef.current = false
    setHydrated(false)
    dirtyRef.current = false
    handledCaptureIdRef.current = null
    void ipcServices.learning
      .get(downloadId)
      .then((saved) => {
        if (!active) {
          return
        }
        const pending = pendingNotebookDrafts.get(downloadId)
        const loadedSource =
          pending ?? saved ?? emptyNotebook(downloadId, sourceTitle ?? '', sourceUrl)
        const migration = migrateLegacyNotesToNotebook(
          loadedSource.personalNote ?? '',
          loadedSource.notes,
          loadedSource.migratedLegacyNoteIds ?? [],
          t('learning.legacyTranscriptNotes')
        )
        const previousMigrationIds = loadedSource.migratedLegacyNoteIds ?? []
        const migrationNeeded =
          migration.markdown !== (loadedSource.personalNote ?? '') ||
          migration.migratedNoteIds.length !== previousMigrationIds.length ||
          migration.migratedNoteIds.some((id, index) => id !== previousMigrationIds[index])
        const loaded = migrationNeeded
          ? {
              ...loadedSource,
              migratedLegacyNoteIds: migration.migratedNoteIds,
              personalNote: migration.markdown,
              updatedAt: Date.now()
            }
          : loadedSource
        notebookRef.current = loaded
        setNotebook(loaded)
        if (pending || migrationNeeded) {
          dirtyRef.current = true
          mutationRevisionRef.current += 1
          setMutationRevision(mutationRevisionRef.current)
          setSaveState('saving')
        }
        if (migrationNeeded) {
          pendingNotebookDrafts.set(downloadId, loaded)
        }
        hydratedRef.current = true
        setHydrated(true)
      })
      .catch((error) => {
        logger.error('Failed to load learning notebook', error)
        if (active) {
          setLoadError(true)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
      flushPendingSave(false)
    }
  }, [downloadId, flushPendingSave, loadAttempt, sourceTitle, sourceUrl, t])

  useEffect(() => {
    if (!(hydrated && dirtyRef.current)) {
      return
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }
    const revision = mutationRevision
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persistNotebook(notebookRef.current, revision, true)
    }, 450)
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [hydrated, mutationRevision, persistNotebook])

  useEffect(() => {
    if (!(capture && hydrated && handledCaptureIdRef.current !== capture.id)) {
      return
    }
    handledCaptureIdRef.current = capture.id
    mutate((current) => ({
      ...current,
      personalNote: appendTranscriptQuoteToNotebook(
        current.personalNote ?? '',
        capture.quote,
        capture.timestampMs
      )
    }))
    setPreview(false)
  }, [capture, hydrated, mutate])

  const exportNotebook = async (): Promise<void> => {
    const saved = await ipcServices.fs.saveTextFile({
      content: buildLearningNotebookMarkdown(notebook),
      defaultFileName: safeLearningFileName(notebook.title)
    })
    if (saved) {
      toast.success(t('learning.exported'))
      void ipcServices.fs.openFileLocation(saved.path)
    }
  }

  const copyNotebook = async (): Promise<void> => {
    await navigator.clipboard.writeText(buildLearningNotebookMarkdown(notebook))
    toast.success(t('learning.copied'))
  }

  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    const link = target.closest<HTMLAnchorElement>('a[href^="#fengsha-seek-"]')
    if (!link) {
      return
    }
    const timestampMs = Number(link.hash.replace('#fengsha-seek-', ''))
    if (!Number.isFinite(timestampMs)) {
      return
    }
    event.preventDefault()
    onSeek(timestampMs / 1000)
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground text-sm">{t('learning.loading')}</div>
  }

  if (loadError) {
    return (
      <div
        aria-live="assertive"
        className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
        role="alert"
      >
        <p className="max-w-md text-muted-foreground text-sm">{t('learning.loadFailed')}</p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)} variant="outline">
          {t('learning.retryLoad')}
        </Button>
      </div>
    )
  }

  const noteText = notebook.personalNote ?? ''
  const characterCount = noteText.trim().length

  return (
    <div className="learning-notebook-pane flex h-full min-h-0 flex-col bg-gradient-to-b from-amber-50/45 via-background to-background dark:from-amber-950/10">
      <header className="shrink-0 border-border/60 border-b px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-950 text-amber-300 shadow-sm dark:bg-amber-300 dark:text-stone-950">
              <NotebookPen className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{t('learning.notebook')}</p>
              <p className="mt-0.5 text-muted-foreground text-xs leading-5">
                {t('learning.notebookDescription')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              aria-label={t('learning.copy')}
              onClick={copyNotebook}
              size="icon"
              variant="ghost"
            >
              <ClipboardCopy />
            </Button>
            <Button
              aria-label={t('learning.export')}
              onClick={exportNotebook}
              size="icon"
              variant="ghost"
            >
              <Download />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-stone-200/80 bg-background/85 p-0.5 shadow-sm dark:border-white/10">
            <Button
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
              size="sm"
              variant={preview ? 'ghost' : 'secondary'}
            >
              <Edit3 /> {t('learning.edit')}
            </Button>
            <Button
              aria-pressed={preview}
              onClick={() => setPreview(true)}
              size="sm"
              variant={preview ? 'secondary' : 'ghost'}
            >
              <Eye /> {t('learning.preview')}
            </Button>
          </div>
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            {saveState === 'saving' ? (
              t('learning.saving')
            ) : saveState === 'saved' ? (
              <>
                <Check className="size-3" /> {t('learning.saved')}
              </>
            ) : (
              t('learning.localFirst')
            )}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        {preview ? (
          <div
            className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-stone-200/80 bg-background px-5 py-4 text-sm leading-7 shadow-sm dark:border-white/10"
            data-testid="learning-notebook-preview"
            onClick={handlePreviewClick}
            onKeyDown={() => undefined}
            role="document"
          >
            {noteText.trim() ? (
              <Response>{noteText}</Response>
            ) : (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <FileText className="size-5" />
                </span>
                <p className="mt-4 font-medium text-sm">{t('learning.personalNoteEmpty')}</p>
                <p className="mt-1 max-w-56 text-muted-foreground text-xs leading-5">
                  {t('learning.personalNoteDescription')}
                </p>
              </div>
            )}
          </div>
        ) : (
          <Textarea
            aria-label={t('learning.personalNote')}
            className="min-h-0 flex-1 resize-none rounded-xl border-stone-200/80 bg-background px-4 py-3 font-mono text-sm leading-7 shadow-sm focus-visible:ring-amber-500/35 dark:border-white/10"
            data-testid="learning-notebook-editor"
            onChange={(event) =>
              mutate((current) => ({ ...current, personalNote: event.target.value }))
            }
            placeholder={t('learning.personalNotePlaceholder')}
            value={noteText}
          />
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-border/60 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span>{t('learning.notebookCharacterCount', { count: characterCount })}</span>
        <span className="inline-flex items-center gap-1">
          <Link2 className="size-3" /> {t('learning.notebookTimestampHint')}
        </span>
      </footer>
    </div>
  )
}
