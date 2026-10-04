import { useRef, useState } from 'react'
import { supabase } from '../supabase'

const errors = {
  PIN_UNAVAILABLE: 'Ten PIN jest już zajęty. Wybierz inny.',
  TARGET_UNAVAILABLE: 'Nadanie PIN-u wymaga aktywnego konta i odpowiedniej roli pracownika.',
  DENIED: 'Nie masz aktualnych uprawnień administratora.',
  AUTH: 'Sesja wygasła. Zaloguj się ponownie jako administrator.',
  EXISTING_IDENTITY: 'Pracownik ma konto innego typu. Administrator musi sprawdzić powiązanie konta.',
  IDENTITY: 'Niezgodne powiązanie konta pracownika. Wymagana weryfikacja administratora.',
  OPERATION_CONFLICT: 'Ta operacja została już zapisana. Zamknij formularz i otwórz go ponownie.',
  CONFIG: 'Usługa PIN jest nieprawidłowo skonfigurowana. Przekaż administratorowi identyfikator błędu.',
  ORIGIN: 'Ten adres aplikacji nie został dopuszczony do zarządzania PIN-em.',
  INPUT: 'PIN musi mieć dokładnie 4 cyfry.',
}
export default function ManageEmployeePin({ employee, locationName, onClose, onSaved, onBusy = () => {} }) {
  const [pin, setPin] = useState('')
  const operation = useRef(crypto.randomUUID()), locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    if (locked.current) return
    const value = pin
    if (!/^[0-9]{4}$/.test(value)) { setMessage('PIN musi mieć dokładnie 4 cyfry.'); return }
    locked.current = true; setBusy(true); onBusy(true); setPin(''); setMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee-pin', {
        body: { employee_id: employee.id, pin: value, operation_id: operation.current },
      })
      if (error || data?.success !== true) {
        let result = data
        if (error?.context instanceof Response) {
          try { result = await error.context.clone().json() } catch { /* Non-JSON gateway response: retain retry UUID. */ }
        }
        const code = Object.hasOwn(errors, result?.code) ? result.code : 'UNCONFIRMED'
        const requestId = /^[a-f0-9-]{36}$/i.test(result?.request_id || '') ? result.request_id : null
        console.error('manage-employee-pin', { code, requestId, status: error?.context?.status || null })
        if (result?.retry_same_operation === false) operation.current = crypto.randomUUID()
        setMessage(`${errors[code] || 'Nie udało się potwierdzić operacji. Sprawdź połączenie i adres UAT. Przy ponowieniu wpisz ten sam PIN i pozostaw formularz otwarty.'}${requestId ? ` Identyfikator błędu: ${requestId}.` : ''}`)
      } else onSaved()
    } catch {
      console.error('manage-employee-pin', { code: 'NETWORK' })
      setMessage('Brak połączenia. Ponów z tym samym PIN-em w tym formularzu.')
    } finally { locked.current = false; setBusy(false); onBusy(false) }
  }
  return <form className="auth-form employee-pin" onSubmit={submit} aria-label={`PIN: ${employee.name}`}>
    <h3>Nadaj / resetuj PIN: {employee.name}</h3>
    <p>{employee.role} · {locationName}</p>
    <label>Nowy PIN<input autoFocus type="password" inputMode="numeric" autoComplete="new-password" required minLength={4} maxLength={4} pattern="[0-9]{4}" disabled={busy} value={pin} onChange={e => setPin(e.target.value)} /></label>
    <p>4 cyfry. Przekaż PIN pracownikowi bezpiecznie — nie będzie można go odczytać później. Reset nie wylogowuje istniejących sesji.</p>
    {message && <p role="alert">{message}</p>}
    <div className="employee-actions"><button className="primary-action" disabled={busy}>{busy ? 'Zapisywanie…' : 'Nadaj / resetuj PIN'}</button><button type="button" disabled={busy} onClick={() => { setPin(''); onClose() }}>Anuluj</button></div>
  </form>
}
