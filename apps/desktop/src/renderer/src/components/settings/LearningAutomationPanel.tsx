import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { LearningAiWorkflowId, LearningAiWorkflowSettings } from '@shared/learning-types'
import { createDefaultLearningAiSettings } from '@shared/learning-workflow/defaults'
import { Bot, RotateCcw, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const WORKFLOW_ORDER: LearningAiWorkflowId[] = [
  'summary',
  'mindmap',
  'translation',
  'quote-candidates',
  'reflection'
]

export function LearningAutomationPanel() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<LearningAiWorkflowSettings | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setSettings(await ipcServices.learning.getAiSettings())
    } catch (error) {
      logger.error('Failed to load learning AI automation settings', error)
      toast.error(t('learning.automation.loadFailed'))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const updateRule = (
    id: LearningAiWorkflowId,
    change: Partial<{ enabled: boolean; runOnTranscriptComplete: boolean }>
  ) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            workflows: current.workflows.map((rule) =>
              rule.id === id ? { ...rule, ...change } : rule
            )
          }
        : current
    )
  }

  const updatePrompt = (id: LearningAiWorkflowId, systemPrompt: string) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            prompts: current.prompts.map((prompt) =>
              prompt.id === id ? { ...prompt, systemPrompt } : prompt
            )
          }
        : current
    )
  }

  const save = async () => {
    if (!settings) {
      return
    }
    try {
      setSaving(true)
      setSettings(await ipcServices.learning.saveAiSettings(settings))
      toast.success(t('learning.automation.saved'))
    } catch (error) {
      logger.error('Failed to save learning AI automation settings', error)
      toast.error(t('learning.automation.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setSettings(createDefaultLearningAiSettings())
    toast.info(t('learning.automation.resetHint'))
  }

  if (!settings) {
    return <p className="text-muted-foreground text-sm">{t('learning.loading')}</p>
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-muted/25 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-500/12 p-2 text-amber-700 dark:text-amber-300">
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{t('learning.automation.title')}</h3>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('learning.automation.description')}
            </p>
            <label className="mt-4 block space-y-1.5" htmlFor="learning-default-model">
              <span className="font-medium text-sm">{t('learning.automation.defaultModel')}</span>
              <Input
                id="learning-default-model"
                onChange={(event) =>
                  setSettings((current) =>
                    current ? { ...current, defaultModel: event.target.value } : current
                  )
                }
                placeholder={t('learning.automation.defaultModelPlaceholder')}
                value={settings.defaultModel}
              />
              <span className="text-muted-foreground text-xs">
                {t('learning.automation.defaultModelHint')}
              </span>
            </label>
          </div>
        </div>
      </section>

      {WORKFLOW_ORDER.map((id) => {
        const rule = settings.workflows.find((item) => item.id === id)
        const prompt = settings.prompts.find((item) => item.id === id)
        if (!(rule && prompt)) {
          return null
        }
        return (
          <section className="rounded-2xl border bg-background p-5 shadow-sm" key={id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="inline-flex items-center gap-2 font-semibold">
                  <Sparkles className="size-4 text-amber-500" />
                  {t(`learning.automation.workflows.${id}.title`)}
                </h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t(`learning.automation.workflows.${id}.description`)}
                </p>
              </div>
              <div className="flex items-center gap-5 text-sm">
                <div className="inline-flex items-center gap-2">
                  <span>{t('learning.automation.enabled')}</span>
                  <Switch
                    aria-label={`${t(`learning.automation.workflows.${id}.title`)} ${t('learning.automation.enabled')}`}
                    checked={rule.enabled}
                    label=""
                    onToggle={() => updateRule(id, { enabled: !rule.enabled })}
                  />
                </div>
                <div className="inline-flex items-center gap-2">
                  <span>{t('learning.automation.autoRun')}</span>
                  <Switch
                    aria-label={`${t(`learning.automation.workflows.${id}.title`)} ${t('learning.automation.autoRun')}`}
                    checked={rule.runOnTranscriptComplete}
                    label=""
                    onToggle={() =>
                      updateRule(id, {
                        runOnTranscriptComplete: !rule.runOnTranscriptComplete
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <label className="mt-4 block space-y-1.5" htmlFor={`learning-prompt-${id}`}>
              <span className="font-medium text-sm">{t('learning.automation.systemPrompt')}</span>
              <Textarea
                className="min-h-44 font-mono text-xs leading-5"
                id={`learning-prompt-${id}`}
                onChange={(event) => updatePrompt(id, event.target.value)}
                value={prompt.systemPrompt}
              />
              <span className="text-muted-foreground text-xs">
                {t('learning.automation.promptVersion', { version: prompt.version })}
              </span>
            </label>
          </section>
        )
      })}

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-border/70 border-t bg-background/95 py-4 backdrop-blur">
        <Button onClick={reset} variant="outline">
          <RotateCcw /> {t('learning.automation.restoreDefaults')}
        </Button>
        <Button disabled={saving} onClick={() => void save()}>
          <Save /> {saving ? t('learning.automation.saving') : t('learning.automation.save')}
        </Button>
      </div>
    </div>
  )
}
