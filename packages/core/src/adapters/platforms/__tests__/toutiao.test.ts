import { describe, expect, it, vi } from 'vitest'
import { ToutiaoAdapter } from '../toutiao'
import type { RuntimeInterface } from '../../../runtime/interface'

describe('ToutiaoAdapter', () => {
  it('declares the public draft and image-upload capabilities', () => {
    expect(new ToutiaoAdapter().meta).toMatchObject({
      id: 'toutiao',
      name: '头条号',
      capabilities: ['article', 'draft', 'image_upload'],
    })
  })

  it('does not upload images or save a draft when not authenticated', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    const runtime = {
      type: 'extension',
      fetch,
      cookies: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      session: { get: vi.fn(), set: vi.fn() },
      dom: { parseHTML: vi.fn(), querySelector: vi.fn(), querySelectorAll: vi.fn(), getTextContent: vi.fn(), getInnerHTML: vi.fn() },
    } as unknown as RuntimeInterface
    const adapter = new ToutiaoAdapter()
    await adapter.init(runtime)

    const result = await adapter.publish({
      title: 'test',
      markdown: '',
      html: '<img src="https://example.com/a.png">',
    })

    expect(result).toMatchObject({
      success: false,
      draftOnly: true,
      error: '请先登录并开通头条号',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('writes an authenticated article through the creator editor and reports a draft result', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>creator</html>', { status: 200 }))
    const executeScript = vi.fn().mockResolvedValue({ saved: true, imageCount: 1 })
    const runtime = {
      type: 'extension',
      fetch,
      cookies: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      session: { get: vi.fn(), set: vi.fn() },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://mp.toutiao.com/profile_v4/graphic/publish' }]),
        create: vi.fn(),
        waitForLoad: vi.fn(),
        executeScript,
      },
      dom: { parseHTML: vi.fn(), querySelector: vi.fn(), querySelectorAll: vi.fn(), getTextContent: vi.fn(), getInnerHTML: vi.fn() },
    } as unknown as RuntimeInterface
    const adapter = new ToutiaoAdapter()
    await adapter.init(runtime)

    const result = await adapter.publish({
      title: 'draft title',
      markdown: '',
      html: '<p>draft body</p><img src="https://example.com/a.png">',
    })

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      success: true,
      draftOnly: true,
      postUrl: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    })
  })
})
