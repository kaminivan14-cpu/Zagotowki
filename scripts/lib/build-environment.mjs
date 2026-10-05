export const SUPABASE_TARGETS = Object.freeze({
  uat: 'https://meuzkduxttjcuiynsnaa.supabase.co',
  production: 'https://ssheqxdgsmndiutthxvd.supabase.co',
})

export function assertBuildEnvironment({ mode, env, vercelEnv }) {
  if (vercelEnv && !['preview', 'production', 'development'].includes(vercelEnv)) {
    throw new Error('Build safety: unsupported VERCEL_ENV.')
  }
  if (vercelEnv === 'production' && mode !== 'production') {
    throw new Error('Build safety: Vercel Production requires production mode.')
  }
  const target = vercelEnv === 'preview' ? 'uat'
    : vercelEnv === 'production' ? 'production' : mode
  const expected = SUPABASE_TARGETS[target]
  if (!expected) throw new Error('Build safety: use --mode uat or --mode production.')
  if (env.VITE_SUPABASE_URL !== expected) {
    throw new Error(`Build safety: ${target} requires VITE_SUPABASE_URL=${expected}. Build stopped.`)
  }
  const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!key) throw new Error(`Build safety: ${target} public Supabase key is missing.`)
  if (key.startsWith('sb_secret_')) throw new Error('Build safety: secret keys cannot be bundled.')
  if (key.split('.').length === 3) {
    let payload
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()) }
    catch { throw new Error('Build safety: malformed Supabase public JWT key.') }
    if (payload.role !== 'anon' || payload.ref !== new URL(expected).hostname.split('.')[0]) {
      throw new Error('Build safety: public JWT key role/project does not match build target.')
    }
  }
  return target
}
