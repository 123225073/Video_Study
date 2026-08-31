import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { ipcServices } from '@renderer/lib/ipc'
import {
  BookOpen,
  Captions,
  ExternalLink,
  HardDrive,
  Languages,
  NotebookPen,
  ShieldCheck
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const features = [
  { icon: Captions, key: 'transcript' },
  { icon: Languages, key: 'translate' },
  { icon: NotebookPen, key: 'notes' },
  { icon: BookOpen, key: 'ai' }
] as const

export function About() {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')

  useEffect(() => {
    void ipcServices.app.getVersion().then(setVersion)
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-10">
      <section className="learning-hero overflow-hidden rounded-2xl border border-amber-500/20 p-7 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <img
            alt={t('learning.appName')}
            className="size-20 rounded-2xl border border-amber-500/20 shadow-md"
            src="./app-icon.png"
          />
          <div className="min-w-0 flex-1">
            <Badge
              className="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              variant="outline"
            >
              {t('learning.localFirst')}
            </Badge>
            <h1 className="mt-3 font-semibold text-3xl tracking-tight">{t('learning.appName')}</h1>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {t('learning.aboutDescription')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-xs">{t('about.version')}</p>
            <p className="mt-1 font-mono font-semibold text-lg">v{version || '3.2.0'}</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <article className="rounded-xl border bg-card p-4" key={feature.key}>
              <Icon className="size-5 text-amber-600" />
              <h2 className="mt-3 font-semibold text-sm">
                {t(`learning.aboutFeatures.${feature.key}.title`)}
              </h2>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t(`learning.aboutFeatures.${feature.key}.description`)}
              </p>
            </article>
          )
        })}
      </div>

      <section className="mt-6 rounded-2xl border bg-muted/25 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <h2 className="font-semibold text-sm">{t('learning.privacyTitle')}</h2>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              {t('learning.privacyDescription')}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3 border-border/60 border-t pt-4">
          <HardDrive className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-sm">{t('learning.openSourceTitle')}</h2>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              {t('learning.openSourceDescription')}
            </p>
          </div>
          <Button
            onClick={() => void ipcServices.fs.openExternal('https://github.com/nexmoe/VidBee')}
            size="sm"
            variant="outline"
          >
            GitHub <ExternalLink />
          </Button>
        </div>
      </section>
    </div>
  )
}
