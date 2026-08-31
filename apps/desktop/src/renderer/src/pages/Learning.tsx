import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ipcServices } from '@renderer/lib/ipc'
import { formatLearningClock } from '@renderer/lib/learning-notebook'
import { logger } from '@renderer/lib/logger'
import { downloadRecordsAtom } from '@renderer/store/downloads'
import { type TranscriptListState, transcriptMapAtom } from '@renderer/store/transcripts'
import type { LearningNotebook, LearningSearchResult } from '@shared/learning-types'
import { useNavigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  FileText,
  Grid2X2,
  LayoutList,
  NotebookPen,
  Search,
  Tags
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

type LibraryStatus = 'attention' | 'processing' | 'ready' | 'saved'
type LibraryView = 'card' | 'list'

interface LibraryLesson {
  downloadId: string
  durationMs: number
  hasTranscript: boolean
  noteCount: number
  outputCount: number
  status: LibraryStatus
  tags: string[]
  title: string
  updatedAt: number
}

const PROCESSING_STATES = new Set<TranscriptListState>(['queued', 'retry-scheduled', 'running'])
const ATTENTION_STATES = new Set<TranscriptListState>(['cancelled', 'failed', 'no-speech'])

const resolvePlatformLabel = (url: string | null | undefined) => {
  if (!url) {
    return ''
  }
  const normalized = url.toLowerCase()
  if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) {
    return 'YouTube'
  }
  if (normalized.includes('bilibili.com') || normalized.includes('b23.tv')) {
    return '哔哩哔哩'
  }
  if (normalized.startsWith('http')) {
    return 'Web'
  }
  return ''
}

const resolveLibraryStatus = (
  listState: TranscriptListState,
  hasTranscript: boolean,
  hasNotebook: boolean
): LibraryStatus => {
  if (hasTranscript) {
    return 'ready'
  }
  if (PROCESSING_STATES.has(listState)) {
    return 'processing'
  }
  if (ATTENTION_STATES.has(listState)) {
    return 'attention'
  }
  return hasNotebook ? 'saved' : 'processing'
}

