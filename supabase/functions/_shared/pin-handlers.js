import { trustedEnvironment, PIN_ERROR, validPin, validLoginPin, validPinEmail, exactKeys, signedMessage, validSignature, readBody } from './pin-protocol.js'
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
const checked = async promise => {
  const result = await promise
  if (result.error) throw new Error('BACKEND')
  return result.data
}
const audit = (requestId, operation, code, start) => console.info('pin-auth', {
  requestId, operation, code, success: code === 'OK', timingMs: Date.now() - start,
})
export function pinHandler(operation, { createClient, env }) {
  return async req => {
    const start = Date.now(), requestId = crypto.randomUUID()
    const config = trustedEnvironment(env('APP_ENV'), env('SUPABASE_URL'), env('APP_URL'))
    const origin = config?.origin || ''
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    const reply = (status, body, code) => {
      audit(requestId, operation, code, start)
      return new Response(JSON.stringify(body), { status, headers })
    }
    // Explicit environment/project/origin binding. No remote calls before this guard.
    if (!config || !env('SUPABASE_SERVICE_ROLE_KEY')) return reply(503, { error: 'POC niedostępny.' }, 'CONFIG')
    if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403, { error: 'Brak dostępu.' }, 'ORIGIN')
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply(405, { error: 'Wymagany POST.' }, 'METHOD')
    try {
      const raw = await readBody(req)
      let body
      try { body = JSON.parse(raw) } catch { return reply(400, { error: PIN_ERROR }, 'INPUT') }
      const admin = createClient(config.url, env('SUPABASE_SERVICE_ROLE_KEY'), authOptions)
      if (operation === 'login') {
        const secret = env('PIN_PROXY_SECRET')
        if (!secret || secret.length < 32 || !env('SUPABASE_ANON_KEY')) return reply(503, { error: 'POC niedostępny.' }, 'CONFIG')
        const time = req.headers.get('x-pin-time'), id = req.headers.get('x-pin-id'), source = req.headers.get('x-pin-source')
        if (!/^\d{13}$/.test(time || '') || Math.abs(Date.now() - Number(time)) > 30000 || !uuid(id) || !/^[a-f0-9]{64}$/.test(source || '') ||
          !await validSignature(secret, signedMessage(time, id, source, raw), req.headers.get('x-pin-signature'))) {
          return reply(403, { error: PIN_ERROR }, 'PROXY')
        }
        if (!exactKeys(body, ['pin']) || !validLoginPin(body.pin)) return reply(400, { error: PIN_ERROR }, 'INPUT')
        const allowed = await checked(admin.rpc('pin_reserve', { p_source: source, p_attempt: id }))
        if (allowed !== true) return reply(429, { error: 'Zbyt wiele prób. Spróbuj później.' }, 'RATE_LIMIT')
        const rows = await checked(admin.rpc('pin_verify', { p_attempt: id, p_source: source, p_pin: body.pin }))
        if (!Array.isArray(rows) || rows.length !== 1) return reply(401, { error: PIN_ERROR }, 'DENIED')
        const e = rows[0]
        if (!validPinEmail(e.email, config.environment)) return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        const account = await checked(admin.auth.admin.getUserById(e.auth_user_id))
        if (account.user?.id !== e.auth_user_id || account.user?.email !== e.email || String(account.user?.app_metadata?.pin_employee_id) !== String(e.employee_id)) {
          return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        }
        const link = await checked(admin.auth.admin.generateLink({ type: 'magiclink', email: e.email }))
        if (link.user?.id !== e.auth_user_id || !link.properties?.hashed_token) return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        // Per-request client; never sign the service client into an employee session.
        const auth = createClient(config.url, env('SUPABASE_ANON_KEY'), authOptions)
        const verified = await checked(auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' }))
        const session = verified.session
        if (!session || session.user?.id !== e.auth_user_id || !session.access_token || !session.refresh_token) return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        const current = await checked(admin.rpc('pin_confirm', { p_employee: e.employee_id, p_auth_user: e.auth_user_id }))
        if (current !== true) {
          await admin.auth.admin.signOut(session.access_token, 'global')
          return reply(401, { error: PIN_ERROR }, 'DENIED')
        }
        return reply(200, { access_token: session.access_token, refresh_token: session.refresh_token }, 'OK')
      }
      const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      if (!token) return reply(401, { error: 'Zaloguj się jako administrator.' }, 'AUTH')
      const actor = await checked(admin.auth.getUser(token))
      if (!actor.user?.id) return reply(401, { error: 'Zaloguj się jako administrator.' }, 'AUTH')
      if (!exactKeys(body, ['employee_id', 'pin', 'operation_id']) || !/^[1-9]\d*$/.test(String(body.employee_id)) ||
        !validPin(body.pin) || !uuid(body.operation_id)) return reply(400, { error: 'Nieprawidłowe dane.' }, 'INPUT')
      const args = { p_actor: actor.user.id, p_employee: body.employee_id }
      const prepared = await checked(admin.rpc('pin_prepare', args))
      if (!prepared?.[0]) return reply(403, { error: 'Brak dostępu do operacji.' }, 'DENIED')
      const target = prepared[0]
      if (!validPinEmail(target.email, config.environment)) return reply(409, { error: 'Niezgodna tożsamość techniczna.' }, 'IDENTITY')
      let userId = target.auth_user_id
      if (!userId) {
        const created = await admin.auth.admin.createUser({ email: target.email, email_confirm: true,
          app_metadata: { pin_employee_id: String(target.employee_id), pin_provisioning_id: target.provisioning_id } })
        if (created.error) {
          // A concurrent request or interrupted previous invocation may have created the account.
          const retry = await checked(admin.rpc('pin_prepare', args))
          if (retry?.[0]?.email !== target.email || retry?.[0]?.provisioning_id !== target.provisioning_id) return reply(409, { error: 'Niezgodna tożsamość techniczna.' }, 'IDENTITY')
          userId = retry?.[0]?.auth_user_id
          if (!userId) return reply(409, { error: 'Ponów tę samą operację. Konto nie zostało powiązane.' }, 'PROVISION_RETRY')
        } else userId = created.data.user?.id
      }
      if (!userId) return reply(409, { error: 'Ponów tę samą operację.' }, 'PROVISION_RETRY')
      await checked(admin.rpc('pin_finish', { ...args, p_auth_user: userId, p_pin: body.pin, p_operation: body.operation_id }))
      return reply(200, { success: true }, 'OK')
    } catch {
      // Never serialize SDK exceptions: they may carry request bodies or credentials.
      return reply(503, { error: operation === 'login' ? PIN_ERROR : 'Operacja nie powiodła się. Sprawdź uprawnienia i dostępność PIN-u; ponów z tym samym ID operacji.' }, 'BACKEND')
    }
  }
}
