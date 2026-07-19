export type EditorMessage = Record<string, any> & {
  type: 'CLOSE_EDITOR' | 'START_SYNC'
}


export function parseEditorMessage(value: unknown): EditorMessage | null {
  let parsed = value
  if (typeof value === 'string') {
    if (!value.trim()) return null
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const message = parsed as Record<string, any>
  if (message.type !== 'CLOSE_EDITOR' && message.type !== 'START_SYNC') return null
  return message as EditorMessage
}
