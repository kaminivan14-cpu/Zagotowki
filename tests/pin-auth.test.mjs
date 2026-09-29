import test from 'node:test'
import assert from 'node:assert/strict'
import { pinHandler } from '../supabase/functions/_shared/pin-handlers.js'
import { UAT_URL, PIN_ERROR, hmac, signedMessage, validPin, validPinEmail, validSignature } from '../supabase/functions/_shared/pin-protocol.js'

const secret = 'test-only-proxy-secret-not-a-deployed-credential'
const uid = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const row = { employee_id: 2, auth_user_id: uid, email: `${uid}@pin.uat.invalid`, provisioning_id: id }
const ok = data => ({ data, error: null })
async function request(body = { pin: '0001' }, overrides = {}) {
  const raw = JSON.stringify(body), time = String(Date.now()), attempt = crypto.randomUUID(), source = await hmac(secret, 'source:test')
  return new Request('https://edge.test/pin-login', { method: 'POST', body: raw, headers: {
    'x-pin-time': time, 'x-pin-id': attempt, 'x-pin-source': source,
    'x-pin-signature': await hmac(secret, signedMessage(time, attempt, source, raw)), ...overrides,
  } })
}
function fixture(t, settings = {}) {
  const calls = [], logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  const env = name => ({ SUPABASE_URL: UAT_URL, SUPABASE_SERVICE_ROLE_KEY: 'server-test-key', SUPABASE_ANON_KEY: 'public-test-key',
    PIN_PROXY_SECRET: secret, APP_URL: 'https://preview.test' })[name]
  const targetRow = { ...row, email: settings.email ?? row.email }
  const account = { id: uid, email: targetRow.email, app_metadata: { pin_employee_id: '2' } }
  const admin = {
    rpc: async (name, args) => {
      calls.push([name, args])
      if (settings.rpcError) return { error: { message: 'private' } }
      if (name === 'pin_reserve') return ok(settings.allowed ?? true)
      if (name === 'pin_verify') return ok(settings.denied ? [] : [targetRow])
      if (name === 'pin_confirm') return ok(settings.current ?? true)
      if (name === 'pin_prepare') return ok([{ ...targetRow, auth_user_id: settings.newAccount ? null : uid }])
      return ok(null)
    },
    auth: { getUser: async () => ok({ user: { id: uid } }), admin: {
      getUserById: async () => ok({ user: account }),
      generateLink: async args => { calls.push(['generateLink', args]); return ok({ user: account, properties: { hashed_token: 'private-magic-token' } }) },
      signOut: async () => { calls.push(['revoke']); return ok(null) },
      createUser: async args => { calls.push(['createUser', args]); return ok({ user: account }) },
    } },
  }
  const createClient = (url, key, options) => {
    calls.push(['client', { url, key, options }])
    if (key === 'server-test-key') return admin
    return { auth: { verifyOtp: async args => {
      calls.push(['verifyOtp', args])
      return ok({ session: { user: { id: settings.wrongUid ? id : uid }, access_token: 'private-access', refresh_token: 'private-refresh' } })
    } } }
  }
  return { deps: { createClient, env }, calls, logs }
}

