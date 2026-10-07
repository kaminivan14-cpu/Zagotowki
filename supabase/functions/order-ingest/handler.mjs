const MAX_BODY = 256 * 1024
async function authorized(header, secret) {
 if (!secret || secret.length < 32 || !header?.startsWith('Bearer ')) return false
 const digest = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
 const [a,b] = await Promise.all([digest(header.slice(7)),digest(secret)])
 return new Uint8Array(a).reduce((n,v,i)=>n | (v ^ new Uint8Array(b)[i]),0) === 0
}
export function createHandler({secret,location,rpc,logError=console.error}) {
 return async req => {
  const requestId=crypto.randomUUID()
  const response=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Request-Id':requestId}})
  const reject=async(status,error,detail)=>{
   try {await rpc('order_ingest_log',{p_request:requestId,p_status:status,p_detail:detail})}
   catch {logError({requestId,stage:'audit_unavailable'})}
   return response(status,{success:false,error})
  }
  try {
   if(!secret || secret.length<32)return reject(503,'Integration unavailable','configuration')
   if(!await authorized(req.headers.get('authorization'),secret))return reject(401,'Unauthorized','unauthorized')
   if(req.method!=='POST')return reject(405,'Method not allowed','method')
   if(!/^[1-9]\d*$/.test(location || '') || !Number.isSafeInteger(Number(location)))return reject(503,'Integration unavailable','configuration')
   if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reject(415,'Content-Type must be application/json','content_type')
   const reader=req.body?.getReader();let size=0;const parts=[]
   if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return reject(413,'Request too large','body_too_large')}parts.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
   let payload
   try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return reject(400,'Invalid JSON','invalid_json')}
   const result=await rpc('order_ingest',{p_payload:payload,p_location:Number(location),p_request:requestId})
   if(![200,400,409,503].includes(result?.http_status) || typeof result.body?.success!=='boolean')throw new Error('invalid_rpc_response')
   return response(result.http_status,result.body)
  }catch(error){
   logError({requestId,stage:'ingest_failed',code:error?.code || 'BACKEND_FAILURE'})
   return reject(500,'Unable to receive order','database_unavailable')
  }
 }
}
