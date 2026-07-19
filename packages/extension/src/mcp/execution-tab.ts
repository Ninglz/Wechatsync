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
