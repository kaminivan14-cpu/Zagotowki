import { isIP } from 'node:net'
import { trustedEnvironment, managementOrigin, PROD_URL, PIN_ERROR, validLoginPin, exactKeys, hmac, signedMessage } from '../supabase/functions/_shared/pin-protocol.js'

// Temporary: server logs only; remove after the runtime configuration is verified.
function logInvalidConfiguration(config, secret) {
  try {
    let app
    try { app = new URL(process.env.APP_URL) } catch { /* Report booleans only. */ }
    console.info('[pin-config-diag]', {
      VERCEL_ENV_PRESENT: Boolean(process.env.VERCEL_ENV),
      VERCEL_ENV_PRODUCTION: process.env.VERCEL_ENV === 'production',
      VERCEL_ENV_SUPPORTED: ['production', 'preview'].includes(process.env.VERCEL_ENV),
      SUPABASE_URL_PRESENT: Boolean(process.env.VITE_SUPABASE_URL),
      PROD_REF_MATCH: process.env.VITE_SUPABASE_URL === PROD_URL,
      APP_URL_PRESENT: Boolean(process.env.APP_URL),
      APP_URL_PARSE_OK: Boolean(app),
      APP_URL_HTTPS: app?.protocol === 'https:',
      APP_URL_EXPECTED_ORIGIN: app?.origin === 'https://zagotowki.vercel.app',
      APP_URL_NO_CREDENTIALS: Boolean(app && !app.username && !app.password),
      APP_URL_NO_QUERY_HASH: Boolean(app && !app.search && !app.hash),
      APP_URL_ROOT_PATH: app?.pathname === '/',
      PIN_PROXY_SECRET_PRESENT: Boolean(secret),
      PIN_PROXY_SECRET_LENGTH_OK: Boolean(secret && secret.length >= 32),
      CONFIG_VALID: Boolean(config),
    })
  } catch { /* Diagnostics must never affect the response. */ }
}

// Vercel overwrites this header. Do not deploy this handler behind an untrusted runtime.
// https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const reply = (status, error) => res.status(status).json({ error })
  const secret = process.env.PIN_PROXY_SECRET
  const environment = ({ preview: 'uat', production: 'production' })[process.env.VERCEL_ENV]
  const config = trustedEnvironment(environment, process.env.VITE_SUPABASE_URL, process.env.APP_URL)
  if (!config || !secret || secret.length < 32) {
    logInvalidConfiguration(config, secret)
    return reply(503, 'Logowanie PIN niedostępne.')
  }
  // Preview uses the same explicit UAT allowlist as PIN management. Production ignores it.
  const origin = managementOrigin(config, req.headers.origin, process.env.PIN_MANAGEMENT_ORIGINS)
  if (req.headers.origin && req.headers.origin !== origin) return reply(403, PIN_ERROR)
  if (req.method !== 'POST') return reply(405, 'Wymagany POST.')
  const ip = req.headers['x-vercel-forwarded-for']
  if (typeof ip !== 'string' || !isIP(ip)) return reply(403, PIN_ERROR)
  if (!exactKeys(req.body, ['pin']) || !validLoginPin(req.body.pin)) return reply(400, PIN_ERROR)
  try {
    const body = JSON.stringify({ pin: req.body.pin })
    const time = String(Date.now()), id = crypto.randomUUID(), source = await hmac(secret, `source:${ip}`)
    const signature = await hmac(secret, signedMessage(time, id, source, body))
    const response = await fetch(`${config.url}/functions/v1/pin-login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pin-time': time, 'x-pin-id': id,
        'x-pin-source': source, 'x-pin-signature': signature }, body, signal: AbortSignal.timeout(20000) })
    const data = await response.json()
    if (response.ok && typeof data.access_token === 'string' && typeof data.refresh_token === 'string') {
      return res.status(200).json({ access_token: data.access_token, refresh_token: data.refresh_token })
    }
    return reply(response.status === 429 ? 429 : 401, response.status === 429 ? 'Zbyt wiele prób. Spróbuj później.' : PIN_ERROR)
  } catch { return reply(503, 'Logowanie PIN jest chwilowo niedostępne.') }
}
