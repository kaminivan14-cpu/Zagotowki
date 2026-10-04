import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/pin-login.js'
import { UAT_URL, validSignature, signedMessage } from '../supabase/functions/_shared/pin-protocol.js'

test('Vercel gateway signs only platform IP, never browser identity or arbitrary XFF', async t => {
  const names=['VERCEL_ENV','VITE_SUPABASE_URL','PIN_PROXY_SECRET','APP_URL']
  const old=Object.fromEntries(names.map(n=>[n,process.env[n]]))
  t.after(()=>names.forEach(n=>{if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n]}))
  process.env.APP_URL='https://preview.test';process.env.VERCEL_ENV='preview';process.env.VITE_SUPABASE_URL=UAT_URL;process.env.PIN_PROXY_SECRET='test-only-proxy-secret-longer-than-32'
  let calls=0
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++
    assert.equal(url,`${UAT_URL}/functions/v1/pin-login`)
    const h=options.headers
    assert.equal(await validSignature(process.env.PIN_PROXY_SECRET,signedMessage(h['x-pin-time'],h['x-pin-id'],h['x-pin-source'],options.body),h['x-pin-signature']),true)
    assert.deepEqual(JSON.parse(options.body),{pin:'0001'})
    assert.equal(JSON.stringify(h).includes('192.0.2.1'),false)
    return Response.json({access_token:'test-access',refresh_token:'test-refresh'})
  })
  const res={setHeader(){},status(n){this.code=n;return this},json(v){this.body=v}}
  const req={method:'POST',headers:{'x-forwarded-for':'192.0.2.99'},body:{pin:'0001'}}
  await handler(req,res);assert.equal(res.code,403);assert.equal(calls,0)
  req.headers['x-vercel-forwarded-for']='192.0.2.1'
  await handler(req,res);assert.equal(res.code,200);assert.equal(calls,1)
  process.env.VERCEL_ENV='production'
  await handler(req,res);assert.equal(res.code,503);assert.equal(calls,1)
})

test('production gateway uses only PROD, accepts legacy strings and refuses foreign Origin',async t=>{
 const {PROD_URL}=await import('../supabase/functions/_shared/pin-protocol.js')
 const names=['VERCEL_ENV','VITE_SUPABASE_URL','PIN_PROXY_SECRET','APP_URL'],old=Object.fromEntries(names.map(n=>[n,process.env[n]]))
 t.after(()=>names.forEach(n=>{if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n]}))
 process.env.VERCEL_ENV='production';process.env.VITE_SUPABASE_URL=PROD_URL
 process.env.PIN_PROXY_SECRET='test-only-production-proxy-secret';process.env.APP_URL='https://production.test'
 let calls=0
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls++;assert.equal(url,`${PROD_URL}/functions/v1/pin-login`)
  assert.deepEqual(JSON.parse(options.body),{pin:'00000001'})
  return Response.json({access_token:'test-access',refresh_token:'test-refresh'})
 })
 const res={setHeader(){},status(n){this.code=n;return this},json(v){this.body=v}}
 const req={method:'POST',headers:{'x-vercel-forwarded-for':'192.0.2.1',origin:'https://foreign.test'},body:{pin:'00000001'}}
 await handler(req,res);assert.equal(res.code,403);assert.equal(calls,0)
 req.headers.origin='https://production.test';await handler(req,res);assert.equal(res.code,200);assert.equal(calls,1)
 process.env.VITE_SUPABASE_URL=UAT_URL;await handler(req,res);assert.equal(res.code,503);assert.equal(calls,1)
})

