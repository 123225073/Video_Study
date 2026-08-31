import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Response } from '@renderer/components/ui/response'
import { Textarea } from '@renderer/components/ui/textarea'
import { ipcServices } from '@renderer/lib/ipc'
import {
  buildLearningNotebookMarkdown,
  createLearningNote,
  formatLearningClock,
  safeLearningFileName
} from '@renderer/lib/learning-notebook'
import { logger } from '@renderer/lib/logger'
import type { TranscriptSegmentView } from '@renderer/store/transcripts'
import type {
  LearningNote,
  LearningNotebook,
  LearningNoteHighlight,
  LearningNoteKind
} from '@shared/learning-types'
import {
  ClipboardCopy,
  Download,
  Edit3,
  Eye,
  FileText,
  MessageSquareQuote,
  Play,
  Plus,
  Search,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  currentSegmentId: string | null
  currentTimeMs: number
  downloadId: string
  onSeek: (seconds: number) => void
  segments: TranscriptSegmentView[]
  sourceTitle?: string
  sourceUrl?: string | null
}

interface TranscriptReference {
  id: string
  quote: string
  sourceEndOffset: number | null
  sourceSegmentIds: string[]
  sourceStartOffset: number | null
  timestampMs: number
}

const HIGHLIGHT_COLORS: Array<{
  activeClass: string
  dotClass: string
  id: LearningNoteHighlight
}> = [
  { activeClass: 'border-amber-500 bg-amber-500/10', dotClass: 'bg-amber-400', id: 'amber' },
  { activeClass: 'border-sky-500 bg-sky-500/10', dotClass: 'bg-sky-400', id: 'blue' },
  { activeClass: 'border-emerald-500 bg-emerald-500/10', dotClass: 'bg-emerald-400', id: 'green' },
  { activeClass: 'border-pink-500 bg-pink-500/10', dotClass: 'bg-pink-400', id: 'pink' },
  { activeClass: 'border-violet-500 bg-violet-500/10', dotClass: 'bg-violet-400', id: 'purple' }
]

const noteAccentClass: Record<LearningNoteHighlight, string> = {
  amber: 'border-l-amber-400',
  blue: 'border-l-sky-400',
  green: 'border-l-emerald-400',
  pink: 'border-l-pink-400',
  purple: 'border-l-violet-400'
}

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
    notes: [],
    personalNote: '',
    sourceUrl: sourceUrl ?? null,
    title: title || 'Untitled lesson',
    updatedAt: now,
    version: 2
  }
}

const referenceForSegment = (
  segment: TranscriptSegmentView | null,
  fallbackTimeMs: number
): TranscriptReference => ({
  id: segment?.id ?? `current-${Math.floor(fallbackTimeMs)}`,
  quote: segment?.text ?? '',
  sourceEndOffset: segment?.text.length ?? null,
  sourceSegmentIds: segment ? [segment.id] : [],
  sourceStartOffset: segment ? 0 : null,
  timestampMs: segment?.startMs ?? fallbackTimeMs
})

