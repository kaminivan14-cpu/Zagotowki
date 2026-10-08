export const avatarBucket='employee-avatars'
export const avatarLimit=5*1024*1024
export async function validateAvatar(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>avatarLimit)throw Error('Оберіть JPG, PNG або WebP до 5 МБ.')
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer()),text=(a,z)=>String.fromCharCode(...b.slice(a,z))
 const valid=file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:file.type==='image/png'?b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':text(0,4)==='RIFF'&&text(8,12)==='WEBP'
 if(!valid)throw Error('Вміст файлу не відповідає формату зображення.')
 return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]
}
