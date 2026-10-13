import { supabase } from '../supabase'
export const bucket = 'audit-photos'
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
export async function cleanup() {
 const paths = await read('cleanup')
 if(paths.length) {
  const { error } = await supabase.storage.from(bucket).remove(paths)
  if(error) throw error
 }
}
export async function upload(photo, file) {
 const { error } = await supabase.storage.from(bucket).upload(photo.path, new Blob([file], { type: photo.mime }), { contentType: photo.mime, upsert: false })
 // A lost upload response can leave the immutable object in Storage; ready validates its metadata.
 if(error && !['409','400'].includes(String(error.statusCode))) throw error
 if(error && !/already exists|duplicate/i.test(error.message)) throw error
}
export async function photoUrl(path) {
 const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
 if(error) throw error
 return data.signedUrl
}
