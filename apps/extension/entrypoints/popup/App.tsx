import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BridgeRequestError,
  type BridgeStatus,
  discoverBridge,
  type PairingRecord,
  pairBridge,
  postCapture
} from '../../utils/bridge-client'
import {
  buildCapturePayload,
  type CaptureAction,
  isCapturePayloadSafe,
  type PageSnapshot
} from '../../utils/companion-contract'
import { captureVisibleVideoFrame } from '../../utils/frame-capture'
import { extractActivePageSnapshot } from '../../utils/page-capture'
import './App.css'

const PAIRING_STORAGE_KEY = 'fengshaCompanionPairing'

type MessageName = Parameters<typeof browser.i18n.getMessage>[0]

const message = (name: MessageName, substitutions?: string | string[]): string =>
  browser.i18n.getMessage(name, substitutions) || name

const copy = {
  brandEyebrow: message('brandEyebrow'),
  bridgeDisconnected: message('bridgeDisconnected'),
  bridgeReady: message('bridgeReady'),
  captionEmpty: message('captionEmpty'),
  captureActions: message('captureActions'),
  captureFrame: message('captureFrame'),
  captureMoment: message('captureMoment'),
  capturing: message('capturing'),
  connectedAt: (port: number) => message('connectedAt', String(port)),
  connectionOnline: message('connectionOnline'),
  connectionStatus: message('connectionStatus'),
  connectionWaiting: message('connectionWaiting'),
  currentPage: message('currentPage'),
  desktopLabel: message('desktopLabel'),
  desktopNotReady: message('desktopNotReady'),
  desktopUnreachable: message('desktopUnreachable'),
  durationUnknown: message('durationUnknown'),
  errorGeneric: message('errorGeneric'),
  inspectAgain: message('inspectAgain'),
  invalidPairingResponse: message('invalidPairingResponse'),
  localDevice: message('localDevice'),
  localFirstActiveCapture: message('localFirstActiveCapture'),
  loopbackConnection: message('loopbackConnection'),
  noAutoUpload: message('noAutoUpload'),
  noPage: message('noPage'),
  noVideo: message('noVideo'),
  notConnected: message('notConnected'),
  pair: message('pair'),
  pairCode: message('pairCode'),
  pairCodeInvalid: message('pairCodeInvalid'),
  pairCodePlaceholder: message('pairCodePlaceholder'),
  pairFirst: message('pairFirst'),
  pairHint: message('pairHint'),
  paired: message('paired'),
  pairedSuccess: message('pairedSuccess'),
  pairingExpired: message('pairingExpired'),
  pairingRequired: message('pairingRequired'),
  permission: message('permission'),
  product: message('product'),
  protocolIncompatible: message('protocolIncompatible'),
  readingPage: message('readingPage'),
  securityAuthorization: message('securityAuthorization'),
  send: message('send'),
  sending: message('sending'),
  sentFrame: message('sentFrame'),
  sentMoment: message('sentMoment'),
  sentPage: message('sentPage'),
  stop: message('stop'),
  stopped: message('stopped'),
  tooManyRequests: message('tooManyRequests'),
  transcript: message('transcript'),
  unpair: message('unpair'),
  unpairedSuccess: message('unpairedSuccess'),
  unsafePageData: message('unsafePageData'),
  untitledVideo: message('untitledVideo'),
  videoFound: message('videoFound')
} as const

const formatTime = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return '--:--'
  }
  const seconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

const loadPairing = async (): Promise<PairingRecord | null> => {
  const stored = await browser.storage.local.get(PAIRING_STORAGE_KEY)
  const record = stored[PAIRING_STORAGE_KEY] as PairingRecord | undefined
  return record?.token && record.port ? record : null
}

const savePairing = async (record: PairingRecord | null): Promise<void> => {
  if (record) {
    await browser.storage.local.set({ [PAIRING_STORAGE_KEY]: record })
    return
  }
  await browser.storage.local.remove(PAIRING_STORAGE_KEY)
}

const getActiveTab = async (): Promise<Browser.tabs.Tab> => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!(tab?.id && tab.url?.match(/^https?:\/\//))) {
    throw new Error(copy.noPage)
  }
  return tab
}

const inspectActivePage = async (): Promise<{ snapshot: PageSnapshot; tab: Browser.tabs.Tab }> => {
  const tab = await getActiveTab()
  const results = await browser.scripting.executeScript({
    func: extractActivePageSnapshot,
    target: { tabId: tab.id as number }
  })
  const snapshot = results[0]?.result as PageSnapshot | undefined
  if (!snapshot) {
    throw new Error(copy.noPage)
  }
  return { snapshot, tab }
}

type ErrorContext = 'capture' | 'inspect' | 'pair'

