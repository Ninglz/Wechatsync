type UnknownRecord = Record<string, unknown>

export interface ExecutionStateSnapshot {
  schemaVersion: 1
  connected: true
  browser: 'chrome'
  tab: { id: number; title: string; origin: string | null } | null
  task: {
    syncId: string
    status: string
    platforms: string[]
    currentStep: string
    startedAt: string | null
    completedCount: number
    totalCount: number
  } | null
  screenshot: { available: false; capturedAt: null; ref: null }
  recentError: { category: string; suggestedAction: string } | null
  handoff: { required: boolean; reason: string | null }
}

const LOGIN_MARKERS = ['not logged in', 'not authenticated', 'login required', '未登录', '请登录']
const CAPTCHA_MARKERS = ['captcha', 'verification code', '验证码', '人机验证']

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return clean ? clean.slice(0, maxLength) : null
}

function safeOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

function safePlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(item))
    .slice(0, 64)
}

function errorClassification(results: unknown): {
  category: string
  suggestedAction: string
  handoffReason: string | null
} | null {
  if (!Array.isArray(results)) return null
  const failed = results.map(record).filter((item): item is UnknownRecord => item?.success === false)
  if (!failed.length) return null
  const markers = failed
    .flatMap(item => [item.error, item.message])
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .toLowerCase()
  if (LOGIN_MARKERS.some(marker => markers.includes(marker))) {
    return { category: 'login_required', suggestedAction: 'login_in_browser', handoffReason: 'login_required' }
  }
  if (CAPTCHA_MARKERS.some(marker => markers.includes(marker))) {
    return { category: 'captcha_required', suggestedAction: 'complete_verification', handoffReason: 'captcha_required' }
  }
  return { category: 'platform_error', suggestedAction: 'retry_failed_platform', handoffReason: null }
}

function isoTime(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function buildExecutionState(
  activeSyncState: unknown,
  activeTab: unknown,
): ExecutionStateSnapshot {
  const state = record(activeSyncState)
  const tab = record(activeTab)
  const results = state && Array.isArray(state.results) ? state.results.slice(0, 64) : []
  const classification = errorClassification(results)
  const handoffReason = classification?.handoffReason ?? null
  const status = state ? boundedText(state.status, 32) : null
  const platforms = state ? safePlatforms(state.selectedPlatforms) : []
  const syncId = state ? boundedText(state.syncId, 128) : null

  let currentStep = 'saving_drafts'
  if (handoffReason === 'login_required') currentStep = 'waiting_for_login'
  else if (handoffReason === 'captcha_required') currentStep = 'waiting_for_verification'
  else if (status === 'completed') currentStep = 'completed'
  else if (status === 'failed') currentStep = 'failed'
  else if (status === 'cancelled') currentStep = 'cancelled'

  const tabId = tab?.id
  const tabTitle = tab ? boundedText(tab.title, 160) : null

  return {
    schemaVersion: 1,
    connected: true,
    browser: 'chrome',
    tab: typeof tabId === 'number' && Number.isInteger(tabId)
      ? { id: tabId, title: tabTitle ?? 'Chrome tab', origin: safeOrigin(tab?.url) }
      : null,
    task: state && syncId && status ? {
      syncId,
      status,
      platforms,
      currentStep,
      startedAt: isoTime(state.startTime),
      completedCount: results.length,
      totalCount: platforms.length,
    } : null,
    screenshot: { available: false, capturedAt: null, ref: null },
    recentError: classification ? {
      category: classification.category,
      suggestedAction: classification.suggestedAction,
    } : null,
    handoff: { required: handoffReason !== null, reason: handoffReason },
  }
}
