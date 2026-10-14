import { supabase } from '../supabase'
export async function read(kind, id = null, status = 'active') {
 const { data, error } = await supabase.rpc('audit_read', { p_kind: kind, p_id: id, p_status: status })
 if(error) throw error
 return data
}
export async function command(action, args, operation) {
 const { data, error } = await supabase.rpc('audit_command', { p_action: action, p_args: args, p_operation: operation })
 if(error) throw error
 return data
}
async function photos(body) {
 const {data,error}=await supabase.functions.invoke('audit-photos',{body})
 if(error){
  let message=error.message
  try { message=(await error.context.json()).error||message } catch { /* Network error has no response. */ }
  throw Error(message)
 }
 return data
}
export async function cleanup() { return photos({action:'cleanup'}) }
export async function completePhoto(photo,version) {
 const data=await photos({action:'complete',photo_id:photo.id,version})
 return data.audit
}
export async function upload(photo,file,version) {
 const data=await photos({action:'upload',photo_id:photo.id,version})
 if(data.audit)return data.audit
 const response=await fetch(data.url,{method:'PUT',headers:data.headers,body:file,signal:AbortSignal.timeout(120000)})
 // Conditional writes prevent replacement. A lost successful response can be retried safely.
 if(!response.ok&&response.status!==412)throw Error('Przesyłanie zdjęcia nie powiodło się. Ponów operację.')
 return completePhoto(photo,version)
}
export async function photoUrl(id) { return (await photos({action:'download',photo_id:id})).url }
