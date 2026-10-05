// The invitation URL is independent of PIN proxy configuration. No client redirects.
export function invitationHandler({ createClient, env }) {
  const appUrl = env('INVITATION_APP_URL') || env('APP_URL')
  let origin = ''
  try {
    const url = new URL(appUrl)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/') origin = url.origin
  } catch { /* Invalid configuration fails closed. */ }
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Vary': 'Origin' }
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })

  return async req => {
    if (!origin) return reply(503, { error: 'Zaproszenia nie są skonfigurowane.' })
    if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403, { error: 'Niedozwolone źródło.' })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply(405, { error: 'Wymagany POST.' })
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return reply(401, { error: 'Zaloguj się.' })
    try {
      const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: { user }, error: authError } = await client.auth.getUser(token)
      if (authError || !user) return reply(401, { error: 'Sesja jest nieważna.' })
      const { employee_id, email } = await req.json()
      if (!/^\d+$/.test(String(employee_id)) || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return reply(400, { error: 'Nieprawidłowy pracownik lub e-mail.' })
      }
      const args = { p_actor: user.id, p_employee_id: employee_id }
      // Rechecked in the final transaction in case permissions changed while sending the invitation.
      const { error: permissionError } = await client.rpc('auth_link_employee', args)
      if (permissionError) return reply(403, { error: 'Brak uprawnień do zaproszenia.' })
      const redirect = new URL(appUrl)
      redirect.searchParams.set('auth', 'password')
      const { data, error: inviteError } = await client.auth.admin.inviteUserByEmail(email.trim(), { redirectTo: redirect.href })
      if (inviteError || !data?.user) {
        // Only a documented Auth conflict means an existing account. Never link by email.
        if (['email_exists', 'user_already_exists'].includes(inviteError?.code)) {
          return reply(409, { code: 'AUTH_ACCOUNT_EXISTS', error: 'Konto Auth już istnieje. Administrator bazy musi zweryfikować tożsamość i powiązania przed połączeniem z pracownikiem.' })
        }
        if (inviteError?.code === 'email_address_not_authorized') {
          return reply(503, { code: 'INVITE_EMAIL_NOT_AUTHORIZED', error: 'Dostawca poczty nie dopuszcza tego odbiorcy. Administrator UAT musi skonfigurować SMTP.' })
        }
        if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(inviteError?.code)) {
          return reply(429, { code: 'INVITE_RATE_LIMIT', error: 'Limit wysyłania zaproszeń. Spróbuj ponownie później.' })
        }
        return reply(502, { code: 'INVITE_PROVIDER_FAILED', error: 'Usługa Auth nie potwierdziła wysłania zaproszenia. Administrator powinien sprawdzić logi Auth i konfigurację SMTP.' })
      }
      const { error: linkError } = await client.rpc('auth_link_employee', { ...args, p_auth_user_id: data.user.id })
      // Never delete an Auth user as compensation: they may have existed before this request.
      // Unlinked accounts have no application access. See the recovery runbook.
      if (linkError) return reply(409, { error: 'Zaproszenie wysłano, ale konto wymaga ręcznego powiązania. Nie ponawiaj zaproszenia.' })
      return reply(200, { success: true })
    } catch {
      return reply(500, { error: 'Nie udało się obsłużyć zaproszenia.' })
    }
  }
}
