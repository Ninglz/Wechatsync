import { requestLocalAccessBeforeWorkerPairing } from '../lib/local-permission'

const title = document.querySelector<HTMLElement>('#title')
const message = document.querySelector<HTMLElement>('#message')
const retry = document.querySelector<HTMLButtonElement>('#retry')

async function connect(): Promise<void> {
  retry?.setAttribute('data-visible', 'false')
  if (title) title.textContent = '正在连接本机 Agent'
  if (message) message.textContent = 'Chrome 可能会询问是否允许访问本地网络。允许后会自动进入 AHAX。'

  const connected = await requestLocalAccessBeforeWorkerPairing({
    extensionVersion: chrome.runtime.getManifest().version,
    fetcher: (url, init) => fetch(url, init as RequestInit),
    reconnect: () => chrome.runtime.sendMessage({
      type: 'AHAX_RECONNECT_LOCAL_BRIDGE',
    }),
    navigate: url => location.replace(url),
  })

  if (connected) return
  if (title) title.textContent = '需要允许本地连接'
  if (message) message.textContent = 'AHAX 只连接你电脑上的本机 Agent，不会绕过登录或验证码。允许后再试一次。'
  retry?.setAttribute('data-visible', 'true')
}

retry?.addEventListener('click', () => {
  connect().catch(() => {})
})

connect().catch(() => {})
