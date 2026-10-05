import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadEnv } from 'vite'
import { assertBuildEnvironment, SUPABASE_TARGETS as urls } from '../scripts/lib/build-environment.mjs'

const envFor = target => ({ VITE_SUPABASE_URL: urls[target], VITE_SUPABASE_ANON_KEY: 'sb_publishable_test' })
const check = (mode, target, vercelEnv) => assertBuildEnvironment({ mode, env: envFor(target), vercelEnv })

test('UAT and Vercel Preview reject PROD; Production rejects UAT', () => {
  assert.equal(check('uat', 'uat'), 'uat')
  assert.equal(check('production', 'uat', 'preview'), 'uat')
  assert.equal(check('production', 'production', 'production'), 'production')
  assert.equal(check('production', 'production'), 'production')
  for (const args of [['uat', 'production'], ['production', 'production', 'preview'],
    ['production', 'uat', 'production'], ['production', 'uat'], ['uat', 'uat', 'production']]) {
    assert.throws(() => check(...args), /Build safety/)
  }
  assert.throws(() => check('staging', 'uat'), /Build safety/)
  assert.throws(() => check('production', 'production', 'unknown'), /Build safety/)
})

test('missing credentials, foreign JWT and service keys fail; legacy public key remains supported', () => {
  const run = env => assertBuildEnvironment({ mode: 'uat', env })
  const jwt = (ref, role) => `header.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.signature`
  assert.throws(() => run({}), /Build safety/)
  assert.throws(() => run({ VITE_SUPABASE_URL: urls.uat }), /key is missing/)
  for (const key of ['sb_secret_test', jwt('ssheqxdgsmndiutthxvd', 'anon'), jwt('meuzkduxttjcuiynsnaa', 'service_role'), 'bad.bad.bad']) {
    assert.throws(() => run({ ...envFor('uat'), VITE_SUPABASE_ANON_KEY: key }), /Build safety/)
  }
  assert.equal(run({ VITE_SUPABASE_URL: urls.uat, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }), 'uat')
  assert.equal(run({ ...envFor('uat'), VITE_SUPABASE_ANON_KEY: jwt('meuzkduxttjcuiynsnaa', 'anon') }), 'uat')
})

test('Vite actual env precedence: UAT mode overrides generic files, process env wins and is guarded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-env-test-'))
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']
  const saved = Object.fromEntries(names.map(k => [k, process.env[k]]))
  try {
    for (const name of names) delete process.env[name]
    fs.writeFileSync(path.join(dir, '.env'), `VITE_SUPABASE_URL=${urls.production}\n`)
    fs.writeFileSync(path.join(dir, '.env.local'), `VITE_SUPABASE_URL=${urls.production}\n`)
    fs.writeFileSync(path.join(dir, '.env.uat'), `VITE_SUPABASE_URL=${urls.uat}\nVITE_SUPABASE_ANON_KEY=sb_publishable_test\n`)
    assert.equal(assertBuildEnvironment({ mode: 'uat', env: loadEnv('uat', dir) }), 'uat')
    process.env.VITE_SUPABASE_URL = urls.production
    assert.throws(() => assertBuildEnvironment({ mode: 'uat', env: loadEnv('uat', dir) }), /Build safety/)
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
