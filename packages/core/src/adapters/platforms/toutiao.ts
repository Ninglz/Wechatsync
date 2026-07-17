import { CodeAdapter } from '../code-adapter'
import type { Article, AuthResult, PlatformMeta, SyncResult } from '../../types'
import type { PublishOptions } from '../types'

export class ToutiaoAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'toutiao',
    name: '头条号',
    icon: 'https://www.toutiao.com/favicon.ico',
    homepage: 'https://mp.toutiao.com/',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  readonly preprocessConfig = {
    outputFormat: 'html' as const,
  }

  async checkAuth(): Promise<AuthResult> {
    return { isAuthenticated: false }
  }

  async publish(_article: Article, _options?: PublishOptions): Promise<SyncResult> {
    return this.createResult(false, {
      draftOnly: true,
      error: '头条号适配器尚未联调',
    })
  }
}