export function Learning() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const records = useAtomValue(downloadRecordsAtom)
  const transcripts = useAtomValue(transcriptMapAtom)
  const [notebooks, setNotebooks] = useState<LearningNotebook[]>([])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<LearningSearchResult[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | LibraryStatus>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [view, setView] = useState<LibraryView>('list')

  useEffect(() => {
    void ipcServices.learning
      .list()
      .then(setNotebooks)
      .catch((error) => logger.error('Failed to load learning workspaces', error))
  }, [])

  useEffect(() => {
    const normalized = query.trim()
    if (!normalized) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      void ipcServices.learning
        .search({ limit: 50, query: normalized })
        .then(setResults)
        .catch((error) => {
          logger.error('Failed to search learning workspaces', error)
          setResults([])
        })
        .finally(() => setSearching(false))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const openLesson = (downloadId: string) => {
    void navigate({
      params: { downloadId },
      to: '/downloads/$downloadId/transcript'
    })
  }

  const openSearchResult = (result: LearningSearchResult) => {
    if (result.timestampMs !== null) {
      window.localStorage.setItem(
        `fengsha-pending-seek:${result.downloadId}`,
        String(result.timestampMs)
      )
    }
    openLesson(result.downloadId)
  }

  const lessons = useMemo<LibraryLesson[]>(() => {
    const notebooksById = new Map(notebooks.map((notebook) => [notebook.downloadId, notebook]))
    const lessonsById = new Map<string, LibraryLesson>()

    for (const snapshot of Object.values(transcripts)) {
      const notebook = notebooksById.get(snapshot.downloadTaskId)
      const record = records.get(snapshot.downloadTaskId)
      const hasTranscript = Boolean(snapshot.record?.segments.length)
      const platform = notebook?.source?.platform || resolvePlatformLabel(record?.url)
      const tags = Array.from(
        new Set([platform, ...(record?.tags ?? [])].map((tag) => tag.trim()).filter(Boolean))
      )
      lessonsById.set(snapshot.downloadTaskId, {
        downloadId: snapshot.downloadTaskId,
        durationMs:
          snapshot.record?.segments.at(-1)?.endMs ??
          notebook?.source?.durationMs ??
          (record?.duration ?? 0) * 1000,
        hasTranscript,
        noteCount: notebook?.notes.length ?? 0,
        outputCount: notebook?.blocks?.length ?? notebook?.aiArtifacts?.length ?? 0,
        status: resolveLibraryStatus(snapshot.listState, hasTranscript, Boolean(notebook)),
        tags,
        title: record?.title || snapshot.title || notebook?.title || t('learning.untitled'),
        updatedAt:
          notebook?.updatedAt ??
          snapshot.updatedAt ??
          record?.completedAt ??
          record?.downloadedAt ??
          0
      })
    }

    for (const notebook of notebooks) {
      if (lessonsById.has(notebook.downloadId)) {
        continue
      }
      const record = records.get(notebook.downloadId)
      const platform = notebook.source?.platform || resolvePlatformLabel(record?.url)
      lessonsById.set(notebook.downloadId, {
        downloadId: notebook.downloadId,
        durationMs:
          notebook.source?.durationMs ??
          notebook.notes.at(-1)?.timestampMs ??
          (record?.duration ?? 0) * 1000,
        hasTranscript: false,
        noteCount: notebook.notes.length,
        outputCount: notebook.blocks?.length ?? notebook.aiArtifacts?.length ?? 0,
        status: 'saved',
        tags: Array.from(
          new Set([platform, ...(record?.tags ?? [])].map((tag) => tag.trim()).filter(Boolean))
        ),
        title: notebook.title || record?.title || t('learning.untitled'),
        updatedAt: notebook.updatedAt
      })
    }

    return Array.from(lessonsById.values()).toSorted(
      (left, right) => right.updatedAt - left.updatedAt
    )
  }, [notebooks, records, t, transcripts])

  const availableTags = useMemo(
    () => Array.from(new Set(lessons.flatMap((lesson) => lesson.tags))).slice(0, 8),
    [lessons]
  )

  const visibleLessons = useMemo(
    () =>
      lessons.filter((lesson) => {
        const matchesStatus = statusFilter === 'all' || lesson.status === statusFilter
        const matchesTag = !tagFilter || lesson.tags.includes(tagFilter)
        return matchesStatus && matchesTag
      }),
    [lessons, statusFilter, tagFilter]
  )

  const formatUpdatedAt = (timestamp: number) => {
    if (timestamp <= 0) {
      return t('learning.library.savedLocally')
    }
    return new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(timestamp)
  }

  const statuses: Array<'all' | LibraryStatus> = [
    'all',
    'ready',
    'processing',
    'saved',
    'attention'
  ]

  return (
    <div className="learning-library mx-auto w-full max-w-7xl px-5 py-7 sm:px-9 sm:py-10">
      <header className="learning-library-header">
        <div>
          <Badge className="learning-kicker" variant="outline">
            <BookOpen /> {t('learning.library.eyebrow')}
          </Badge>
          <h1 className="learning-display mt-4 font-semibold text-4xl leading-none sm:text-5xl">
            {t('learning.library.title')}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
            {t('learning.library.description', { count: lessons.length })}
          </p>
        </div>
        <Button className="learning-ink-button" onClick={() => void navigate({ to: '/' })}>
          {t('learning.library.addSource')} <ArrowUpRight />
        </Button>
      </header>

      <section aria-label={t('learning.library.tools')} className="learning-library-toolbar">
        <div className="learning-search-field">
          <Search aria-hidden="true" />
          <Input
            aria-label={t('learning.search.label')}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('learning.search.placeholder')}
            value={query}
          />
        </div>
        <fieldset className="learning-view-toggle">
          <legend className="sr-only">{t('learning.library.viewLabel')}</legend>
          <Button
            aria-label={t('learning.library.listView')}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            size="icon"
            variant={view === 'list' ? 'secondary' : 'ghost'}
          >
            <LayoutList />
          </Button>
          <Button
            aria-label={t('learning.library.cardView')}
            aria-pressed={view === 'card'}
            onClick={() => setView('card')}
            size="icon"
            variant={view === 'card' ? 'secondary' : 'ghost'}
          >
            <Grid2X2 />
          </Button>
        </fieldset>
      </section>

      {!query.trim() && lessons.length > 0 ? (
        <div className="learning-filter-bar">
          <fieldset className="learning-status-filters">
            <legend className="sr-only">{t('learning.library.statusLabel')}</legend>
            {statuses.map((status) => (
              <button
                aria-pressed={statusFilter === status}
                className={statusFilter === status ? 'is-active' : undefined}
                key={status}
                onClick={() => setStatusFilter(status)}
                type="button"
              >
                {t(`learning.library.filters.${status}`)}
              </button>
            ))}
          </fieldset>
          {availableTags.length > 0 ? (
            <fieldset className="learning-tag-filters">
              <legend className="sr-only">{t('learning.library.tagLabel')}</legend>
              <Tags aria-hidden="true" />
              {availableTags.map((tag) => (
                <button
                  aria-pressed={tagFilter === tag}
                  className={tagFilter === tag ? 'is-active' : undefined}
                  key={tag}
                  onClick={() => setTagFilter((current) => (current === tag ? '' : tag))}
                  type="button"
                >
                  {tag}
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {query.trim() ? (
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('learning.search.title')}</h2>
            <span aria-live="polite" className="text-muted-foreground text-xs">
              {searching
                ? t('learning.search.searching')
                : t('learning.search.count', { count: results.length })}
            </span>
          </div>
          {results.length === 0 && !searching ? (
            <div className="learning-library-empty compact">{t('learning.search.empty')}</div>
          ) : (
            <div className="learning-search-results">
              {results.map((result) => (
                <button
                  className="learning-search-result"
                  key={`${result.downloadId}:${result.field}:${result.id}`}
                  onClick={() => openSearchResult(result)}
                  type="button"
                >
                  <span className="learning-result-kind">
                    {t(`learning.search.fields.${result.field}`)}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong className="block truncate text-sm">{result.title}</strong>
                    <span className="mt-1 line-clamp-2 block text-muted-foreground text-sm leading-5">
                      {result.snippet || result.text}
                    </span>
                  </span>
                  {result.timestampMs === null ? null : (
                    <span className="shrink-0 font-mono text-amber-700 text-xs dark:text-amber-300">
                      {formatLearningClock(result.timestampMs)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!query.trim() && lessons.length === 0 ? (
        <div className="learning-library-empty">
          <NotebookPen aria-hidden="true" />
          <h2>{t('learning.library.emptyTitle')}</h2>
          <p>{t('learning.library.emptyDescription')}</p>
          <Button onClick={() => void navigate({ to: '/' })}>
            {t('learning.library.emptyAction')}
          </Button>
        </div>
      ) : null}

      {!query.trim() && lessons.length > 0 && visibleLessons.length === 0 ? (
        <div className="learning-library-empty compact">{t('learning.library.filteredEmpty')}</div>
      ) : null}

      {!query.trim() && visibleLessons.length > 0 ? (
        <div className={view === 'card' ? 'learning-card-grid' : 'learning-item-list'}>
          {visibleLessons.map((lesson) => (
            <button
              className={view === 'card' ? 'learning-library-card' : 'learning-library-row'}
              key={lesson.downloadId}
              onClick={() => openLesson(lesson.downloadId)}
              type="button"
            >
              <span className="learning-item-leading">
                <FileText aria-hidden="true" />
              </span>
              <span className="learning-item-copy">
                <span className="learning-item-meta">
                  <span className={`learning-library-status status-${lesson.status}`}>
                    {t(`learning.library.status.${lesson.status}`)}
                  </span>
                  <span>
                    <Clock3 aria-hidden="true" /> {formatLearningClock(lesson.durationMs)}
                  </span>
                </span>
                <strong>{lesson.title}</strong>
                <span className="learning-item-tags">
                  {lesson.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                  {lesson.noteCount > 0 ? (
                    <span>{t('learning.noteCount', { count: lesson.noteCount })}</span>
                  ) : null}
                  {lesson.outputCount > 0 ? (
                    <span>{t('learning.outputCount', { count: lesson.outputCount })}</span>
                  ) : null}
                </span>
              </span>
              <span className="learning-item-trailing">
                <time
                  dateTime={
                    lesson.updatedAt > 0 ? new Date(lesson.updatedAt).toISOString() : undefined
                  }
                >
                  {formatUpdatedAt(lesson.updatedAt)}
                </time>
                <ArrowRight aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
