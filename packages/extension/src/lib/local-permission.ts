import { extensionLandingUrl } from './brand'

const LOCAL_PERMISSION_URL = 'http://127.0.0.1:8765/api/chrome/permission'

type LocalFetchInit = {
  cache: 'no-store'
  targetAddressSpace: 'local'
}

type Dependencies = {
  extensionVersion: string
  fetcher: (
    url: string,
    init: LocalFetchInit,
  ) => Promise<{ ok: boolean }>
  reconnect: () => Promise<unknown>
  navigate: (url: string) => void
}

export async function requestLocalAccessBeforeWorkerPairing(
  dependencies: Dependencies,
): Promise<boolean> {
  try {
    const response = await dependencies.fetcher(
      `${LOCAL_PERMISSION_URL}?version=${encodeURIComponent(dependencies.extensionVersion)}`,
      { cache: 'no-store', targetAddressSpace: 'local' },
    )
    if (!response.ok) return false

    const result = await dependencies.reconnect()
    if (
      !result ||
      typeof result !== 'object' ||
      !('paired' in result) ||
      result.paired !== true
    ) return false

    dependencies.navigate(extensionLandingUrl('update'))
    return true
  } catch {
    return false
  }
}
