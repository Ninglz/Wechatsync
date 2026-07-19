import { describe, expect, it, vi } from 'vitest'

import {
  AHAX_NATIVE_HOST,
  NativeMcpSocket,
} from '../src/mcp/native-socket'

function portHarness() {
  let messageListener: ((message: unknown) => void) | undefined
  let disconnectListener: (() => void) | undefined
  return {
    port: {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: vi.fn(listener => { messageListener = listener }) },
      onDisconnect: { addListener: vi.fn(listener => { disconnectListener = listener }) },
    },
    message: (value: unknown) => messageListener?.(value),
    disconnect: () => disconnectListener?.(),
  }
}

describe('AHAX native MCP socket', () => {
  it('connects only to the fixed native host and proxies bounded text frames', () => {
    const harness = portHarness()
    const connectNative = vi.fn(() => harness.port)
    const socket = new NativeMcpSocket(
      'ws://127.0.0.1:9527/?token=private-token',
      connectNative,
    )
    const opened = vi.fn()
    const received = vi.fn()
    socket.onopen = opened
    socket.onmessage = received

    expect(AHAX_NATIVE_HOST).toBe('net.ahax.agent_bridge')
    expect(connectNative).toHaveBeenCalledWith('net.ahax.agent_bridge')
    expect(harness.port.postMessage).toHaveBeenCalledWith({
      version: 1,
      type: 'connect',
      url: 'ws://127.0.0.1:9527/?token=private-token',
    })

    harness.message({ version: 1, type: 'open' })
    expect(socket.readyState).toBe(1)
    expect(opened).toHaveBeenCalledOnce()

    socket.send('{"id":"request_1"}')
    expect(harness.port.postMessage).toHaveBeenLastCalledWith({
      version: 1,
      type: 'send',
      data: '{"id":"request_1"}',
    })

    harness.message({ version: 1, type: 'message', data: '{"id":"response_1"}' })
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({ data: '{"id":"response_1"}' }),
    )
  })

  it('closes safely when the native host disappears', () => {
    const harness = portHarness()
    const socket = new NativeMcpSocket('ws://127.0.0.1:9527/', () => harness.port)
    const closed = vi.fn()
    socket.onclose = closed

    harness.disconnect()

    expect(socket.readyState).toBe(3)
    expect(closed).toHaveBeenCalledWith({ code: 1006 })
  })

  it('disconnects the native port when the bridge closes its WebSocket', () => {
    const harness = portHarness()
    const socket = new NativeMcpSocket('ws://127.0.0.1:9527/', () => harness.port)

    harness.message({ version: 1, type: 'close', code: 1001 })

    expect(socket.readyState).toBe(3)
    expect(harness.port.disconnect).toHaveBeenCalledOnce()
  })
})
