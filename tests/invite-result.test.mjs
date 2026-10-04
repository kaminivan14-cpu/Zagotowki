import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { invitationFailure } from '../src/auth/inviteResult.js'

const partial = 'Zaproszenie wysłano, ale konto wymaga ręcznego powiązania. Nie ponawiaj zaproszenia.'
const httpError = (message, status = 409) => new FunctionsHttpError(new Response(JSON.stringify({ error: message }), { status }))

test('partial invite uses the actual Edge Function contract and HTTP error body', async () => {
  const source = await readFile(new URL('../supabase/functions/_shared/invite-handler.js', import.meta.url), 'utf8')
  assert.ok(source.includes(`if (linkError) return reply(409, { error: '${partial}' })`))
  const error = httpError(partial)
  const failure = await invitationFailure({ data: null, error })
  assert.equal(failure.partial, true)
  assert.match(failure.message, /Zaproszenie zostało wysłane/)
  assert.match(failure.message, /Nie wysyłaj zaproszenia ponownie/)
  assert.match(failure.message, /interwencja administratora/)
  assert.equal(error.context.bodyUsed, false)
})

test('an existing-account conflict does not claim an invitation was sent', async () => {
  const error = httpError('Nie udało się zaprosić. Istniejące konto wymaga ręcznego powiązania przez administratora bazy.')
  assert.equal((await invitationFailure({ error })).partial, false)
  assert.equal((await invitationFailure({ error: httpError(partial, 500) })).partial, false)
})

test('network and malformed responses remain generic failures', async () => {
  assert.equal((await invitationFailure({ error: new Error('offline') })).partial, false)
  const error = new FunctionsHttpError(new Response('not JSON', { status: 409 }))
  assert.equal((await invitationFailure({ error })).partial, false)
})

test('successful invitation remains successful; explicit body error is recognized', async () => {
  assert.equal(await invitationFailure({ data: { success: true }, error: null }), null)
  assert.equal((await invitationFailure({ data: { error: partial } })).partial, true)
})

test('coded Auth errors distinguish existing accounts from email delivery failures', async () => {
  for (const [code, pattern] of [
    ['AUTH_ACCOUNT_EXISTS', /zweryfikować tożsamość/],
    ['INVITE_EMAIL_NOT_AUTHORIZED', /SMTP/],
    ['INVITE_RATE_LIMIT', /Limit wysyłania/],
    ['INVITE_PROVIDER_FAILED', /nie potwierdziła/],
  ]) {
    const error = new FunctionsHttpError(new Response(JSON.stringify({ code, error: 'hidden provider text' }), { status: 409 }))
    const result = await invitationFailure({ error })
    assert.equal(result.partial, false)
    assert.match(result.message, pattern)
    assert.doesNotMatch(result.message, /hidden provider/)
  }
})
