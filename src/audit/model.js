import { instantLabel } from '../tasks/dateTime.js'
export const answerLabels = { yes: 'TAK', no: 'NIE', na: 'NIE DOTYCZY' }
export const auditTime = value => instantLabel(value, 'Europe/Warsaw')
export const auditName = a => [a.template_name, a.location_name, auditTime(a.started_at)].filter(Boolean).join(' — ')
export function metrics(a) {
 const total = a.questions.length
 const counts = Object.fromEntries(Object.keys(answerLabels).map(k => [k, a.answers.filter(x => x.answer === k).length]))
 return { ...counts, progress: total ? Math.round((counts.yes + counts.no + counts.na) / total * 100) : 0,
  score: total ? Math.round((counts.yes + counts.na) / total * 100) : 0 }
}
export const editable = (a, employee) => a.status === 'active' && a.author_id === employee.auth_user_id
export function missing(a) {
 return [...(!a.location_id ? ['Wybierz lokal.'] : []),
  ...(a.answers.some(x => !x.answer) ? [`Odpowiedz na pozostałe pytania: ${a.answers.filter(x => !x.answer).length}.`] : []),
  ...(a.photos.some(x => x.state === 'pending') ? ['Dokończ przesyłanie zdjęć lub usuń nieprzesłane zdjęcia.'] : [])]
}
export const photoLimit = 10 * 1024 * 1024
export async function validatePhoto(file) {
 const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())
 const str = (a, b) => String.fromCharCode(...bytes.slice(a, b))
 let mime
 if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255) mime='image/jpeg'
 else if(bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10') mime='image/png'
 else if(str(0,4)==='RIFF' && str(8,12)==='WEBP') mime='image/webp'
 else if(str(4,8)==='ftyp' && /heic|heix|hevc|hevx/.test(str(8,32))) mime='image/heic'
 else if(str(4,8)==='ftyp' && /mif1|msf1/.test(str(8,32))) mime='image/heif'
 if(!mime || !file.size || file.size>photoLimit) throw Error('Wybierz JPG, PNG, WebP lub HEIC/HEIF do 10 MB.')
 return mime
}
export function errorLabel(error) {
 const msg = error?.message || 'Błąd połączenia.'
 if(msg.includes('AUDIT_NOT_FOUND')) return 'Nie znaleziono audytu lub wzoru. Odśwież listę.'
 if(msg.includes('AUDIT_LOCATION_INVALID')) return 'Wybrany lokal nie jest już dostępny. Wybierz inny lokal.'
 if(msg.includes('AUDIT_PHOTO_INVALID')) return 'Nieprawidłowe zdjęcie. Użyj JPG, PNG, WebP lub HEIC/HEIF do 10 MB.'
 if(msg.includes('AUDIT_INVALID')) return 'Sprawdź odpowiedzi i długość komentarzy (maksymalnie 200 znaków).'
 if(msg.includes('AUDIT_OPERATION_CONFLICT')) return 'Nie można ponowić tej operacji ze zmienionymi danymi. Otwórz aktualną wersję.'
 if(msg.includes('AUDIT_CONFLICT')) return 'Konflikt: audyt lub wzór zmieniono na innym urządzeniu. Twoje zmiany pozostają na ekranie. Otwórz aktualną wersję, aby kontynuować.'
 if(msg.includes('AUDIT_READ_ONLY')) return 'Ten audyt jest już tylko do odczytu. Otwórz aktualną wersję.'
 if(msg.includes('AUDIT_PHOTO_LIMIT')) return 'Maksymalnie 10 zdjęć przy jednym pytaniu.'
 if(msg.includes('AUDIT_INCOMPLETE')) return 'Uzupełnij lokal, odpowiedzi i dokończ przesyłanie zdjęć.'
 if(msg.includes('AUDIT_TEMPLATE_INVALID')) return 'Podaj nazwę (do 200 znaków) i 1–500 niepustych pytań (do 2000 znaków).'
 if(msg.includes('AUDIT_PHOTO_MISSING')) return 'Zdjęcie nie zostało poprawnie przesłane. Ponów przesyłanie.'
 return `Nie udało się wykonać operacji: ${msg}`
}
