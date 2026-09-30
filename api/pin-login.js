import { isIP } from 'node:net'
import { trustedEnvironment, PIN_ERROR, validLoginPin, exactKeys, hmac, signedMessage } from '../supabase/functions/_shared/pin-protocol.js'

// Vercel overwrites this header. Do not deploy this handler behind an untrusted runtime.
// https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const reply = (status, error) => res.status(status).json({ error })
  const secret = process.env.PIN_PROXY_SECRET
  const environment = ({ preview: 'uat', production: 'production' })[process.env.VERCEL_ENV]
  const config = trustedEnvironment(environment, process.env.VITE_SUPABASE_URL, process.env.APP_URL)
  if (!config || !secret || secret.length < 32) return reply(503, 'Logowanie PIN niedostępne.')
  if (req.headers.origin && req.headers.origin !== config.origin) return reply(403, PIN_ERROR)
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
