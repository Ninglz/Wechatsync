import { CodeAdapter } from '../code-adapter'
import type { Article, AuthResult, PlatformMeta, SyncResult } from '../../types'
import type { PublishOptions } from '../types'

const IMAGE_REF_PREFIX = 'ahax-xhs-image:'
const EDITOR_URL = 'https://creator.xiaohongshu.com/publish/publish?from=ahax&target=image'
const MAX_TITLE_CHARS = 20
const MAX_BODY_CHARS = 1000
const MAX_IMAGES = 18
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024

type XiaohongshuDraft = {
  title: string
  body: string
  images: string[]
}

type StagedImage = {
  blob: Blob
  filename: string
}

function boundedText(value: string, limit: number): string {
  return Array.from(value.trim()).slice(0, limit).join('')
}

function normalizedTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags || []).map(tag => tag.trim().replace(/^#+/, ''))))
    .filter(Boolean)
    .map(tag => `#${tag}`)
}

export function xiaohongshuDraft(article: Article): XiaohongshuDraft {
  const title = boundedText(article.title, MAX_TITLE_CHARS)
  const tags = normalizedTags(article.tags)
  const tagLine = tags.join(' ')
  const separator = tagLine ? '\n\n' : ''
  const proseLimit = Math.max(0, MAX_BODY_CHARS - Array.from(separator + tagLine).length)
  const prose = boundedText(article.markdown, proseLimit)
  const body = [prose, tagLine].filter(Boolean).join(separator)
  const images = Array.from(new Set(article.images || [])).slice(0, MAX_IMAGES)
  return { title, body, images }
}

export class XiaohongshuAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'xiaohongshu',
    name: '小红书',
    icon: 'https://www.xiaohongshu.com/favicon.ico',
    homepage: 'https://creator.xiaohongshu.com/',
    capabilities: ['article', 'draft', 'image_upload', 'tags'],
  }

  readonly preprocessConfig = {
    outputFormat: 'markdown' as const,
  }

  private readonly stagedImages = new Map<string, StagedImage>()

  async checkAuth(): Promise<AuthResult> {
    if (!this.runtime.tabs) return { isAuthenticated: false }
    const tabs = await this.runtime.tabs.query('https://creator.xiaohongshu.com/*')
    const tab = tabs[0]
    if (!tab) return { isAuthenticated: false }
    try {
      const result = await this.runtime.tabs.executeScript(
        tab.id,
        () => ({
          authenticated: !document.querySelector('input[placeholder="手机号"]')
            && Boolean(document.querySelector('#creator-publish-dom')
              || Array.from(document.querySelectorAll('main *')).some(
                element => element.textContent?.trim() === '发布笔记'
              )),
        }),
        []
      )
      return { isAuthenticated: result.authenticated === true }
    } catch (error) {
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  async uploadImage(file: Blob, filename = 'image.png'): Promise<string> {
    if (!(file instanceof Blob) || !file.type.startsWith('image/') || file.size === 0) {
      throw new Error('小红书图片文件无效')
    }
    const id = crypto.randomUUID()
    this.stagedImages.set(id, { blob: file, filename })
    return IMAGE_REF_PREFIX + id
  }

  async publish(article: Article, _options?: PublishOptions): Promise<SyncResult> {
    const auth = await this.checkAuth()
    if (!auth.isAuthenticated) {
      return this.createResult(false, {
        draftOnly: true,
        error: '请先登录小红书创作服务平台',
      })
    }
    if (!this.runtime.tabs) {
      return this.createResult(false, {
        draftOnly: true,
        error: '当前运行环境不支持小红书编辑器',
      })
    }

    const draft = xiaohongshuDraft(article)
    if (!draft.title || !draft.body) {
      return this.createResult(false, {
        draftOnly: true,
        error: '小红书标题和正文不能为空',
      })
    }
    if (!draft.images.length) {
      return this.createResult(false, {
        draftOnly: true,
        error: '小红书图文草稿至少需要一张图片',
      })
    }

    let editorTabId: number | null = null
    let draftSaved = false
    try {
      const images = await this.resolveImages(draft.images)
      const editorTab = await this.runtime.tabs.create(EDITOR_URL, false)
      editorTabId = editorTab.id
      await this.runtime.tabs.waitForLoad(editorTab.id)
      if (!this.runtime.tabs.trustedImageUpload) {
        throw new Error('当前扩展无法使用小红书原生图片选择')
      }
      if (!this.runtime.tabs.retainTrustedImageUpload) {
        throw new Error('当前扩展无法保留小红书草稿图片')
      }
      await this.runtime.tabs.trustedImageUpload(editorTab.id, images)
      const prepared = await this.runtime.tabs.executeScript(
        editorTab.id,
        async (payload: {
          title: string
          body: string
          imageCount: number
        }) => {
          const waitFor = async <T>(getValue: () => T | null, timeout = 30000): Promise<T> => {
            const deadline = Date.now() + timeout
            while (Date.now() < deadline) {
              const value = getValue()
              if (value) return value
              await new Promise(resolve => setTimeout(resolve, 100))
            }
            throw new Error('小红书编辑器响应超时')
          }

          const title = await waitFor(() => document.querySelector<HTMLInputElement>(
            'input[placeholder="填写标题会有更多赞哦"]'
          ))
          const editor = await waitFor(() => document.querySelector<HTMLElement>(
            '.tiptap.ProseMirror[contenteditable="true"]'
          ))
          title.focus()
          title.select()
          const titleInserted = document.execCommand('insertText', false, payload.title)
          if (!titleInserted) {
            const titleSetter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype, 'value'
            )?.set
            titleSetter?.call(title, payload.title)
            title.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertText',
              data: payload.title,
            }))
          }
          title.dispatchEvent(new Event('change', { bubbles: true }))

          editor.focus()
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(editor)
          selection?.removeAllRanges()
          selection?.addRange(range)
          const bodyInserted = document.execCommand('insertText', false, payload.body)
          if (!bodyInserted) {
            editor.innerText = payload.body
            editor.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertText',
              data: payload.body,
            }))
          }
          const comparableText = (value: string) => value.replace(/\s+/g, ' ').trim()
          await waitFor(() => (
            title.value === payload.title
            && comparableText(editor.innerText) === comparableText(payload.body)
          ) ? true : null)
          let imagesStableSince = 0
          await waitFor(() => {
            const previews = Array.from(document.querySelectorAll<HTMLImageElement>(
              'img.img.preview'
            ))
            const loading = Array.from(document.querySelectorAll('.mask')).some(
              element => element.textContent?.trim() === 'loading...'
            )
            const ready = previews.length === payload.imageCount
              && previews.every(image => (
                image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
              ))
              && !loading
            if (!ready) {
              imagesStableSince = 0
              return null
            }
            if (!imagesStableSince) imagesStableSince = Date.now()
            return Date.now() - imagesStableSince >= 4000 ? true : null
          }, 45000)
          await new Promise<void>(resolve => requestAnimationFrame(
            () => requestAnimationFrame(() => resolve())
          ))

          return { prepared: true, imageCount: payload.imageCount }
        },
        [{ title: draft.title, body: draft.body, imageCount: images.length }]
      )
      if (!prepared.prepared) throw new Error('小红书草稿未准备完成')
      if (!this.runtime.tabs.trustedDraftSave) {
        throw new Error('当前扩展无法发送可信草稿保存操作')
      }
      await this.runtime.tabs.trustedDraftSave(editorTab.id)
      const saveDeadline = Date.now() + 30000
      let saved = false
      while (Date.now() < saveDeadline && !saved) {
        try {
          const result = await this.runtime.tabs.executeScript(
            editorTab.id,
            () => ({ saved: (
              !document.querySelector('input[placeholder="填写标题会有更多赞哦"]')
              || Array.from(document.querySelectorAll('*')).some(
                element => element.children.length === 0
                  && element.textContent?.trim() === '保存成功'
              )
            ) }),
            []
          )
          saved = result.saved === true
        } catch {
          // Navigation destroys the previous execution context; retry on the new page.
        }
        if (!saved) await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (!saved) throw new Error('AHAX_DRAFT_SAVE_VERIFICATION_FAILED')
      await this.runtime.tabs.retainTrustedImageUpload(editorTab.id)
      draftSaved = true
      return this.createResult(true, {
        postUrl: EDITOR_URL,
        draftOnly: true,
        message: `草稿已保存，已上传 ${prepared.imageCount} 张图片`,
      })
    } catch (error) {
      return this.createResult(false, {
        draftOnly: true,
        error: (error as Error).message,
      })
    } finally {
      this.releaseImages(draft.images)
      if (editorTabId !== null && !draftSaved) {
        await this.runtime.tabs.releaseTrustedImageUpload?.(editorTabId).catch(() => undefined)
      }
    }
  }

  private async resolveImages(refs: string[]) {
    const images: Array<{ dataUrl: string; filename: string; type: string }> = []
    let totalBytes = 0
    for (const ref of refs) {
      let blob: Blob
      let filename = 'image.png'
      if (ref.startsWith(IMAGE_REF_PREFIX)) {
        const staged = this.stagedImages.get(ref.slice(IMAGE_REF_PREFIX.length))
        if (!staged) throw new Error('小红书暂存图片已失效，请重试当前平台')
        blob = staged.blob
        filename = staged.filename
      } else {
        const response = await this.runtime.fetch(ref)
        if (!response.ok) throw new Error(`小红书图片下载失败: ${response.status}`)
        blob = await response.blob()
      }
      if (!blob.type.startsWith('image/') || blob.size === 0) {
        throw new Error('小红书图片内容无效')
      }
      totalBytes += blob.size
      if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error('小红书图片总大小超过安全上限')
      }
      images.push({
        dataUrl: await this.imageDataUri(blob),
        filename,
        type: blob.type,
      })
    }
    return images
  }

  private async imageDataUri(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return `data:${blob.type};base64,${btoa(binary)}`
  }

  private releaseImages(refs: string[]): void {
    refs.forEach(ref => {
      if (ref.startsWith(IMAGE_REF_PREFIX)) {
        this.stagedImages.delete(ref.slice(IMAGE_REF_PREFIX.length))
      }
    })
  }
}
