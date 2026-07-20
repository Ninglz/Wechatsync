type UnknownRecord = Record<string, unknown>

export interface ExecutionStateSnapshot {
  schemaVersion: 1 | 2
  connected: true
  browser: 'chrome'
  context?: {
    workspace: string
    account: {
      platform: string
      authenticated: boolean
      label: string | null
      verifiedAt: string
    } | null
  }
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
  screenshot:
    | { available: false; capturedAt: null; ref: null }
    | { available: true; capturedAt: string; ref: string }
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
  if (
    markers.includes('ahax_trusted_click_debugger_conflict')
    || markers.includes('another debugger')
    || markers.includes('already attached')
    || markers.includes('already being debugged')
  ) {
    return {
      category: 'debugger_conflict',
      suggestedAction: 'close_conflicting_debugger',
      handoffReason: null,
    }
  }
  if (
    markers.includes('ahax_trusted_click_attach_failed')
    || markers.includes('cannot attach to this target')
    || markers.includes('debugger permission')
    || markers.includes('not allowed to debug')
  ) {
    return {
      category: 'debugger_unavailable',
      suggestedAction: 'reload_extension_with_debugger_permission',
      handoffReason: null,
    }
  }
  if (
    markers.includes('ahax_trusted_click_activation_failed')
    || markers.includes('ahax_trusted_click_dispatch_failed')
  ) {
    return {
      category: 'trusted_click_failed',
      suggestedAction: 'refresh_platform_editor',
      handoffReason: null,
    }
  }
  if (
    markers.includes('无法访问小红书草稿控件')
    || markers.includes('暂存按钮不可交互')
  ) {
    return {
      category: 'draft_control_unavailable',
      suggestedAction: 'refresh_platform_editor',
      handoffReason: null,
    }
  }
  return { category: 'platform_error', suggestedAction: 'retry_failed_platform', handoffReason: null }
}

function isoTime(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function safeIsoText(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return null
  }
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

function safeAccountLabel(value: unknown): string | null {
  const label = boundedText(value, 80)
  if (!label || /(cookie|authorization|bearer|token|secret|password)\s*[:=]/i.test(label)) {
    return null
  }
  return label
}

export function contextFromAuth(
  platform: unknown,
  auth: unknown,
  clock: () => Date = () => new Date(),
): NonNullable<ExecutionStateSnapshot['context']> {
  const safePlatform = typeof platform === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(platform)
    ? platform
    : null
  const authRecord = record(auth)
  const authenticated = authRecord?.isAuthenticated === true
  const verifiedAt = clock().toISOString()
  return {
    workspace: 'AHAX Local',
    account: safePlatform ? {
      platform: safePlatform,
      authenticated,
      label: safeAccountLabel(authRecord?.username),
      verifiedAt,
    } : null,
  }
}

export async function captureEvidenceFromDataUrl(
  dataUrl: unknown,
  clock: () => Date = () => new Date(),
): Promise<ExecutionStateSnapshot['screenshot']> {
  if (typeof dataUrl !== 'string' || !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    return { available: false, capturedAt: null, ref: null }
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(dataUrl),
  )
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return {
    available: true,
    capturedAt: clock().toISOString(),
    ref: `sha256:${hex}`,
  }
}

function safeContext(value: unknown): ExecutionStateSnapshot['context'] | null {
  const raw = record(value)
  const workspace = boundedText(raw?.workspace, 80)
  if (!raw || !workspace) return null
  const rawAccount = record(raw.account)
  if (raw.account === null) return { workspace, account: null }
  const platform = rawAccount?.platform
  const authenticated = rawAccount?.authenticated
  const verifiedAt = safeIsoText(rawAccount?.verifiedAt)
  if (
    typeof platform !== 'string'
    || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(platform)
    || typeof authenticated !== 'boolean'
    || verifiedAt === null
  ) return { workspace, account: null }
  return {
    workspace,
    account: {
      platform,
      authenticated,
      label: safeAccountLabel(rawAccount?.label),
      verifiedAt,
    },
  }
}

function safeScreenshot(value: unknown): ExecutionStateSnapshot['screenshot'] {
  const raw = record(value)
  const capturedAt = safeIsoText(raw?.capturedAt)
  const ref = raw?.ref
  if (
    raw?.available === true
    && capturedAt !== null
    && typeof ref === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(ref)
  ) {
    return { available: true, capturedAt, ref }
  }
  return { available: false, capturedAt: null, ref: null }
}

export function buildExecutionState(
  activeSyncState: unknown,
  activeTab: unknown,
  executionContext?: unknown,
  screenshotEvidence?: unknown,
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

  const context = safeContext(executionContext)
  const version = context === null && screenshotEvidence === undefined ? 1 : 2
  return {
    schemaVersion: version,
    connected: true,
    browser: 'chrome',
    ...(version === 2 ? { context: context ?? { workspace: 'AHAX Local', account: null } } : {}),
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
    screenshot: safeScreenshot(screenshotEvidence),
    recentError: classification ? {
      category: classification.category,
      suggestedAction: classification.suggestedAction,
    } : null,
    handoff: { required: handoffReason !== null, reason: handoffReason },
  }
}