for (const pin of ['0001','123','12345','abcd',1234,null]) test(`PIN string validation ${typeof pin}:${String(pin).length}`, () => {
  assert.equal(validPin(pin), pin === '0001')
})
test('signed PIN -> service verification -> real SDK API sequence -> minimal session', async t => {
  const f = fixture(t)
  const response = await pinHandler('login', f.deps)(await request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { access_token: 'private-access', refresh_token: 'private-refresh' })
  assert.equal(f.calls.find(([name]) => name === 'pin_verify')[1].p_pin, '0001')
  assert.deepEqual(f.calls.filter(([name]) => ['generateLink','verifyOtp'].includes(name)).map(([name]) => name), ['generateLink','verifyOtp'])
  const clients = f.calls.filter(([name]) => name === 'client')
  assert.equal(clients.length, 2)
  assert.equal(clients[1][1].options.auth.persistSession, false)
  const logs = JSON.stringify(f.logs)
  for (const value of ['0001','server-test-key','private-magic-token','private-access','private-refresh']) assert.equal(logs.includes(value), false)
})
for (const body of [{ pin:'0001', employee_id:1 },{ pin:'0001', role:'administrator' },{ pin:'0001',location_id:2 },{ pin:'123' },{ pin:1234 }]) {
  test('reject extra identity/role/location or invalid PIN before verifier', async t => {
    const f = fixture(t)
    assert.equal((await pinHandler('login', f.deps)(await request(body))).status, 400)
    assert.equal(f.calls.some(([name]) => name === 'pin_verify'), false)
  })
}
for (const [settings, status] of [[{ allowed:false },429],[{ denied:true },401],[{ current:false },401],[{ wrongUid:true },401],[{ rpcError:true },503]]) {
  test(`fail closed ${JSON.stringify(settings)}`, async t => {
    const f = fixture(t, settings)
    const response = await pinHandler('login', f.deps)(await request())
    assert.equal(response.status, status)
    if(status !== 429) assert.equal((await response.json()).error, PIN_ERROR)
    if(settings.allowed === false) assert.equal(f.calls.some(([name]) => name === 'pin_verify'), false)
  })
}
test('direct spoofed source cannot bypass trusted proxy', async t => {
  const f = fixture(t)
  assert.equal((await pinHandler('login', f.deps)(await request(undefined, { 'x-pin-signature':'0'.repeat(64), 'x-forwarded-for':'1.2.3.4' }))).status,403)
  assert.equal(f.calls.some(([name]) => name === 'pin_reserve'),false)
  assert.equal(await validSignature(secret,'different-body',await hmac(secret,'body')),false)
})
test('management requires bearer, provisions no password and rechecks via SQL finish', async t => {
  const f = fixture(t, { newAccount:true }), handler=pinHandler('manage',f.deps)
  const body=JSON.stringify({ employee_id:2,pin:'0001',operation_id:id })
  assert.equal((await handler(new Request('https://edge.test',{method:'POST',body}))).status,401)
  const response=await handler(new Request('https://edge.test',{method:'POST',body,headers:{authorization:'Bearer private-admin'}}))
  assert.equal(response.status,200)
  const args=f.calls.find(([name])=>name==='createUser')[1]
  assert.equal('password' in args,false)
  assert.equal(args.email_confirm,true)
  assert.equal(f.calls.find(([name])=>name==='pin_finish')[1].p_actor,uid)
})

test('installed Supabase SDK parses generateLink and verifies OTP using separate clients (mock transport only)', async t => {
  const { createClient } = await import('@supabase/supabase-js')
  const f=fixture(t), paths=[]
  const user={id:uid,email:row.email,app_metadata:{pin_employee_id:'2'},aud:'authenticated',role:'authenticated'}
  const transport=async(input,options)=>{
    const path=new URL(input).pathname;paths.push(path)
    let data
    if(path==='/rest/v1/rpc/pin_reserve'||path==='/rest/v1/rpc/pin_confirm') data=true
    else if(path==='/rest/v1/rpc/pin_verify') data=[row]
    else if(path===`/auth/v1/admin/users/${uid}`) data={user}
    else if(path==='/auth/v1/admin/generate_link') {
      assert.deepEqual(JSON.parse(options.body),{type:'magiclink',email:row.email})
      data={...user,hashed_token:'test-only-hash',verification_type:'magiclink'}
    } else if(path==='/auth/v1/verify') {
      assert.equal(new Headers(options.headers).get('apikey'),'public-test-key')
      const body=JSON.parse(options.body)
      assert.equal(body.type,'email');assert.equal(body.token_hash,'test-only-hash')
      data={access_token:'test-only-access',refresh_token:'test-only-refresh',expires_in:3600,token_type:'bearer',user}
    } else throw new Error('unexpected mock path')
    return Response.json(data)
  }
  const handler=pinHandler('login',{env:f.deps.env,createClient:(url,key,opts)=>createClient(url,key,{...opts,global:{fetch:transport}})})
  const response=await handler(await request())
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{access_token:'test-only-access',refresh_token:'test-only-refresh'})
  assert.ok(paths.includes('/auth/v1/admin/generate_link'))
  assert.ok(paths.includes('/auth/v1/verify'))
})

