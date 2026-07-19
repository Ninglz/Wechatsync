import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const nativeHost = fileURLToPath(
  new URL('../dist/native-host.js', import.meta.url),
)
const extensionOrigin = 'chrome-extension://jecfkhkfmaeheiicmhffomcipaokhgnn/'

test('native host exits when Chrome closes the native messaging pipe', async () => {
  const bridge = new WebSocketServer({ host: '127.0.0.1', port: 9527 })
  await new Promise(resolve => bridge.once('listening', resolve))
  const connected = new Promise(resolve => bridge.once('connection', resolve))
  const child = spawn(process.execPath, [nativeHost, extensionOrigin], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  try {
    const message = Buffer.from(JSON.stringify({
      version: 1,
      type: 'connect',
      url: 'ws://127.0.0.1:9527/?token=abcdefghijklmnop',
    }))
    const header = Buffer.alloc(4)
    header.writeUInt32LE(message.length, 0)
    child.stdin.write(Buffer.concat([header, message]))
    await connected
    child.stdin.end()

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('native host did not exit after stdin closed'))
      }, 1000)
      child.once('exit', code => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    assert.equal(exitCode, 0)
  } finally {
    child.kill('SIGKILL')
    await new Promise(resolve => bridge.close(resolve))
  }
})
