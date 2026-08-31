import { TranscriptCaptionsPane } from '@renderer/components/transcript/TranscriptCaptionsPane'
import { TranscriptProgressThinking } from '@renderer/components/transcript/TranscriptProgressThinking'
import { TranscriptPromptPane } from '@renderer/components/transcript/TranscriptPromptPane'
import { Button } from '@renderer/components/ui/button'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { TranscriptSelectionAction } from '@renderer/lib/study-studio/types'
import type { TranscriptSegmentView, TranscriptSpeakerView } from '@renderer/store/transcripts'
import type { AiSettingsSnapshot } from '@shared/ai-types'
import { AlignLeft, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface LearningTranscriptPaneProps {
  correctedSegmentIds?: ReadonlySet<string>
  currentSegmentId: string | null
  currentTimeMs: number
  downloadId: string
  error?: string | null
  failed?: boolean
  noSpeech: boolean
  noSpeechDetail: string
  onCancel?: () => void
  onCorrectSegment?: (segmentId: string, text: string) => Promise<void>
  onRestoreSegment?: (segmentId: string) => Promise<void>
  onRetry?: () => void
  onSeek: (seconds: number) => void
  onSelectionIntent?: (action: TranscriptSelectionAction) => void
  ready: boolean
  resolveColorIndex: (speakerId: string | null) => number | null
  resolveSpeaker: (speakerId: string | null) => string
  running: boolean
  runningLabel: string
  segments: TranscriptSegmentView[]
  sourceCover?: string | null
  sourceDurationMs?: number
  sourceTitle?: string
  sourceUrl?: string | null
  speakers?: TranscriptSpeakerView[]
  stage?: string | null
  stageHistory?: Array<{ stage: string; startedAt: number }>
  streamLive?: boolean
  transcriptText: string
}

/** Original transcript first, with an optional non-destructive AI reading view. */
export function LearningTranscriptPane({
  correctedSegmentIds,
  currentSegmentId,
  currentTimeMs,
  downloadId,
  error = null,
  failed = false,
  noSpeech,
  noSpeechDetail,
  onCancel,
  onCorrectSegment,
  onRestoreSegment,
  onRetry,
  onSeek,
  onSelectionIntent,
  ready,
  resolveColorIndex,
  resolveSpeaker,
  running,
  runningLabel,
  segments,
  sourceCover,
  sourceDurationMs,
  sourceTitle,
  speakers = [],
  stage = null,
  stageHistory = [],
  streamLive = running,
  transcriptText
}: LearningTranscriptPaneProps) {
  const [view, setView] = useState<'original' | 'reading'>('original')
  const [aiSettings, setAiSettings] = useState<AiSettingsSnapshot | null>(null)
  const [highlightedSegmentIds, setHighlightedSegmentIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )

  const refreshHighlights = useCallback(async (): Promise<void> => {
    try {
      const notebook = await ipcServices.learning.get(downloadId)
      setHighlightedSegmentIds(
        new Set(
          (notebook?.notes ?? [])
            .filter((note) => Boolean(note.highlightColor))
            .flatMap((note) => note.sourceSegmentIds ?? [])
        )
      )
    } catch (loadError) {
      logger.error('Failed to load transcript highlights', loadError)
    }
  }, [downloadId])

  useEffect(() => {
    void refreshHighlights()
    const handleChanged = (event: Event): void => {
      const changedDownloadId = (event as CustomEvent<{ downloadId?: string }>).detail?.downloadId
      if (changedDownloadId === downloadId) {
        void refreshHighlights()
      }
    }
    window.addEventListener('learning:notes-changed', handleChanged)
    return () => window.removeEventListener('learning:notes-changed', handleChanged)
  }, [downloadId, refreshHighlights])

  useEffect(() => {
    let active = true
    void ipcServices.ai
      .getSnapshot()
      .then((snapshot) => {
        if (active) {
          setAiSettings(snapshot)
        }
      })
      .catch((loadError) => logger.error('Failed to load transcript reading settings', loadError))
    return () => {
      active = false
    }
  }, [])

  const readingPrompt = aiSettings?.prompts.find((prompt) => prompt.id === 'improve-grammar')
  const activeProvider = aiSettings?.providers.find(
    (provider) => provider.id === aiSettings.activeProviderId
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-border/60 border-b px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          <Button
            aria-pressed={view === 'original'}
            onClick={() => setView('original')}
            size="sm"
            variant={view === 'original' ? 'secondary' : 'ghost'}
          >
            <AlignLeft /> 原文
          </Button>
          <Button
            aria-pressed={view === 'reading'}
            disabled={!readingPrompt}
            onClick={() => setView('reading')}
            size="sm"
            variant={view === 'reading' ? 'secondary' : 'ghost'}
          >
            <Sparkles /> AI 阅读版
          </Button>
        </div>
        <span className="text-muted-foreground text-xs">点击时间或正文即可回到视频</span>
      </div>

      {view === 'reading' && readingPrompt ? (
        <div className="min-h-0 flex-1">
          <TranscriptPromptPane
            downloadId={downloadId}
            hasProvider={Boolean(aiSettings?.activeProviderId)}
            prompt={readingPrompt}
            providerLabel={
              activeProvider ? `${activeProvider.name} · ${activeProvider.modelId}` : null
            }
            ready={ready}
            settingsReady={aiSettings !== null}
            sourceCover={sourceCover}
            sourceTitle={sourceTitle}
            transcriptText={transcriptText}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {running ? (
            <TranscriptProgressThinking
              downloadId={downloadId}
              running={running}
              runningLabel={runningLabel}
              stage={stage}
              stageHistory={stageHistory}
            />
          ) : null}
          <div className="min-h-0 flex-1">
            <TranscriptCaptionsPane
              collapsed={false}
              correctedSegmentIds={correctedSegmentIds}
              currentSegmentId={currentSegmentId}
              currentTimeMs={currentTimeMs}
              downloadId={downloadId}
              embedded
              error={error}
              failed={failed}
              highlightedSegmentIds={highlightedSegmentIds}
              noSpeech={noSpeech}
              noSpeechDetail={noSpeechDetail}
              onCancel={onCancel}
              onCorrectSegment={onCorrectSegment}
              onRestoreSegment={onRestoreSegment}
              onRetry={onRetry}
              onSeek={onSeek}
              onSelectionIntent={onSelectionIntent}
              ready={ready}
              resolveColorIndex={resolveColorIndex}
              resolveSpeaker={resolveSpeaker}
              running={running}
              runningLabel={runningLabel}
              segments={segments}
              sourceCover={sourceCover}
              sourceDurationMs={sourceDurationMs}
              sourceTitle={sourceTitle}
              speakers={speakers}
              stage={stage}
              stageHistory={stageHistory}
              streamLive={streamLive}
            />
          </div>
        </div>
      )}
    </div>
  )
}
