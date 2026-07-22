export type RuntimeStatusInput = {
  connected: boolean
  wechatAuthenticated: boolean
}

export type RuntimeStatusDescription = {
  tone: 'waiting' | 'attention' | 'ready'
  title: string
  detail: string
  action: string
}

export type RuntimeWakeStatus = {
  connected: boolean
  bootstrapAttempted: boolean
}

export async function wakeDisconnectedRuntime(
  isConnected: () => boolean,
  bootstrap: () => Promise<boolean>,
): Promise<RuntimeWakeStatus> {
  if (isConnected()) {
    return { connected: true, bootstrapAttempted: false }
  }

  await bootstrap()
  return { connected: isConnected(), bootstrapAttempted: true }
}

export function observedRuntimeConnection(
  statusResponse: unknown,
  authResponse: unknown,
): boolean {
  const observedAfterBootstrap = (
    authResponse as { runtime?: { connected?: unknown } } | null
  )?.runtime?.connected
  if (typeof observedAfterBootstrap === 'boolean') {
    return observedAfterBootstrap
  }

  return (
    statusResponse as { connected?: unknown } | null
  )?.connected === true
}

export function describeRuntimeStatus(
  status: RuntimeStatusInput,
): RuntimeStatusDescription {
  if (!status.connected) {
    return {
      tone: 'waiting',
      title: '还没有连接本机执行端',
      detail: '先连接 AHAX，再检查公众号登录。',
      action: '连接 AHAX 工作台',
    }
  }
  if (!status.wechatAuthenticated) {
    return {
      tone: 'attention',
      title: '执行端已连接，公众号未登录',
      detail: '登录微信公众号后台后，点击重新检查。',
      action: '检查公众号登录',
    }
  }
  return {
    tone: 'ready',
    title: '本机执行端可以工作',
    detail: '已连接 AHAX，微信公众号已登录，会自动接收草稿任务。',
    action: '重新检查',
  }
}
