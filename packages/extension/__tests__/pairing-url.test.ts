import { describe, expect, it } from 'vitest'

import { authenticatedWebSocketUrl } from '../src/mcp/pairing-url'


describe('authenticatedWebSocketUrl', () => {
  it('adds the local pairing token only to the WebSocket handshake URL', () => {
    expect(
      authenticatedWebSocketUrl(
        'ws://127.0.0.1:9527',
        'private-pairing-token',
      ),
    ).toBe('ws://127.0.0.1:9527/?token=private-pairing-token')
  })

  it('fails closed when no pairing token is available', () => {
    expect(() => authenticatedWebSocketUrl('ws://127.0.0.1:9527', null))
      .toThrow('pairing token')
  })
})
