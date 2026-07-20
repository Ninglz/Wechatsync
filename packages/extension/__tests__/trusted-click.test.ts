import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dispatchTrustedClick } from '../src/runtime/trusted-click'

describe('trusted draft click', () => {
  beforeEach(() => {
    ;(chrome as unknown as { debugger: unknown }).debugger = {
      attach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('dispatches one trusted left click and always detaches', async () => {
    await dispatchTrustedClick(8, { x: 120, y: 640 })

    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 8 }, '1.3')
    expect(chrome.debugger.sendCommand).toHaveBeenNthCalledWith(
      1,
      { tabId: 8 },
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: 120, y: 640 },
    )
    expect(chrome.debugger.sendCommand).toHaveBeenNthCalledWith(
      2,
      { tabId: 8 },
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: 120, y: 640, button: 'left', clickCount: 1 },
    )
    expect(chrome.debugger.sendCommand).toHaveBeenNthCalledWith(
      3,
      { tabId: 8 },
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: 120, y: 640, button: 'left', clickCount: 1 },
    )
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 8 })
  })

  it('rejects unsafe coordinates before attaching', async () => {
    await expect(dispatchTrustedClick(8, { x: -1, y: 640 })).rejects.toThrow(
      'Trusted click point is invalid',
    )
    expect(chrome.debugger.attach).not.toHaveBeenCalled()
  })

  it('detaches when Chrome rejects an input command', async () => {
    vi.mocked(chrome.debugger.sendCommand).mockRejectedValueOnce(new Error('blocked'))

    await expect(dispatchTrustedClick(8, { x: 120, y: 640 })).rejects.toThrow('blocked')

    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 8 })
  })
})
