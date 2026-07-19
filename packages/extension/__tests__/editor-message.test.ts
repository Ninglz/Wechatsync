import { describe, expect, it } from 'vitest'

import { parseEditorMessage } from '../src/lib/editor-message'


describe('editor message boundary', () => {
  it('ignores empty, malformed, and unrelated page messages without throwing', () => {
    for (const value of ['', '   ', '{', null, 42, { type: 'OTHER' }]) {
      expect(parseEditorMessage(value)).toBeNull()
    }
  })

  it('accepts only the two editor commands from object or JSON payloads', () => {
    expect(parseEditorMessage({ type: 'CLOSE_EDITOR' })).toEqual({
      type: 'CLOSE_EDITOR',
    })
    expect(parseEditorMessage(JSON.stringify({
      type: 'START_SYNC',
      platforms: ['toutiao'],
    }))).toEqual({
      type: 'START_SYNC',
      platforms: ['toutiao'],
    })
  })
})
