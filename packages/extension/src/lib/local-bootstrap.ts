const AHAX_LOCAL_BOOTSTRAP = 'http://127.0.0.1:8765/api/chrome/bootstrap'
const LOOPBACK_SERVER = 'ws://127.0.0.1:9527'
const TOKEN = /^[A-Za-z0-9._~-]{16,256}$/
const REVISION = /^[0-9a-f]{40}$/


export function shouldBootstrapForTab(url: string | undefined): boolean {
  if (typeof url !== 'string' || !url) return false
  try {
    const parsed = new URL(url)
    const localWorkspace = (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === '8765'
    )
    const ahaxLanding = (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'ahax.net' || parsed.hostname === 'www.ahax.net')
    )
    return localWorkspace || ahaxLanding
  } catch {
    return false
  }
}

type BootstrapPayload = {
  extension_version: string
  revision: string
  server_url: string
  token: string
}

type BootstrapDependencies = {
  extensionVersion: string
  fetcher: (url: string, init: { cache: 'no-store' }) => Promise<{
    ok: boolean
    json(): Promise<unknown>
  }>
  storageSet: (values: Record<string, unknown>) => Promise<void>
  setToken: (token: string) => void
  setServerUrl: (url: string) => void
  setLocalTransport: (transport: 'native' | 'websocket') => void
  start: () => void
}

function validPayload(value: unknown, version: string): value is BootstrapPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return (
    Object.keys(payload).sort().join(',') ===
      'extension_version,revision,server_url,token' &&
    payload.extension_version === version &&
    payload.server_url === LOOPBACK_SERVER &&
    typeof payload.revision === 'string' && REVISION.test(payload.revision) &&
    typeof payload.token === 'string' && TOKEN.test(payload.token)
  )
}

type BootstrapEffects = {
  extensionVersion: string
  storageSet: (values: Record<string, unknown>) => Promise<void>
  setToken: (token: string) => void
  setServerUrl: (url: string) => void
  setLocalTransport: (transport: 'native' | 'websocket') => void
  start: () => void
}

async function applyBootstrapPayload(
  payload: unknown,
  dependencies: BootstrapEffects,
  transport: 'native' | 'websocket',
): Promise<boolean> {
  if (!validPayload(payload, dependencies.extensionVersion)) return false
  await dependencies.storageSet({
    mcpEnabled: true,
    mcpServerUrl: payload.server_url,
    mcpToken: payload.token,
    mcpLocalTransport: transport,
  })
  dependencies.setToken(payload.token)
  dependencies.setServerUrl(payload.server_url)
  dependencies.setLocalTransport(transport)
  dependencies.start()
  return true
}

export async function bootstrapAhaxLocalExecution(
  dependencies: BootstrapDependencies,
): Promise<boolean> {
  try {
    const response = await dependencies.fetcher(
      `${AHAX_LOCAL_BOOTSTRAP}?version=${encodeURIComponent(dependencies.extensionVersion)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) return false
    return applyBootstrapPayload(await response.json(), dependencies, 'websocket')
  } catch {
    return false
  }
}

type NativeBootstrapDependencies = BootstrapEffects & {
  nativeRequest: (message: {
    version: 1
    type: 'bootstrap'
    extensionVersion: string
  }) => Promise<unknown>
}

export async function bootstrapAhaxNativeExecution(
  dependencies: NativeBootstrapDependencies,
): Promise<boolean> {
  try {
    const payload = await dependencies.nativeRequest({
      version: 1,
      type: 'bootstrap',
      extensionVersion: dependencies.extensionVersion,
    })
    return applyBootstrapPayload(payload, dependencies, 'native')
  } catch {
    return false
  }
}
