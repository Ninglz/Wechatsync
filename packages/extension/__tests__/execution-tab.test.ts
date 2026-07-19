import { describe, expect, it, vi } from 'vitest'

import { chromeMock, mockStorage } from '../vitest.setup'
import {
  findExecutionTab,
  focusExecutionTab,
  recordExecutionTab,
} from '../src/mcp/execution-tab'

describe('execution task tabs', () => {
  it('records only bounded tab ids on the active sync state', async () => {
    mockStorage.activeSyncState = {
      syncId: 'sync_1',
      status: 'syncing',
      article: { content: 'private body' },
      selectedPlatforms: ['toutiao'],
      results: [],
      startTime: 1,
    }

    await recordExecutionTab(42)
    await recordExecutionTab(42)

    expect(mockStorage.activeSyncState.executionTabIds).toEqual([42])
    expect(mockStorage.activeSyncState.article.content).toBe('private body')
  })

  it('finds and focuses a tracked task tab without using an unrelated active tab', async () => {
    chromeMock.tabs.get = vi.fn(async (id: number) => {
      if (id === 41) throw new Error('closed')
      return { id, windowId: 7, title: 'Toutiao editor', url: 'https://mp.toutiao.com/editor' }
    })
    chromeMock.tabs.update = vi.fn().mockResolvedValue(undefined)
    chromeMock.windows.update = vi.fn().mockResolvedValue(undefined)
    const state = { executionTabIds: [41, 42] }

    const tab = await findExecutionTab(state)
    const result = await focusExecutionTab(state)

    expect(tab?.id).toBe(42)
    expect(result).toEqual({ focused: true })
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(42, { active: true })
    expect(chromeMock.windows.update).toHaveBeenCalledWith(7, { focused: true })
  })

  it('does not focus any tab when no recorded task tab still exists', async () => {
    chromeMock.tabs.get = vi.fn().mockRejectedValue(new Error('closed'))

    await expect(focusExecutionTab({ executionTabIds: [99] })).resolves.toEqual({ focused: false })
    expect(chromeMock.tabs.update).not.toHaveBeenCalled()
  })
})
