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
