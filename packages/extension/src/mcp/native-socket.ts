export const AHAX_NATIVE_HOST = 'net.ahax.agent_bridge'

type NativePort = {
  postMessage(message: unknown): void
  disconnect(): void
  onMessage: { addListener(listener: (message: unknown) => void): void }
  onDisconnect: { addListener(listener: () => void): void }
}

type ConnectNative = (hostName: string) => NativePort

export class NativeMcpSocket {
  readyState = 0
  onopen: WebSocket['onopen'] = null
  onmessage: WebSocket['onmessage'] = null
  onclose: WebSocket['onclose'] = null
  onerror: WebSocket['onerror'] = null

  private readonly port: NativePort
  private closed = false

  constructor(
    url: string,
    connectNative: ConnectNative = hostName => chrome.runtime.connectNative(hostName),
  ) {
    this.port = connectNative(AHAX_NATIVE_HOST)
    this.port.onMessage.addListener(message => this.handleMessage(message))
    this.port.onDisconnect.addListener(() => this.finish(1006, true))
    this.port.postMessage({ version: 1, type: 'connect', url })
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('AHAX native bridge is not connected')
    this.port.postMessage({ version: 1, type: 'send', data })
  }

  close(): void {
    if (this.closed) return
    this.readyState = 2
    try {
      this.port.postMessage({ version: 1, type: 'close' })
      this.port.disconnect()
    } finally {
      this.finish(1000, false)
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return
    const value = message as Record<string, unknown>
    if (value.version !== 1 || typeof value.type !== 'string') return
    if (value.type === 'open' && this.readyState === 0) {
      this.readyState = 1
      this.onopen?.call(this as unknown as WebSocket, new Event('open'))
      return
    }
    if (value.type === 'message' && this.readyState === 1 && typeof value.data === 'string') {
      this.onmessage?.call(
        this as unknown as WebSocket,
        new MessageEvent('message', { data: value.data }),
      )
      return
    }
    if (value.type === 'error') {
      this.onerror?.call(this as unknown as WebSocket, new Event('error'))
    }
    if (value.type === 'close' || value.type === 'error') {
      const code = typeof value.code === 'number' ? value.code : 1006
      this.finish(code, value.type === 'error')
    }
  }

  private finish(code: number, error: boolean): void {
    if (this.closed) return
    this.closed = true
    this.readyState = 3
    try {
      this.port.disconnect()
    } catch {
      // Chrome may already have closed the native port.
    }
    if (error) this.onerror?.call(this as unknown as WebSocket, new Event('error'))
    this.onclose?.call(
      this as unknown as WebSocket,
      { code } as CloseEvent,
    )
  }
}
