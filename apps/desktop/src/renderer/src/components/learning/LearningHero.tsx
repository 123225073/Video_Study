import {
  LearningDeleteDialog,
  type LearningDeleteTarget
} from '@renderer/components/learning/LearningDeleteDialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { useImportLocalMedia } from '@renderer/hooks/use-import-local-media'
import { ipcServices } from '@renderer/lib/ipc'
import { formatLearningClock } from '@renderer/lib/learning-notebook'
import { logger } from '@renderer/lib/logger'
import { downloadRecordsAtom } from '@renderer/store/downloads'
import { transcriptMapAtom } from '@renderer/store/transcripts'
import type { LearningNotebook } from '@shared/learning-types'
import { useNavigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BookOpenText,
  Cloud,
  FilePlus2,
  FolderUp,
  Link2,
  MonitorUp,
  Puzzle,
  Radio,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface LearningHeroProps {
  onOpenLearning: () => void
}

interface QuickCreateAction {
  descriptionKey: string
  icon: LucideIcon
  id: string
  onActivate?: () => void
  statusKey: string
  titleKey: string
}

interface RecentLearningItem {
  downloadId: string
  durationMs: number
  isLocalSource: boolean
  noteCount: number
  title: string
  updatedAt: number
}

const openExistingUrlImporter = () => {
  const moreActions = document.querySelector<HTMLButtonElement>('[data-testid="add-url-more"]')
  const trigger = moreActions?.parentElement?.querySelector<HTMLButtonElement>(
    'button:not([data-testid="add-url-more"])'
  )
  trigger?.click()
}

export function LearningHero({ onOpenLearning }: LearningHeroProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const records = useAtomValue(downloadRecordsAtom)
  const transcripts = useAtomValue(transcriptMapAtom)
  const { pickAndImportMedia } = useImportLocalMedia()
  const [notebooks, setNotebooks] = useState<LearningNotebook[]>([])
  const [deleteTarget, setDeleteTarget] = useState<LearningDeleteTarget | null>(null)

  useEffect(() => {
    void ipcServices.learning
      .list()
      .then(setNotebooks)
      .catch((error) => logger.error('Failed to load recent learning workspaces', error))
  }, [])

  const recentItems = useMemo<RecentLearningItem[]>(() => {
    const notebooksById = new Map(notebooks.map((notebook) => [notebook.downloadId, notebook]))
    const itemsById = new Map<string, RecentLearningItem>()

    for (const snapshot of Object.values(transcripts)) {
      if (!snapshot.record?.segments.length) {
        continue
      }
      const notebook = notebooksById.get(snapshot.downloadTaskId)
      const record = records.get(snapshot.downloadTaskId)
      itemsById.set(snapshot.downloadTaskId, {
        downloadId: snapshot.downloadTaskId,
        durationMs: snapshot.record.segments.at(-1)?.endMs ?? 0,
        isLocalSource: record?.url.startsWith('file:') === true,
        noteCount: notebook?.notes.length ?? 0,
        title: record?.title || snapshot.title || t('learning.untitled'),
        updatedAt: notebook?.updatedAt ?? snapshot.updatedAt ?? record?.completedAt ?? 0
      })
    }

    for (const notebook of notebooks) {
      if (itemsById.has(notebook.downloadId)) {
        continue
      }
      const record = records.get(notebook.downloadId)
      itemsById.set(notebook.downloadId, {
        downloadId: notebook.downloadId,
        durationMs: notebook.source?.durationMs ?? notebook.notes.at(-1)?.timestampMs ?? 0,
        isLocalSource: record?.url.startsWith('file:') === true,
        noteCount: notebook.notes.length,
        title: notebook.title || t('learning.untitled'),
        updatedAt: notebook.updatedAt
      })
    }

    return Array.from(itemsById.values())
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 4)
  }, [notebooks, records, t, transcripts])

  const formatUpdatedAt = (timestamp: number) => {
    if (timestamp <= 0) {
      return t('learning.home.recentSavedLocally')
    }
    return new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit',
      month: 'short'
    }).format(timestamp)
  }

  const quickActions: QuickCreateAction[] = [
    {
      descriptionKey: 'learning.home.actions.local.description',
      icon: FolderUp,
      id: 'local',
      onActivate: () => void pickAndImportMedia(),
      statusKey: 'learning.home.status.available',
      titleKey: 'learning.home.actions.local.title'
    },
    {
      descriptionKey: 'learning.home.actions.link.description',
      icon: Link2,
      id: 'link',
      onActivate: openExistingUrlImporter,
      statusKey: 'learning.home.status.available',
      titleKey: 'learning.home.actions.link.title'
    },
    {
      descriptionKey: 'learning.home.actions.cloud.description',
      icon: Cloud,
      id: 'cloud',
      statusKey: 'learning.home.status.soon',
      titleKey: 'learning.home.actions.cloud.title'
    },
    {
      descriptionKey: 'learning.home.actions.record.description',
      icon: Radio,
      id: 'record',
      statusKey: 'learning.home.status.reserved',
      titleKey: 'learning.home.actions.record.title'
    },
    {
      descriptionKey: 'learning.home.actions.blank.description',
      icon: FilePlus2,
      id: 'blank',
      statusKey: 'learning.home.status.reserved',
      titleKey: 'learning.home.actions.blank.title'
    },
    {
      descriptionKey: 'learning.home.actions.companion.description',
      icon: Puzzle,
      id: 'companion',
      onActivate: () => void navigate({ search: { tab: 'companion' }, to: '/settings' }),
      statusKey: 'learning.home.status.available',
      titleKey: 'learning.home.actions.companion.title'
    }
  ]

  return (
    <section className="learning-home-shell px-6 pt-5 pb-2 sm:px-8 sm:pt-7">
      <header className="learning-home-heading">
        <div>
          <Badge className="learning-kicker" variant="outline">
            <MonitorUp /> {t('learning.home.eyebrow')}
          </Badge>
          <h1 className="learning-display mt-3 font-semibold text-3xl leading-tight sm:text-4xl">
            {t('learning.home.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
            {t('learning.home.description')}
          </p>
        </div>
        <Button className="learning-ink-button" onClick={onOpenLearning}>
          {t('learning.home.openLibrary')} <ArrowRight />
        </Button>
      </header>

      <div className="learning-quick-grid mt-6">
        {quickActions.map((action) => {
          const Icon = action.icon
          const available = Boolean(action.onActivate)
          return (
            <button
              aria-disabled={!available}
              className="learning-quick-card"
              disabled={!available}
              key={action.id}
              onClick={action.onActivate}
              type="button"
            >
              <span className="learning-quick-icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <strong>{t(action.titleKey)}</strong>
                <small>{t(action.descriptionKey)}</small>
              </span>
              <span
                className={available ? 'learning-action-status' : 'learning-action-status muted'}
              >
                {t(action.statusKey)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="learning-recent mt-7">
        <div className="flex items-end justify-between gap-4 border-border/60 border-b pb-3">
          <div>
            <p className="learning-section-index">{t('learning.home.recentEyebrow')}</p>
            <h2 className="mt-1 font-semibold font-serif text-lg">
              {t('learning.home.recentTitle')}
            </h2>
          </div>
          <Button className="h-8 px-2 text-xs" onClick={onOpenLearning} variant="ghost">
            {t('learning.home.viewAll')} <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {recentItems.length === 0 ? (
          <div className="learning-recent-empty">
            <BookOpenText aria-hidden="true" />
            <span>{t('learning.home.recentEmpty')}</span>
          </div>
        ) : (
          <div className="learning-recent-list">
            {recentItems.map((item, index) => (
              <div className="learning-recent-entry" key={item.downloadId}>
                <button
                  className="learning-recent-row"
                  onClick={() =>
                    void navigate({
                      params: { downloadId: item.downloadId },
                      to: '/downloads/$downloadId/transcript'
                    })
                  }
                  type="button"
                >
                  <span className="learning-recent-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong className="block truncate">{item.title}</strong>
                    <small>
                      {formatLearningClock(item.durationMs)} ·{' '}
                      {t('learning.noteCount', { count: item.noteCount })}
                    </small>
                  </span>
                  <time
                    dateTime={
                      item.updatedAt > 0 ? new Date(item.updatedAt).toISOString() : undefined
                    }
                  >
                    {formatUpdatedAt(item.updatedAt)}
                  </time>
                  <ArrowRight aria-hidden="true" />
                </button>
                <Button
                  aria-label={t('learning.deleteDialog.itemLabel', { title: item.title })}
                  className="learning-recent-delete"
                  onClick={() =>
                    setDeleteTarget({
                      downloadId: item.downloadId,
                      isLocalSource: item.isLocalSource,
                      title: item.title
                    })
                  }
                  size="icon"
                  title={t('learning.deleteDialog.itemLabel', { title: item.title })}
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <LearningDeleteDialog
        onDeleted={(downloadId) =>
          setNotebooks((current) => current.filter((item) => item.downloadId !== downloadId))
        }
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        target={deleteTarget}
      />
    </section>
  )
}
