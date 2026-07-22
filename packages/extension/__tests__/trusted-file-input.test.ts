import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchTrustedImageFiles,
  retainTrustedImageFiles,
  releaseTrustedImageFiles,
} from '../src/runtime/trusted-file-input'

const fileInputTree = {
  root: {
    nodeName: '#document',
    children: [{
      nodeName: 'INPUT',
      backendNodeId: 220,
      attributes: ['type', 'file', 'accept', 'image/*', 'multiple', ''],
    }],
  },
}

describe('trusted image file input', () => {
  beforeEach(() => {
    ;(chrome as unknown as { debugger: unknown }).debugger = {
      attach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockImplementation((_, command: string) => {
        if (command === 'DOM.getDocument') return Promise.resolve(fileInputTree)
        if (command === 'DOM.setFileInputFiles') return Promise.resolve({})
        return Promise.reject(new Error('unexpected command'))
      }),
      detach: vi.fn().mockResolvedValue(undefined),
    }
    ;(chrome as unknown as { downloads: unknown }).downloads = {
      download: vi.fn().mockResolvedValue(41),
      search: vi.fn().mockResolvedValue([{
        id: 41,
        state: 'complete',
        filename: '/Users/test/Downloads/AHAX Uploads/cover.png',
      }]),
      removeFile: vi.fn().mockResolvedValue(undefined),
      erase: vi.fn().mockResolvedValue([]),
    }
  })

  it('uses Chrome native file input semantics and retains the draft asset after success', async () => {
    await dispatchTrustedImageFiles(8, [{
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      filename: 'cover.png',
      type: 'image/png',
    }])

    expect(chrome.downloads.download).toHaveBeenCalledWith(expect.objectContaining({
      url: 'data:image/png;base64,aW1hZ2U=',
      saveAs: false,
      conflictAction: 'uniquify',
    }))
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 8 },
      'DOM.setFileInputFiles',
      {
        backendNodeId: 220,
        files: ['/Users/test/Downloads/AHAX Uploads/cover.png'],
      },
    )

    await retainTrustedImageFiles(8)

    expect(chrome.downloads.removeFile).not.toHaveBeenCalled()
    expect(chrome.downloads.erase).toHaveBeenCalledWith({ id: 41 })
  })

  it('removes the staged file when the draft save fails', async () => {
    await dispatchTrustedImageFiles(8, [{
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      filename: 'cover.png',
      type: 'image/png',
    }])

    await releaseTrustedImageFiles(8)

    expect(chrome.downloads.removeFile).toHaveBeenCalledWith(41)
    expect(chrome.downloads.erase).toHaveBeenCalledWith({ id: 41 })
  })

  it('fails closed when the exact image file input is unavailable', async () => {
    vi.mocked(chrome.debugger.sendCommand).mockResolvedValueOnce({
      root: { nodeName: '#document' },
    })

    await expect(dispatchTrustedImageFiles(8, [{
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      filename: 'cover.png',
      type: 'image/png',
    }])).rejects.toThrow('AHAX_IMAGE_INPUT_UNAVAILABLE')

    expect(chrome.downloads.removeFile).toHaveBeenCalledWith(41)
  })

  it('reports a conflicting debugger without exposing Chrome error details', async () => {
    vi.mocked(chrome.debugger.attach).mockRejectedValueOnce(
      new Error('Another debugger is already attached with private-detail'),
    )

    await expect(dispatchTrustedImageFiles(8, [{
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      filename: 'cover.png',
      type: 'image/png',
    }])).rejects.toThrow('AHAX_IMAGE_INPUT_DEBUGGER_CONFLICT')

    expect(chrome.downloads.removeFile).toHaveBeenCalledWith(41)
  })

  it('rejects non-image payloads before downloading or attaching', async () => {
    await expect(dispatchTrustedImageFiles(8, [{
      dataUrl: 'data:text/plain;base64,c2VjcmV0',
      filename: '../secret.txt',
      type: 'text/plain',
    }])).rejects.toThrow('AHAX_IMAGE_FILE_INVALID')

    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(chrome.debugger.attach).not.toHaveBeenCalled()
  })
})
