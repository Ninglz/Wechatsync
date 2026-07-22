import { beforeEach, describe, expect, it, vi } from 'vitest'

import { waitForTabLoad } from '../src/runtime/tab-load'

describe('waitForTabLoad', () => {
  beforeEach(() => {
    ;(chrome.tabs as unknown as { onUpdated: unknown }).onUpdated = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }
  })

  it('resolves when the tab completed before the listener was installed', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({
      id: 8,
      status: 'complete',
    } as chrome.tabs.Tab)

    await expect(waitForTabLoad(8, 100, 0)).resolves.toBeUndefined()
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledOnce()
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledOnce()
  })
})
