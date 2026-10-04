import { trustedEnvironment, managementOrigin, PIN_ERROR, validPin, validLoginPin, validPinEmail, exactKeys, signedMessage, validSignature, readBody } from './pin-protocol.js'
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
const knownErrors = {
  'Forbidden': ['DENIED', 403, 'Brak uprawnień administratora. Zaloguj się ponownie.'],
  'Unavailable target': ['TARGET_UNAVAILABLE', 403, 'Pracownik jest nieaktywny lub jego rola nie pozwala na nadanie PIN-u.'],
  'Existing non-PIN identity': ['EXISTING_IDENTITY', 409, 'Pracownik ma konto innego typu. Administrator musi sprawdzić jego powiązanie; nie zmieniono konta.'],
  'Identity conflict': ['IDENTITY', 409, 'Niezgodne powiązanie konta pracownika. Wymagana weryfikacja administratora.'],
  'Already linked': ['IDENTITY', 409, 'Pracownik jest już powiązany z innym kontem.'],
  'PIN unavailable': ['PIN_UNAVAILABLE', 409, 'Ten PIN jest już zajęty. Wybierz inny.'],
  'Operation already used': ['OPERATION_CONFLICT', 409, 'Ta operacja została już zapisana. Zamknij formularz i otwórz go ponownie.'],
}

const audit = (requestId, operation, code, start) => console.info('pin-auth', {
  requestId, operation, code, success: code === 'OK', timingMs: Date.now() - start,
})
export function pinHandler(operation, { createClient, env }) {
  return async req => {
    const start = Date.now(), requestId = crypto.randomUUID()
    const config = trustedEnvironment(env('APP_ENV'), env('SUPABASE_URL'), env('APP_URL'))
    const origin = operation === 'manage' ? managementOrigin(config, req.headers.get('origin'), env('PIN_MANAGEMENT_ORIGINS')) : config?.origin || ''
    let stage = 'request'
    const checked = async (promise, nextStage) => {
      stage = nextStage
      const result = await promise
      if (result.error) {
        const failure = new Error('BACKEND')
        failure.safe = Object.hasOwn(knownErrors, result.error.message) ? knownErrors[result.error.message] : null
        failure.backendCode = /^[A-Z0-9]{5}$/.test(result.error.code) ? result.error.code : 'SDK_ERROR'
        throw failure
      }
      return result.data
    }
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    const reply = (status, body, code) => {
      audit(requestId, operation, code, start)
      return new Response(JSON.stringify(operation === 'manage' ? { ...body, code, request_id: requestId } : body), { status, headers })
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
        const allowed = await checked(admin.rpc('pin_reserve', { p_source: source, p_attempt: id }), 'pin_reserve')
        if (allowed !== true) return reply(429, { error: 'Zbyt wiele prób. Spróbuj później.' }, 'RATE_LIMIT')
        const rows = await checked(admin.rpc('pin_verify', { p_attempt: id, p_source: source, p_pin: body.pin }), 'pin_verify')
        if (!Array.isArray(rows) || rows.length !== 1) return reply(401, { error: PIN_ERROR }, 'DENIED')
        const e = rows[0]
        if (!validPinEmail(e.email, config.environment)) return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        const account = await checked(admin.auth.admin.getUserById(e.auth_user_id), 'get_user')
        if (account.user?.id !== e.auth_user_id || account.user?.email !== e.email || String(account.user?.app_metadata?.pin_employee_id) !== String(e.employee_id)) {
          return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        }
        const link = await checked(admin.auth.admin.generateLink({ type: 'magiclink', email: e.email }), 'generate_link')
        if (link.user?.id !== e.auth_user_id || !link.properties?.hashed_token) return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        // Per-request client; never sign the service client into an employee session.
        const auth = createClient(config.url, env('SUPABASE_ANON_KEY'), authOptions)
        const verified = await checked(auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' }), 'verify_otp')
        const session = verified.session
        if (!session || session.user?.id !== e.auth_user_id || !session.access_token || !session.refresh_token) return reply(401, { error: PIN_ERROR }, 'IDENTITY')
        const current = await checked(admin.rpc('pin_confirm', { p_employee: e.employee_id, p_auth_user: e.auth_user_id }), 'pin_confirm')
        if (current !== true) {
          await admin.auth.admin.signOut(session.access_token, 'global')
          return reply(401, { error: PIN_ERROR }, 'DENIED')
        }
        return reply(200, { access_token: session.access_token, refresh_token: session.refresh_token }, 'OK')
      }
      const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      if (!token) return reply(401, { error: 'Zaloguj się jako administrator.' }, 'AUTH')
      const actor = await checked(admin.auth.getUser(token), 'verify_admin')
      if (!actor.user?.id) return reply(401, { error: 'Zaloguj się jako administrator.' }, 'AUTH')
      if (!exactKeys(body, ['employee_id', 'pin', 'operation_id']) || !/^[1-9]\d*$/.test(String(body.employee_id)) ||
        !validPin(body.pin) || !uuid(body.operation_id)) return reply(400, { error: 'Nieprawidłowe dane.' }, 'INPUT')
      const args = { p_actor: actor.user.id, p_employee: body.employee_id }
      const prepared = await checked(admin.rpc('pin_prepare', args), 'pin_prepare')
      if (!prepared?.[0]) return reply(403, { error: 'Brak dostępu do operacji.' }, 'DENIED')
      const target = prepared[0]
      if (!validPinEmail(target.email, config.environment)) return reply(409, { error: 'Niezgodna tożsamość techniczna.' }, 'IDENTITY')
      let userId = target.auth_user_id
      if (!userId) {
        stage = 'create_user'
        const created = await admin.auth.admin.createUser({ email: target.email, email_confirm: true,
          app_metadata: { pin_employee_id: String(target.employee_id), pin_provisioning_id: target.provisioning_id } })
        if (created.error) {
          // A concurrent request or interrupted previous invocation may have created the account.
          const retry = await checked(admin.rpc('pin_prepare', args), 'pin_prepare')
          if (retry?.[0]?.email !== target.email || retry?.[0]?.provisioning_id !== target.provisioning_id) return reply(409, { error: 'Niezgodna tożsamość techniczna.' }, 'IDENTITY')
          userId = retry?.[0]?.auth_user_id
          if (!userId) return reply(409, { error: 'Ponów tę samą operację. Konto nie zostało powiązane.' }, 'PROVISION_RETRY')
        } else userId = created.data.user?.id
      }
      if (!userId) return reply(409, { error: 'Ponów tę samą operację.' }, 'PROVISION_RETRY')
      await checked(admin.rpc('pin_finish', { ...args, p_auth_user: userId, p_pin: body.pin, p_operation: body.operation_id }), 'pin_finish')
      return reply(200, { success: true }, 'OK')
    } catch (error) {
      console.info('pin-auth-backend', { requestId, operation, stage, code: error?.backendCode || 'UNEXPECTED' })
      if (operation === 'manage' && error?.safe) {
        const [code, status, message] = error.safe
        return reply(status, { error: message, retry_same_operation: false }, code)
      }
      // Never serialize SDK exceptions: they may carry request bodies or credentials.
      return reply(503, { error: operation === 'login' ? PIN_ERROR : 'Operacja nie powiodła się. Sprawdź uprawnienia i dostępność PIN-u; ponów z tym samym ID operacji.' }, 'BACKEND')
    }
  }
}
