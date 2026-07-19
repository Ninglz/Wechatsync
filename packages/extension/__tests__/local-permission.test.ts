import { describe, expect, it, vi } from 'vitest'

import {
  requestLocalAccessBeforeWorkerPairing,
} from '../src/lib/local-permission'

describe('AHAX local network permission bootstrap', () => {
  it('uses native pairing before asking for local network access', async () => {
    const fetcher = vi.fn()
    const reconnect = vi.fn(async () => ({ paired: true }))
    const navigate = vi.fn()

    const result = await requestLocalAccessBeforeWorkerPairing({
      extensionVersion: '2.1.0',
      fetcher,
      reconnect,
      navigate,
    })

    expect(result).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(reconnect).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith(
      'https://ahax.net/?from=chrome-extension-reload',
    )
  })

  it('stays on the extension page when local access is denied', async () => {
    const reconnect = vi.fn(async () => ({ paired: false }))
    const navigate = vi.fn()

    const result = await requestLocalAccessBeforeWorkerPairing({
      extensionVersion: '2.1.0',
      fetcher: async () => ({ ok: false }),
      reconnect,
      navigate,
    })

    expect(result).toBe(false)
    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('stays on the extension page when the worker did not pair', async () => {
    const navigate = vi.fn()

    const result = await requestLocalAccessBeforeWorkerPairing({
      extensionVersion: '2.1.0',
      fetcher: async () => ({ ok: true }),
      reconnect: vi.fn(async () => ({ paired: false })),
      navigate,
    })

    expect(result).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
