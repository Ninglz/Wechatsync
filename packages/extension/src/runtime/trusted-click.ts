type CdpNode = {
  nodeName?: string
  nodeValue?: string
  backendNodeId?: number
  attributes?: string[]
  children?: CdpNode[]
  shadowRoots?: CdpNode[]
}

const DEBUGGER_OPERATION_TIMEOUT_MS = 5000

function boundedDebuggerOperation<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('AHAX_DEBUGGER_OPERATION_TIMEOUT')),
      DEBUGGER_OPERATION_TIMEOUT_MS,
    )
    operation.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      error => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function isDebuggerConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('another debugger')
    || message.includes('already attached')
    || message.includes('already being debugged')
}

function nodeClass(node: CdpNode): string {
  const attributes = node.attributes || []
  const index = attributes.indexOf('class')
  return index >= 0 ? attributes[index + 1] || '' : ''
}

function nodeText(node: CdpNode): string {
  return [node.nodeValue, ...(node.children || []).map(child => child.nodeValue)]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim()
}

function findSafeDraftButton(node: CdpNode): CdpNode | null {
  if (
    node.nodeName === 'BUTTON'
    && nodeClass(node) === 'ce-btn white'
    && nodeText(node) === '暂存离开'
    && Number.isInteger(node.backendNodeId)
  ) return node
  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
    const found = findSafeDraftButton(child)
    if (found) return found
  }
  return null
}

export async function dispatchTrustedDraftSave(tabId: number): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 1) {
    throw new Error('AHAX_TRUSTED_CLICK_ATTACH_FAILED')
  }

  const target = { tabId }
  try {
    await boundedDebuggerOperation(chrome.debugger.attach(target, '1.3'))
  } catch (error) {
    throw new Error(
      isDebuggerConflict(error)
        ? 'AHAX_TRUSTED_CLICK_DEBUGGER_CONFLICT'
        : 'AHAX_TRUSTED_CLICK_ATTACH_FAILED',
    )
  }

  try {
    let documentResult: { root?: CdpNode }
    try {
      documentResult = await boundedDebuggerOperation(
        chrome.debugger.sendCommand(
          target, 'DOM.getDocument', { depth: -1, pierce: true },
        ),
      ) as { root?: CdpNode }
    } catch {
      throw new Error('AHAX_TRUSTED_CLICK_DISPATCH_FAILED')
    }
    const button = documentResult.root ? findSafeDraftButton(documentResult.root) : null
    if (!button?.backendNodeId) {
      throw new Error('AHAX_DRAFT_CONTROL_UNAVAILABLE')
    }

    try {
      const resolved = await boundedDebuggerOperation(
        chrome.debugger.sendCommand(
          target, 'DOM.resolveNode', { backendNodeId: button.backendNodeId },
        ),
      ) as { object?: { objectId?: string } }
      const objectId = resolved.object?.objectId
      if (!objectId) throw new Error('missing button object')
      const called = await boundedDebuggerOperation(
        chrome.debugger.sendCommand(
          target,
          'Runtime.callFunctionOn',
          {
            objectId,
            functionDeclaration: "function(){ if(this.tagName!=='BUTTON'||this.className!=='ce-btn white'||this.textContent.trim()!=='暂存离开') throw new Error('unsafe target'); this.click(); return true; }",
            userGesture: true,
            returnByValue: true,
          },
        ),
      ) as { result?: { value?: unknown }; exceptionDetails?: unknown }
      if (called.exceptionDetails || called.result?.value !== true) {
        throw new Error('draft control call rejected')
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'AHAX_DRAFT_CONTROL_UNAVAILABLE') throw error
      throw new Error('AHAX_TRUSTED_CLICK_DISPATCH_FAILED')
    }
  } finally {
    await boundedDebuggerOperation(chrome.debugger.detach(target)).catch(() => undefined)
  }
}
