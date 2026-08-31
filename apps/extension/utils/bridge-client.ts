import {
  BRIDGE_PORT_RANGE,
  BRIDGE_SCHEMA_VERSION,
  type BridgeCapturePayload
} from './companion-contract.ts'

const HEALTH_TIMEOUT_MS = 900
const REQUEST_TIMEOUT_MS = 12_000

export interface BridgeEndpoint {
  baseUrl: string
  port: number
}

export interface BridgeStatus extends BridgeEndpoint {
  paired: boolean
  product: string
}

export interface PairingRecord {
  pairedAt: string
  port: number
  token: string
}

export interface CaptureResponse {
  accepted: boolean
  action: BridgeCapturePayload['action']
  clientName: string
  schemaVersion: string
}

interface StatusResponse {
  app?: string
  ok?: boolean
  paired?: boolean
  pairedClientCount?: number
  schemaVersion?: string
}

interface PairResponse {
  clientId?: string
  port?: number
  schemaVersion?: string
  token?: string
}

export class BridgeRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'BridgeRequestError'
    this.status = status
  }
}

const requestJson = async <T>(url: string, options: RequestInit, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal
    })
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (!response.ok) {
      throw new BridgeRequestError(
        data?.error || `Request failed (${response.status})`,
        response.status
      )
    }
    if (!data) {
      throw new BridgeRequestError('The desktop app returned an empty response.')
    }
    return data
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      throw error
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new BridgeRequestError('The desktop app response timed out.')
    }
    throw new BridgeRequestError('The desktop app is not reachable.')
  } finally {
    clearTimeout(timeoutId)
  }
}

const endpointForPort = (port: number): BridgeEndpoint => ({
  baseUrl: `http://127.0.0.1:${port}`,
  port
})

const isBridgePort = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= BRIDGE_PORT_RANGE.start &&
  value <= BRIDGE_PORT_RANGE.end

const readStatus = async (
  endpoint: BridgeEndpoint,
  token?: string
): Promise<BridgeStatus | null> => {
  try {
    const data = await requestJson<StatusResponse>(
      `${endpoint.baseUrl}/companion/v1/status`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        method: 'GET'
      },
      HEALTH_TIMEOUT_MS
    )
    if (
      !(
        data.ok === true &&
        data.schemaVersion === BRIDGE_SCHEMA_VERSION &&
        typeof data.app === 'string' &&
        data.app.trim()
      )
    ) {
      return null
    }
    return {
      ...endpoint,
      paired: data.paired ?? Boolean(token),
      product: data.app.trim()
    }
  } catch {
    return null
  }
}

export const discoverBridge = async (
  record?: PairingRecord | null
): Promise<BridgeStatus | null> => {
  if (isBridgePort(record?.port)) {
    const storedStatus = await readStatus(endpointForPort(record.port), record.token)
    if (storedStatus) {
      return storedStatus
    }
  }

  const requests: Promise<BridgeStatus | null>[] = []
  for (let port = BRIDGE_PORT_RANGE.start; port <= BRIDGE_PORT_RANGE.end; port += 1) {
    if (port !== record?.port) {
      requests.push(readStatus(endpointForPort(port)))
    }
  }
  const statuses = await Promise.all(requests)
  return statuses.find((status) => status !== null) ?? null
}

export const pairBridge = async (
  endpoint: BridgeEndpoint,
  code: string,
  clientName = 'Fengsha Video Learning Companion'
): Promise<PairingRecord> => {
  const data = await requestJson<PairResponse>(
    `${endpoint.baseUrl}/companion/v1/pair`,
    {
      body: JSON.stringify({
        clientName: clientName.trim().slice(0, 120) || 'Fengsha Video Learning Companion',
        code: code.trim()
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    },
    REQUEST_TIMEOUT_MS
  )
  if (data.schemaVersion !== BRIDGE_SCHEMA_VERSION) {
    throw new BridgeRequestError('The desktop app uses an incompatible companion protocol.')
  }
  if (!data.token || data.token.length < 16 || data.token.length > 1024) {
    throw new BridgeRequestError('The desktop app returned an invalid pairing token.')
  }
  if (!isBridgePort(data.port)) {
    throw new BridgeRequestError('The desktop app returned an invalid companion port.')
  }
  return {
    pairedAt: new Date().toISOString(),
    port: data.port,
    token: data.token
  }
}

export const postCapture = async (
  endpoint: BridgeEndpoint,
  token: string,
  payload: BridgeCapturePayload
): Promise<CaptureResponse> => {
  const response = await requestJson<CaptureResponse>(
    `${endpoint.baseUrl}/companion/v1/capture`,
    {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    },
    REQUEST_TIMEOUT_MS
  )
  if (
    !(
      response.accepted === true &&
      response.action === payload.action &&
      typeof response.clientName === 'string' &&
      response.clientName.trim() &&
      response.schemaVersion === BRIDGE_SCHEMA_VERSION
    )
  ) {
    throw new BridgeRequestError('The desktop app rejected the companion protocol response.')
  }
  return response
}
