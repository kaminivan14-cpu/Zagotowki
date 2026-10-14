import test from 'node:test'
import assert from 'node:assert/strict'
import { AwsClient } from 'aws4fetch'
import { auditDatabase, uid } from './helpers/audit-db.mjs'
import { createHandler } from '../supabase/functions/audit-photos/handler.mjs'
import { createR2 } from '../supabase/functions/audit-photos/r2.mjs'
import { jpegSize,sha256 } from '../supabase/functions/audit-photos/jpeg.mjs'
const jpeg=Uint8Array.from([255,216,255,192,0,11,8,0,20,0,30,1,1,17,0,255,217])
test('R2 migration and Edge: authorization, immutable completion, conflict, bytes and cleanup',async t=>{
 const db=await auditDatabase({r2:true});t.after(()=>db.close())
 const as=async(n,role='authenticated')=>db.exec(`RESET ROLE; SET request.jwt.claim.sub='${n?uid(n):''}'; SET ROLE ${role}`)
 const command=async(action,args)=>(await db.query('SELECT public.audit_command($1,$2::jsonb,$3::uuid) AS value',[action,JSON.stringify(args),crypto.randomUUID()])).rows[0].value
 const service=async args=>(await db.query('SELECT public.audit_photo_service($1,$2::uuid,$3::uuid,$4,$5::jsonb) AS value',[args.p_action,args.p_actor,args.p_photo,args.p_version,JSON.stringify(args.p_verified)])).rows[0].value
 await as(1)
 const template=await command('template_save',{id:crypto.randomUUID(),name:'R2',questions:['Q']})
 let a=await command('start',{template_id:template.id})
 const metadata={mime:'image/jpeg',bytes:jpeg.length,width:30,height:20,sha256:await sha256(jpeg)}
 const reserve=()=>({id:a.id,version:a.version,question:0,photo_id:crypto.randomUUID(),...metadata})
 await assert.rejects(command('photo_reserve',{...reserve(),mime:'image/png'}),/AUDIT_PHOTO_INVALID/)
 await assert.rejects(command('photo_reserve',{...reserve(),width:1921}),/AUDIT_PHOTO_INVALID/)
 await assert.rejects(command('photo_reserve',{...reserve(),sha256:null}),/AUDIT_PHOTO_INVALID/)
 a=await command('photo_reserve',reserve());const photo=a.photos[0]
 await assert.rejects(command('photo_ready',{id:a.id,version:a.version,photo_id:photo.id}),/AUDIT_USE_PHOTO_SERVICE/)
 const args={p_action:'ready',p_actor:uid(1),p_photo:photo.id,p_version:a.version,p_verified:metadata}
 await assert.rejects(service(args),/permission denied/)
 await as(null,'anon');await assert.rejects(service(args),/permission denied/)
 let bytes=jpeg,uploads=0,deletes=0
 const handler=createHandler({origins:['https://uat.example'],authenticate:async token=>token==='owner'?uid(1):token==='other'?uid(2):token==='inactive'?uid(3):null,
  rpc:async args=>{await as(null,'service_role');return service(args)},
  r2:{putUrl:async()=>{uploads++;return {url:'https://r2.example/upload'}},getUrl:async()=> 'https://r2.example/read',inspect:async()=>bytes,remove:async()=>{deletes++}}})
 const call=async(action,{token='owner',version=a.version,origin='https://uat.example',...extra}={})=>{
  const res=await handler(new Request('https://edge.example',{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action,photo_id:photo.id,version,...extra})}))
  return {status:res.status,...await res.json()}
 }
 assert.equal((await call('upload',{token:'bad'})).status,401)
 assert.equal((await call('upload',{origin:'https://evil.example'})).status,403)
 assert.equal((await call('upload',{token:'inactive'})).status,403)
 assert.equal((await call('upload',{token:'other'})).status,403)
 assert.equal((await call('upload',{version:a.version-1})).status,409)
 assert.equal((await call('download')).status,400)
 assert.equal((await call('upload')).status,200);assert.equal(uploads,1)
 bytes=jpeg.slice();bytes[14]=1
 assert.equal((await call('complete')).status,400)
 bytes=jpeg
 const ready=await call('complete');assert.equal(ready.status,200);assert.equal(ready.audit.photos[0].state,'ready');assert.equal(ready.audit.version,a.version+1)
 assert.equal((await call('complete')).audit.version,ready.audit.version)
 assert.equal((await call('upload')).audit.version,ready.audit.version);assert.equal(uploads,1)
 assert.equal((await call('download',{token:'other'})).status,200)
 await as(1);a=await command('save',{id:a.id,version:ready.audit.version,location_id:1,answers:[{answer:'yes',comment:''}]})
 a=await command('complete',{id:a.id,version:a.version})
 assert.equal((await call('upload')).audit.status,'completed');assert.equal(uploads,1)
 assert.equal((await call('cleanup')).removed,0)
 await as(1);a=await command('start',{template_id:template.id});a=await command('photo_reserve',reserve())
 const tombstone=a.photos[0];await command('delete',{id:a.id,version:a.version})
 assert.equal((await call('upload',{photo_id:tombstone.id})).status,403)
 assert.equal((await call('cleanup',{token:'other'})).removed,0)
 assert.equal((await call('cleanup')).removed,1);assert.equal(deletes,1)
 assert.equal((await call('cleanup')).removed,1);assert.equal(deletes,2)
})
test('R2 signer binds conditional header, type, length and short expiry; inspect checks stored bytes',async()=>{
 const photo={path:`audits/${uid(1)}/${uid(2)}.jpg`,mime:'image/jpeg',bytes:jpeg.length}
 const requests=[]
 const r2=createR2({AwsClient,endpoint:`https://${'a'.repeat(32)}.eu.r2.cloudflarestorage.com`,bucket:'audit-uat',accessKeyId:'test',secretAccessKey:'test',fetcher:async req=>{
  requests.push(req)
  return req.method==='HEAD'?new Response(null,{headers:{'Content-Length':jpeg.length,'Content-Type':'image/jpeg',ETag:'"test"'}}):new Response(jpeg)
 }})
 const signed=await r2.putUrl(photo),url=new URL(signed.url)
 assert.equal(url.searchParams.get('X-Amz-Expires'),'300')
 for(const header of ['content-length','content-type','if-none-match'])assert.ok(url.searchParams.get('X-Amz-SignedHeaders').split(';').includes(header))
 assert.equal(signed.headers['If-None-Match'],'*');assert.equal(signed.headers['Content-Length'],undefined)
 assert.deepEqual(await r2.inspect(photo),jpeg)
 assert.equal(requests[1].headers.get('If-Match'),'"test"')
 await assert.rejects(r2.putUrl({...photo,path:'../other'}),/AUDIT_PHOTO_INVALID/)
 await assert.rejects(r2.inspect({...photo,bytes:1}),/AUDIT_PHOTO_INVALID/)
 assert.deepEqual(jpegSize(jpeg),{width:30,height:20})
 assert.throws(()=>jpegSize(new Uint8Array([255,216,255,217])),/AUDIT_PHOTO_INVALID/)
})
