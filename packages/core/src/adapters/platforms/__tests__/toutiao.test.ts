import { describe, expect, it } from 'vitest'
import { ToutiaoAdapter } from '../toutiao'

describe('ToutiaoAdapter', () => {
  it('declares the public draft and image-upload capabilities', () => {
    expect(new ToutiaoAdapter().meta).toMatchObject({
      id: 'toutiao',
      name: '头条号',
      capabilities: ['article', 'draft', 'image_upload'],
    })
  })
})
