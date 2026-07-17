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

  async publish(article: Article, _options?: PublishOptions): Promise<SyncResult> {
    const auth = await this.checkAuth()
    if (!auth.isAuthenticated) {
      return this.createResult(false, {
        draftOnly: true,
        error: '请先登录并开通头条号',
      })
    }

    if (!this.runtime.tabs) {
      return this.createResult(false, {
        draftOnly: true,
        error: '当前运行环境不支持头条号编辑器',
      })
    }

    try {
      const editorUrl = 'https://mp.toutiao.com/profile_v4/graphic/publish'
      const existingTabs = await this.runtime.tabs.query(`${editorUrl}*`)
      const editorTab = existingTabs[0] || await this.runtime.tabs.create(editorUrl, false)

      if (!existingTabs.length) {
        await this.runtime.tabs.waitForLoad(editorTab.id)
      }

      const html = article.html || `<p>${article.markdown}</p>`
      const imageSources = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi))
        .map(match => match[1])
      const bodyHtml = html.replace(/<img[^>]*>/gi, '')

      const result = await this.runtime.tabs.executeScript(
        editorTab.id,
        async (payload: { title: string; bodyHtml: string; imageSources: string[] }) => {
          const waitFor = async <T>(getValue: () => T | null, timeout = 15000): Promise<T> => {
            const deadline = Date.now() + timeout
            while (Date.now() < deadline) {
              const value = getValue()
              if (value) return value
              await new Promise(resolve => setTimeout(resolve, 100))
            }
            throw new Error('头条号编辑器响应超时')
          }

          const title = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="请输入文章标题（2～30个字）"]')
          const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')
          if (!title || !editor) {
            throw new Error('未找到头条号文章编辑器')
          }

          const titleSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
          titleSetter?.call(title, payload.title)
          title.dispatchEvent(new Event('input', { bubbles: true }))
          title.dispatchEvent(new Event('change', { bubbles: true }))

          editor.focus()
          editor.innerHTML = payload.bodyHtml
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))

          for (const source of payload.imageSources) {
            const imageButton = document.querySelectorAll<HTMLButtonElement>('.syl-toolbar-button')[11]
            if (!imageButton) throw new Error('未找到头条号图片上传按钮')
            imageButton.click()

            const fileInput = await waitFor(() => document.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]'))
            const response = await fetch(source)
            if (!response.ok) throw new Error(`图片下载失败: ${response.status}`)
            const blob = await response.blob()
            const extension = blob.type.split('/')[1] || 'png'
            const transfer = new DataTransfer()
            transfer.items.add(new File([blob], `image.${extension}`, { type: blob.type || 'image/png' }))
            fileInput.files = transfer.files
            fileInput.dispatchEvent(new Event('change', { bubbles: true }))

            const uploadedImage = await waitFor(() => document.querySelector<HTMLElement>('.pic-select-image-item'))
            uploadedImage.click()
            const confirmButton = await waitFor(() => document.querySelector<HTMLButtonElement>('[data-e2e="imageUploadConfirm-btn"]'))
            confirmButton.click()
            await waitFor(() => !document.querySelector('[data-e2e="imageUploadConfirm-btn"]'))
          }

          await waitFor(() => Array.from(document.querySelectorAll('span')).some(span => span.textContent?.includes('草稿已保存')))
          return { saved: true, imageCount: payload.imageSources.length }
        },
        [{ title: article.title, bodyHtml, imageSources }]
      )

      if (!result.saved) {
        throw new Error('头条号草稿未保存')
      }

      return this.createResult(true, {
        postUrl: editorTab.url || editorUrl,
        draftOnly: true,
        message: `草稿已保存，已上传 ${result.imageCount} 张正文图`,
      })
    } catch (error) {
      return this.createResult(false, {
        draftOnly: true,
        error: (error as Error).message,
      })
    }
  }
}