export function LearningNotebookPane({
  capture,
  currentSegmentId,
  currentTimeMs,
  downloadId,
  onSeek,
  segments,
  sourceTitle,
  sourceUrl
}: LearningNotebookPaneProps) {
  const { t } = useTranslation()
  const [notebook, setNotebook] = useState<LearningNotebook>(() =>
    emptyNotebook(downloadId, sourceTitle ?? '', sourceUrl)
  )
  const [draft, setDraft] = useState('')
  const [highlightColor, setHighlightColor] = useState<LearningNoteHighlight>('amber')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(false)
  const [selectedReference, setSelectedReference] = useState<TranscriptReference | null>(null)
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

  const currentSegment = useMemo(
    () =>
      segments.find((segment) => segment.id === currentSegmentId) ??
      segments.find(
        (segment) => segment.startMs <= currentTimeMs && segment.endMs >= currentTimeMs
      ) ??
      segments.findLast((segment) => segment.startMs <= currentTimeMs) ??
      null,
    [currentSegmentId, currentTimeMs, segments]
  )
  const reference = useMemo(
    () => selectedReference ?? referenceForSegment(currentSegment, currentTimeMs),
    [currentSegment, currentTimeMs, selectedReference]
  )
  const filteredNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) {
      return notebook.notes
    }
    return notebook.notes.filter((note) =>
      `${note.text}\n${note.quote}\n${formatLearningClock(note.timestampMs)}`
        .toLocaleLowerCase()
        .includes(query)
    )
  }, [notebook.notes, search])

  const persistNotebook = useCallback(
    async (snapshot: LearningNotebook, revision: number, updateUi: boolean): Promise<void> => {
      if (updateUi) {
        setSaveState('saving')
      }
      try {
        await ipcServices.learning.save({
          downloadId: snapshot.downloadId,
          personalNote: snapshot.personalNote ?? ''
        })
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

  const persistNote = useCallback(
    async (note: LearningNote, notifyTranscript = false): Promise<void> => {
      setSaveState('saving')
      try {
        await ipcServices.learning.upsertNote({ downloadId, note })
        setSaveState('saved')
        if (notifyTranscript) {
          window.dispatchEvent(
            new CustomEvent('learning:notes-changed', { detail: { downloadId } })
          )
        }
      } catch (error) {
        logger.error('Failed to save learning note', error)
        setSaveState('idle')
        toast.error(t('learning.saveFailed'))
        const saved = await ipcServices.learning.get(downloadId).catch(() => null)
        if (saved) {
          setNotebook((current) => ({
            ...saved,
            personalNote: current.personalNote
          }))
        }
      }
    },
    [downloadId, t]
  )

  const deleteNote = useCallback(
    async (noteId: string): Promise<void> => {
      setSaveState('saving')
      try {
        await ipcServices.learning.deleteNote({ downloadId, noteId })
        setSaveState('saved')
        window.dispatchEvent(new CustomEvent('learning:notes-changed', { detail: { downloadId } }))
      } catch (error) {
        logger.error('Failed to delete learning note', error)
        setSaveState('idle')
        toast.error(t('learning.saveFailed'))
        const saved = await ipcServices.learning.get(downloadId).catch(() => null)
        if (saved) {
          setNotebook((current) => ({
            ...saved,
            personalNote: current.personalNote
          }))
        }
      }
    },
    [downloadId, t]
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

  useEffect(() => {
    void loadAttempt
    let active = true
    setLoading(true)
    setLoadError(false)
    setSaveState('idle')
    setSelectedReference(null)
    setDraft('')
    setSearch('')
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
        const loaded = saved ?? emptyNotebook(downloadId, sourceTitle ?? '', sourceUrl)
        notebookRef.current = loaded
        setNotebook(loaded)
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
  }, [downloadId, flushPendingSave, loadAttempt, sourceTitle, sourceUrl])

  useEffect(() => {
    const handleNotesChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ downloadId?: string }>).detail
      if (detail?.downloadId !== downloadId) {
        return
      }
      void ipcServices.learning
        .get(downloadId)
        .then((saved) => {
          if (saved) {
            setNotebook((current) => ({
              ...saved,
              personalNote: current.personalNote
            }))
          }
        })
        .catch((error) => logger.error('Failed to refresh learning notes', error))
    }
    window.addEventListener('learning:notes-changed', handleNotesChanged)
    return () => window.removeEventListener('learning:notes-changed', handleNotesChanged)
  }, [downloadId])

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

  const mutate = useCallback((update: (current: LearningNotebook) => LearningNotebook) => {
    dirtyRef.current = true
    mutationRevisionRef.current += 1
    setMutationRevision(mutationRevisionRef.current)
    setSaveState('saving')
    setNotebook((current) => {
      const updated = { ...update(current), updatedAt: Date.now() }
      notebookRef.current = updated
      return updated
    })
  }, [])

  useEffect(() => {
    if (!(capture && hydrated && handledCaptureIdRef.current !== capture.id)) {
      return
    }
    handledCaptureIdRef.current = capture.id
    const matchingSegment =
      segments.find(
        (segment) => segment.startMs <= capture.timestampMs && segment.endMs >= capture.timestampMs
      ) ?? null
    const matchOffset = matchingSegment?.text.indexOf(capture.quote) ?? -1
    const sourceStartOffset = matchOffset >= 0 ? matchOffset : null
    setSelectedReference({
      id: capture.id,
      quote: capture.quote,
      sourceEndOffset: sourceStartOffset === null ? null : sourceStartOffset + capture.quote.length,
      sourceSegmentIds: matchingSegment ? [matchingSegment.id] : [],
      sourceStartOffset,
      timestampMs: capture.timestampMs
    })
    setDraft('')
  }, [capture, hydrated, segments])

  const addNote = (): void => {
    const text = draft.trim()
    if (!(text && reference.quote.trim())) {
      return
    }
    const note = createLearningNote({
      highlightColor,
      kind: 'insight',
      quote: reference.quote,
      sourceEndOffset: reference.sourceEndOffset,
      sourceSegmentIds: reference.sourceSegmentIds,
      sourceStartOffset: reference.sourceStartOffset,
      text,
      timestampMs: reference.timestampMs
    })
    setNotebook((current) => ({ ...current, notes: [note, ...current.notes] }))
    void persistNote(note, true)
    setDraft('')
    setSelectedReference(null)
  }

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

  return (
    <div className="learning-notebook-pane flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-border/60 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm">{t('learning.notebook')}</p>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {t('learning.notebookDescription')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span aria-live="polite" className="mr-1 text-[11px] text-muted-foreground">
            {saveState === 'saving'
              ? t('learning.saving')
              : saveState === 'saved'
                ? t('learning.saved')
                : ''}
          </span>
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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="rounded-2xl border bg-background/90 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-border/60 border-b px-4 py-3">
            <div className="flex min-w-0 gap-2.5">
              <div className="mt-0.5 rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                <FileText className="size-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{t('learning.personalNote')}</h3>
                <p className="mt-0.5 text-muted-foreground text-xs leading-5">
                  {t('learning.personalNoteDescription')}
                </p>
              </div>
            </div>
            <div className="flex rounded-lg bg-muted/65 p-0.5">
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
          </div>
          <div className="p-4">
            {preview ? (
              <div className="min-h-40 rounded-xl border bg-muted/15 p-4 text-sm leading-7">
                {(notebook.personalNote ?? '').trim() ? (
                  <Response>{notebook.personalNote ?? ''}</Response>
                ) : (
                  <p className="text-muted-foreground">{t('learning.personalNoteEmpty')}</p>
                )}
              </div>
            ) : (
              <Textarea
                aria-label={t('learning.personalNote')}
                className="min-h-44 resize-y border-transparent bg-muted/25 font-mono text-sm leading-6 shadow-none hover:border-border focus-visible:bg-background"
                onChange={(event) =>
                  mutate((current) => ({ ...current, personalNote: event.target.value }))
                }
                placeholder={t('learning.personalNotePlaceholder')}
                value={notebook.personalNote ?? ''}
              />
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border bg-background/90 shadow-sm">
          <div className="flex items-start gap-2.5 border-border/60 border-b px-4 py-3">
            <div className="mt-0.5 rounded-lg bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
              <MessageSquareQuote className="size-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t('learning.transcriptNotes')}</h3>
              <p className="mt-0.5 text-muted-foreground text-xs leading-5">
                {t('learning.transcriptNotesDescription')}
              </p>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  className="inline-flex cursor-pointer items-center gap-1 font-mono text-amber-700 text-xs hover:underline dark:text-amber-300"
                  onClick={() => onSeek(reference.timestampMs / 1000)}
                  type="button"
                >
                  <Play className="size-3" /> {formatLearningClock(reference.timestampMs)}
                </button>
                {selectedReference ? (
                  <Button onClick={() => setSelectedReference(null)} size="sm" variant="ghost">
                    {t('learning.followCurrent')}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {t('learning.currentMoment')}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-6">{reference.quote || t('learning.noQuote')}</p>
            </div>

            <fieldset className="flex items-center gap-2">
              <legend className="mr-1 text-muted-foreground text-xs">
                {t('learning.highlightColor')}
              </legend>
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  aria-label={t(`learning.highlightColors.${color.id}`)}
                  aria-pressed={highlightColor === color.id}
                  className={`flex size-7 cursor-pointer items-center justify-center rounded-full border transition hover:scale-105 ${
                    highlightColor === color.id
                      ? color.activeClass
                      : 'border-transparent bg-muted/50'
                  }`}
                  key={color.id}
                  onClick={() => setHighlightColor(color.id)}
                  type="button"
                >
                  <span className={`size-3 rounded-full ${color.dotClass}`} />
                </button>
              ))}
            </fieldset>

            <Textarea
              className="min-h-24 resize-y"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  addNote()
                }
              }}
              placeholder={t('learning.transcriptNotePlaceholder')}
              value={draft}
            />
            <Button
              className="w-full"
              disabled={!(draft.trim() && reference.quote.trim())}
              onClick={addNote}
            >
              <Plus /> {t('learning.addTranscriptNote')}
              <span className="ml-auto opacity-65">Ctrl + Enter</span>
            </Button>
          </div>

          <div className="border-border/60 border-t p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t('learning.searchTranscriptNotes')}
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('learning.searchTranscriptNotes')}
                value={search}
              />
            </div>

            {filteredNotes.length === 0 ? (
              <div className="mt-3 flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 p-5 text-center">
                <MessageSquareQuote className="size-6 text-muted-foreground/65" />
                <p className="mt-2 text-muted-foreground text-sm">
                  {search ? t('learning.noMatchingNotes') : t('learning.emptyTranscriptNotes')}
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {filteredNotes.map((note) => {
                  const noteIndex = notebook.notes.findIndex((item) => item.id === note.id)
                  const accent = note.highlightColor
                    ? noteAccentClass[note.highlightColor]
                    : 'border-l-border'
                  return (
                    <article
                      className={`learning-note-card group rounded-xl border border-l-4 bg-background p-3 ${accent}`}
                      key={note.id}
                    >
                      <button
                        className="inline-flex cursor-pointer items-center gap-1 font-mono text-sky-700 text-xs hover:underline dark:text-sky-300"
                        onClick={() => onSeek(note.timestampMs / 1000)}
                        type="button"
                      >
                        <Play className="size-3" /> {formatLearningClock(note.timestampMs)}
                      </button>
                      {note.quote ? (
                        <blockquote className="mt-2 border-sky-500/30 border-l-2 pl-3 text-muted-foreground text-xs leading-5">
                          {note.quote}
                        </blockquote>
                      ) : null}
                      <Textarea
                        aria-label={t('learning.transcriptNotePlaceholder')}
                        className="mt-2 min-h-20 resize-y border-transparent bg-muted/25 text-sm leading-6 shadow-none hover:border-border focus-visible:bg-background"
                        onChange={(event) => {
                          const updated = {
                            ...note,
                            text: event.target.value,
                            updatedAt: Date.now()
                          }
                          setNotebook((current) => ({
                            ...current,
                            notes: current.notes.map((item) =>
                              item.id === note.id ? updated : item
                            )
                          }))
                          void persistNote(updated)
                        }}
                        value={note.text}
                      />
                      <div className="mt-2 flex justify-end opacity-65 transition group-hover:opacity-100">
                        <Button
                          aria-label={t('learning.delete')}
                          onClick={() => {
                            setNotebook((current) => ({
                              ...current,
                              notes: current.notes.filter((item) => item.id !== note.id)
                            }))
                            void deleteNote(note.id)
                            toast(t('learning.noteDeleted'), {
                              action: {
                                label: t('learning.undo'),
                                onClick: () => {
                                  setNotebook((current) => {
                                    const notes = [...current.notes]
                                    notes.splice(Math.max(0, noteIndex), 0, note)
                                    return { ...current, notes }
                                  })
                                  void persistNote(note, true)
                                }
                              }
                            })
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-border/60 border-t px-4 py-2 text-muted-foreground text-xs">
        {t('learning.noteCount', { count: notebook.notes.length })}
      </footer>
    </div>
  )
}
