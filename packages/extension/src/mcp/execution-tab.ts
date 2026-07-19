type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function tabIds(value: unknown): number[] {
  const state = record(value)
  if (!state || !Array.isArray(state.executionTabIds)) return []
  return state.executionTabIds
    .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 0)
    .slice(-64)
}

export async function recordExecutionTab(tabId: number): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 0) return
  const storage = await chrome.storage.local.get('activeSyncState')
  const state = record(storage.activeSyncState)
  if (!state || state.status !== 'syncing') return
  const ids = tabIds(state)
  if (!ids.includes(tabId)) ids.push(tabId)
  await chrome.storage.local.set({
    activeSyncState: { ...state, executionTabIds: ids.slice(-64) },
  })
}

export async function openLoginHandoffTab(
  platformId: string,
  homepage: string,
  clock: () => number = Date.now,
): Promise<{ opened: true; platform: string }> {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(platformId)) {
    throw new Error('Invalid platform')
  }
  const target = new URL(homepage)
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('Invalid platform homepage')
  }
  const tab = await chrome.tabs.create({ url: target.href, active: true })
  if (!Number.isInteger(tab.id) || typeof tab.id !== 'number' || tab.id < 0) {
    throw new Error('Platform login tab unavailable')
  }
  const timestamp = clock()
  if (!Number.isSafeInteger(timestamp) || timestamp < 1) {
    throw new Error('Invalid handoff timestamp')
  }
  await chrome.storage.local.set({
    activeSyncState: {
      syncId: `handoff_${platformId}_${timestamp}`,
      status: 'failed',
      selectedPlatforms: [platformId],
      results: [{
        platform: platformId,
        success: false,
        error: 'login required',
        timestamp,
      }],
      startTime: timestamp,
      executionTabIds: [tab.id],
    },
  })
  return { opened: true, platform: platformId }
}

export async function findExecutionTab(state: unknown): Promise<chrome.tabs.Tab | null> {
  const ids = tabIds(state).reverse()
  for (const id of ids) {
    try {
      const tab = await chrome.tabs.get(id)
      if (tab?.id === id) return tab
    } catch {
      continue
    }
  }
  return null
}

export async function focusExecutionTab(state: unknown): Promise<{ focused: boolean }> {
  const tab = await findExecutionTab(state)
  if (!tab?.id) return { focused: false }
  await chrome.tabs.update(tab.id, { active: true })
  if (typeof tab.windowId === 'number') {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
  return { focused: true }
}
