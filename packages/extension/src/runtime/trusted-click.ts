export type TrustedClickPoint = {
  x: number
  y: number
}

function validCoordinate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 10_000
}

function isDebuggerConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('another debugger')
    || message.includes('already attached')
    || message.includes('already being debugged')
}

export async function dispatchTrustedClick(
  tabId: number,
  point: TrustedClickPoint,
): Promise<void> {
  if (
    !Number.isInteger(tabId)
    || tabId < 1
    || !validCoordinate(point.x)
    || !validCoordinate(point.y)
  ) {
    throw new Error('Trusted click point is invalid')
  }

  const target = { tabId }
  try {
    await chrome.debugger.attach(target, '1.3')
  } catch (error) {
    throw new Error(
      isDebuggerConflict(error)
        ? 'AHAX_TRUSTED_CLICK_DEBUGGER_CONFLICT'
        : 'AHAX_TRUSTED_CLICK_ATTACH_FAILED',
    )
  }
  try {
    try {
      await chrome.debugger.sendCommand(target, 'Page.bringToFront')
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
      })
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      })
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      })
    } catch {
      throw new Error('AHAX_TRUSTED_CLICK_DISPATCH_FAILED')
    }
  } finally {
    // A detach failure happens after the click. The adapter verifies the draft save
    // separately, so do not convert a completed click into an unsafe retry signal.
    await chrome.debugger.detach(target).catch(() => undefined)
  }
}
