import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { emailRoles, emailAccessLabels } from './loginRoles'
import { invitationFailure } from './inviteResult'
import Dialog from '../tasks/components/Dialog'

export default function EmailInvite({ employee, revision }) {
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [opened, setOpened] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const pending = useRef(false)
  const eligible = emailRoles.includes(employee.role)
  useEffect(() => {
    if (!eligible) return
    let live = true
    supabase.rpc('auth_email_access').then(({ data, error }) => {
      if (!live) return
      const row = !error && Array.isArray(data) ? data.find(item => item.employee_id === employee.id) : null
      if (row) setAccess(row)
      setLookupFailed(!row)
    }).catch(() => { if (live) setLookupFailed(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [employee.id, employee.role, eligible, revision, refresh])
  if (!eligible) return null
  // The backend remains the permission/identity/idempotency gate. A failed read
  // must not hide the form, or erase a previously confirmed invitation.
  const canInvite = employee.active === true && !employee.archived && !employee.archived_at &&
    !['active', 'invited', 'pending'].includes(access?.access_state)
  return <div className="email-access">
    <small>{access ? emailAccessLabels[access.access_state] : loading ? 'Перевірка доступу…' : 'Не вдалося перевірити доступ'}</small>
    {lookupFailed && access && <small>Не вдалося оновити стан доступу</small>}
    {canInvite && <button type="button" disabled={busy} onClick={() => { setMessage(''); setOpened(true) }}>Запросити</button>}
    {message && <p role="status">{message}</p>}
    {opened && <Dialog title={`Запросити: ${employee.name}`} busy={busy} onClose={() => setOpened(false)}>
      <form onSubmit={async event => {
        event.preventDefault()
        if (pending.current) return
        pending.current = true; setBusy(true); setMessage('')
        try {
          const response = await supabase.functions.invoke('invite-employee', { body: { employee_id: employee.id, email: email.trim() } })
          const failure = await invitationFailure(response)
          if (failure) setMessage(failure.message)
          else { setAccess({ employee_id: employee.id, access_state: 'invited', can_invite: false }); setMessage('Запрошення надіслано'); setOpened(false); setEmail('') }
        } catch { setMessage('Не вдалося підтвердити запрошення. Перевірте стан доступу перед повторенням.') }
        finally { pending.current = false; setBusy(false); setRefresh(value => value + 1) }
      }}>
        <p>{employee.name} · {employee.role}</p>
        <label>Email<input type="email" required autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <p>Перевірте адресу: її власник отримає доступ як цей працівник.</p>
        <button disabled={busy || !canInvite}>Надіслати запрошення</button>
        <button type="button" disabled={busy} onClick={() => setOpened(false)}>Скасувати</button>
        {message && <p role="alert">{message}</p>}
      </form>
    </Dialog>}
  </div>
}
