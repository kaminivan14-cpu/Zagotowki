import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { canManageEmployee } from './session'
import ManageEmployeePin from './ManageEmployeePin'
import { invitationFailure } from './inviteResult'

export default function EmployeesScreen({ pracownik, lokale, onPowrot }) {
  const [filter, setFilter] = useState('all')
  const [confirmation, setConfirmation] = useState(null)
  const dialogRef = useRef(null)
  useEffect(() => { if (confirmation) dialogRef.current?.showModal() }, [confirmation])
  const actionPending = useRef(false)
  const [pinEmployee, setPinEmployee] = useState(null)
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
  const lifecycle = async (employee, action) => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.rpc('auth_employee_lifecycle', { p_employee_id: employee.id, p_action: action })
      if (error) throw error
      setConfirmation(null); setForm(null); setPinEmployee(null); setInvite(null)
      setRevision(x => x + 1)
      setMessage(action === 'restore' ? 'Przywrócono pracownika jako nieaktywnego.' : 'Zapisano zmianę konta.')
    } catch { setMessage('Nie udało się zmienić konta pracownika. Spróbuj ponownie.') }
    finally { actionPending.current = false; setBusy(false) }
  }
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
      <button disabled={busy} onClick={() => { setInvite(null); setForm({ name: '', role: 'crafter', location_id: pracownik.location_id || '', active: true }) }}>Dodaj pracownika</button>
      <p role="status">{message}</p>
      <label>Widok pracowników<select aria-label="Widok pracowników" disabled={busy} value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Pracownicy — wszyscy niearchiwalni</option><option value="active">Aktywni</option><option value="inactive">Nieaktywni</option>
        {pracownik.role === 'administrator' && <option value="archived">Archiwalni</option>}
      </select></label>
      {confirmation && <dialog ref={dialogRef} aria-modal="true" aria-labelledby="employee-confirm-title" onCancel={e => { e.preventDefault(); if (!busy) setConfirmation(null) }}>
        <h2 id="employee-confirm-title">{confirmation.action === 'archive' ? 'Usunąć pracownika?' : 'Dezaktywować pracownika?'}</h2>
        <p>Czy na pewno chcesz {confirmation.action === 'archive' ? 'usunąć' : 'dezaktywować'} konto {confirmation.employee.name}?</p>
        <p>{confirmation.action === 'archive' ? 'Pracownik straci możliwość logowania, ale jego historia w systemie zostanie zachowana.' : 'Pracownik straci możliwość logowania do aplikacji.'}</p>
        <p role="alert">{message}</p>
        <button autoFocus disabled={busy} onClick={() => setConfirmation(null)}>Anuluj</button>
        <button disabled={busy} onClick={() => lifecycle(confirmation.employee, confirmation.action)}>{confirmation.action === 'archive' ? 'Usuń konto' : 'Dezaktywuj'}</button>
      </dialog>}
      <fieldset disabled={busy || Boolean(confirmation)} style={{ border: 0, padding: 0, margin: 0 }}>
      {pinEmployee && <ManageEmployeePin key={pinEmployee.id} employee={pinEmployee} onClose={() => setPinEmployee(null)} onSaved={() => { setPinEmployee(null); setRevision(x => x + 1); setMessage('PIN został nadany.') }} />}
      {form && <form className="produkt auth-form" onSubmit={save}>
        <label>Imię<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Rola<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          {(pracownik.role === 'administrator' ? ['crafter', 'sushi-master', 'shift-manager', 'su-chef', 'manager', 'administrator'] : ['crafter', 'sushi-master', 'shift-manager', 'su-chef']).map(role => <option key={role}>{role}</option>)}
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
      <div className="produkty">{employees.filter(e => filter === 'archived' ? Boolean(e.archived_at) : !e.archived_at && (filter === 'all' || (filter === 'active' ? e.active : !e.active))).map(e => <div className="produkt" key={e.id}>
        <strong>{e.name}</strong><p>{e.role} · {lokale.find(l => String(l.id) === String(e.location_id))?.name || (e.role === 'administrator' ? 'Wszystkie lokale' : 'Brak lokalu')}</p>
        <p>{e.active ? 'Aktywny' : 'Nieaktywny'} · {e.auth_user_id ? 'Konto połączone' : 'Brak konta logowania'}</p>
        {pracownik.role === 'administrator' && !e.archived_at && ['manager', 'su-chef', 'shift-manager', 'sushi-master', 'crafter', 'employee'].includes(e.role) && <><button disabled={busy || !e.active} onClick={() => { setInvite(null); setForm(null); setPinEmployee(e) }}>Nadaj / resetuj PIN</button>{!e.active && <p>Nadanie PIN-u wymaga aktywnego konta.</p>}</>}
        {!e.archived_at && canManageEmployee(pracownik, e) && <><button disabled={busy} onClick={() => { setInvite(null); setForm({ ...e }) }}>Edytuj</button>
          {!e.auth_user_id && e.active && <button disabled={busy || pendingLinks.includes(e.id)} onClick={() => { setForm(null); setEmail(''); setInvite(e) }}>Zaproś do aplikacji</button>}</>}
        {pracownik.role === 'administrator' && canManageEmployee(pracownik, e) && (e.archived_at
          ? <button disabled={busy} onClick={() => lifecycle(e, 'restore')}>Przywróć</button>
          : <><button disabled={busy} onClick={() => e.active ? setConfirmation({ employee: e, action: 'deactivate' }) : lifecycle(e, 'activate')}>{e.active ? 'Dezaktywuj' : 'Aktywuj'}</button>
            <button disabled={busy} onClick={() => setConfirmation({ employee: e, action: 'archive' })}>Usuń</button></>)}
      </div>)}</div>
      </fieldset>
    </main></div>
}
