import {inputDateTimeLabel} from './dateTime.js'
export const inputPlaceholder=type=>type==='date'?'DD.MM.YYYY':type==='time'?'HH:mm':'DD.MM.YYYY HH:mm'
export const displayInput=(iso,type)=>iso?inputDateTimeLabel(iso,type):''
export function parseInput(text,type){
 if(!text)return ''
 const datePattern='(\\d{2})\\.(\\d{2})\\.(\\d{4})',timePattern='([01]\\d|2[0-3]):([0-5]\\d)'
 const m=text.match(new RegExp('^'+(type==='date'?datePattern:type==='time'?timePattern:datePattern+' '+timePattern)+'$'))
 if(!m)return null
 if(type==='time')return text
 const iso=`${m[3]}-${m[2]}-${m[1]}`,day=new Date(`${iso}T12:00:00Z`)
 if(m[3]==='0000'||Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==iso)return null
 return type==='date'?iso:`${iso}T${m[4]}:${m[5]}`
}
export function inputError(text,type,min,max){const iso=parseInput(text,type);if(iso===null)return `Введіть ${inputPlaceholder(type)}: коректну дату та час у 24-годинному форматі.`;if(iso&&min&&iso<min)return `Значення має бути не раніше ${displayInput(min,type)}.`;if(iso&&max&&iso>max)return `Значення має бути не пізніше ${displayInput(max,type)}.`;return ''}
