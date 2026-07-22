import { describe, expect, it, vi } from 'vitest'

const { performSync } = vi.hoisted(() => ({
  performSync: vi.fn(async () => ({ results: [], syncId: 'sync_test' })),
}))

vi.mock('../src/background/sync-service', () => ({ performSync }))
vi.mock('../src/adapters', () => ({
  checkAllPlatformsAuth: vi.fn(),
  checkPlatformAuth: vi.fn(),
  getAdapter: vi.fn(),
}))

import { mcpClient } from '../src/mcp/client'

describe('MCP sync intent', () => {
  it('passes the Python intentHash through to the background sync service', async () => {
    const intentHash = `sha256:${'d'.repeat(64)}`
    const handleMethod = (
      mcpClient as unknown as {
        handleMethod(method: string, params?: Record<string, unknown>): Promise<unknown>
      }
    ).handleMethod.bind(mcpClient)

    await handleMethod('syncArticle', {
      platforms: ['xiaohongshu'],
      intentHash,
      article: { title: 'Intent propagation', content: '<p>正文</p>' },
    })

    expect(performSync).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Intent propagation' }),
      ['xiaohongshu'],
      { source: 'mcp', intentHash },
    )
  })
})
