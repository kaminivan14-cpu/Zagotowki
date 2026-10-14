import { AwsClient } from 'npm:aws4fetch@1.0.20'
import { createHandler } from './handler.mjs'
import { createR2 } from './r2.mjs'
const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
// Explicit environment binding prevents accidentally running UAT code against PROD.
const target=Deno.env.get('AUDIT_PHOTOS_PROJECT_REF')||''
const origins=(Deno.env.get('AUDIT_PHOTOS_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)
let r2
try {
 if(!target||url!==`https://${target}.supabase.co`||!key||!origins.length||origins.some(x=>{
  const u=new URL(x);return u.origin!==x||(u.protocol!=='https:'&&!['http://localhost:5173','http://127.0.0.1:5173'].includes(x))
 }))throw Error('AUDIT_CONFIGURATION')
 r2=createR2({AwsClient,endpoint:Deno.env.get('R2_ENDPOINT'),bucket:Deno.env.get('R2_BUCKET'),accessKeyId:Deno.env.get('R2_ACCESS_KEY_ID'),secretAccessKey:Deno.env.get('R2_SECRET_ACCESS_KEY')})
}catch{console.error('audit-photos: invalid or missing configuration')}
Deno.serve(createHandler({origins,r2,
 authenticate:async(token:string)=>{
  const res=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)})
  return res.ok?(await res.json()).id:null
 },
 rpc:async(args:unknown)=>{
  const res=await fetch(`${url}/rest/v1/rpc/audit_photo_service`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)})
  const data=await res.json();if(!res.ok)throw Error(data.message||'RPC_FAILED');return data
 },
}))
