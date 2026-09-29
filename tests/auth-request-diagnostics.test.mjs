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
    for (let i = 0; i < 100 && !logs.some(([, r]) => r.stage === 'SHA256_OK'); i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(calls, 1)
    assert.equal(logs[0][1].stage, 'FETCH_ENTER')
    const records = Object.fromEntries(logs.map(([, r]) => [r.stage, r]))
    assert.equal(records.REQUEST.authorizationExists, true)
    assert.equal(records.RESPONSE.status, 401)
    assert.equal(records.SHA256_OK.apikeySha256, createHash('sha256').update(key).digest('hex'))
    for (let i = 0; i < 100 && !logs.some(([, r]) => r.stage === 'ERROR_BODY'); i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.deepEqual(logs.find(([, r]) => r.stage === 'ERROR_BODY')[1].responseBody,
      { message: 'Invalid API key', hint: '[REDACTED]' })
    const output = JSON.stringify(logs)
    for (const secret of [key, 'private-token', 'private-query', 'private@example.test']) assert.equal(output.includes(secret), false)

  })
}

test('success without key omits body; other paths are not logged', async t => {
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  const fetch = createAuthDiagnosticFetch(async () => Response.json({ access_token: 'private' }))
  await fetch('https://example.test/auth/v1/user')
  await fetch('https://example.test/auth/v1/token')
  assert.equal(logs.filter(([, r]) => r.stage === 'FETCH_ENTER').length, 2)
  const response = logs.find(([, r]) => r.stage === 'RESPONSE')[1]
  assert.equal(response.apikeyExists, false)
  assert.equal(response.authorizationExists, false)
  assert.equal(logs.some(([, r]) => r.responseBody), false)
})

test('network rejection is preserved', async () => {
  const error = new Error('network failure')
  const fetch = createAuthDiagnosticFetch(async () => { throw error })
  await assert.rejects(fetch('https://example.test/auth/v1/user'), actual => actual === error)
})

test('Supabase SDK routes getUser through global.fetch and diagnostic wrapper', async t => {
  const { createClient } = await import('@supabase/supabase-js')
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  let calls = 0
  const key = 'test-only-sdk-key'
  const client = createClient('https://example.test', key, {
    global: { fetch: createAuthDiagnosticFetch(async (input, options) => {
      calls++
      assert.equal(new URL(input).pathname, '/auth/v1/user')
      assert.equal(new Headers(options.headers).get('apikey'), key)
      return Response.json({ message: 'Invalid API key' }, { status: 401 })
    }) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.getUser('test-only-jwt')
  assert.equal(error.status, 401)
  for (let i = 0; i < 100 && !logs.some(([, r]) => r.stage === 'SHA256_OK'); i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(calls, 1)
  assert.equal(logs[0][0], '[auth-request-diag]')
  assert.equal(logs.find(([, r]) => r.stage === 'SHA256_OK')[1].apikeySha256, createHash('sha256').update(key).digest('hex'))
})

test('digest failure preserves response and body diagnostics', async t => {
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  t.mock.method(globalThis.crypto.subtle, 'digest', async () => { throw new Error('test failure') })
  let calls = 0
  const fetch = createAuthDiagnosticFetch(async () => {
    calls++
    return Response.json({ message: 'Invalid API key' }, { status: 401 })
  })
  const response = await fetch('https://example.test/auth/v1/user', { headers: { apikey: 'test-key' } })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(response.status, 401)
  assert.equal(calls, 1)
  assert.ok(logs.some(([, r]) => r.stage === 'SHA256_FAILED'))
  assert.ok(logs.some(([, r]) => r.stage === 'RESPONSE'))
  assert.ok(logs.some(([, r]) => r.stage === 'ERROR_BODY'))
})

test('entry is synchronous and clone failure does not hide fingerprint', async t => {
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  const response = Response.json({}, { status: 401 })
  t.mock.method(response, 'clone', () => { throw new Error('private detail') })
  const fetch = createAuthDiagnosticFetch(async () => {
    assert.equal(logs[0][1].stage, 'FETCH_ENTER')
    return response
  })
  const pending = fetch('https://example.test/auth/v1/user', { headers: { apikey: 'test-key' } })
  assert.equal(logs[0][1].stage, 'FETCH_ENTER')
  assert.equal(await pending, response)
  for (let i = 0; i < 100 && !logs.some(([, r]) => r.stage === 'SHA256_OK'); i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(logs.some(([, r]) => r.stage === 'BODY_FAILED'))
  assert.ok(logs.some(([, r]) => r.stage === 'SHA256_OK'))
  assert.equal(JSON.stringify(logs).includes('private detail'), false)
})
