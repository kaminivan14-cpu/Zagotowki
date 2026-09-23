import { useEffect, useRef, useState } from 'react'
import App from '../App'
import LoginScreen from './LoginScreen'
import { supabase } from '../supabase'
import { clearProductCatalog } from '../productCatalog'
import { employeeContext, validEmployee } from './session'
import './auth.css'

export default function AuthGate() {
  const [session, setSession] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [passwordMode, setPasswordMode] = useState(() => new URLSearchParams(location.search).get('auth') === 'password')
  const generation = useRef(0)
  const refresh = useRef(() => {})
  useEffect(() => {
    const requests = generation
    let alive = true
    let currentSession = null
    let timer
    sessionStorage.removeItem('pracownik')
    const loadProfile = async (nextSession) => {
      const request = ++generation.current
      currentSession = nextSession
      setSession(nextSession)
      if (!nextSession) { setEmployee(null); setLoading(false); return }
      try {
        const { data, error: profileError } = await supabase.rpc('auth_employee_profile')
        if (!alive || request !== generation.current) return
        if (profileError || !validEmployee(data?.[0], nextSession.user.id)) {
          setEmployee(null)
          setError('Brak dostępu. Konto musi być połączone z aktywnym pracownikiem. Skontaktuj się z managerem.')
        } else { setError(''); setEmployee(data[0]) }
      } catch {
        if (alive && request === generation.current) { setEmployee(null); setError('Nie udało się sprawdzić dostępu. Spróbuj ponownie.') }
      } finally { if (alive && request === generation.current) setLoading(false) }
    }
    // Defer API calls outside the auth callback (Supabase holds its session lock).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordMode(true)
      const changed = currentSession?.user?.id !== nextSession?.user?.id
      ++generation.current
      currentSession = nextSession
      if (changed || !nextSession) { setEmployee(null); clearProductCatalog(); setLoading(Boolean(nextSession)) }
      clearTimeout(timer)
      timer = setTimeout(() => { if (alive) void loadProfile(nextSession) }, 0)
    })
    refresh.current = () => { if (alive) void loadProfile(currentSession) }
    const interval = setInterval(() => refresh.current(), 60000)
    const onFocus = () => refresh.current()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false; ++requests.current; clearTimeout(timer); clearInterval(interval)
      subscription.unsubscribe(); window.removeEventListener('focus', onFocus)
    }
  }, [])
  const signOut = async () => {
    ++generation.current
    setEmployee(null); clearProductCatalog(); setLoading(true)
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    setLoading(false)
    if (signOutError) setError('Wylogowanie nie powiodło się. Ponów próbę przed przekazaniem urządzenia.')
    else { setSession(null); setError('') }
  }
  const finishPassword = () => {
    const url = new URL(location.href)
    url.searchParams.delete('auth'); url.hash = ''
    history.replaceState(null, '', url)
    setPasswordMode(false); refresh.current()
  }
  if (passwordMode) return <LoginScreen passwordMode session={session} loading={loading} onPasswordSaved={finishPassword} onCancel={async () => { await signOut(); finishPassword() }} />
  if (loading) return <div className="app auth-screen" role="status">Sprawdzanie sesji…</div>
  if (!session) return <LoginScreen />
  if (!employee) return <div className="app auth-screen"><h1>ZAGOTÓWKI</h1><p role="alert">{error}</p><button onClick={() => refresh.current()}>Sprawdź ponownie</button><button onClick={signOut}>Wyloguj / zmień użytkownika</button></div>
  return <App key={employeeContext(employee)} pracownik={employee} onSignOut={signOut} />
}
