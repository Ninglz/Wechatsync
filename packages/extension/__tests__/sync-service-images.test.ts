import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockStorage } from '../vitest.setup'

const { syncToMultiplePlatforms } = vi.hoisted(() => ({
  syncToMultiplePlatforms: vi.fn(),
}))

vi.mock('../src/adapters', () => ({
  getAllPlatformMetas: () => [{ id: 'xiaohongshu', name: '小红书' }],
  getPlatformPreprocessConfigs: () => ({}),
  syncToMultiplePlatforms,
}))

vi.mock('../src/adapters/cms/wordpress', () => ({ publish: vi.fn() }))
vi.mock('../src/adapters/cms/metaweblog', () => ({
  publish: vi.fn(),
  publishToTypecho: vi.fn(),
}))

import { performSync } from '../src/background/sync-service'

describe('performSync article package', () => {
  beforeEach(() => {
    syncToMultiplePlatforms.mockReset()
    syncToMultiplePlatforms.mockImplementation(async (_platforms, _article, callbacks) => {
      callbacks.onResult({
        platform: 'xiaohongshu',
        success: true,
        draftOnly: true,
        postUrl: 'https://creator.xiaohongshu.com/publish/publish?target=image',
      })
    })
    ;(globalThis.chrome as any).action = {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('keeps staged image references and tags through normalization', async () => {
    await performSync({
      title: 'AHAX 小红书草稿验证',
      content: '<p>正文</p>',
      markdown: '正文',
      images: ['ahax-xhs-image:cover_1'],
      tags: ['AHAX', '草稿验证'],
      source: { platform: 'xiaohongshu' },
    }, ['xiaohongshu'], { skipHistory: true, source: 'mcp' })

    const article = syncToMultiplePlatforms.mock.calls[0][1]
    expect(article.images).toEqual(['ahax-xhs-image:cover_1'])
    expect(article.tags).toEqual(['AHAX', '草稿验证'])
  })

  it('returns the saved receipt without executing again when the ACK was lost', async () => {
    const intentHash = `sha256:${'a'.repeat(64)}`
    const article = {
      title: 'ACK 丢失幂等验证',
      content: '<p>正文</p>',
      source: { platform: 'xiaohongshu' },
    }

    const firstReceipt = await performSync(
      article,
      ['xiaohongshu'],
      { skipHistory: true, source: 'mcp', intentHash },
    )
    // The caller never observes firstReceipt because its response ACK is lost.
    const replayReceipt = await performSync(
      article,
      ['xiaohongshu'],
      { skipHistory: true, source: 'mcp', intentHash },
    )

    expect(syncToMultiplePlatforms).toHaveBeenCalledOnce()
    expect(replayReceipt).toEqual(firstReceipt)
  })

  it('keeps an uncertain fence across a process restart and never executes again', async () => {
    const intentHash = `sha256:${'b'.repeat(64)}`
    const article = {
      title: '进程重启幂等验证',
      content: '<p>正文</p>',
      source: { platform: 'xiaohongshu' },
    }
    syncToMultiplePlatforms.mockImplementationOnce(async () => {
      throw new Error('simulated worker termination after platform save')
    })

    await expect(performSync(
      article,
      ['xiaohongshu'],
      { skipHistory: true, source: 'mcp', intentHash },
    )).rejects.toThrow('simulated worker termination')

    // A fresh invocation represents the restarted service worker. The fence must
    // come from persistent storage rather than in-memory request state.
    await expect(performSync(
      article,
      ['xiaohongshu'],
      { skipHistory: true, source: 'mcp', intentHash },
    )).rejects.toThrow(/uncertain/i)
    expect(syncToMultiplePlatforms).toHaveBeenCalledOnce()
  })

  it('persists the WeChat saved receipt when it includes a draft id', async () => {
    const intentHash = `sha256:${'c'.repeat(64)}`
    syncToMultiplePlatforms.mockImplementation(async (_platforms, _article, callbacks) => {
      callbacks.onResult({
        platform: 'weixin',
        success: true,
        draftOnly: true,
        postId: 'draft_123',
        postUrl: 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit',
      })
    })

    await performSync(
      {
        title: 'Draft ID receipt',
        content: '<p>正文</p>',
        source: { platform: 'weixin' },
      },
      ['weixin'],
      { skipHistory: true, source: 'mcp', intentHash },
    )
    await performSync(
      {
        title: 'Draft ID receipt',
        content: '<p>正文</p>',
        source: { platform: 'weixin' },
      },
      ['weixin'],
      { skipHistory: true, source: 'mcp', intentHash },
    )

    expect(syncToMultiplePlatforms).toHaveBeenCalledOnce()
  })

  it('fails closed instead of rerunning a saved intent with a damaged receipt', async () => {
    const intentHash = `sha256:${'e'.repeat(64)}`
    mockStorage[`mcpDraftIntent:${intentHash}`] = {
      status: 'saved',
      updatedAt: Date.now(),
    }

    await expect(performSync(
      {
        title: 'Damaged saved receipt',
        content: '<p>正文</p>',
        source: { platform: 'weixin' },
      },
      ['weixin'],
      { skipHistory: true, source: 'mcp', intentHash },
    )).rejects.toThrow(/uncertain/i)
    expect(syncToMultiplePlatforms).not.toHaveBeenCalled()
  })
})
