import { describe, expect, it, vi } from 'vitest'

import {
  requestLocalAccessBeforeWorkerPairing,
} from '../src/lib/local-permission'

describe('AHAX local network permission bootstrap', () => {
  it('grants the extension document access before waking the worker', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }))
    const reconnect = vi.fn(async () => ({ paired: true }))
    const navigate = vi.fn()

    const result = await requestLocalAccessBeforeWorkerPairing({
      extensionVersion: '2.1.0',
      fetcher,
      reconnect,
      navigate,
    })

    expect(result).toBe(true)
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/chrome/permission?version=2.1.0',
      { cache: 'no-store', targetAddressSpace: 'local' },
    )
    expect(reconnect).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith(
      'https://ahax.net/?from=chrome-extension-reload',
    )
  })

  it('stays on the extension page when local access is denied', async () => {
    const reconnect = vi.fn()
    const navigate = vi.fn()

    const result = await requestLocalAccessBeforeWorkerPairing({
      extensionVersion: '2.1.0',
      fetcher: async () => ({ ok: false }),
      reconnect,
      navigate,
    })

    expect(result).toBe(false)
    expect(reconnect).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('stays on the extension page when the worker did not pair', async () => {
    const navigate = vi.fn()

    const result = await requestLocalAccessBeforeWorkerPairing({
      extensionVersion: '2.1.0',
      fetcher: async () => ({ ok: true }),
      reconnect: async () => ({ paired: false }),
      navigate,
    })

    expect(result).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
