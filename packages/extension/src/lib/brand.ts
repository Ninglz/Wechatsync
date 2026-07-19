export const AHAX_NAME = 'AHAX'
export const AHAX_HOME_URL = 'https://ahax.net/'
type Tabs = {
  create(value: { url: string; active: boolean }): Promise<unknown>
}

export function extensionLandingUrl(reason: 'install' | 'update'): string {
  const source = reason === 'install' ? 'chrome-extension-install' : 'chrome-extension-reload'
  return `${AHAX_HOME_URL}?from=${source}`
}

export async function openAhaxLandingForExtensionBoot(tabs: Tabs): Promise<void> {
  await tabs.create({ url: extensionLandingUrl('update'), active: true })
}
