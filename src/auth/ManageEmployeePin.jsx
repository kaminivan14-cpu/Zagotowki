import { useState } from 'react'
import { supabase } from '../supabase'

export default function ManageEmployeePin({ employee, onClose, onSaved }) {
  const [pin, setPin] = useState('')
  const [operationId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    const value = pin
    setPin('')
    if (!/^[0-9]{4}$/.test(value)) { setMessage('PIN musi mieć dokładnie 4 cyfry.'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee-pin', {
        body: { employee_id: employee.id, pin: value, operation_id: operationId },
      })
      if (error || data?.success !== true) {
        setMessage('Nie udało się nadać PIN-u. Sprawdź uprawnienia i dostępność PIN-u. Przy ponowieniu wpisz ten sam PIN; nie zamykaj formularza.')
      } else onSaved()
    } catch { setMessage('Brak połączenia. Ponów z tym samym PIN-em w tym formularzu.') }
    finally { setBusy(false) }
  }
  return <form className="produkt auth-form" onSubmit={submit}>
    <h2>Nadaj / resetuj PIN: {employee.name}</h2>
    <label>Nowy PIN<input type="text" inputMode="numeric" autoComplete="off" required minLength={4} maxLength={4} pattern="[0-9]{4}" value={pin} onChange={e => setPin(e.target.value)} /></label>
    <p>4 cyfry. Przekaż PIN pracownikowi bezpiecznie — nie będzie można go odczytać później. Reset nie wylogowuje istniejących sesji.</p>
    {message && <p role="status">{message}</p>}
    <button disabled={busy}>Nadaj PIN</button><button type="button" disabled={busy} onClick={() => { setPin(''); onClose() }}>Anuluj</button>
  </form>
}
