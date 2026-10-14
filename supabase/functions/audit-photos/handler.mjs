import {jpegSize,sha256} from './jpeg.mjs'
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
export function createHandler({origins,authenticate,rpc,r2}){
 const allowed=new Set(origins)
 return async req=>{
  const origin=req.headers.get('origin')||''
  const headers={'Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS',...(allowed.has(origin)?{'Access-Control-Allow-Origin':origin}:{})}
  const reply=(status,body)=>Response.json(body,{status,headers})
  if(!allowed.size||!r2)return reply(503,{error:'Magazyn zdjęć nie jest jeszcze skonfigurowany.'})
  if(origin&&!allowed.has(origin))return reply(403,{error:'Niedozwolone źródło żądania.'})
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(req.method!=='POST')return reply(405,{error:'Wymagane żądanie POST.'})
  try{
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
   const actor=token&&await authenticate(token)
   if(!uuid(actor))return reply(401,{error:'Zaloguj się ponownie.'})
   if(!req.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'Nieprawidłowy format żądania.'})
   const reader=req.body?.getReader();let text='',length=0
   if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();return reply(413,{error:'Żądanie jest za duże.'})}text+=new TextDecoder().decode(value)}
   let args;try{args=JSON.parse(text)}catch{return reply(400,{error:'Nieprawidłowe żądanie.'})}
   if(!args||typeof args!=='object'||Array.isArray(args))return reply(400,{error:'Nieprawidłowe żądanie.'})
   const {action,photo_id,version}=args
   if(!['upload','complete','download','cleanup'].includes(action))return reply(400,{error:'Nieprawidłowa operacja.'})
   if(action!=='cleanup'&&!uuid(photo_id))return reply(400,{error:'Nieprawidłowe zdjęcie.'})
   if(['upload','complete'].includes(action)&&(!Number.isSafeInteger(version)||version<1))return reply(400,{error:'Nieprawidłowa wersja audytu.'})
   const call=(p_action,p_photo=photo_id,p_verified=null)=>rpc({p_action,p_actor:actor,p_photo:p_photo||null,p_version:version||null,p_verified})
   if(action==='cleanup'){
    const photos=await call('cleanup_list',null)
    // Sequential, bounded work: tombstones retained for recovery and late uploads.
    for(const photo of photos){await call('cleanup_check',photo.id);await r2.remove(photo);await call('cleanup_done',photo.id)}
    return reply(200,{removed:photos.length})
   }
   if(action==='download')return reply(200,{url:await r2.getUrl(await call('download'))})
   const context=await call(action==='upload'?'upload':'check')
   if(context.audit)return reply(200,{audit:context.audit})
   const photo=context.photo
   if(action==='upload')return reply(200,await r2.putUrl(photo))
   const bytes=await r2.inspect(photo),dimensions=jpegSize(bytes),hash=await sha256(bytes)
   if(hash!==photo.sha256||dimensions.width!==photo.width||dimensions.height!==photo.height)throw Error('AUDIT_PHOTO_INVALID')
   return reply(200,await call('ready',photo.id,{...dimensions,sha256:hash,bytes:bytes.length,mime:'image/jpeg'}))
  }catch(error){
   const code=error?.message||''
   const known=['AUDIT_CONFLICT','AUDIT_READ_ONLY','AUDIT_DENIED','AUDIT_NOT_FOUND','AUDIT_PHOTO_INVALID','AUDIT_PHOTO_MISSING'].find(x=>code.includes(x))
   return reply(known==='AUDIT_CONFLICT'?409:known==='AUDIT_READ_ONLY'||known==='AUDIT_DENIED'?403:known?400:503,{error:known||'Nie udało się połączyć z magazynem zdjęć. Ponów operację.'})
  }
 }
}
