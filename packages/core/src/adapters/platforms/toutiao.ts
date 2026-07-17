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
    try {
      await this.get('https://mp.toutiao.com/profile_v4/index')
      return { isAuthenticated: true }
    } catch (error) {
      return {
        isAuthenticated: false,
        error: (error as Error).message,
      }
    }
  }

  async publish(_article: Article, _options?: PublishOptions): Promise<SyncResult> {
    const auth = await this.checkAuth()
    if (!auth.isAuthenticated) {
      return this.createResult(false, {
        draftOnly: true,
        error: '请先登录并开通头条号',
      })
    }

    return this.createResult(false, {
      draftOnly: true,
      error: '头条号适配器尚未联调',
    })
  }
}
