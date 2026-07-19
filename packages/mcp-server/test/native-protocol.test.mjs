import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AHAX_EXTENSION_ORIGIN,
  MAX_NATIVE_MESSAGE_BYTES,
  validateCallerOrigin,
  validateClientMessage,
} from '../dist/native-protocol.js'

test('native host accepts only the pinned AHAX extension origin', () => {
  assert.equal(
    AHAX_EXTENSION_ORIGIN,
    'chrome-extension://jecfkhkfmaeheiicmhffomcipaokhgnn/',
  )
  assert.equal(validateCallerOrigin(AHAX_EXTENSION_ORIGIN), true)
  assert.equal(validateCallerOrigin('chrome-extension://attacker/'), false)
  assert.equal(validateCallerOrigin(undefined), false)
})

test('native protocol accepts only fixed loopback bridge messages', () => {
  assert.equal(MAX_NATIVE_MESSAGE_BYTES, 1024 * 1024)
  assert.deepEqual(
    validateClientMessage({
      version: 1,
      type: 'connect',
      url: 'ws://127.0.0.1:9527/?token=private-pairing-token',
    }),
    {
      version: 1,
      type: 'connect',
      url: 'ws://127.0.0.1:9527/?token=private-pairing-token',
    },
  )
  assert.equal(
    validateClientMessage({
      version: 1,
      type: 'connect',
      url: 'wss://attacker.example/?token=private-pairing-token',
    }),
    null,
  )
  assert.equal(
    validateClientMessage({ version: 1, type: 'publish', data: '{}' }),
    null,
  )
})
