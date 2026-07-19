const AHAX_LOCAL_BOOTSTRAP = 'http://127.0.0.1:8765/api/chrome/bootstrap'
const LOOPBACK_SERVER = 'ws://127.0.0.1:9527'
const TOKEN = /^[A-Za-z0-9._~-]{16,256}$/
const REVISION = /^[0-9a-f]{40}$/

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

export async function bootstrapAhaxLocalExecution(
  dependencies: BootstrapDependencies,
): Promise<boolean> {
  try {
    const response = await dependencies.fetcher(
      `${AHAX_LOCAL_BOOTSTRAP}?version=${encodeURIComponent(dependencies.extensionVersion)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) return false
    const payload = await response.json()
    if (!validPayload(payload, dependencies.extensionVersion)) return false
    await dependencies.storageSet({
      mcpEnabled: true,
      mcpServerUrl: payload.server_url,
      mcpToken: payload.token,
    })
    dependencies.setToken(payload.token)
    dependencies.setServerUrl(payload.server_url)
    dependencies.start()
    return true
  } catch {
    return false
  }
}
