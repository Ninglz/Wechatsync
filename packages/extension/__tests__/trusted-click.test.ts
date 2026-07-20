import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dispatchTrustedDraftSave } from '../src/runtime/trusted-click'

const safeTree = {
  root: {
    nodeName: '#document',
    shadowRoots: [{
      nodeName: '#document-fragment',
      children: [{
        nodeName: 'BUTTON',
        backendNodeId: 157,
        attributes: ['type', 'button', 'class', 'ce-btn white'],
        children: [{ nodeName: '#text', nodeValue: '暂存离开' }],
      }],
    }],
  },
}

describe('trusted draft save', () => {
  beforeEach(() => {
    ;(chrome as unknown as { debugger: unknown }).debugger = {
      attach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockImplementation((_, command: string) => {
        if (command === 'DOM.getDocument') return Promise.resolve(safeTree)
        if (command === 'DOM.resolveNode') {
          return Promise.resolve({ object: { objectId: 'safe-button-object' } })
        }
        if (command === 'Runtime.callFunctionOn') {
          return Promise.resolve({ result: { value: true } })
        }
        return Promise.reject(new Error('unexpected command'))
      }),
      detach: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('invokes only the exact white draft button in a user-gesture context', async () => {
    await dispatchTrustedDraftSave(8)

    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 8 }, '1.3')
    expect(chrome.debugger.sendCommand).toHaveBeenNthCalledWith(
      1, { tabId: 8 }, 'DOM.getDocument', { depth: -1, pierce: true },
    )
    expect(chrome.debugger.sendCommand).toHaveBeenNthCalledWith(
      2, { tabId: 8 }, 'DOM.resolveNode', { backendNodeId: 157 },
    )
    const call = vi.mocked(chrome.debugger.sendCommand).mock.calls[2]
    expect(call[1]).toBe('Runtime.callFunctionOn')
    expect(call[2]).toMatchObject({
      objectId: 'safe-button-object',
      userGesture: true,
      returnByValue: true,
    })
    expect(String((call[2] as { functionDeclaration: string }).functionDeclaration))
      .toContain("this.className!=='ce-btn white'")
    expect(String((call[2] as { functionDeclaration: string }).functionDeclaration))
      .toContain("this.textContent.trim()!=='暂存离开'")
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 8 })
  })

  it('rejects invalid tab ids before attaching', async () => {
    await expect(dispatchTrustedDraftSave(0)).rejects.toThrow(
      'AHAX_TRUSTED_CLICK_ATTACH_FAILED',
    )
    expect(chrome.debugger.attach).not.toHaveBeenCalled()
  })

  it('fails closed when the safe draft button is unavailable', async () => {
    vi.mocked(chrome.debugger.sendCommand).mockResolvedValueOnce({
      root: { nodeName: '#document' },
    })

    await expect(dispatchTrustedDraftSave(8)).rejects.toThrow(
      'AHAX_DRAFT_CONTROL_UNAVAILABLE',
    )
    expect(chrome.debugger.sendCommand).toHaveBeenCalledTimes(1)
  })

  it('stores only a fixed conflict code when another debugger owns the tab', async () => {
    vi.mocked(chrome.debugger.attach).mockRejectedValueOnce(
      new Error('Another debugger is already attached token=private'),
    )

    await expect(dispatchTrustedDraftSave(8)).rejects.toThrow(
      'AHAX_TRUSTED_CLICK_DEBUGGER_CONFLICT',
    )
    expect(chrome.debugger.detach).not.toHaveBeenCalled()
  })

  it('fails closed instead of leaving a draft task running when debugger attach stalls', async () => {
    vi.useFakeTimers()
    vi.mocked(chrome.debugger.attach).mockReturnValueOnce(new Promise(() => undefined))

    const save = expect(dispatchTrustedDraftSave(8)).rejects.toThrow(
      'AHAX_TRUSTED_CLICK_ATTACH_FAILED',
    )
    await vi.advanceTimersByTimeAsync(5001)

    await save
    expect(chrome.debugger.sendCommand).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stores only a fixed dispatch code for private Chrome failures', async () => {
    vi.mocked(chrome.debugger.sendCommand).mockRejectedValueOnce(
      new Error('unknown private Chrome failure'),
    )

    await expect(dispatchTrustedDraftSave(8)).rejects.toThrow(
      'AHAX_TRUSTED_CLICK_DISPATCH_FAILED',
    )
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 8 })
  })

  it('does not turn a completed save call into an uncertain retry when detach fails', async () => {
    vi.mocked(chrome.debugger.detach).mockRejectedValueOnce(new Error('already detached'))

    await expect(dispatchTrustedDraftSave(8)).resolves.toBeUndefined()
  })
})
