import { describe, expect, it, vi } from 'vitest'

import {
  bootstrapAhaxNativeExecution,
  bootstrapAhaxLocalExecution,
  shouldBootstrapForTab,
} from '../src/lib/local-bootstrap'


describe('AHAX local execution bootstrap', () => {
  it('retries pairing when either the local workspace or AHAX landing finishes loading', () => {
    expect(shouldBootstrapForTab('http://127.0.0.1:8765/')).toBe(true)
    expect(shouldBootstrapForTab('http://localhost:8765/projects/project_1')).toBe(true)
    expect(shouldBootstrapForTab('https://ahax.net/?from=chrome-extension-reload')).toBe(true)
    expect(shouldBootstrapForTab('https://www.ahax.net/')).toBe(true)
    expect(shouldBootstrapForTab('https://geo.ahax.net/')).toBe(true)
    expect(shouldBootstrapForTab('https://example.com/')).toBe(false)
    expect(shouldBootstrapForTab(undefined)).toBe(false)
  })

  it('pairs the pinned extension with loopback without exposing the token in its result', async () => {
    const stored: Record<string, unknown>[] = []
    const setToken = vi.fn()
    const setServerUrl = vi.fn()
    const setLocalTransport = vi.fn()
    const start = vi.fn()
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        extension_version: '2.1.0',
        revision: 'f'.repeat(40),
        server_url: 'ws://127.0.0.1:9527',
        token: 'private-pairing-token',
      }),
    })

    const result = await bootstrapAhaxLocalExecution({
      extensionVersion: '2.1.0',
      fetcher,
      storageSet: async values => { stored.push(values) },
      setToken,
      setServerUrl,
      setLocalTransport,
      start,
    })

    expect(result).toBe(true)
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/chrome/bootstrap?version=2.1.0',
      { cache: 'no-store' },
    )
    expect(stored).toEqual([{
      mcpEnabled: true,
      mcpServerUrl: 'ws://127.0.0.1:9527',
      mcpToken: 'private-pairing-token',
      mcpLocalTransport: 'websocket',
    }])
    expect(setToken).toHaveBeenCalledWith('private-pairing-token')
    expect(setServerUrl).toHaveBeenCalledWith('ws://127.0.0.1:9527')
    expect(setLocalTransport).toHaveBeenCalledWith('websocket')
    expect(stored[0]).toMatchObject({ mcpLocalTransport: 'websocket' })
    expect(start).toHaveBeenCalledOnce()
  })

  it('fails closed for an unpinned version or non-loopback server', async () => {
    const storageSet = vi.fn()
    const result = await bootstrapAhaxLocalExecution({
      extensionVersion: '2.1.0',
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          extension_version: '2.0.9',
          revision: 'f'.repeat(40),
          server_url: 'wss://example.com:9527',
          token: 'private-pairing-token',
        }),
      }),
      storageSet,
      setToken: vi.fn(),
      setServerUrl: vi.fn(),
      setLocalTransport: vi.fn(),
      start: vi.fn(),
    })

    expect(result).toBe(false)
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('loads the same pinned bootstrap through the fixed native host', async () => {
    const storageSet = vi.fn(async () => undefined)
    const setToken = vi.fn()
    const setServerUrl = vi.fn()
    const setLocalTransport = vi.fn()
    const start = vi.fn()
    const nativeRequest = vi.fn(async () => ({
      extension_version: '2.1.0',
      revision: 'f'.repeat(40),
      server_url: 'ws://127.0.0.1:9527',
      token: 'private-pairing-token',
    }))

    const result = await bootstrapAhaxNativeExecution({
      extensionVersion: '2.1.0', nativeRequest, storageSet,
      setToken, setServerUrl, setLocalTransport, start,
    })

    expect(result).toBe(true)
    expect(nativeRequest).toHaveBeenCalledWith({
      version: 1,
      type: 'bootstrap',
      extensionVersion: '2.1.0',
    })
    expect(storageSet).toHaveBeenCalledOnce()
    expect(setToken).toHaveBeenCalledWith('private-pairing-token')
    expect(setServerUrl).toHaveBeenCalledWith('ws://127.0.0.1:9527')
    expect(setLocalTransport).toHaveBeenCalledWith('native')
    expect(storageSet).toHaveBeenCalledWith(expect.objectContaining({
      mcpLocalTransport: 'native',
    }))
    expect(start).toHaveBeenCalledOnce()
  })
})
