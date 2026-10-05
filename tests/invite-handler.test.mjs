import test from 'node:test'
import assert from 'node:assert/strict'
import { invitationHandler } from '../supabase/functions/_shared/invite-handler.js'
const origin = 'https://zagotowki-git-feature-orders-sbla-b.vercel.app'
function fixture(options = {}) {
  const calls = []
  const env = { APP_URL: 'https://old.example', INVITATION_APP_URL: origin, ...options.env }
  const handler = invitationHandler({ env: key => env[key], createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: options.noUser ? null : { id: 'verified-actor' } } }),
      admin: { inviteUserByEmail: async (email, args) => {
        calls.push(['invite', email, args]); return { data: { user: { id: 'invited-user' } }, error: options.inviteError }
      } },
    },
    rpc: async (name, args) => {
      calls.push([name, args]); return { error: options.permissionError || (args.p_auth_user_id && options.linkError) }
    },
  }) })
  const request = (method = 'POST', requestOrigin = origin, token = 'test-token') => handler(new Request('https://uat.example/functions/v1/invite-employee', {
    method, headers: { origin: requestOrigin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ employee_id: 10, email: 'controlled@example.com', p_actor: 'forged-actor' }) } : {}),
  }))
  return { calls, request }
}
test('UAT preflight uses exact invitation origin; foreign origin is rejected without Auth calls', async () => {
  const f = fixture(); const res = await f.request('OPTIONS')
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('access-control-allow-origin'), origin)
  assert.match(res.headers.get('access-control-allow-headers'), /authorization/)
  assert.equal((await f.request('OPTIONS', 'https://foreign.example')).status, 403)
  assert.deepEqual(f.calls, [])
})
test('invalid URL and unauthenticated requests fail before invitation', async () => {
  assert.equal((await fixture({ env: { INVITATION_APP_URL: 'invalid' } }).request()).status, 503)
  assert.equal((await fixture().request('POST', origin, '')).status, 401)
  assert.equal((await fixture({ noUser: true }).request()).status, 401)
  const f = fixture({ permissionError: true })
  assert.equal((await f.request()).status, 403)
  assert.equal(f.calls.length, 1)
})
test('new invite uses verified actor, fixed redirect, and rechecks permissions for linking', async () => {
  const f = fixture(); assert.equal((await f.request()).status, 200)
  assert.equal(f.calls[0][1].p_actor, 'verified-actor')
  assert.equal(f.calls[1][2].redirectTo, `${origin}/?auth=password`)
  assert.equal(f.calls[2][1].p_auth_user_id, 'invited-user')
  assert.equal(f.calls[2][1].p_actor, 'verified-actor')
})
test('existing Auth, SMTP restrictions and rate limits are distinct; none link the employee', async () => {
  for (const [code, status, expected] of [
    ['email_exists', 409, 'AUTH_ACCOUNT_EXISTS'],
    ['user_already_exists', 409, 'AUTH_ACCOUNT_EXISTS'],
    ['email_address_not_authorized', 503, 'INVITE_EMAIL_NOT_AUTHORIZED'],
    ['over_email_send_rate_limit', 429, 'INVITE_RATE_LIMIT'],
    ['unexpected_failure', 502, 'INVITE_PROVIDER_FAILED'],
  ]) {
    const f = fixture({ inviteError: { code } }); const res = await f.request()
    assert.equal(res.status, status); assert.equal((await res.json()).code, expected)
    assert.equal(f.calls.length, 2)
  }
})
test('failure after email delivery explicitly forbids reinvitation', async () => {
  const res = await fixture({ linkError: true }).request()
  assert.equal(res.status, 409); assert.match((await res.json()).error, /Nie ponawiaj zaproszenia/)
})
