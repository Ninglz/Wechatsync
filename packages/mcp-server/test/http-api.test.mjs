import assert from 'node:assert/strict'
import { test } from 'node:test'
import WebSocket from 'ws'

import { ExtensionBridge } from '../dist/exports.js'


test('bridge HTTP API is loopback-only and requires its bearer token', async () => {
  process.env.WECHATSYNC_TOKEN = 'private-bridge-token'
  const wsPort = 32000 + Math.floor(Math.random() * 1000) * 2
  const bridge = new ExtensionBridge(wsPort, { silent: true })
  await bridge.start()
  try {
    const status = await fetch(`http://127.0.0.1:${wsPort + 1}/status`)
    assert.equal(status.status, 200)
    assert.equal(status.headers.get('access-control-allow-origin'), null)

    const rejected = await fetch(`http://127.0.0.1:${wsPort + 1}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'get_capabilities' }),
    })
    assert.equal(rejected.status, 401)

    const accepted = await fetch(`http://127.0.0.1:${wsPort + 1}/request`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer private-bridge-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ method: 'get_capabilities' }),
    })
    assert.equal(accepted.status, 503)
  } finally {
    bridge.stop()
  }
})

test('bridge WebSocket rejects unauthenticated clients before accepting the extension', async () => {
  process.env.WECHATSYNC_TOKEN = 'private-bridge-token'
  const wsPort = 34000 + Math.floor(Math.random() * 1000) * 2
  const bridge = new ExtensionBridge(wsPort, { silent: true })
  await bridge.start()
  try {
    const rejected = new WebSocket(`ws://127.0.0.1:${wsPort}`)
    await new Promise((resolve) => {
      rejected.once('unexpected-response', (_request, response) => {
        response.resume()
        resolve()
      })
      rejected.once('error', resolve)
      rejected.once('close', resolve)
    })
    assert.equal(bridge.isConnected(), false)

    const accepted = new WebSocket(
      `ws://127.0.0.1:${wsPort}?token=private-bridge-token`,
    )
    await new Promise((resolve, reject) => {
      accepted.once('open', resolve)
      accepted.once('error', reject)
    })
    assert.equal(bridge.isConnected(), true)
    accepted.close()
    await new Promise(resolve => accepted.once('close', resolve))
  } finally {
    bridge.stop()
  }
})
