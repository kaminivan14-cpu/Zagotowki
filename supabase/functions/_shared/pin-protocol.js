export const validPinEmail = (value, environment = 'uat') => typeof value === 'string' && new RegExp(`^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}@pin\\.${environment === 'production' ? 'prod' : 'uat'}\\.invalid$`).test(value)
export const UAT_URL = 'https://meuzkduxttjcuiynsnaa.supabase.co'
export const PROD_URL = 'https://ssheqxdgsmndiutthxvd.supabase.co'
export const projectUrl = environment => ({ uat: UAT_URL, production: PROD_URL })[environment]
export function trustedEnvironment(environment, url, appUrl) {
  if (!projectUrl(environment) || url !== projectUrl(environment)) return null
  try {
    const app = new URL(appUrl)
    if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash || app.pathname !== '/') return null
    return { url, origin: app.origin, environment }
  } catch { return null }
}
// Login may verify grandfathered credentials. Assignment/reset remains exactly four digits.
export const validLoginPin = value => typeof value === 'string' && /^[0-9]{4,8}$/.test(value)
export const PIN_ERROR = 'Nieprawidłowy PIN lub konto niedostępne.'
export const validPin = value => typeof value === 'string' && /^[0-9]{4}$/.test(value)
export const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const bytes = value => new TextEncoder().encode(value)
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export async function validSignature(secret, message, signature) {
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return false
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const sig = Uint8Array.from(signature.match(/../g), x => parseInt(x, 16))
  return crypto.subtle.verify('HMAC', key, sig, bytes(message))
}
export const signedMessage = (time, id, source, body) => `${time}\n${id}\n${source}\n${body}`
export async function readBody(req, max = 1024) {
  // Bound streamed bodies too, not only the optional Content-Length header.
  const reader = req.body?.getReader()
  if (!reader) throw new Error('INPUT')
  let size = 0, text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new Error('INPUT') }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally { reader.releaseLock() }
}
