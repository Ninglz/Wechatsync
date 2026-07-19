export const AHAX_NAME = 'AHAX'
export const AHAX_HOME_URL = 'https://ahax.net/'

export function extensionLandingUrl(reason: 'install' | 'update'): string {
  const source = reason === 'install' ? 'chrome-extension-install' : 'chrome-extension-reload'
  return `${AHAX_HOME_URL}?from=${source}`
}
