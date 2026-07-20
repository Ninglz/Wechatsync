export type TrustedClickPoint = {
  x: number
  y: number
}

function validCoordinate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 10_000
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
  await chrome.debugger.attach(target, '1.3')
  try {
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
      clickCount: 1,
    })
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    })
  } finally {
    await chrome.debugger.detach(target)
  }
}
