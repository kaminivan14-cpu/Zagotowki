export const ZONE='Europe/Warsaw'
export const date=value=>value?new Date(value).toLocaleDateString('pl-PL',{timeZone:ZONE,day:'2-digit',month:'2-digit',year:'numeric'}):''
export const time=value=>value?new Date(value).toLocaleTimeString('pl-PL',{timeZone:ZONE,hour:'2-digit',minute:'2-digit'}):''
export const isoDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
export const duration=minutes=>`${Math.floor(Math.max(0,minutes)/60)} h ${Math.floor(Math.max(0,minutes)%60)} min`
export const initialRange=()=>{const today=isoDate(Date.now());return {p_from:today.slice(0,8)+'01',p_to:today,p_employee:null,p_location:null,p_status:null}}
export function localInput(value){if(!value)return '';return `${isoDate(value)}T${time(value)}`}
// Resolve Warsaw wall time by round trip. DST gaps and repeated times require explicit offset.
export function warsawInstant(value) {
 if(!value)return null
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value)
 if(!match)throw new Error('Podaj poprawną datę i godzinę.')
 const candidates=['+01:00','+02:00'].map(offset=>new Date(value+':00'+offset)).filter(d=>Number.isFinite(+d)&&localInput(d.toISOString())===value)
 if(candidates.length!==1)throw new Error('Ta godzina nie istnieje lub jest niejednoznaczna przy zmianie czasu. Wpisz czas ISO z offsetem, np. +01:00.')
 return candidates[0].toISOString()
}
export function correctionInstant(value,original) {
 if(value===localInput(original))return original
 if(/T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)))return new Date(value).toISOString()
 return warsawInstant(value)
}
export function worktimeError(error) {
 const msg=error?.message||''
 if(msg.includes('UNFINISHED_WORK'))return 'Najpierw zakończ lub oddaj aktywną pracę w Zamówieniach.'
 if(msg.includes('VERSION_CONFLICT'))return 'Sesja została zmieniona. Odśwież dane przed korektą.'
 if(msg.includes('SHIFT_OVERLAP'))return 'Korekta nakłada się na inną sesję tego pracownika.'
 if(msg.includes('END_CURRENT_SHIFT'))return 'Masz aktywną sesję w innym lokalu. Zakończ ją przed zmianą lokalu.'
 if(msg.includes('INVALID_'))return 'Sprawdź daty, godziny i powód korekty.'
 if(msg.includes('DENIED'))return 'Brak uprawnień do tych danych.'
 if(msg.includes('EXPORT_TOO_LARGE'))return 'Eksport przekracza 10 000 sesji. Zawęź filtry.'
 return 'Nie udało się potwierdzić operacji. Ponów tę samą operację.'
}

export function polishDate(value) { return value ? value.split('-').reverse().join('.') : '' }
export function parsePolishDate(value) {
 const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
 if(!match)return null
 const iso=`${match[3]}-${match[2]}-${match[1]}`
 return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10)===iso ? iso : null
}
