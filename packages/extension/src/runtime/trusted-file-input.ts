type CdpNode = {
  nodeName?: string
  backendNodeId?: number
  attributes?: string[]
  children?: CdpNode[]
  shadowRoots?: CdpNode[]
}

export type TrustedImageFile = {
  dataUrl: string
  filename: string
  type: string
}

const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const MAX_IMAGES = 18
const DOWNLOAD_TIMEOUT_MS = 30000
const DEBUGGER_TIMEOUT_MS = 5000
const stagedDownloads = new Map<number, number[]>()

function bounded<T>(operation: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(code)), timeoutMs)
    operation.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      () => {
        clearTimeout(timeout)
        reject(new Error(code))
      },
    )
  })
}

function debuggerConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('another debugger')
    || message.includes('already attached')
    || message.includes('already being debugged')
}

function attachDebugger(target: chrome.debugger.Debuggee): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('AHAX_IMAGE_INPUT_ATTACH_FAILED')),
      DEBUGGER_TIMEOUT_MS,
    )
    chrome.debugger.attach(target, '1.3').then(
      () => {
        clearTimeout(timeout)
        resolve()
      },
      error => {
        clearTimeout(timeout)
        reject(new Error(
          debuggerConflict(error)
            ? 'AHAX_IMAGE_INPUT_DEBUGGER_CONFLICT'
            : 'AHAX_IMAGE_INPUT_ATTACH_FAILED',
        ))
      },
    )
  })
}

function attribute(node: CdpNode, name: string): string {
  const attributes = node.attributes || []
  const index = attributes.indexOf(name)
  return index >= 0 ? attributes[index + 1] || '' : ''
}

function findImageFileInput(node: CdpNode): CdpNode | null {
  const accept = attribute(node, 'accept').toLowerCase()
  if (
    node.nodeName === 'INPUT'
    && attribute(node, 'type').toLowerCase() === 'file'
    && (accept.includes('image') || /\.(?:jpe?g|png|webp)/.test(accept))
    && Number.isInteger(node.backendNodeId)
  ) return node
  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
    const found = findImageFileInput(child)
    if (found) return found
  }
  return null
}

function validatedFile(file: TrustedImageFile): TrustedImageFile & { extension: string } {
  const extension = IMAGE_TYPES.get(file.type)
  const expectedPrefix = extension ? `data:${file.type};base64,` : ''
  if (
    !extension
    || typeof file.dataUrl !== 'string'
    || !file.dataUrl.startsWith(expectedPrefix)
    || !/^[A-Za-z0-9+/=]+$/.test(file.dataUrl.slice(expectedPrefix.length))
    || typeof file.filename !== 'string'
    || !file.filename.trim()
  ) throw new Error('AHAX_IMAGE_FILE_INVALID')
  return { ...file, extension }
}

async function removeDownload(id: number): Promise<void> {
  await chrome.downloads.removeFile(id).catch(() => undefined)
  await chrome.downloads.erase({ id }).catch(() => undefined)
}

async function downloadedPath(file: TrustedImageFile): Promise<{ id: number; path: string }> {
  const valid = validatedFile(file)
  const stem = valid.filename
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 48) || 'image'
  const id = await chrome.downloads.download({
    url: valid.dataUrl,
    filename: `AHAX Uploads/${crypto.randomUUID()}-${stem}.${valid.extension}`,
    saveAs: false,
    conflictAction: 'uniquify',
  })
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const [item] = await chrome.downloads.search({ id })
    if (item?.state === 'complete' && item.filename) return { id, path: item.filename }
    if (item?.state === 'interrupted') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  await removeDownload(id)
  throw new Error('AHAX_IMAGE_DOWNLOAD_FAILED')
}

export async function releaseTrustedImageFiles(tabId: number): Promise<void> {
  const ids = stagedDownloads.get(tabId) || []
  stagedDownloads.delete(tabId)
  await Promise.all(ids.map(removeDownload))
}

export async function retainTrustedImageFiles(tabId: number): Promise<void> {
  const ids = stagedDownloads.get(tabId) || []
  stagedDownloads.delete(tabId)
  // Xiaohongshu drafts are browser-local and may continue to reference the
  // selected file. Keep the file, but remove its entry from download history.
  await Promise.all(ids.map(id => chrome.downloads.erase({ id }).catch(() => undefined)))
}

export async function dispatchTrustedImageFiles(
  tabId: number,
  files: TrustedImageFile[],
): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 1 || !Array.isArray(files) || files.length < 1 || files.length > MAX_IMAGES) {
    throw new Error('AHAX_IMAGE_FILE_INVALID')
  }
  files.forEach(validatedFile)
  await releaseTrustedImageFiles(tabId)

  const downloaded: Array<{ id: number; path: string }> = []
  try {
    for (const file of files) downloaded.push(await downloadedPath(file))
    const target = { tabId }
    await attachDebugger(target)
    try {
      const documentResult = await bounded(
        chrome.debugger.sendCommand(target, 'DOM.getDocument', { depth: -1, pierce: true }),
        DEBUGGER_TIMEOUT_MS,
        'AHAX_IMAGE_INPUT_DISPATCH_FAILED',
      ) as { root?: CdpNode }
      const input = documentResult.root ? findImageFileInput(documentResult.root) : null
      if (!input?.backendNodeId) throw new Error('AHAX_IMAGE_INPUT_UNAVAILABLE')
      await bounded(
        chrome.debugger.sendCommand(target, 'DOM.setFileInputFiles', {
          backendNodeId: input.backendNodeId,
          files: downloaded.map(item => item.path),
        }),
        DEBUGGER_TIMEOUT_MS,
        'AHAX_IMAGE_INPUT_DISPATCH_FAILED',
      )
    } finally {
      await bounded(
        chrome.debugger.detach(target), DEBUGGER_TIMEOUT_MS,
        'AHAX_IMAGE_INPUT_DETACH_FAILED',
      ).catch(() => undefined)
    }
    stagedDownloads.set(tabId, downloaded.map(item => item.id))
  } catch (error) {
    await Promise.all(downloaded.map(item => removeDownload(item.id)))
    if (error instanceof Error && error.message.startsWith('AHAX_')) throw error
    throw new Error('AHAX_IMAGE_INPUT_DISPATCH_FAILED')
  }
}
