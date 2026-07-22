import { describe, expect, it } from 'vitest'

import { describeRuntimeStatus } from '../src/lib/runtime-status'

describe('AHAX Runtime status', () => {
  it('shows the one action that makes an unpaired extension usable', () => {
    expect(describeRuntimeStatus({ connected: false, wechatAuthenticated: false })).toEqual({
      tone: 'waiting',
      title: '还没有连接本机执行端',
      detail: '先连接 AHAX，再检查公众号登录。',
      action: '连接 AHAX 工作台',
    })
  })

  it('asks for WeChat login only after the local bridge is connected', () => {
    expect(describeRuntimeStatus({ connected: true, wechatAuthenticated: false })).toEqual({
      tone: 'attention',
      title: '执行端已连接，公众号未登录',
      detail: '登录微信公众号后台后，点击重新检查。',
      action: '检查公众号登录',
    })
  })

  it('reports a genuinely ready browser executor', () => {
    expect(describeRuntimeStatus({ connected: true, wechatAuthenticated: true })).toEqual({
      tone: 'ready',
      title: '本机执行端可以工作',
      detail: '已连接 AHAX，微信公众号已登录，会自动接收草稿任务。',
      action: '重新检查',
    })
  })
})
