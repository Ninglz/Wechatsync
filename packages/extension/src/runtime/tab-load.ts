export async function waitForTabLoad(
  tabId: number,
  timeout = 30000,
  settleDelay = 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      chrome.tabs.onUpdated.removeListener(listener)
      if (error) {
        reject(error)
        return
      }
      setTimeout(resolve, settleDelay)
    }
    const listener = (
      updatedTabId: number,
      info: chrome.tabs.TabChangeInfo,
    ) => {
      if (updatedTabId === tabId && info.status === 'complete') finish()
    }
    const timeoutId = setTimeout(
      () => finish(new Error('Tab load timeout')),
      timeout,
    )

    // Install the listener first, then inspect current state. This covers both a
    // tab that completed before this call and one completing during the check.
    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.get(tabId).then(
      tab => {
        if (tab.status === 'complete') finish()
      },
      () => finish(new Error('Tab load failed')),
    )
  })
}
