import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
