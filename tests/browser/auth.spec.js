import { test, expect } from '@playwright/test'

const user = { id: '00000000-0000-0000-0000-000000000001', email: 'cook@example.test', aud: 'authenticated', role: 'authenticated' }
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url')
  return { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: user.id, exp, role: 'authenticated' })}.test`, refresh_token: 'test-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user }
}
async function setup(page, { loggedIn = false, legacy = false, active = true } = {}) {
  const calls = []
  await page.addInitScript(({ saved, legacy }) => {
    if (saved && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('sb-auth-tests-auth-token', JSON.stringify(saved)); sessionStorage.setItem('seeded', 'true')
    }
    if (legacy) sessionStorage.setItem('pracownik', JSON.stringify({ id: 1, role: 'administrator' }))
  }, { saved: loggedIn ? session() : null, legacy })
  await page.routeWebSocket(/.*/, socket => socket.close())
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:5173') return route.continue()
    if (url.hostname !== 'auth-tests.supabase.co') return route.abort()
    calls.push({ path: url.pathname, search: url.search, method: req.method(), body: req.postDataJSON() })
    let body
    if (url.pathname === '/auth/v1/token') body = session()
    else if (url.pathname === '/auth/v1/user') body = user
    else if (['/auth/v1/logout', '/auth/v1/recover'].includes(url.pathname)) body = {}
    else if (url.pathname === '/rest/v1/rpc/auth_employee_profile') body = active ? [{ id: 1, auth_user_id: user.id, name: 'Kucharz testowy', role: 'employee', location_id: 1, active: true }] : []
    else if (url.pathname === '/rest/v1/Locations') body = [{ id: 1, name: 'Lokal A', active: true }]
    else if (url.pathname === '/rest/v1/Products') body = []
    else throw new Error(`Unexpected request: ${url.pathname}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return calls
}

test('legacy PIN state grants no access and triggers no business reads', async ({ page }) => {
  const calls = await setup(page, { legacy: true })
  await page.goto('/')
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible()
  expect(calls.some(c => c.path.startsWith('/rest/'))).toBe(false)
})
test('email login persists on reload; logout removes the previous employee', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/')
  await page.getByLabel('E-mail', { exact: true }).fill(user.email)
  await page.getByLabel('Hasło', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Zaloguj', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lokal A' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Kucharz testowy', { exact: false })).toBeVisible()
  expect(calls.filter(c => c.path === '/auth/v1/token')).toHaveLength(1)
  await page.getByRole('button', { name: 'Wyloguj', exact: true }).click()
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible()
  await expect(page.getByText('Kucharz testowy', { exact: false })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible()
})
test('inactive or unlinked accounts never mount the business application', async ({ page }) => {
  const calls = await setup(page, { loggedIn: true, active: false })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Brak dostępu')
  expect(calls.some(c => c.path.endsWith('/Products') || c.path.endsWith('/Locations'))).toBe(false)
})
test('password reset returns a generic response and a fixed app redirect', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Nie pamiętam hasła' }).click()
  await page.getByLabel('E-mail', { exact: true }).fill(user.email)
  await page.getByRole('button', { name: 'Wyślij link' }).click()
  await expect(page.getByRole('status')).toContainText('Jeśli konto istnieje')
  expect(calls.some(c => c.path === '/auth/v1/recover' && c.body.email === user.email)).toBe(true)
  const request = calls.find(c => c.path === '/auth/v1/recover')
  expect(new URLSearchParams(request.search).get('redirect_to')).toBe('http://127.0.0.1:5173/?auth=password')
})
test('invitation/recovery requires matching passwords and saves through Auth', async ({ page }) => {
  const calls = await setup(page, { loggedIn: true })
  await page.goto('/?auth=password')
  await page.getByLabel('Nowe hasło', { exact: true }).fill('new-password-123')
  await page.getByLabel('Powtórz hasło').fill('different-password')
  await page.getByRole('button', { name: 'Zapisz hasło' }).click()
  await expect(page.getByRole('status')).toContainText('Hasła muszą być takie same')
  await page.getByLabel('Powtórz hasło').fill('new-password-123')
  await page.getByRole('button', { name: 'Zapisz hasło' }).click()
  await expect(page.getByRole('heading', { name: 'Hasło zostało zmienione' })).toBeVisible()
  await page.getByRole('button', { name: 'Przejdź do aplikacji' }).click()
  await expect(page.getByRole('button', { name: 'Lokal A' })).toBeVisible()
  expect(calls.some(c => c.path === '/auth/v1/user' && c.method === 'PUT' && c.body.password === 'new-password-123')).toBe(true)
})

