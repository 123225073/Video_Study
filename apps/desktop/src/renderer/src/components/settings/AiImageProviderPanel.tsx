import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@renderer/components/ui/item'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ipcServices } from '@renderer/lib/ipc'
import { logger } from '@renderer/lib/logger'
import type { AiImageAuthType, AiImageProviderConfig, AiSettingsSnapshot } from '@shared/ai-types'
import { Check, ImageIcon, KeyRound, Loader2, Pencil } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const OPENAI_IMAGE_BASE_URL = 'https://api.openai.com/v1'

interface AiImageProviderPanelProps {
  onSaved: (snapshot: AiSettingsSnapshot) => void
  value: AiImageProviderConfig
}

/** Compact image-model capability card with its configuration isolated in a dialog. */
export function AiImageProviderPanel({ onSaved, value }: AiImageProviderPanelProps) {
  const { t } = useTranslation()
  const baseUrlId = useId()
  const modelId = useId()
  const keyId = useId()
  const headerId = useId()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<AiImageProviderConfig['provider']>(value.provider)
  const [authType, setAuthType] = useState<AiImageAuthType>(value.authType)
  const [baseUrl, setBaseUrl] = useState(value.baseUrl)
  const [model, setModel] = useState(value.modelId)
  const [apiKeyHeader, setApiKeyHeader] = useState(value.apiKeyHeader)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProvider(value.provider)
    setAuthType(value.authType)
    setBaseUrl(value.baseUrl)
    setModel(value.modelId)
    setApiKeyHeader(value.apiKeyHeader)
    setApiKey('')
  }, [value])

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setProvider(value.provider)
      setAuthType(value.authType)
      setBaseUrl(value.baseUrl)
      setModel(value.modelId)
      setApiKeyHeader(value.apiKeyHeader)
      setApiKey('')
    }
    setOpen(nextOpen)
  }

  const configured = value.authType === 'none' || value.hasApiKey
  const canSave =
    Boolean(baseUrl.trim() && model.trim()) &&
    (authType === 'none' || Boolean(apiKey.trim() || value.hasApiKey)) &&
    (authType !== 'api-key' || Boolean(apiKeyHeader.trim()))
  const providerName =
    value.provider === 'openai-compatible'
      ? t('settings.ai.providerCards.openAiCompatible')
      : 'OpenAI'

  const save = async (): Promise<void> => {
    if (!canSave || saving) {
      return
    }
    setSaving(true)
    try {
      const snapshot = await ipcServices.ai.upsertImageProvider({
        apiKey: apiKey.trim() || undefined,
        apiKeyHeader: apiKeyHeader.trim() || undefined,
        authType,
        baseUrl: baseUrl.trim(),
        modelId: model.trim(),
        provider
      })
      onSaved(snapshot)
      setOpen(false)
      toast.success(t('settings.ai.providerCards.savedImage'))
    } catch (error) {
      logger.error('Failed to save image provider', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save image provider')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Item className="min-h-20 border bg-card shadow-xs" rounded="both" variant="muted">
        <ItemMedia className="border-amber-200 bg-amber-50 text-amber-700" variant="icon">
          <ImageIcon className="size-4" />
        </ItemMedia>
        <ItemContent>
          <p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
            {t('settings.ai.providerCards.imageModel')}
          </p>
          <ItemTitle>
            {providerName}
            <Badge variant={configured ? 'secondary' : 'outline'}>
              {configured ? (
                <Check aria-hidden className="size-3" />
              ) : (
                <KeyRound className="size-3" />
              )}
              {configured
                ? t('settings.ai.providerCards.inUse')
                : t('settings.ai.providerCards.setupRequired')}
            </Badge>
          </ItemTitle>
          <ItemDescription>{value.modelId}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button onClick={() => handleOpenChange(true)} size="sm" type="button" variant="outline">
            <Pencil aria-hidden className="size-3.5" />
            {t('settings.ai.providerCards.edit')}
          </Button>
        </ItemActions>
      </Item>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg border bg-amber-50 text-amber-700">
                <ImageIcon className="size-4" />
              </span>
              {t('settings.ai.providerCards.configureImage')}
            </DialogTitle>
            <DialogDescription>{t('settings.ai.providerCards.imageDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('settings.ai.providerCards.service')}</Label>
              <Select
                onValueChange={(next: AiImageProviderConfig['provider']) => {
                  setProvider(next)
                  if (next === 'openai') {
                    setBaseUrl(OPENAI_IMAGE_BASE_URL)
                    setAuthType('bearer')
                    setModel('gpt-image-2')
                  }
                }}
                value={provider}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="openai-compatible">
                    {t('settings.ai.providerCards.openAiCompatible')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.ai.providerCards.authentication')}</Label>
              <Select onValueChange={(next: AiImageAuthType) => setAuthType(next)} value={authType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">Bearer token</SelectItem>
                  <SelectItem value="api-key">API key header</SelectItem>
                  <SelectItem value="none">{t('settings.ai.providerCards.localNoAuth')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor={baseUrlId}>Base URL</Label>
              <Input
                id={baseUrlId}
                onChange={(event) => setBaseUrl(event.currentTarget.value)}
                placeholder={OPENAI_IMAGE_BASE_URL}
                value={baseUrl}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={modelId}>{t('settings.ai.providerCards.model')}</Label>
              <Input
                id={modelId}
                onChange={(event) => setModel(event.currentTarget.value)}
                placeholder="gpt-image-2"
                value={model}
              />
            </div>
            {authType === 'api-key' ? (
              <div className="grid gap-2">
                <Label htmlFor={headerId}>{t('settings.ai.providerCards.keyHeader')}</Label>
                <Input
                  id={headerId}
                  onChange={(event) => setApiKeyHeader(event.currentTarget.value)}
                  placeholder="api-key"
                  value={apiKeyHeader}
                />
              </div>
            ) : null}
            {authType === 'none' ? null : (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={keyId}>API Key</Label>
                <Input
                  autoComplete="off"
                  id={keyId}
                  onChange={(event) => setApiKey(event.currentTarget.value)}
                  placeholder={
                    value.hasApiKey ? t('settings.ai.providerCards.keepSavedKey') : 'sk-...'
                  }
                  type="password"
                  value={apiKey}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              {t('settings.ai.providerCards.cancel')}
            </Button>
            <Button disabled={!canSave || saving} onClick={() => void save()} type="button">
              {saving ? <Loader2 className="animate-spin" /> : null}
              {t('settings.ai.providerCards.saveImage')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
