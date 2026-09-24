import { useState } from 'react'
import { supabase } from '../supabase'
import { invalidPasswordLink } from './passwordRecovery'
export default function LoginScreen({ passwordMode = false, session, loading, linkError, onPasswordSaved, onCancel }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reset, setReset] = useState(false)
  const [saved, setSaved] = useState(false)
  const passwordError = linkError || (!loading && !session ? invalidPasswordLink : '')
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      if (passwordMode) {
        if (!session || passwordError) throw new Error(invalidPasswordLink)
        if (password.length < 12) throw new Error('Użyj co najmniej 12 znaków.')
        if (password !== confirmation) throw new Error('Hasła muszą być takie same.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw new Error('Nie udało się ustawić hasła. Sprawdź wymagania hasła lub poproś o nowy link.')
        setPassword(''); setConfirmation(''); setSaved(true)
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
  const cancelPassword = async () => {
    setBusy(true); setMessage('')
    try {
      if (!await onCancel()) setMessage('Wylogowanie nie powiodło się. Spróbuj ponownie.')
    } catch { setMessage('Wylogowanie nie powiodło się. Spróbuj ponownie.') }
    finally { setBusy(false) }
  }
  if (passwordMode && saved) return <div className="app auth-screen"><h1>Hasło zostało zmienione</h1>
    <p role="status">Nowe hasło zostało zapisane. Możesz przejść dalej lub wrócić do logowania.</p>
    {message && <p role="alert">{message}</p>}
    <button disabled={busy || loading || !session} onClick={onPasswordSaved}>Przejdź do aplikacji</button>
    <button disabled={busy} onClick={cancelPassword}>Wróć do logowania</button>
  </div>
  return <div className="app auth-screen"><header><h1>ZAGOTÓWKI</h1><h2>{passwordMode ? 'Ustaw nowe hasło' : reset ? 'Odzyskaj dostęp' : 'Logowanie pracownika'}</h2></header>
    <main><form className="produkt auth-form" onSubmit={submit}>
      {!passwordMode && <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {!reset && <label>{passwordMode ? 'Nowe hasło' : 'Hasło'}<input type="password" autoComplete={passwordMode ? 'new-password' : 'current-password'} required minLength={passwordMode ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {passwordMode && <><p>Użyj co najmniej 12 znaków.</p><label>Powtórz hasło<input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></>}
      {message && <p role="status">{message}</p>}
      {passwordMode && loading && <p role="status">Sprawdzanie linku…</p>}
      {passwordMode && passwordError && <p role="alert">{passwordError}</p>}
      <button className="zatwierdz" disabled={busy || loading || (passwordMode && (!session || passwordError))}>{busy ? 'Proszę czekać…' : passwordMode ? 'Zapisz hasło' : reset ? 'Wyślij link' : 'Zaloguj'}</button>
      {!passwordMode && <button type="button" disabled={busy} onClick={() => { setReset(!reset); setMessage(''); setPassword('') }}>{reset ? 'Wróć do logowania' : 'Nie pamiętam hasła'}</button>}
      {passwordMode && <button type="button" disabled={busy} onClick={cancelPassword}>Wróć do logowania</button>}
      {!passwordMode && !reset && <p>Sesja pozostaje zalogowana na tym urządzeniu. Na wspólnym urządzeniu wyloguj się po pracy.</p>}
    </form></main></div>
}
