import test from 'node:test'
import assert from 'node:assert/strict'
import { passwordRedirect } from '../src/auth/passwordRecovery.js'

test('password routing recognizes recovery callbacks before Supabase consumes their hash', () => {
  for (const path of ['/?auth=password', '/#type=recovery&access_token=test', '/?type=recovery&code=test']) {
    assert.deepEqual(passwordRedirect(`https://app.example.test${path}`), { requested: true, hasError: false })
  }
  for (const path of ['/', '/#type=signup', '/?code=test']) {
    assert.deepEqual(passwordRedirect(`https://app.example.test${path}`), { requested: false, hasError: false })
  }
})

test('invalid callback errors route to password help and expose no tokens or remote message', () => {
  for (const suffix of ['#error_code=otp_expired', '?error=access_denied', '#error_description=untrusted&access_token=secret']) {
    assert.deepEqual(passwordRedirect(`https://app.example.test/${suffix}`), { requested: true, hasError: true })
  }
})
