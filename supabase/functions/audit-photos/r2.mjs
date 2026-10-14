// AwsClient is injected so the same adapter is exercised in Node tests and Deno Edge.
export function createR2({AwsClient,endpoint,bucket,accessKeyId,secretAccessKey,fetcher=fetch}){
 const base=new URL(endpoint)
 if(base.protocol!=='https:'||!/^([a-f0-9]{32})(\.eu)?\.r2\.cloudflarestorage\.com$/.test(base.hostname)||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error('R2_CONFIGURATION')
 if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)||!accessKeyId||!secretAccessKey)throw Error('R2_CONFIGURATION')
 const aws=new AwsClient({accessKeyId,secretAccessKey,service:'s3',region:'auto'})
 const url=path=>{
  if(!/^audits\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(path))throw Error('AUDIT_PHOTO_INVALID')
  return new URL(`${bucket}/${path}`,base)
 }
 const request=async(path,method,headers={})=>{
  const signed=await aws.sign(url(path),{method,headers,aws:{allHeaders:true}})
  return fetcher(signed,{signal:AbortSignal.timeout(20000)})
 }
 return {
  async putUrl(photo){
   const target=url(photo.path);target.searchParams.set('X-Amz-Expires','300')
   // allHeaders is essential: aws4fetch otherwise excludes If-None-Match / Content-Length.
   const signed=await aws.sign(target,{method:'PUT',headers:{'Content-Type':photo.mime,'Content-Length':String(photo.bytes),'If-None-Match':'*'},aws:{signQuery:true,allHeaders:true}})
   // Browsers set Content-Length from Blob automatically; JS must not try to set it.
   return {url:signed.url,headers:{'Content-Type':photo.mime,'If-None-Match':'*'}}
  },
  async getUrl(photo){
   const target=url(photo.path);target.searchParams.set('X-Amz-Expires','300')
   return (await aws.sign(target,{method:'GET',aws:{signQuery:true}})).url
  },
  async inspect(photo){
   const head=await request(photo.path,'HEAD')
   if(!head.ok)throw Error(head.status===404?'AUDIT_PHOTO_MISSING':'R2_UNAVAILABLE')
   if(head.headers.get('content-type')!==photo.mime||Number(head.headers.get('content-length'))!==photo.bytes)throw Error('AUDIT_PHOTO_INVALID')
   const etag=head.headers.get('etag');if(!etag)throw Error('AUDIT_PHOTO_INVALID')
   const response=await request(photo.path,'GET',{'If-Match':etag})
   if(!response.ok)throw Error('AUDIT_PHOTO_MISSING')
   const reader=response.body.getReader(),parts=[];let size=0
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>photo.bytes){await reader.cancel();throw Error('AUDIT_PHOTO_INVALID')}parts.push(value)}
   if(size!==photo.bytes)throw Error('AUDIT_PHOTO_INVALID')
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes
  },
  async remove(photo){const response=await request(photo.path,'DELETE');if(!response.ok&&response.status!==404)throw Error('R2_UNAVAILABLE')},
 }
}
