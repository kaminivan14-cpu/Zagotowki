import { validatePhoto } from './model'
export async function preparePhoto(file) {
 const mime=await validatePhoto(file)
 let bitmap
 try {
  if(/heic|heif/.test(mime)) {
   const { heicTo }=await import('heic-to/csp')
   bitmap=await heicTo({blob:file,type:'bitmap'})
  } else bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})
 } catch { throw Error('Nie udało się odczytać zdjęcia. Wybierz poprawny plik JPG, PNG, WebP lub HEIC/HEIF.') }
 try {
  const ratio=Math.min(1,1920/Math.max(bitmap.width,bitmap.height))
  const width=Math.max(1,Math.round(bitmap.width*ratio)),height=Math.max(1,Math.round(bitmap.height*ratio))
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height)
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82))
  if(!blob||blob.size>4194304)throw Error('Nie udało się zmniejszyć zdjęcia do 4 MB. Wybierz mniejsze zdjęcie.')
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())
  const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
  return {blob,mime:'image/jpeg',bytes:blob.size,width,height,sha256}
 } finally { bitmap.close?.() }
}
