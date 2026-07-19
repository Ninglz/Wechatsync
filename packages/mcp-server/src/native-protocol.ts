export const AHAX_EXTENSION_ORIGIN =
  'chrome-extension://jecfkhkfmaeheiicmhffomcipaokhgnn/'
export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024

const TOKEN = /^[A-Za-z0-9._~-]{16,256}$/
const VERSION = /^\d+\.\d+\.\d+$/

export type NativeClientMessage =
  | { version: 1; type: 'bootstrap'; extensionVersion: string }
  | { version: 1; type: 'connect'; url: string }
  | { version: 1; type: 'send'; data: string }
  | { version: 1; type: 'close' }

export function validateCallerOrigin(origin: unknown): boolean {
  return origin === AHAX_EXTENSION_ORIGIN
}

export function validateClientMessage(value: unknown): NativeClientMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.version !== 1 || typeof message.type !== 'string') return null

  if (message.type === 'bootstrap') {
    if (
      Object.keys(message).sort().join(',') !== 'extensionVersion,type,version'
      || typeof message.extensionVersion !== 'string'
      || !VERSION.test(message.extensionVersion)
    ) return null
    return message as NativeClientMessage
  }

  if (message.type === 'connect') {
    if (
      Object.keys(message).sort().join(',') !== 'type,url,version'
      || typeof message.url !== 'string'
      || !validBridgeUrl(message.url)
    ) return null
    return message as NativeClientMessage
  }

  if (message.type === 'send') {
    if (
      Object.keys(message).sort().join(',') !== 'data,type,version'
      || typeof message.data !== 'string'
      || Buffer.byteLength(message.data, 'utf8') > MAX_NATIVE_MESSAGE_BYTES - 1024
    ) return null
    return message as NativeClientMessage
  }

  if (message.type === 'close') {
    return Object.keys(message).sort().join(',') === 'type,version'
      ? message as NativeClientMessage
      : null
  }
  return null
}

function validBridgeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const keys = [...url.searchParams.keys()]
    return (
      url.protocol === 'ws:'
      && url.hostname === '127.0.0.1'
      && url.port === '9527'
      && url.pathname === '/'
      && !url.username
      && !url.password
      && !url.hash
      && keys.length === 1
      && keys[0] === 'token'
      && TOKEN.test(url.searchParams.get('token') || '')
    )
  } catch {
    return false
  }
}