test('temporary config diagnostics expose only booleans and preserve fail-closed response', async t => {
  const { PROD_URL } = await import('../supabase/functions/_shared/pin-protocol.js')
  const baseline = { VERCEL_ENV: 'production', VITE_SUPABASE_URL: PROD_URL,
    APP_URL: 'https://zagotowki.vercel.app', PIN_PROXY_SECRET: 'synthetic-secret-not-for-output-64'.repeat(2) }
  const old = Object.fromEntries(Object.keys(baseline).map(n => [n, process.env[n]]))
  t.after(() => Object.keys(old).forEach(n => {
    if (old[n] === undefined) delete process.env[n]; else process.env[n] = old[n]
  }))
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args))
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected fetch') })
  const req = { method: 'GET', headers: {}, body: { pin: 'never-log-body' } }
  const res = { setHeader() {}, status(n) { this.code = n; return this }, json(v) { this.body = v } }
  const cases = [
    ['VERCEL_ENV', undefined, 'VERCEL_ENV_PRESENT'],
    ['VERCEL_ENV', 'unknown', 'VERCEL_ENV_SUPPORTED'],
    ['VITE_SUPABASE_URL', undefined, 'SUPABASE_URL_PRESENT'],
    ['VITE_SUPABASE_URL', UAT_URL, 'PROD_REF_MATCH'],
    ['APP_URL', undefined, 'APP_URL_PRESENT'],
    ['APP_URL', 'invalid', 'APP_URL_PARSE_OK'],
    ['APP_URL', 'http://zagotowki.vercel.app', 'APP_URL_HTTPS'],
    ['APP_URL', 'https://user:password@zagotowki.vercel.app', 'APP_URL_NO_CREDENTIALS'],
    ['APP_URL', 'https://zagotowki.vercel.app/?secret=hidden', 'APP_URL_NO_QUERY_HASH'],
    ['APP_URL', 'https://zagotowki.vercel.app/path', 'APP_URL_ROOT_PATH'],
    ['PIN_PROXY_SECRET', undefined, 'PIN_PROXY_SECRET_PRESENT'],
    ['PIN_PROXY_SECRET', 'short-secret', 'PIN_PROXY_SECRET_LENGTH_OK'],
  ]
  for (const [name, value, check] of cases) {
    Object.assign(process.env, baseline)
    if (value === undefined) delete process.env[name]; else process.env[name] = value
    logs.length = 0
    await handler(req, res)
    assert.equal(res.code, 503)
    assert.deepEqual(res.body, { error: 'Logowanie PIN niedostępne.' })
    assert.equal(logs.length, 1)
    assert.equal(logs[0][0], '[pin-config-diag]')
    assert.equal(logs[0][1][check], false)
    assert.ok(Object.values(logs[0][1]).every(v => typeof v === 'boolean'))
    assert.equal(logs[0].length, 2)
  }
  Object.assign(process.env, baseline)
  logs.length = 0
  await handler(req, res)
  assert.equal(res.code, 405)
  assert.equal(logs.length, 0)
  delete process.env.PIN_PROXY_SECRET
  t.mock.method(console, 'info', () => { throw new Error('Logger unavailable') })
  await handler(req, res)
  assert.equal(res.code, 503)
  assert.equal(calls, 0)
})

test('UAT proxy accepts only listed preview origins and still signs the request',async t=>{
 const names=['VERCEL_ENV','VITE_SUPABASE_URL','PIN_PROXY_SECRET','APP_URL','PIN_MANAGEMENT_ORIGINS'],old=Object.fromEntries(names.map(n=>[n,process.env[n]]))
 t.after(()=>names.forEach(n=>{if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n]}))
 Object.assign(process.env,{VERCEL_ENV:'preview',VITE_SUPABASE_URL:UAT_URL,APP_URL:'https://old-preview.test',PIN_PROXY_SECRET:'test-only-secret-at-least-32-characters',PIN_MANAGEMENT_ORIGINS:'https://orders-preview.test'})
 let calls=0
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls++;assert.equal(url,`${UAT_URL}/functions/v1/pin-login`)
  const h=options.headers
  assert.equal(await validSignature(process.env.PIN_PROXY_SECRET,signedMessage(h['x-pin-time'],h['x-pin-id'],h['x-pin-source'],options.body),h['x-pin-signature']),true)
  return Response.json({access_token:'test',refresh_token:'test'})
 })
 const res={setHeader(){},status(n){this.code=n;return this},json(v){this.body=v}}
 const req={method:'POST',headers:{origin:'https://orders-preview.test','x-vercel-forwarded-for':'192.0.2.1'},body:{pin:'0091'}}
 await handler(req,res);assert.equal(res.code,200);assert.equal(calls,1)
 req.headers.origin='https://orders-preview.test.attacker.invalid'
 await handler(req,res);assert.equal(res.code,403);assert.equal(calls,1)
 const {PROD_URL}=await import('../supabase/functions/_shared/pin-protocol.js')
 Object.assign(process.env,{VERCEL_ENV:'production',VITE_SUPABASE_URL:PROD_URL})
 req.headers.origin='https://orders-preview.test'
 await handler(req,res);assert.equal(res.code,403);assert.equal(calls,1)
})
