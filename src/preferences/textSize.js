const listeners=new Set()
let currentScale=1
export const subscribeTextScale=listener=>{listeners.add(listener);return()=>listeners.delete(listener)}
export const getTextScale=()=>currentScale
export const textSizes={small:.9,normal:1,large:1.1,xlarge:1.2}
export const textSizeKey=id=>`app_text_size:${id}`
export function readTextSize(id,storage=localStorage){
 try {const size=id?storage.getItem(textSizeKey(id)):null;return Object.hasOwn(textSizes,size)?size:'normal'}catch{return 'normal'}
}
export function applyTextSize(size){const next=textSizes[size]||1;document.documentElement.style.setProperty('--app-font-scale',String(next));if(next!==currentScale){currentScale=next;listeners.forEach(fn=>fn())}}
export function saveTextSize(id,size,storage=localStorage){
 if(!id||!Object.hasOwn(textSizes,size))return false
 applyTextSize(size)
 try{storage.setItem(textSizeKey(id),size);return true}catch{return false}
}
