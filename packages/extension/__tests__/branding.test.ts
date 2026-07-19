import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  AHAX_HOME_URL,
  AHAX_NAME,
  openAhaxLandingForExtensionBoot,
  extensionLandingUrl,
} from '../src/lib/brand'

const root = path.resolve(__dirname, '..')

describe('AHAX extension branding', () => {
  it('uses AHAX as the installed extension identity', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))

    expect(manifest.name).toBe('AHAX')
    expect(manifest.short_name).toBe('AHAX')
    expect(manifest.homepage_url).toBe('https://ahax.net/')
    expect(manifest.description).toContain('本地优先')
    expect(manifest.description).toContain('草稿')
    expect(fs.existsSync(path.join(root, 'assets/ahax-icon.svg'))).toBe(true)
  })

  it('opens the AHAX site after install or extension reload/update', () => {
    expect(AHAX_NAME).toBe('AHAX')
    expect(AHAX_HOME_URL).toBe('https://ahax.net/')
    expect(extensionLandingUrl('install')).toBe('https://ahax.net/?from=chrome-extension-install')
    expect(extensionLandingUrl('update')).toBe('https://ahax.net/?from=chrome-extension-reload')
  })

  it('opens AHAX once per extension session without spawning tabs on worker wakeups', async () => {
    const created: Array<{ url: string; active: boolean }> = []
    const session: Record<string, unknown> = {}
    const tabs = {
      create: async (value: { url: string; active: boolean }) => {
        created.push(value)
      },
    }
    const sessionStorage = {
      get: async (key: string) => ({ [key]: session[key] }),
      set: async (value: Record<string, unknown>) => {
        Object.assign(session, value)
      },
    }

    await openAhaxLandingForExtensionBoot(tabs, sessionStorage)
    await openAhaxLandingForExtensionBoot(tabs, sessionStorage)
    expect(created).toEqual([
      { url: 'https://ahax.net/?from=chrome-extension-reload', active: true },
    ])
  })

  it('removes upstream branding from every shipped user-facing surface', () => {
    const files = [
      'manifest.json',
      'src/popup/index.html',
      'src/popup/pages/HomeNew.tsx',
      'src/popup/pages/About.tsx',
      'src/popup/components/SettingsDrawer.tsx',
      'src/editor/EditorApp.tsx',
      'src/lib/fab.ts',
      'src/components/sync-dialog/SharePrompt.tsx',
      'src/background/index.ts',
      'src/content/api.ts',
      'src/content/weixin-editor.ts',
    ]
    const shippedCopy = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')

    expect(shippedCopy).not.toMatch(/文章同步助手|微信公众号同步助手|同步助手|www\.wechatsync\.com|developer\.wechatsync\.com|fun0\.netlify\.app|txc\.qq\.com/)
    expect(shippedCopy).toContain('AHAX')
  })
})
