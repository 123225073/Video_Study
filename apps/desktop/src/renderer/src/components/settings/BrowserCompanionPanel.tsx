import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@renderer/components/ui/item'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { CompanionPairingInfo } from '@shared/companion-types'
import { Check, Copy, MonitorSmartphone, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export function BrowserCompanionPanel() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<CompanionPairingInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setInfo(await ipcServices.companion.getPairingInfo())
    } catch (error) {
      logger.error('Failed to load browser companion pairing info', error)
      toast.error(t('learning.companion.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const copyCode = async () => {
    if (!info?.code) {
      return
    }
    await navigator.clipboard.writeText(info.code)
    toast.success(t('learning.companion.codeCopied'))
  }

  const reset = async () => {
    try {
      setLoading(true)
      setInfo(await ipcServices.companion.resetPairings())
      toast.success(t('learning.companion.resetDone'))
    } catch (error) {
      logger.error('Failed to reset browser companion pairings', error)
      toast.error(t('learning.companion.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ItemGroup>
        <Item className="items-start" variant="muted">
          <ItemContent>
            <ItemTitle>{t('learning.companion.title')}</ItemTitle>
            <ItemDescription>{t('learning.companion.description')}</ItemDescription>
          </ItemContent>
          <Badge variant={info?.port ? 'secondary' : 'outline'}>
            {info?.port ? (
              <>
                <Check /> {t('learning.companion.running', { port: info.port })}
              </>
            ) : (
              t('learning.companion.starting')
            )}
          </Badge>
        </Item>

        <Item className="items-center" variant="muted">
          <ItemContent>
            <ItemTitle>{t('learning.companion.pairingCode')}</ItemTitle>
            <ItemDescription>{t('learning.companion.pairingHint')}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="flex items-center gap-2">
              <code className="rounded-lg border bg-background px-4 py-2 font-bold text-2xl tracking-[0.28em]">
                {loading ? '······' : (info?.code ?? '------')}
              </code>
              <Button aria-label={t('learning.companion.copyCode')} onClick={copyCode} size="icon">
                <Copy />
              </Button>
            </div>
          </ItemActions>
        </Item>

        <Item className="items-start" variant="muted">
          <ItemContent>
            <ItemTitle>{t('learning.companion.pairedDevices')}</ItemTitle>
            <ItemDescription>
              {info?.pairedClientCount
                ? info.clientNames.join(' · ')
                : t('learning.companion.noDevices')}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant="outline">
              <MonitorSmartphone /> {info?.pairedClientCount ?? 0}
            </Badge>
          </ItemActions>
        </Item>
      </ItemGroup>

      <ItemGroup>
        <Item className="items-start" variant="muted">
          <ItemContent>
            <ItemTitle className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4" /> {t('learning.companion.privacyTitle')}
            </ItemTitle>
            <ItemDescription>{t('learning.companion.privacyDescription')}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button disabled={loading} onClick={() => void reset()} variant="outline">
              <RefreshCw /> {t('learning.companion.reset')}
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </div>
  )
}
