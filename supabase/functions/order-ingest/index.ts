import { createHandler } from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const rpc=async(name:string,args:unknown)=>{
 if(!url || !key)throw new Error('Backend configuration missing');
 const res=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!res.ok){const error=await res.json().catch(()=>({}));console.error(JSON.stringify({stage:'rpc',name,status:res.status,code:error.code}));throw Object.assign(new Error('RPC failed'),{code:error.code})}
 return res.status===204?null:res.json();
};
Deno.serve(createHandler({secret:Deno.env.get('ORDERS_INTEGRATION_SECRET'),location:Deno.env.get('ORDERS_INTEGRATION_LOCATION_ID'),rpc}));
