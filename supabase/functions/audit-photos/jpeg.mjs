// Structural JPEG validation shared by server and tests. No metadata is trusted for dimensions.
export function jpegSize(bytes) {
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('AUDIT_PHOTO_INVALID')
 let offset=2
 while(offset+4<=bytes.length){
  if(bytes[offset++]!==255)throw Error('AUDIT_PHOTO_INVALID')
  while(bytes[offset]===255)offset++
  const marker=bytes[offset++]
  if(marker===218||marker===217)break
  const length=(bytes[offset]<<8)|bytes[offset+1]
  if(length<2||offset+length>bytes.length)break
  if([192,193,194].includes(marker)){
   if(length<8)break
   const height=(bytes[offset+3]<<8)|bytes[offset+4],width=(bytes[offset+5]<<8)|bytes[offset+6]
   if(width<1||height<1||width>1920||height>1920)break
   return {width,height}
  }
  offset+=length
 }
 throw Error('AUDIT_PHOTO_INVALID')
}
export async function sha256(bytes){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')
}
