import { pinRoles } from './loginRoles'
import EmailInvite from './EmailInvite'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { canManageEmployee, roleLabels } from './session'
import ManageEmployeePin from './ManageEmployeePin'

export default function EmployeesScreen({ pracownik, lokale, onPowrot }) {
  const [filter, setFilter] = useState('all')
  const [confirmation, setConfirmation] = useState(null)
  const dialogRef = useRef(null)
  useEffect(() => { if (confirmation) dialogRef.current?.showModal() }, [confirmation])
  const actionPending = useRef(false)
  const [pinEmployee, setPinEmployee] = useState(null)
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(null)
  const [actionBusy, setBusy] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const busy = actionBusy || pinBusy
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let alive = true
    supabase.rpc('auth_list_employees').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('employees-list', { code: 'READ_FAILED' }); setEmployees([]); setMessage('Nie udało się pobrać pracowników.') }
      else setEmployees(data || [])
    }).catch(() => { console.error('employees-list', { code: 'NETWORK' }); if (alive) { setEmployees([]); setMessage('Brak połączenia.') } })
    return () => { alive = false }
  }, [revision])
  const lifecycle = async (employee, action) => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.rpc('auth_employee_lifecycle', { p_employee_id: employee.id, p_action: action })
      if (error) throw error
      setConfirmation(null); setForm(null); setPinEmployee(null)
      setRevision(x => x + 1)
      setMessage(action === 'restore' ? 'Przywrócono pracownika jako nieaktywnego.' : 'Zapisano zmianę konta.')
    } catch { console.error('employee-lifecycle', { code: 'COMMAND_FAILED' }); setMessage('Nie udało się zmienić konta pracownika. Spróbuj ponownie.') }
    finally { actionPending.current = false; setBusy(false) }
  }
  const save = async (event) => {
    event.preventDefault()
    if (busy || actionPending.current) return
    actionPending.current = true
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.rpc('auth_save_employee', {
        p_employee_id: form.id || null, p_name: form.name.trim(), p_role: form.role,
        p_location_id: form.location_id || null, p_active: form.active,
      })
      if (error) throw new Error(error.message)
      setForm(null); setRevision(x => x + 1); setMessage('Zapisano pracownika.')
    } catch { console.error('employee-account', { code: 'COMMAND_FAILED' }); setMessage('Nie udało się zapisać operacji. Sprawdź dane i uprawnienia, a następnie spróbuj ponownie.') } finally { actionPending.current = false; setBusy(false) }
  }
  return <div className="app employees-screen"><header><h1>Pracownicy</h1><p>Zalogowany jako: {pracownik.name} · {pracownik.role}</p><button disabled={busy} onClick={onPowrot}>← Powrót</button></header>
    <main>
      <button disabled={busy} onClick={() => { setPinEmployee(null); setForm({ name: '', role: 'crafter', location_id: pracownik.location_id || '', active: true }) }}>Dodaj pracownika</button>
      <p role="status">{message}</p>
      <label>Widok pracowników<select aria-label="Widok pracowników" disabled={busy} value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Pracownicy — wszyscy niearchiwalni</option><option value="active">Aktywni</option><option value="inactive">Nieaktywni</option>
        {['owner', 'administrator'].includes(pracownik.role) && <option value="archived">Archiwalni</option>}
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
      {form && <form className="produkt auth-form" onSubmit={save}>
        <h2>{form.id ? `Edytuj: ${form.name}` : 'Nowy pracownik'}</h2>
        <label>Imię<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Rola<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          {(['owner', 'administrator'].includes(pracownik.role) ? ['crafter', 'sushi-master', 'shift-manager', 'su-chef', 'manager', 'administrator', 'owner', 'director', 'expert', 'specialist'] : ['crafter', 'sushi-master', 'shift-manager', 'su-chef']).map(role => <option key={role} value={role}>{roleLabels[role] || role}</option>)}
        </select></label>
        <label>Lokal<select required={!['owner','administrator','director','expert','specialist'].includes(form.role)} disabled={!['owner', 'administrator'].includes(pracownik.role)} value={form.location_id ?? ''} onChange={e => setForm({ ...form, location_id: e.target.value })}>
          <option value="">Wszystkie lokale (administrator)</option>{lokale.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
        <label><span>Aktywny</span><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /></label>
        <button disabled={busy}>Zapisz</button><button type="button" disabled={busy} onClick={() => setForm(null)}>Anuluj</button>
      </form>}
      <div className="produkty">{employees.filter(e => filter === 'archived' ? Boolean(e.archived_at) : !e.archived_at && (filter === 'all' || (filter === 'active' ? e.active : !e.active))).map(e => <div className="produkt employee-card" key={e.id}>
        <h2>{e.name}</h2>{['owner','administrator'].includes(pracownik.role) && <EmailInvite employee={e} revision={revision}/>}<p>{e.role} · {lokale.find(l => String(l.id) === String(e.location_id))?.name || (['owner', 'administrator'].includes(e.role) ? 'Wszystkie lokale' : 'Brak lokalu')}</p>
        <p className={`employee-state ${e.active ? 'is-active' : 'is-inactive'}`}>{e.archived_at ? 'Archiwalny' : e.active ? 'Aktywny' : 'Nieaktywny'} · {e.auth_user_id ? 'Konto połączone' : 'Brak konta logowania'}</p>
        <div className="employee-actions">{['owner', 'administrator'].includes(pracownik.role) && !e.archived_at && pinRoles.includes(e.role) && <><button className="primary-action" aria-expanded={pinEmployee?.id === e.id} disabled={busy || !e.active} onClick={() => { setForm(null); setPinEmployee(e) }}>Nadaj / resetuj PIN</button>{!e.active && <p>Nadanie PIN-u wymaga aktywnego konta.</p>}</>}
        {!e.archived_at && canManageEmployee(pracownik, e) && <><button disabled={busy} onClick={() => { setPinEmployee(null); setForm({ ...e }) }}>Edytuj</button>
          </>}
        {['owner', 'administrator'].includes(pracownik.role) && canManageEmployee(pracownik, e) && (e.archived_at
          ? <button disabled={busy} onClick={() => lifecycle(e, 'restore')}>Przywróć</button>
          : <><button disabled={busy} onClick={() => e.active ? setConfirmation({ employee: e, action: 'deactivate' }) : lifecycle(e, 'activate')}>{e.active ? 'Dezaktywuj' : 'Aktywuj'}</button>
            <button className="danger-action" disabled={busy} onClick={() => setConfirmation({ employee: e, action: 'archive' })}>Usuń</button></>)}
      </div>
        {pinEmployee?.id === e.id && <ManageEmployeePin key={e.id} employee={e} locationName={lokale.find(l => String(l.id) === String(e.location_id))?.name || 'Brak lokalu'} onBusy={setPinBusy} onClose={() => setPinEmployee(null)} onSaved={() => { setPinEmployee(null); setRevision(x => x + 1); setMessage('PIN został nadany.') }} />}
      </div>)}</div>
      </fieldset>
    </main></div>
}
