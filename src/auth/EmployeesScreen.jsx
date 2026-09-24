import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { canManageEmployee } from './session'
import { invitationFailure } from './inviteResult'

export default function EmployeesScreen({ pracownik, lokale, onPowrot }) {
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(null)
  const [invite, setInvite] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [pendingLinks, setPendingLinks] = useState([])
  useEffect(() => {
    let alive = true
    supabase.rpc('auth_list_employees').then(({ data, error }) => {
      if (!alive) return
      if (error) setMessage('Nie udało się pobrać pracowników.')
      else setEmployees(data || [])
    }).catch(() => { if (alive) setMessage('Brak połączenia.') })
    return () => { alive = false }
  }, [revision])
  const save = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.rpc('auth_save_employee', {
        p_employee_id: form.id || null, p_name: form.name.trim(), p_role: form.role,
        p_location_id: form.location_id || null, p_active: form.active,
      })
      if (error) throw new Error(error.message)
      setForm(null); setRevision(x => x + 1); setMessage('Zapisano pracownika.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const sendInvite = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('invite-employee', { body: { employee_id: invite.id, email: email.trim() } })
      const failure = await invitationFailure({ data, error })
      if (failure) {
        if (failure.partial) {
          setPendingLinks(ids => [...ids, invite.id])
          setInvite(null); setEmail('')
        }
        setMessage(failure.message)
        return
      }
      setInvite(null); setEmail(''); setRevision(x => x + 1)
      setMessage('Wysłano zaproszenie i połączono konto z pracownikiem.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <div className="app employees-screen"><header><h1>Pracownicy</h1><p>Zalogowany jako: {pracownik.name} · {pracownik.role}</p><button disabled={busy} onClick={onPowrot}>← Powrót</button></header>
    <main>
      <button disabled={busy} onClick={() => { setInvite(null); setForm({ name: '', role: 'employee', location_id: pracownik.location_id || '', active: true }) }}>Dodaj pracownika</button>
      <p role="status">{message}</p>
      {form && <form className="produkt auth-form" onSubmit={save}>
        <label>Imię<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Rola<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          {(pracownik.role === 'administrator' ? ['employee', 'su-chef', 'manager', 'administrator'] : ['employee', 'su-chef']).map(role => <option key={role}>{role}</option>)}
        </select></label>
        <label>Lokal<select required={form.role !== 'administrator'} disabled={pracownik.role !== 'administrator'} value={form.location_id ?? ''} onChange={e => setForm({ ...form, location_id: e.target.value })}>
          <option value="">Wszystkie lokale (administrator)</option>{lokale.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
        <label><span>Aktywny</span><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /></label>
        <button disabled={busy}>Zapisz</button><button type="button" disabled={busy} onClick={() => setForm(null)}>Anuluj</button>
      </form>}
      {invite && <form className="produkt auth-form" onSubmit={sendInvite}>
        <h2>Zaproszenie: {invite.name}</h2><label>E-mail pracownika<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <p>Sprawdź adres — jego właściciel otrzyma dostęp jako ten pracownik.</p>
        <button disabled={busy}>Wyślij zaproszenie</button><button type="button" disabled={busy} onClick={() => setInvite(null)}>Anuluj</button>
      </form>}
      <div className="produkty">{employees.map(e => <div className="produkt" key={e.id}>
        <strong>{e.name}</strong><p>{e.role} · {lokale.find(l => String(l.id) === String(e.location_id))?.name || (e.role === 'administrator' ? 'Wszystkie lokale' : 'Brak lokalu')}</p>
        <p>{e.active ? 'Aktywny' : 'Nieaktywny'} · {e.auth_user_id ? 'Konto połączone' : 'Brak konta logowania'}</p>
        {canManageEmployee(pracownik, e) && <><button disabled={busy} onClick={() => { setInvite(null); setForm({ ...e }) }}>Edytuj</button>
          {!e.auth_user_id && e.active && <button disabled={busy || pendingLinks.includes(e.id)} onClick={() => { setForm(null); setEmail(''); setInvite(e) }}>Zaproś do aplikacji</button>}</>}
      </div>)}</div>
    </main></div>
}
