import { describe, expect, it, vi } from 'vitest'
import { XiaohongshuAdapter, xiaohongshuDraft } from '../xiaohongshu'
import type { RuntimeInterface } from '../../../runtime/interface'

function runtime(overrides: Partial<RuntimeInterface> = {}): RuntimeInterface {
  return {
    type: 'extension',
    fetch: vi.fn().mockResolvedValue(new Response('<html>creator</html>', { status: 200 })),
    cookies: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    session: { get: vi.fn(), set: vi.fn() },
    dom: {
      parseHTML: vi.fn(), querySelector: vi.fn(), querySelectorAll: vi.fn(),
      getTextContent: vi.fn(), getInnerHTML: vi.fn(),
    },
    ...overrides,
  } as unknown as RuntimeInterface
}

describe('XiaohongshuAdapter', () => {
  it('declares only the real image-note draft capabilities', () => {
    expect(new XiaohongshuAdapter().meta).toMatchObject({
      id: 'xiaohongshu',
      name: '小红书',
      capabilities: ['article', 'draft', 'image_upload', 'tags'],
    })
  })

  it('bounds title, body, tags, and image count to the observed editor limits', () => {
    const draft = xiaohongshuDraft({
      title: '一二三四五六七八九十一二三四五六七八九十一二三',
      markdown: '正文'.repeat(600),
      tags: ['AHAX', '#本地Agent', 'AHAX'],
      images: Array.from({ length: 20 }, (_, index) => `ahax-xhs-image:${index}`),
    })

    expect(Array.from(draft.title)).toHaveLength(20)
    expect(Array.from(draft.body).length).toBeLessThanOrEqual(1000)
    expect(draft.body).toContain('#AHAX')
    expect(draft.body).toContain('#本地Agent')
    expect(draft.images).toHaveLength(18)
  })

  it('requires a logged-in creator tab and at least one staged image', async () => {
    const adapter = new XiaohongshuAdapter()
    await adapter.init(runtime({
      tabs: {
        query: vi.fn().mockResolvedValue([]), create: vi.fn(), waitForLoad: vi.fn(),
        executeScript: vi.fn(),
      },
    }))

    const result = await adapter.publish({ title: '标题', markdown: '正文', images: [] })

    expect(result).toMatchObject({
      success: false,
      draftOnly: true,
      error: '请先登录小红书创作服务平台',
    })
  })

  it('stages image blobs and saves through the creator editor without publishing', async () => {
    const executeScript = vi.fn()
      .mockResolvedValueOnce({ authenticated: true })
      .mockResolvedValueOnce({ saved: true, imageCount: 1 })
    const tabs = {
      query: vi.fn().mockResolvedValue([{
        id: 7,
        url: 'https://creator.xiaohongshu.com/publish/publish?target=image',
      }]),
      create: vi.fn().mockResolvedValue({
        id: 8,
        url: 'https://creator.xiaohongshu.com/publish/publish?from=ahax&target=image',
      }),
      waitForLoad: vi.fn(), executeScript,
    }
    const adapter = new XiaohongshuAdapter()
    await adapter.init(runtime({ tabs }))
    const imageRef = await adapter.uploadImage(new Blob(['image'], { type: 'image/png' }), 'cover.png')

    const result = await adapter.publish({
      title: 'AHAX 草稿验证',
      markdown: '正文',
      tags: ['AHAX'],
      images: [imageRef],
    })

    expect(imageRef).toMatch(/^ahax-xhs-image:/)
    expect(executeScript).toHaveBeenCalledTimes(2)
    const editorScript = executeScript.mock.calls[1][1].toString()
    expect(editorScript).toContain("button.ce-btn.white")
    expect(editorScript).not.toContain("button.ce-btn.bg-red")
    expect(editorScript).toContain('document.execCommand')
    expect(tabs.create).toHaveBeenCalledWith(
      'https://creator.xiaohongshu.com/publish/publish?from=ahax&target=image',
      true
    )
    expect(result).toMatchObject({
      success: true,
      draftOnly: true,
      postUrl: 'https://creator.xiaohongshu.com/publish/publish?from=ahax&target=image',
    })
  })
})
