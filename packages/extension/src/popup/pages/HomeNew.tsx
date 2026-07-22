import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Plus, Clock, X, Download, Info, ExternalLink, RefreshCw } from 'lucide-react'
import { useSyncStore } from '../stores/sync'
import { SettingsDrawer } from '../components/SettingsDrawer'
import { SyncDialog } from '@/components/sync-dialog'
import type { Platform as DialogPlatform } from '@/components/sync-dialog'
import { cn } from '@/lib/utils'
import { trackPageView, trackFeatureDiscovery } from '../../lib/analytics'
import { createLogger } from '../../lib/logger'
import { getCachedUpdateInfo, dismissUpdate, type UpdateCheckResult } from '../../lib/version-check'
import { describeRuntimeStatus } from '../../lib/runtime-status'

const logger = createLogger('HomeNew')

export function HomeNew() {
  const navigate = useNavigate()
  const {
    status,
    article,
    platforms,
    selectedPlatforms,
    results,
    error,

    platformProgress,
    recovered,
    loadPlatforms,
    loadArticle,
    recoverSyncState,
    togglePlatform,
    selectAll,
    deselectAll,
    startSync,
    retryFailed,
    reset,
    checkRateLimit,
  } = useSyncStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null)
  const [allPlatforms, setAllPlatforms] = useState<DialogPlatform[]>([])

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [floatingEnabled, setFloatingEnabled] = useState(false)
  const [isFirstSync, setIsFirstSync] = useState(false)
  const [showShareTip, setShowShareTip] = useState(false)
  const [runtimeConnected, setRuntimeConnected] = useState(false)
  const [wechatAuthenticated, setWechatAuthenticated] = useState(false)
  const [runtimeChecking, setRuntimeChecking] = useState(true)

  // Load data
  useEffect(() => {
    const init = async () => {
      await recoverSyncState()
      // Render from cache first, then refresh
      try {
        const cached = await chrome.storage.local.get('platformListCache')
        if (cached.platformListCache?.length) {
          setAllPlatforms(cached.platformListCache.map((p: any) => ({
            id: p.id, name: p.name, icon: p.icon,
            isAuthenticated: p.isAuthenticated, username: p.username,
            homepage: p.homepage,
          })))
        }
      } catch {}
      loadAllPlatforms()
      refreshRuntimeStatus()
      loadArticle()
      chrome.storage.local.get(['floatingButtonEnabled', 'syncHistory', 'dismissedShareTip'], (r) => {
        setFloatingEnabled(r.floatingButtonEnabled ?? false)
        setIsFirstSync(!r.syncHistory || r.syncHistory.length === 0)
        if (!r.dismissedShareTip) {
          setShowShareTip(true)
        }
      })
      const cached = await getCachedUpdateInfo()
      if (cached?.hasUpdate && cached.info) {
        setUpdateInfo(cached)
      }
    }
    init()
    trackPageView('home').catch(() => {})
  }, [])

  const loadAllPlatforms = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_ALL_AUTH', payload: { forceRefresh: false } })
      const mapped: DialogPlatform[] = (response.platforms || []).map((p: any) => ({
        id: p.id, name: p.name, icon: p.icon,
        isAuthenticated: p.isAuthenticated, username: p.username,
        homepage: p.homepage,
      }))
      setAllPlatforms(mapped)
      await loadPlatforms()
    } catch (error) {
      logger.error('Failed to load platforms:', error)
    }
  }

  const refreshRuntimeStatus = async () => {
    setRuntimeChecking(true)
    try {
      const [runtime, auth] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'MCP_STATUS' }),
        chrome.runtime.sendMessage({ type: 'CHECK_ALL_AUTH', payload: { forceRefresh: true } }),
      ])
      setRuntimeConnected(runtime?.connected === true)
      const wechat = (auth?.platforms || []).find((platform: any) => platform.id === 'weixin')
      setWechatAuthenticated(wechat?.isAuthenticated === true)
    } catch (error) {
      logger.error('Failed to inspect Runtime:', error)
      setRuntimeConnected(false)
      setWechatAuthenticated(false)
    } finally {
      setRuntimeChecking(false)
    }
  }

  const handleRuntimeAction = async () => {
    setRuntimeChecking(true)
    try {
      if (!runtimeConnected) {
        await chrome.runtime.sendMessage({ type: 'AHAX_RECONNECT_LOCAL_BRIDGE' })
      }
      await refreshRuntimeStatus()
    } finally {
      setRuntimeChecking(false)
    }
  }

  // Open editor
  const handleEditArticle = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'OPEN_EDITOR',
        platforms: allPlatforms,
        selectedPlatforms,
      })
      window.close()
    }
  }

  // Start sync with rate-limit check
  const handleStartSync = async () => {
    const warning = await checkRateLimit()
    if (warning) {
      setRateLimitWarning(warning)
      setTimeout(() => setRateLimitWarning(null), 8000)
    }
    startSync()
  }

  const successCount = results.filter(r => r.success).length
  const runtimeStatus = describeRuntimeStatus({
    connected: runtimeConnected,
    wechatAuthenticated,
  })

  return (
    <div className="flex flex-col h-[500px]">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <img src="/assets/icon-48.png" alt="Logo" className="w-6 h-6" />
          <h1 className="font-semibold">AHAX</h1>
        </div>
        <nav className="flex items-center gap-0.5">
          <button
            onClick={() => navigate('/add-cms')}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[10px] text-muted-foreground leading-none">添加</span>
          </button>
          <button
            onClick={() => navigate('/history')}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[10px] text-muted-foreground leading-none">历史</span>
          </button>
          <button
            onClick={() => navigate('/about')}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="text-[10px] text-muted-foreground leading-none">关于</span>
          </button>
          <button
            onClick={() => {
              setSettingsOpen(true)
              trackFeatureDiscovery('settings', 'header_icon').catch(() => {})
            }}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-[10px] text-muted-foreground leading-none">设置</span>
          </button>
        </nav>
      </header>

      <section className="px-4 pt-3" aria-label="本机执行端状态">
        <div className={cn(
          'rounded-xl border p-3',
          runtimeStatus.tone === 'ready' && 'border-green-200 bg-green-50',
          runtimeStatus.tone === 'attention' && 'border-amber-200 bg-amber-50',
          runtimeStatus.tone === 'waiting' && 'border-slate-200 bg-slate-50',
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  runtimeStatus.tone === 'ready' ? 'bg-green-500' : runtimeStatus.tone === 'attention' ? 'bg-amber-500' : 'bg-slate-400',
                )} />
                <p className="text-sm font-semibold">{runtimeChecking ? '正在检查本机执行端…' : runtimeStatus.title}</p>
              </div>
              <p className="mt-1 pl-[18px] text-xs leading-relaxed text-muted-foreground">{runtimeStatus.detail}</p>
            </div>
            <button
              type="button"
              disabled={runtimeChecking}
              onClick={handleRuntimeAction}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn('mr-1 inline h-3.5 w-3.5', runtimeChecking && 'animate-spin')} />
              {runtimeStatus.action}
            </button>
          </div>
          {!wechatAuthenticated && runtimeConnected && (
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: 'https://mp.weixin.qq.com/' })}
              className="mt-2 ml-[18px] text-xs font-medium text-primary hover:underline"
            >
              打开微信公众号后台 <ExternalLink className="inline h-3 w-3" />
            </button>
          )}
        </div>
      </section>

      {/* Version update banner */}
      {updateInfo?.hasUpdate && updateInfo.info && (
        <div className="px-4 pt-3">
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Download className="w-4 h-4" />
                <span>新版本 v{updateInfo.info.version} 可用</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={updateInfo.info.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  下载
                </a>
                <button
                  onClick={async () => {
                    if (updateInfo.info) {
                      await dismissUpdate(updateInfo.info.version)
                      chrome.runtime.sendMessage({ type: 'CLEAR_UPDATE_BADGE' }).catch(() => {})
                      setUpdateInfo(null)
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="忽略此版本"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {updateInfo.info.releaseNotes && (
              <p className="text-xs text-muted-foreground mt-1">{updateInfo.info.releaseNotes}</p>
            )}
          </div>
        </div>
      )}

      {/* Share / welcome banner (first time only) */}
      {showShareTip && (
        <div className="px-4 pt-3">
          <div className="bg-muted/50 rounded-lg p-3 text-sm relative">
            <button
              onClick={() => {
                setShowShareTip(false)
                chrome.storage.local.set({ dismissedShareTip: true })
              }}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="font-medium mb-1.5">欢迎使用 AHAX</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              本地优先生成平台差异稿，并安全保存到各平台草稿箱。
              <br />
              查看完整内容工作流{' '}
              <a
                href="https://ahax.net/?from=chrome-extension"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                AHAX 官网
              </a>
            </p>
          </div>
        </div>
      )}

      {/* SyncDialog — the unified sync flow */}
      <SyncDialog
        article={article}
        platforms={allPlatforms}
        status={status}
        selectedPlatforms={selectedPlatforms}
        results={results}
        platformProgress={platformProgress}
        error={error}
        onTogglePlatform={togglePlatform}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onStartSync={handleStartSync}
        onRetryFailed={retryFailed}
        onReset={reset}
        onCancel={reset}
        onEditArticle={handleEditArticle}
        className="flex-1 min-h-0"
      />

      {/* First sync success hint */}
      {status === 'completed' && isFirstSync && successCount > 0 && (
        <div className="px-4 pb-3">
          <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2.5 space-y-1.5">
            <p className="text-xs font-medium text-green-700 dark:text-green-400">
              首次同步成功！以后同步更方便：
            </p>
            {!floatingEnabled && (
              <button
                onClick={() => {
                  chrome.storage.local.set({ floatingButtonEnabled: true })
                  setFloatingEnabled(true)
                }}
                className="text-xs text-primary hover:underline block"
              >
                开启 AHAX 悬浮按钮 — 从任意文章页开始内容任务
              </button>
            )}
            <p className="text-xs text-green-600 dark:text-green-500">
              下次在文章页点击扩展图标即可快速同步
            </p>
          </div>
        </div>
      )}

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Rate limit warning (non-blocking toast) */}
      {rateLimitWarning && (
        <div className="fixed top-2 left-2 right-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg flex items-start gap-2">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 flex-1">{rateLimitWarning}</p>
            <button
              onClick={() => setRateLimitWarning(null)}
              className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
