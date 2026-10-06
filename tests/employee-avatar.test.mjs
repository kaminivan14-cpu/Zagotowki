import test from 'node:test'
import assert from 'node:assert/strict'
import {validateAvatar,avatarLimit} from '../src/tasks/employees/avatar.js'
test('avatar accepts supported image signatures, rejects MIME spoof and oversized files',async()=>{
 for(const [mime,bytes,ext] of [['image/png',[137,80,78,71,13,10,26,10],'png'],['image/jpeg',[255,216,255],'jpg'],['image/webp',new TextEncoder().encode('RIFF1234WEBP'),'webp']])assert.equal(await validateAvatar(new File([new Uint8Array(bytes)],'test',{type:mime})),ext)
 await assert.rejects(validateAvatar(new File(['<svg/>'],'test.png',{type:'image/png'})))
 await assert.rejects(validateAvatar(new File(['anything'],'test',{type:'text/plain'})))
 await assert.rejects(validateAvatar(new File([new Uint8Array(avatarLimit+1)],'test.png',{type:'image/png'})))
})
