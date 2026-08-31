import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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
import { ImageIcon, KeyRound, Loader2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const OPENAI_IMAGE_BASE_URL = 'https://api.openai.com/v1'

interface AiImageProviderPanelProps {
  onSaved: (snapshot: AiSettingsSnapshot) => void
  value: AiImageProviderConfig
}

/** Independent BYOK configuration for OpenAI-compatible image generation. */
export function AiImageProviderPanel({ onSaved, value }: AiImageProviderPanelProps) {
  const { i18n } = useTranslation()
  const isChinese = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith('zh')
  const baseUrlId = useId()
  const modelId = useId()
  const keyId = useId()
  const headerId = useId()
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

  const canSave =
    Boolean(baseUrl.trim() && model.trim()) &&
    (authType === 'none' || Boolean(apiKey.trim() || value.hasApiKey)) &&
    (authType !== 'api-key' || Boolean(apiKeyHeader.trim()))

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
      toast.success(isChinese ? '图片模型配置已安全保存' : 'Image provider saved securely')
    } catch (error) {
      logger.error('Failed to save image provider', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save image provider')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border bg-muted/20 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
            <ImageIcon className="size-4" />
          </span>
          <div>
            <h3 className="font-medium">
              {isChinese ? '独立图片生成服务' : 'Independent image provider'}
            </h3>
            <p className="mt-1 max-w-2xl text-muted-foreground text-xs leading-5">
              {isChinese
                ? '与文字模型完全分开。API 密钥加密保存在本机；保存配置不会假装测试成功，也不会发起付费生图。'
                : 'Separate from text models. The API key is sealed locally; saving does not fake a successful test or make a paid request.'}
            </p>
          </div>
        </div>
        <Badge variant={value.hasApiKey || value.authType === 'none' ? 'secondary' : 'outline'}>
          <KeyRound className="size-3" />
          {value.hasApiKey || value.authType === 'none'
            ? isChinese
              ? '已配置'
              : 'Configured'
            : isChinese
              ? '待填写密钥'
              : 'API key required'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{isChinese ? '图片服务类型' : 'Image service'}</Label>
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
                {isChinese ? 'OpenAI 兼容接口' : 'OpenAI-compatible'}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>{isChinese ? '鉴权方式' : 'Authentication'}</Label>
          <Select onValueChange={(next: AiImageAuthType) => setAuthType(next)} value={authType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bearer">Bearer token</SelectItem>
              <SelectItem value="api-key">API key header</SelectItem>
              <SelectItem value="none">
                {isChinese ? '无鉴权（仅本地接口）' : 'None (local only)'}
              </SelectItem>
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
          <Label htmlFor={modelId}>{isChinese ? '图片模型' : 'Image model'}</Label>
          <Input
            id={modelId}
            onChange={(event) => setModel(event.currentTarget.value)}
            placeholder="gpt-image-2"
            value={model}
          />
        </div>
        {authType === 'api-key' ? (
          <div className="grid gap-2">
            <Label htmlFor={headerId}>{isChinese ? '密钥请求头' : 'API key header'}</Label>
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
                value.hasApiKey
                  ? isChinese
                    ? '留空则保留原密钥'
                    : 'Leave blank to keep saved key'
                  : 'sk-...'
              }
              type="password"
              value={apiKey}
            />
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button disabled={!canSave || saving} onClick={() => void save()} type="button">
          {saving ? <Loader2 className="animate-spin" /> : null}
          {isChinese ? '保存图片服务' : 'Save image provider'}
        </Button>
      </div>
    </section>
  )
}