const readableError = (error: unknown, context: ErrorContext = 'capture'): string => {
  if (error instanceof BridgeRequestError) {
    if (error.status === 401 || error.status === 403) {
      return context === 'pair' ? copy.pairCodeInvalid : copy.pairingExpired
    }
    if (error.status === 429) {
      return copy.tooManyRequests
    }
    if (error.status === 503) {
      return copy.desktopNotReady
    }
    if (error.message.includes('incompatible') || error.message.includes('protocol')) {
      return copy.protocolIncompatible
    }
    if (error.message.includes('invalid pairing token')) {
      return copy.invalidPairingResponse
    }
    if (error.message.includes('not reachable') || error.message.includes('timed out')) {
      return copy.desktopUnreachable
    }
    return copy.errorGeneric
  }
  if (
    error instanceof Error &&
    (error.message === copy.noPage || error.message === copy.unsafePageData)
  ) {
    return error.message
  }
  return copy.errorGeneric
}

function App() {
  const [bridge, setBridge] = useState<BridgeStatus | null>(null)
  const [busyAction, setBusyAction] = useState<CaptureAction | 'inspect' | 'pair' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pairing, setPairing] = useState<PairingRecord | null>(null)
  const [pairingCode, setPairingCode] = useState('')
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null)
  const [tab, setTab] = useState<Browser.tabs.Tab | null>(null)

  const refreshPage = useCallback(async (): Promise<void> => {
    setBusyAction('inspect')
    setError('')
    try {
      const inspected = await inspectActivePage()
      setSnapshot(inspected.snapshot)
      setTab(inspected.tab)
    } catch (caught) {
      setSnapshot(null)
      setTab(null)
      setError(readableError(caught, 'inspect'))
    } finally {
      setBusyAction(null)
    }
  }, [])

  const refreshBridge = useCallback(async (): Promise<void> => {
    const storedPairing = await loadPairing()
    setPairing(storedPairing)
    const discovered = await discoverBridge(storedPairing)
    setBridge(discovered)
  }, [])

  useEffect(() => {
    void refreshPage()
    void refreshBridge()
  }, [refreshBridge, refreshPage])

  const captionPreview = useMemo(() => {
    if (!snapshot) {
      return ''
    }
    if (snapshot.captions.visibleText) {
      return snapshot.captions.visibleText
    }
    const cue = snapshot.captions.tracks.flatMap((track) => track.cues)[0]
    return cue?.text ?? snapshot.captions.renderedSegments[0]?.text ?? ''
  }, [snapshot])

  const paired = Boolean(bridge && pairing && bridge.paired)
  const canUseVideoAction = Boolean(paired && snapshot?.video.found)

  const handlePair = async (): Promise<void> => {
    if (!(bridge && pairingCode.trim())) {
      return
    }
    setBusyAction('pair')
    setError('')
    setNotice('')
    try {
      const nextPairing = await pairBridge(bridge, pairingCode, copy.product)
      await savePairing(nextPairing)
      setPairing(nextPairing)
      setPairingCode('')
      const status = await discoverBridge(nextPairing)
      setBridge(status ? { ...status, paired: true } : { ...bridge, paired: true })
      setNotice(copy.pairedSuccess)
    } catch (caught) {
      setError(readableError(caught, 'pair'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleUnpair = async (): Promise<void> => {
    await savePairing(null)
    setPairing(null)
    setBridge((current) => (current ? { ...current, paired: false } : current))
    setNotice(copy.unpairedSuccess)
  }

  const handleCapture = async (action: CaptureAction): Promise<void> => {
    if (!(bridge && pairing)) {
      setError(copy.pairFirst)
      return
    }
    setBusyAction(action)
    setError('')
    setNotice('')
    try {
      const inspected = await inspectActivePage()
      const frame =
        action === 'frame'
          ? await captureVisibleVideoFrame(inspected.tab, inspected.snapshot)
          : undefined
      const payload = buildCapturePayload(action, inspected.snapshot, frame)
      if (!isCapturePayloadSafe(payload)) {
        throw new Error(copy.unsafePageData)
      }
      await postCapture(bridge, pairing.token, payload)
      setSnapshot(inspected.snapshot)
      setTab(inspected.tab)
      setNotice(
        action === 'frame'
          ? copy.sentFrame
          : action === 'time-marker'
            ? copy.sentMoment
            : copy.sentPage
      )
    } catch (caught) {
      if (
        caught instanceof BridgeRequestError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        await savePairing(null)
        setPairing(null)
        setBridge((current) => (current ? { ...current, paired: false } : current))
      }
      setError(readableError(caught))
    } finally {
      setBusyAction(null)
    }
  }

  const handleStop = (): void => {
    setSnapshot(null)
    setTab(null)
    setError('')
    setNotice(copy.stopped)
  }

  const pageTitle =
    snapshot?.page.title === 'Untitled video' ? copy.untitledVideo : snapshot?.page.title

  return (
    <main className="app">
      <header className="brand-bar">
        <div className="brand-identity">
          <img alt="" className="brand-icon" src="/icon/48.png" />
          <div>
            <p className="eyebrow">{copy.brandEyebrow}</p>
            <h1>{copy.product}</h1>
          </div>
        </div>
        <div className={`connection-badge ${bridge ? 'is-online' : ''}`} title={bridge?.product}>
          <span aria-hidden="true" className="connection-dot" />
          <span>{bridge ? copy.connectionOnline : copy.connectionWaiting}</span>
        </div>
      </header>

      <section className="privacy-strip">
        <span aria-hidden="true" className="privacy-mark">
          {copy.localDevice}
        </span>
        <span>{copy.permission}</span>
      </section>

      <section aria-label={copy.connectionStatus} className="status-grid">
        <div>
          <span className="status-label">{copy.desktopLabel}</span>
          <strong>{bridge ? copy.bridgeReady : copy.bridgeDisconnected}</strong>
          <small>{bridge ? copy.connectedAt(bridge.port) : copy.loopbackConnection}</small>
        </div>
        <div>
          <span className="status-label">{copy.securityAuthorization}</span>
          <strong>
            {paired ? copy.paired : bridge ? copy.pairingRequired : copy.notConnected}
          </strong>
          {paired && (
            <button className="text-button" onClick={() => void handleUnpair()} type="button">
              {copy.unpair}
            </button>
          )}
        </div>
      </section>

      {bridge && !paired && (
        <section className="pair-card">
          <label htmlFor="pairing-code">{copy.pairCode}</label>
          <p>{copy.pairHint}</p>
          <div className="pair-row">
            <input
              autoComplete="one-time-code"
              id="pairing-code"
              maxLength={32}
              onChange={(event) => setPairingCode(event.target.value.replace(/\s/g, ''))}
              placeholder={copy.pairCodePlaceholder}
              value={pairingCode}
            />
            <button
              disabled={!pairingCode.trim() || busyAction === 'pair'}
              onClick={() => void handlePair()}
              type="button"
            >
              {copy.pair}
            </button>
          </div>
        </section>
      )}

      <section className="page-card">
        <div className="section-heading">
          <span>{copy.currentPage}</span>
          <button
            className="text-button"
            disabled={busyAction === 'inspect'}
            onClick={() => void refreshPage()}
            type="button"
          >
            {copy.inspectAgain}
          </button>
        </div>
        {snapshot ? (
          <>
            <h2 title={pageTitle}>{pageTitle}</h2>
            <div className="video-meta">
              <span>{snapshot.page.platform.toUpperCase()}</span>
              <span>·</span>
              <span>
                {formatTime(snapshot.video.currentTime)} /{' '}
                {snapshot.video.duration === null
                  ? copy.durationUnknown
                  : formatTime(snapshot.video.duration)}
              </span>
              <span>·</span>
              <span>{snapshot.video.found ? copy.videoFound : copy.noVideo}</span>
            </div>
            <div className="transcript-preview">
              <span>{copy.transcript}</span>
              <p>{captionPreview || copy.captionEmpty}</p>
            </div>
          </>
        ) : (
          <p className="empty-copy">{busyAction === 'inspect' ? copy.readingPage : copy.noPage}</p>
        )}
      </section>

      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <section aria-label={copy.captureActions} className="actions">
        <button
          className="primary-button"
          disabled={!(paired && snapshot) || busyAction !== null}
          onClick={() => void handleCapture('open')}
          type="button"
        >
          {busyAction === 'open' ? copy.sending : copy.send}
        </button>
        <div className="secondary-actions">
          <button
            disabled={!canUseVideoAction || busyAction !== null}
            onClick={() => void handleCapture('time-marker')}
            type="button"
          >
            {copy.captureMoment}
          </button>
          <button
            disabled={!canUseVideoAction || busyAction !== null}
            onClick={() => void handleCapture('frame')}
            type="button"
          >
            {busyAction === 'frame' ? copy.capturing : copy.captureFrame}
          </button>
        </div>
        <button className="stop-button" disabled={!snapshot} onClick={handleStop} type="button">
          {copy.stop}
        </button>
      </section>

      <footer>
        <span>{tab?.url ? new URL(tab.url).hostname : copy.localFirstActiveCapture}</span>
        <span>{copy.noAutoUpload}</span>
      </footer>
    </main>
  )
}

export default App
