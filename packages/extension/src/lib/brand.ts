export const AHAX_NAME = 'AHAX'
export const AHAX_HOME_URL = 'https://ahax.net/'
const SESSION_LANDING_KEY = 'ahaxLandingOpenedForSession'

type SessionStorage = {
  get(key: string): Promise<Record<string, unknown>>
  set(value: Record<string, unknown>): Promise<void>
}

type Tabs = {
  create(value: { url: string; active: boolean }): Promise<unknown>
}

export function extensionLandingUrl(reason: 'install' | 'update'): string {
  const source = reason === 'install' ? 'chrome-extension-install' : 'chrome-extension-reload'
  return `${AHAX_HOME_URL}?from=${source}`
}

export async function openAhaxLandingForCurrentSession(
  storage: SessionStorage,
  tabs: Tabs,
): Promise<boolean> {
  const current = await storage.get(SESSION_LANDING_KEY)
  if (current[SESSION_LANDING_KEY] === true) return false
  await tabs.create({ url: extensionLandingUrl('update'), active: true })
  await storage.set({ [SESSION_LANDING_KEY]: true })
  return true
}