test('provisioning retry uses previously recovered identity without creating a second user', async t => {
  const f=fixture(t)
  const body=JSON.stringify({employee_id:2,pin:'0001',operation_id:id})
  for(let i=0;i<2;i++) assert.equal((await pinHandler('manage',f.deps)(new Request('https://edge.test',{
    method:'POST',body,headers:{authorization:'Bearer test-only-admin'},
  }))).status,200)
  assert.equal(f.calls.some(([name])=>name==='createUser'),false)
  const ops=f.calls.filter(([name])=>name==='pin_finish').map(([,args])=>args.p_operation)
  assert.deepEqual(ops,[id,id])
})

test('technical emails accept only UUID at the fixed reserved domain', () => {
  assert.equal(validPinEmail(`${uid}@pin.uat.invalid`), true)
  for (const value of [`${uid}@example.com`, `${uid}@pin.uat.invalid.example.com`, 'name@pin.uat.invalid', `${uid}@pin.uat.invalid\n`, null]) {
    assert.equal(validPinEmail(value), false)
  }
})
for (const operation of ['login', 'manage']) test(`${operation} rejects other domains before Auth account/link operations`, async t => {
  const f = fixture(t, { email: `${uid}@example.com`, newAccount: true })
  const req = operation === 'login' ? await request() : new Request('https://edge.test', {
    method: 'POST', headers: { authorization: 'Bearer test-only-admin' },
    body: JSON.stringify({ employee_id: 2, pin: '0001', operation_id: id }),
  })
  const response = await pinHandler(operation, f.deps)(req)
  assert.equal(response.status, operation === 'login' ? 401 : 409)
  assert.equal(f.calls.some(([name]) => ['createUser','generateLink','verifyOtp','pin_finish'].includes(name)), false)
  for (const [name, args] of f.calls) if (name === 'pin_prepare') assert.deepEqual(Object.keys(args).sort(), ['p_actor','p_employee'])
})

test('migration email constraint accepts only UUID@pin.uat.invalid (isolated table)', async t => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { readFile } = await import('node:fs/promises')
  const sql = await readFile(new URL('../supabase/migrations/202609290001_employee_pin.sql', import.meta.url), 'utf8')
  const table = sql.match(/CREATE TABLE app_private\.pin_accounts \([\s\S]*?\n\);/)[0]
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec('CREATE SCHEMA auth; CREATE SCHEMA app_private; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public."Employees"(id bigint PRIMARY KEY); INSERT INTO public."Employees" VALUES(1),(2);')
  await db.exec(table)
  await db.query('INSERT INTO app_private.pin_accounts(employee_id,email) VALUES(1,$1)', [`${uid}@pin.uat.invalid`])
  for (const email of [`${id}@example.com`, `${id}@pin.uat.invalid.example.com`, 'name@pin.uat.invalid', `${id}@pin.uat.invalid\n`]) {
    await assert.rejects(db.query('INSERT INTO app_private.pin_accounts(employee_id,email) VALUES(2,$1)', [email]), e => e.code === '23514')
  }
  assert.doesNotMatch(sql, /p_domain|pin_prepare\(uuid,bigint,text\)/)
  assert.match(sql, /gen_random_uuid\(\)::text\|\|'@pin\.uat\.invalid'/)
})
