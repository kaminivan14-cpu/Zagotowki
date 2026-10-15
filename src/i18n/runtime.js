import {pl} from './pl.js'
const listeners=new Set(),warned=new Set()
let locale='uk'
try{const saved=globalThis.localStorage?.getItem('zagotowki.locale');if(['uk','pl'].includes(saved))locale=saved}catch{/* Storage may be unavailable. */}
export const getLocale=()=>locale
export function setLocale(next){if(!['uk','pl'].includes(next)||next===locale)return;locale=next;try{globalThis.localStorage?.setItem('zagotowki.locale',next)}catch{/* Session preference still works. */}listeners.forEach(fn=>fn())}
export const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)}
export function tr(key,values={}){let text=locale==='pl'?pl[key]:key;if(text==null){text=key;if(import.meta.env?.DEV&&!warned.has(key)){warned.add(key);console.warn('Missing translation:',key)}}return text.replace(/\{(\w+)\}/g,(_,k)=>values[k]??`{${k}}`)}
export const localized=labels=>Object.defineProperties({},Object.fromEntries(Object.entries(labels).map(([key,value])=>[key,{enumerable:true,get:()=>typeof value==='string'?tr(value):value&&typeof value==='object'?localized(value):value}])))
