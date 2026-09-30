import { useState } from 'react'
import { supabase } from '../supabase'

export default function PinLoginScreen({ onBack }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    const submitted = pin
    setPin(''); setMessage('')
    if (!/^[0-9]{4,8}$/.test(submitted)) { setMessage('PIN musi mieć od 4 do 8 cyfr. Nowe PIN-y mają 4 cyfry.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: submitted }), cache: 'no-store' })
      if (!response.ok) {
        setMessage(response.status === 429 ? 'Zbyt wiele prób. Spróbuj później.' : 'Nieprawidłowy PIN lub konto niedostępne.')
        return
      }
      const data = await response.json()
      if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') throw new Error('SESSION')
      const { error } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
      if (error) throw new Error('SESSION')
    } catch { setMessage('Nie udało się zalogować. Spróbuj ponownie.') }
    finally { setBusy(false) }
  }
  return <div className="app auth-screen"><h1>ZAGOTÓWKI</h1><h2>Logowanie PIN</h2>
    <form className="produkt auth-form" onSubmit={submit}>
      <label>PIN<input type="password" inputMode="numeric" autoComplete="off" required minLength={4} maxLength={8} pattern="[0-9]{4,8}" value={pin} onChange={e => setPin(e.target.value)} /></label>
      {message && <p role="status">{message}</p>}
      <button disabled={busy}>Zaloguj</button>
      <button type="button" disabled={busy} onClick={() => { setPin(''); onBack() }}>Administrator — e-mail i hasło</button>
    </form>
  </div>
}
