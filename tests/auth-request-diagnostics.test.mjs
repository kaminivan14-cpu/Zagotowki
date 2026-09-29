import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createAuthDiagnosticFetch } from '../src/auth/authRequestDiagnostics.js'

for (const variant of ['url', 'request', 'override']) {
  test(`diagnostics observe one real fetch: ${variant}`, async t => {
    const logs = []
    t.mock.method(console, 'info', (...args) => logs.push(args))
    const key = 'test-only-key'
    const url = 'https://example.test/auth/v1/user?token=private-query'
    const headers = { apikey: key, Authorization: 'Bearer private-token' }
    const input = variant === 'url' ? url : new Request(url, {
      headers: variant === 'override' ? { apikey: 'replaced-key' } : headers,
    })
    const options = variant === 'request' ? undefined : { headers }
    const body = { message: 'Invalid API key', hint: 'unknown private-token', access_token: 'private-token', user: { email: 'private@example.test' } }
    const response = Response.json(body, { status: 401 })
    let calls = 0
    const fetch = createAuthDiagnosticFetch(async (actualInput, actualOptions) => {
      calls++
      assert.equal(actualInput, input)
      assert.equal(actualOptions, options)
      return response
    })
    assert.equal(await fetch(input, options), response)
    assert.deepEqual(await response.json(), body)
    for (let i = 0; i < 100 && !logs.length; i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(calls, 1)
    assert.deepEqual(logs, [['[auth-request-diag]', {
      hostname: 'example.test', pathname: '/auth/v1/user', method: 'GET', status: 401,
      apikeyExists: true, apikeyLength: key.length,
      apikeySha256: createHash('sha256').update(key).digest('hex'),
      responseBody: { message: 'Invalid API key', hint: '[REDACTED]' },
    }]])
  })
}

test('success without key omits body; other paths are not logged', async t => {
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  const fetch = createAuthDiagnosticFetch(async () => Response.json({ access_token: 'private' }))
  await fetch('https://example.test/auth/v1/user')
  await fetch('https://example.test/auth/v1/token')
  assert.deepEqual(logs, [['[auth-request-diag]', {
    hostname: 'example.test', pathname: '/auth/v1/user', method: 'GET', status: 200,
    apikeyExists: false, apikeyLength: 0,
  }]])
})

test('network rejection is preserved', async () => {
  const error = new Error('network failure')
  const fetch = createAuthDiagnosticFetch(async () => { throw error })
  await assert.rejects(fetch('https://example.test/auth/v1/user'), actual => actual === error)
})
