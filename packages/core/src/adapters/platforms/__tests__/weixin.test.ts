import { describe, expect, it, vi } from 'vitest'

import type { RuntimeInterface } from '../../../runtime/interface'
import { WeixinAdapter } from '../weixin'

describe('WeixinAdapter', () => {
  it('returns a terminal draft receipt after WeChat confirms the save', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      appMsgId: 'draft_123',
      base_resp: { ret: 0 },
    }), {
      headers: { 'content-type': 'application/json' },
    }))
    const runtime = {
      type: 'extension',
      fetch,
      cookies: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      session: { get: vi.fn(), set: vi.fn() },
      dom: {
        parseHTML: vi.fn(), querySelector: vi.fn(), querySelectorAll: vi.fn(),
        getTextContent: vi.fn(), getInnerHTML: vi.fn(),
      },
    } as unknown as RuntimeInterface
    const adapter = new WeixinAdapter()
    await adapter.init(runtime)
    ;(adapter as unknown as { weixinMeta: object }).weixinMeta = {
      token: 'token_123',
      userName: 'gh_123',
      nickName: 'AHAX',
      ticket: '',
      svrTime: 1,
      avatar: '',
    }

    const result = await adapter.publish({
      title: '公众号幂等验证',
      html: '<p>正文</p>',
      markdown: '正文',
    }, { draftOnly: true })

    expect(result).toMatchObject({
      platform: 'weixin',
      success: true,
      draftOnly: true,
      postId: 'draft_123',
      postUrl: expect.stringContaining('appmsgid=draft_123'),
    })
    expect(result.timestamp).toBeGreaterThan(0)
  })
})
