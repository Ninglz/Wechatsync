import { describe, expect, it } from 'vitest'

import { buildExecutionState } from '../src/mcp/execution-state'

describe('buildExecutionState', () => {
  it('returns bounded execution evidence without private article or browser data', () => {
    const state = buildExecutionState(
      {
        syncId: 'sync_123',
        status: 'syncing',
        article: {
          title: 'private title',
          content: '<p>private body</p>',
          html: '<p>private html</p>',
          markdown: 'private markdown',
        },
        selectedPlatforms: ['toutiao', 'juejin'],
        results: [
          { platform: 'toutiao', success: true },
          { platform: 'juejin', success: false, error: 'not logged in token=private' },
        ],
        startTime: 1_721_234_567_000,
        cookie: 'private cookie',
        token: 'private token',
      },
      {
        id: 42,
        title: 'Toutiao editor',
        url: 'https://mp.toutiao.com/profile_v4/graphic/publish?token=private#draft',
      },
    )

    expect(state).toEqual({
      schemaVersion: 1,
      connected: true,
      browser: 'chrome',
      tab: { id: 42, title: 'Toutiao editor', origin: 'https://mp.toutiao.com' },
      task: {
        syncId: 'sync_123',
        status: 'syncing',
        platforms: ['toutiao', 'juejin'],
        currentStep: 'waiting_for_login',
        startedAt: '2024-07-17T16:42:47.000Z',
        completedCount: 2,
        totalCount: 2,
      },
      screenshot: { available: false, capturedAt: null, ref: null },
      recentError: {
        category: 'login_required',
        suggestedAction: 'login_in_browser',
      },
      handoff: { required: true, reason: 'login_required' },
    })

    const serialized = JSON.stringify(state)
    for (const secret of [
      'private title', 'private body', 'private html', 'private markdown',
      'private cookie', 'private token', '?token=', '#draft',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('reports idle state and explicit absence of screenshot evidence', () => {
    expect(buildExecutionState(undefined, undefined)).toEqual({
      schemaVersion: 1,
      connected: true,
      browser: 'chrome',
      tab: null,
      task: null,
      screenshot: { available: false, capturedAt: null, ref: null },
      recentError: null,
      handoff: { required: false, reason: null },
    })
  })

  it('classifies captcha without copying the raw error', () => {
    const state = buildExecutionState({
      syncId: 'sync_456',
      status: 'failed',
      selectedPlatforms: ['baijiahao'],
      results: [{ platform: 'baijiahao', success: false, error: '验证码 raw-private-detail' }],
      startTime: 1_721_234_567_000,
    }, undefined)

    expect(state.recentError).toEqual({
      category: 'captcha_required',
      suggestedAction: 'complete_verification',
    })
    expect(state.handoff).toEqual({ required: true, reason: 'captcha_required' })
    expect(state.task?.currentStep).toBe('waiting_for_verification')
    expect(JSON.stringify(state)).not.toContain('raw-private-detail')
  })
})
