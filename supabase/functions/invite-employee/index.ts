import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

// APP_URL is an exact trusted frontend URL, never a redirect supplied by the client.
const appUrl = Deno.env.get('APP_URL')
const origin = appUrl ? new URL(appUrl).origin : ''
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Vary': 'Origin' }
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async (req: Request) => {
  if (!appUrl) return reply(503, { error: 'Zaproszenia nie są skonfigurowane.' })
  if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403, { error: 'Niedozwolone źródło.' })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return reply(405, { error: 'Wymagany POST.' })
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return reply(401, { error: 'Zaloguj się.' })
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
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
    if (inviteError || !data.user) return reply(409, { error: 'Nie udało się zaprosić. Istniejące konto wymaga ręcznego powiązania przez administratora bazy.' })
    const { error: linkError } = await client.rpc('auth_link_employee', { ...args, p_auth_user_id: data.user.id })
    // Never delete an Auth user as compensation: they may have existed before this request.
    // Unlinked accounts have no application access. See the recovery runbook.
    if (linkError) return reply(409, { error: 'Zaproszenie wysłano, ale konto wymaga ręcznego powiązania. Nie ponawiaj zaproszenia.' })
    return reply(200, { success: true })
  } catch {
    return reply(500, { error: 'Nie udało się obsłużyć zaproszenia.' })
  }
})
