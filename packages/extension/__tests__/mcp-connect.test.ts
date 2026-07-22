import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/adapters', () => ({
  checkAllPlatformsAuth: vi.fn(),
  checkPlatformAuth: vi.fn(),
  getAdapter: vi.fn(),
}))
vi.mock('../src/background/sync-service', () => ({ performSync: vi.fn() }))

import { mcpClient } from '../src/mcp/client'

describe('MCP connection lifecycle', () => {
  afterEach(() => {
    mcpClient.disconnect()
    vi.unstubAllGlobals()
  })

  it('reuses a CONNECTING socket instead of closing and replacing it', () => {
    const sockets: Array<{
      readyState: number
      close: ReturnType<typeof vi.fn>
      send: ReturnType<typeof vi.fn>
      onopen: null
      onmessage: null
      onclose: null
      onerror: null
    }> = []
    const WebSocketConstructor = vi.fn(function () {
      const socket = {
        readyState: 0,
        close: vi.fn(),
        send: vi.fn(),
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      }
      sockets.push(socket)
      return socket
    })
    vi.stubGlobal('WebSocket', WebSocketConstructor)
    mcpClient.setToken('private-pairing-token')
    mcpClient.setServerUrl('ws://127.0.0.1:9527')
    mcpClient.setLocalTransport('websocket')

    mcpClient.connect()
    mcpClient.connect()

    expect(WebSocketConstructor).toHaveBeenCalledOnce()
    expect(sockets).toHaveLength(1)
    expect(sockets[0].close).not.toHaveBeenCalled()
  })
})
