export const AHAX_NAME = 'AHAX'
export const AHAX_HOME_URL = 'https://ahax.net/'
type Tabs = {
  create(value: { url: string; active: boolean }): Promise<unknown>
}
type SessionStorage = {
  get(key: string): Promise<Record<string, unknown>>
  set(value: Record<string, unknown>): Promise<void>
}

const LANDING_OPENED_KEY = 'ahaxLandingOpenedForExtensionSession'

export function extensionLandingUrl(reason: 'install' | 'update'): string {
  const source = reason === 'install' ? 'chrome-extension-install' : 'chrome-extension-reload'
  return `${AHAX_HOME_URL}?from=${source}`
}

export async function openAhaxLandingForExtensionBoot(
  tabs: Tabs,
  sessionStorage: SessionStorage,
): Promise<void> {
  const state = await sessionStorage.get(LANDING_OPENED_KEY)
  if (state[LANDING_OPENED_KEY] === true) return

  // chrome.storage.session survives service-worker suspension but is cleared by
  // an unpacked-extension reload. Mark before opening so concurrent wakeups
  // cannot create a tab storm.
  await sessionStorage.set({ [LANDING_OPENED_KEY]: true })
  await tabs.create({ url: extensionLandingUrl('update'), active: true })
}