function recoveryUrl() {
  const saved = session()
  return '/#' + new URLSearchParams({ access_token: saved.access_token, refresh_token: saved.refresh_token,
    expires_in: String(saved.expires_in), token_type: 'bearer', type: 'recovery' })
}

test('real SDK recovery hash without auth query opens password form and survives reload', async ({ page }) => {
  const calls = await setup(page)
  await page.goto(recoveryUrl())
  await expect(page.getByRole('heading', { name: 'Ustaw nowe hasło' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zapisz hasło' })).toBeEnabled()
  await expect(page).toHaveURL(/\?auth=password#?$/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Zapisz hasło' })).toBeEnabled()
  await page.getByLabel('Nowe hasło', { exact: true }).fill('recovered-password-123')
  await page.getByLabel('Powtórz hasło').fill('recovered-password-123')
  await page.getByRole('button', { name: 'Zapisz hasło' }).click()
  await expect(page.getByRole('status')).toContainText('Nowe hasło zostało zapisane')
  expect(calls.some(c => c.path === '/auth/v1/user' && c.method === 'PUT' && c.body.password === 'recovered-password-123')).toBe(true)
  await page.getByRole('button', { name: 'Wróć do logowania' }).click()
  await expect(page.getByRole('button', { name: 'Zaloguj', exact: true })).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:5173/')
})

test('expired callback blocks password change even with an existing session', async ({ page }) => {
  const calls = await setup(page, { loggedIn: true })
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Expired')
  await expect(page.getByRole('alert')).toContainText('Link jest nieważny lub wygasł')
  await expect(page.getByRole('button', { name: 'Zapisz hasło' })).toBeDisabled()
  expect(calls.some(c => c.method === 'PUT')).toBe(false)
  await page.getByRole('button', { name: 'Wróć do logowania' }).click()
  await expect(page.getByRole('button', { name: 'Nie pamiętam hasła' })).toBeVisible()
})

test('recovery is retained when SDK consumes callback before React subscribes', async ({ page }) => {
  await setup(page)
  await page.route('**/src/main.jsx', async route => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({ response, body: `import { supabase as recoveryTestClient } from '/src/supabase.js';
      await recoveryTestClient.auth.initialize();
      await new Promise(resolve => setTimeout(resolve, 100));
      ${source}` })
  })
  await page.goto(recoveryUrl())
  await expect(page.getByRole('heading', { name: 'Ustaw nowe hasło' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zapisz hasło' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Zaloguj', exact: true })).toHaveCount(0)
})

test('missing recovery session and invalid token cannot save passwords', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/?auth=password')
  await expect(page.getByRole('alert')).toContainText('Link jest nieważny lub wygasł')
  await expect(page.getByRole('button', { name: 'Zapisz hasło' })).toBeDisabled()
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'bad_jwt', message: 'Invalid JWT' }) }))
  await page.goto(recoveryUrl())
  await expect(page.getByRole('alert')).toContainText('Link jest nieważny lub wygasł')
  await expect(page.getByRole('button', { name: 'Zapisz hasło' })).toBeDisabled()
  expect(calls.some(c => c.method === 'PUT')).toBe(false)
})

test('password update failure stays in recovery and permits retry', async ({ page }) => {
  await setup(page, { loggedIn: true })
  let fail = true
  await page.route('**/auth/v1/user', route => route.fulfill({ status: fail ? 422 : 200,
    contentType: 'application/json', body: JSON.stringify(fail ? { code: 'weak_password', message: 'Weak password' } : user) }))
  await page.goto('/?auth=password')
  await page.getByLabel('Nowe hasło', { exact: true }).fill('new-password-123')
  await page.getByLabel('Powtórz hasło').fill('new-password-123')
  await page.getByRole('button', { name: 'Zapisz hasło' }).click()
  await expect(page.getByRole('status')).toContainText('Nie udało się ustawić hasła')
  await expect(page.getByRole('heading', { name: 'Ustaw nowe hasło' })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Zapisz hasło' }).click()
  await expect(page.getByRole('heading', { name: 'Hasło zostało zmienione' })).toBeVisible()
})

test('recovery email network error is actionable', async ({ page }) => {
  await setup(page)
  await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 429,
    contentType: 'application/json', body: JSON.stringify({ message: 'Rate limit exceeded' }) }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Nie pamiętam hasła' }).click()
  await page.getByLabel('E-mail', { exact: true }).fill(user.email)
  await page.getByRole('button', { name: 'Wyślij link' }).click()
  await expect(page.getByRole('status')).toContainText('Nie udało się wysłać prośby')
  await expect(page.getByRole('button', { name: 'Wyślij link' })).toBeEnabled()
})
