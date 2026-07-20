import { describe, expect, it } from 'vitest'

import manifest from '../manifest.json'

describe('trusted draft click permission', () => {
  it('declares the debugger permission required for trusted mouse input', () => {
    expect(manifest.permissions).toContain('debugger')
  })
})
