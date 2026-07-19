import { stdin, stdout } from 'node:process'
import WebSocket from 'ws'

import {
  AHAX_EXTENSION_ORIGIN,
  MAX_NATIVE_MESSAGE_BYTES,
  validateCallerOrigin,
  validateClientMessage,
  type NativeClientMessage,
} from './native-protocol.js'

const callerOrigin = process.argv[2]
if (!validateCallerOrigin(callerOrigin)) process.exit(1)

let pending = Buffer.alloc(0)
let socket: WebSocket | null = null
let chain = Promise.resolve()
let shuttingDown = false

function reply(value: unknown): void {
  if (shuttingDown) return
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  if (payload.length > MAX_NATIVE_MESSAGE_BYTES) return
  const header = Buffer.alloc(4)
  header.writeUInt32LE(payload.length, 0)
  stdout.write(header)
  stdout.write(payload)
}

function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  stdin.pause()
  socket?.removeAllListeners()
  socket?.terminate()
  socket = null
  stdout.end()
}

function fixedError(code: string): void {
  reply({ version: 1, type: 'error', code })
}

async function handle(message: NativeClientMessage): Promise<void> {
  if (message.type === 'bootstrap') {
    const response = await fetch(
      `http://127.0.0.1:8765/api/chrome/bootstrap?version=${encodeURIComponent(message.extensionVersion)}`,
      { headers: { Origin: AHAX_EXTENSION_ORIGIN.slice(0, -1) }, cache: 'no-store' },
    )
    if (!response.ok) throw new Error('bootstrap_unavailable')
    reply(await response.json())
    return
  }

  if (message.type === 'connect') {
    if (socket) socket.close()
    socket = new WebSocket(message.url)
    socket.on('open', () => reply({ version: 1, type: 'open' }))
    socket.on('message', data => {
      const text = data.toString()
      if (Buffer.byteLength(text, 'utf8') <= MAX_NATIVE_MESSAGE_BYTES - 1024) {
        reply({ version: 1, type: 'message', data: text })
      }
    })
    socket.on('close', code => reply({ version: 1, type: 'close', code }))
    socket.on('error', () => fixedError('bridge_connection_failed'))
    return
  }

  if (message.type === 'send') {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('bridge_not_connected')
    }
    socket.send(message.data)
    return
  }

  socket?.close()
  socket = null
}

stdin.on('data', chunk => {
  pending = Buffer.concat([pending, chunk])
  if (pending.length > MAX_NATIVE_MESSAGE_BYTES + 4) {
    fixedError('message_too_large')
    process.exit(1)
  }
  while (pending.length >= 4) {
    const length = pending.readUInt32LE(0)
    if (length < 2 || length > MAX_NATIVE_MESSAGE_BYTES) {
      fixedError('invalid_message')
      process.exit(1)
    }
    if (pending.length < length + 4) return
    const payload = pending.subarray(4, length + 4)
    pending = pending.subarray(length + 4)
    let parsed: unknown
    try {
      parsed = JSON.parse(payload.toString('utf8'))
    } catch {
      fixedError('invalid_message')
      continue
    }
    const message = validateClientMessage(parsed)
    if (!message) {
      fixedError('invalid_message')
      continue
    }
    chain = chain.then(() => handle(message)).catch(error => {
      fixedError(error instanceof Error ? error.message : 'native_host_failed')
    })
  }
})

stdin.once('end', shutdown)
stdin.once('close', shutdown)

stdin.resume()
