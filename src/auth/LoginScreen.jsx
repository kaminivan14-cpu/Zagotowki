import { useState } from 'react'
import { supabase } from '../supabase'
export default function LoginScreen({ passwordMode = false, session, loading, onPasswordSaved, onCancel }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reset, setReset] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      if (passwordMode) {
        if (!session) throw new Error('Link jest nieważny lub wygasł. Poproś o nowy link.')
        if (password !== confirmation) throw new Error('Hasła muszą być takie same.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw new Error('Nie udało się ustawić hasła. Sprawdź wymagania hasła lub poproś o nowy link.')
        setPassword(''); setConfirmation(''); onPasswordSaved()
      } else if (reset) {
        const redirect = new URL(location.pathname, location.origin)
        redirect.searchParams.set('auth', 'password')
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect.href })
        if (error) throw new Error('Nie udało się wysłać prośby. Spróbuj ponownie później.')
        setMessage('Jeśli konto istnieje, otrzymasz wiadomość z linkiem do ustawienia hasła.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error('Nie udało się zalogować. Sprawdź e-mail, hasło i potwierdzenie adresu.')
      }
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <div className="app auth-screen"><header><h1>ZAGOTÓWKI</h1><p>{passwordMode ? 'Ustaw hasło' : reset ? 'Odzyskaj dostęp' : 'Logowanie pracownika'}</p></header>
    <main><form className="produkt auth-form" onSubmit={submit}>
      {!passwordMode && <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {!reset && <label>Hasło<input type="password" autoComplete={passwordMode ? 'new-password' : 'current-password'} required minLength={passwordMode ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {passwordMode && <><p>Użyj co najmniej 12 znaków.</p><label>Powtórz hasło<input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></>}
      {message && <p role="status">{message}</p>}
      {passwordMode && !loading && !session && <p role="alert">Brak ważnej sesji z linku. Poproś o nowy link.</p>}
      <button className="zatwierdz" disabled={busy || loading || (passwordMode && !session)}>{busy ? 'Proszę czekać…' : passwordMode ? 'Zapisz hasło' : reset ? 'Wyślij link' : 'Zaloguj'}</button>
      {!passwordMode && <button type="button" disabled={busy} onClick={() => { setReset(!reset); setMessage(''); setPassword('') }}>{reset ? 'Wróć do logowania' : 'Nie pamiętam hasła'}</button>}
      {passwordMode && <button type="button" disabled={busy} onClick={onCancel}>Wróć do logowania</button>}
      {!passwordMode && !reset && <p>Sesja pozostaje zalogowana na tym urządzeniu. Na wspólnym urządzeniu wyloguj się po pracy.</p>}
    </form></main></div>
}
