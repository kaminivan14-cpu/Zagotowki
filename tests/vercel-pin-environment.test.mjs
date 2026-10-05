import test from 'node:test'
import assert from 'node:assert/strict'
import { vercelPinEnvironment } from '../scripts/lib/vercel-pin-environment.mjs'
import { managementOrigin, UAT_URL, PROD_URL } from '../supabase/functions/_shared/pin-protocol.js'
const preview = { VERCEL_ENV: 'preview', VITE_SUPABASE_URL: UAT_URL, VERCEL_URL: 'zagotowki-abc-sbla-b.vercel.app', VERCEL_BRANCH_URL: 'zagotowki-git-feature-new-sbla-b.vercel.app' }
test('Preview uses deployment and branch URLs without APP_URL or per-branch env', () => {
  for (const branch of ['feature-new', 'release-new']) {
    const env = { ...preview, VERCEL_BRANCH_URL: `zagotowki-git-${branch}-sbla-b.vercel.app`, APP_URL: 'https://obsolete.example', PIN_MANAGEMENT_ORIGINS: 'https://foreign.example' }
    const runtime = vercelPinEnvironment(env)
    assert.equal(runtime.config.url, UAT_URL)
    assert.equal(runtime.config.origin, `https://${preview.VERCEL_URL}`)
    assert.equal(managementOrigin(runtime.config, `https://${env.VERCEL_BRANCH_URL}`, runtime.additionalOrigins), `https://${env.VERCEL_BRANCH_URL}`)
    assert.notEqual(managementOrigin(runtime.config, 'https://foreign.example', runtime.additionalOrigins), 'https://foreign.example')
  }
})
test('Preview rejects Production target and untrusted or malformed platform hosts', () => {
  assert.equal(vercelPinEnvironment({ ...preview, VITE_SUPABASE_URL: PROD_URL }), null)
  for (const host of ['https://x.vercel.app', 'evil.example', 'x.vercel.app/extra', 'x.vercel.app@evil.example', 'x.vercel.app?query', '*.vercel.app']) {
    assert.equal(vercelPinEnvironment({ ...preview, VERCEL_URL: host }), null)
    assert.equal(vercelPinEnvironment({ ...preview, VERCEL_BRANCH_URL: host }), null)
  }
})
test('Production still requires explicit APP_URL and Production Supabase; ignores preview hosts', () => {
  const env = { ...preview, VERCEL_ENV: 'production', VITE_SUPABASE_URL: PROD_URL, APP_URL: 'https://zagotowki.vercel.app' }
  assert.equal(vercelPinEnvironment(env).config.origin, env.APP_URL)
  assert.equal(vercelPinEnvironment({ ...env, APP_URL: undefined }), null)
  assert.equal(vercelPinEnvironment({ ...env, VITE_SUPABASE_URL: UAT_URL }), null)
})
