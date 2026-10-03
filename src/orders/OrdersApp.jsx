import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import ProductionMode from './ProductionMode'
import { canUseProductionMode } from './production'
import OrdersBoard from './OrdersBoard'
import OrderGenerator from './OrderGenerator'
import OrderNotices from './OrderNotices'
import { labels as L } from './labels'
import { lifecycle } from './board'
import EmployeesScreen from '../auth/EmployeesScreen'
import { pendingOperation, operationKey, orderError, formatTime, money, rateText, parseRate } from './client'

export default function OrdersApp({ employee, capabilities, onSignOut, onModules, onWorktime }) {
  // Keep both views mounted after first use so switching preserves in-progress form state.
  const [mode,setMode]=useState('general'), [operatorMounted,setOperatorMounted]=useState(false)
  const operatorAllowed=canUseProductionMode(capabilities)
  const operatorActive=operatorAllowed && mode==='operational'
  const [notices, setNotices] = useState([]), [noticeError, setNoticeError] = useState(false), [now, setNow] = useState(() => Date.now())
  const [focusOrder,setFocusOrder]=useState(null),[ackBusy,setAckBusy]=useState(false)
  const acknowledged=useRef(new Set())
  const has = name => capabilities.includes(name)
  const [location, setLocation] = useState(employee.location_id || ''), [locations, setLocations] = useState([])
  const [orders, setOrders] = useState([]), [catalog, setCatalog] = useState([]), [shifts, setShifts] = useState([])
  const [employeesOpen, setEmployeesOpen] = useState(false)
  const [tab, setTab] = useState('all'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState({}), [summary, setSummary] = useState(null), [history, setHistory] = useState(null), [events, setEvents] = useState(null)
  const [pending, setPending] = useState(() => { try { return JSON.parse(sessionStorage.getItem(operationKey(employee.id))) } catch { return null } })
  const alive = useRef(true), locked = useRef(false), generation = useRef(0), historyRequest = useRef(0)
  const shift = shifts.find(s => !s.ended_at && String(s.location_id) === String(location))
  const chef = capabilities.includes('orders.cut') && capabilities.includes('orders.issue')
  const load = useCallback(async () => {
    const n = ++generation.current
    try {
      const results = await Promise.all([supabase.rpc('orders_catalog'), supabase.rpc('orders_shifts'), location ? supabase.rpc('orders_board', { p_location: Number(location) }) : Promise.resolve({ data: [] })])
      if (!alive.current || n !== generation.current) return
      if (results.some(r => r.error)) { console.error('orders-read', { code: 'RPC_FAILED' }); setOrders([]); setCatalog([]); setShifts([]); setSummary(null); setHistory(null); setEvents(null); setMessage('Nie udało się odświeżyć danych lub utracono dostęp.'); return }
      setCatalog(results[0].data || []); setShifts(results[1].data || []); setOrders(results[2].data || []); setNow(Date.now())
      if (chef && location) {
        const response = await supabase.rpc('orders_notifications', { p_location: Number(location) })
        if (alive.current && n === generation.current) { setNoticeError(Boolean(response.error)); setNotices(response.error ? [] : (response.data || []).filter(n=>!acknowledged.current.has(n.id))) }
      } else setNotices([])
    } catch { if (alive.current && n === generation.current) { console.error('orders-read', { code: 'NETWORK' }); setOrders([]); setCatalog([]); setShifts([]); setEvents(null); setSummary(null); setHistory(null); setMessage('Brak połączenia. Dane wymagają odświeżenia.') } }
  }, [location, chef])
  useEffect(() => {
    alive.current = true
    const initial = setTimeout(() => void load(), 0)
    const requests = generation
    const timer = setInterval(() => void load(), 5000)
    return () => { alive.current = false; ++requests.current; clearTimeout(initial); clearInterval(timer) }
  }, [load])
  useEffect(() => {
    let active = true
    supabase.from('Locations').select('id,name').eq('active', true).then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      setLocations(data || [])
    }).catch(() => { console.error('orders-locations', { code: 'READ_FAILED' }); if (active) setMessage('Nie udało się pobrać lokali. Odśwież aplikację.') })
    return () => { active = false }
  }, [])
  async function run(action, args) {
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage('')
    try {
      const op = pendingOperation(sessionStorage, employee.id, action, args); setPending(op)
      const { error } = await supabase.rpc('orders_command', { p_action: action, p_args: args, p_operation: op.id })
      if (error) {
        // A structured PostgreSQL rejection rolled back the whole transaction. Network errors remain retryable with the same UUID.
        if (['P0001', '42501', '23514', '22P02', '22003'].includes(error.code)) { sessionStorage.removeItem(operationKey(employee.id)); setPending(null) }
        throw error
      }
      sessionStorage.removeItem(operationKey(employee.id)); if (!alive.current) return
      setPending(null); setSelection({}); setMessage('Zapisano.'); await load(); return true
    } catch (error) { console.error('orders-command', { action, code: /^[A-Z0-9]{5}$/.test(error?.code) ? error.code : 'UNCONFIRMED' }); if (alive.current) setMessage(orderError(error)) }
    finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  const action = (label, name, args, disabled = false) => <button disabled={busy || disabled} onClick={event => { if (event.detail < 2) void run(name, args) }}>{label}</button>
  const isMine = w => !w.released_at && w.employee_id === employee.id && !w.ready_for_cutting_at
  const visibleOrders = orders.filter(o => (tab !== 'new' || lifecycle(o) === 'new') && (tab !== 'board' || ['partial','in_progress'].includes(lifecycle(o))) && (tab !== 'done' || lifecycle(o) === 'done') && (tab !== 'mine' || o.items.some(i => i.assignments.some(isMine))))
  async function readHistory(id, type) {
    const n = ++historyRequest.current
    setSummary(null); setHistory(null)
    try {
      const { data, error } = await supabase.rpc(type === 'summary' ? 'orders_shift_summary' : 'orders_shift_history', { p_shift: Number(id) })
      if (!alive.current || n !== historyRequest.current) return
      if (error) throw error
      if (type === 'summary') setSummary({ ...data, shift_id: id }); else setHistory({ shiftId: id, rows: data || [] })
    } catch { console.error('orders-history', { code: 'READ_FAILED' }); if (alive.current && n === historyRequest.current) setMessage('Podsumowanie niedostępne. Sprawdź zakończenie zmiany i uprawnienia.') }
  }
  if (employeesOpen && has('employees.manage')) return <EmployeesScreen pracownik={employee} lokale={locations} onPowrot={() => setEmployeesOpen(false)} />
  return <div className="app orders-app"><header className="orders-header"><div><h1>Zamówienia</h1><p>{employee.name}</p></div><div className="header-actions">{has('worktime.access') && <button onClick={onWorktime}>Czas pracy</button>}{operatorAllowed && <div className="orders-mode-switch" role="group" aria-label={L.workMode}>{[['general',L.generalMode],['operational',L.operationalMode]].map(([key,label])=><button key={key} aria-pressed={operatorActive ? key==='operational' : key==='general'} onClick={()=>{setMode(key);if(key==='operational')setOperatorMounted(true)}}>{label}</button>)}</div>}<button disabled={busy} onClick={onModules}>← Wybór modułów</button>{has('employees.manage') && <button disabled={busy} onClick={() => setEmployeesOpen(true)}>Pracownicy</button>}<button disabled={busy} onClick={onSignOut}>Wyloguj</button></div></header>
    <label>Lokal<select value={location} disabled={busy} onChange={e => { ++historyRequest.current; setSelection({}); setOrders([]); setNotices([]); setNoticeError(false); setSummary(null); setHistory(null); setEvents(null); setLocation(e.target.value) }}><option value="">Wybierz lokal</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <div hidden={operatorActive}>
    <nav aria-label="Widoki zamówień">{[['all',L.all],['new',L.waiting],['board',L.working],['done',L.done],...(has('orders.work') ? [['mine','Moje zadania']] : []),['shifts','Zmiany / historia'],...(has('orders.test.generate') ? [['generator','Generator UAT']] : []),...(has('orders.rates.manage') ? [['rates','Katalog i stawki']] : [])].map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{['all','new','board','done'].includes(key) ? ` (${orders.filter(o=>key==='all' || (key==='new' ? lifecycle(o)==='new' : key==='done' ? lifecycle(o)==='done' : ['partial','in_progress'].includes(lifecycle(o)))).length})` : ''}</button>)}</nav>
    {chef && <OrderNotices notices={notices} error={noticeError} busy={ackBusy} onView={id=>{setTab('all');setFocusOrder({id,nonce:Date.now()})}} onRead={async id=>{
      if(ackBusy)return;setAckBusy(true)
      try {const {error}=await supabase.rpc('orders_notifications',{p_location:Number(location),p_ack:id});if(error)throw error;acknowledged.current.add(id);if(alive.current)setNotices(old=>old.filter(x=>x.id!==id))}
      catch {if(alive.current)setNoticeError(true)}finally{if(alive.current)setAckBusy(false)}
    }}/>}
    <p role="status">{message}</p>{pending && <aside>Operacja oczekuje na potwierdzenie. {action('Ponów tę samą operację',pending.action,pending.args)}</aside>}
    <section className="shift-panel" aria-label="Moja zmiana"><div><h2>Moja zmiana</h2><p>{shift ? `Zmiana od ${formatTime(shift.started_at)}` : 'Brak aktywnej zmiany w tym lokalu'}</p><small>Podgląd zamówień nie wymaga rozpoczęcia zmiany.</small></div>
      {shift ? action('Zakończ zmianę','end_shift',{ shift_id: shift.id }) : action('Rozpocznij zmianę','open_shift',{ location_id: Number(location) },!location)}</section>
    {tab === 'generator' && has('orders.test.generate') && <OrderGenerator catalog={catalog} location={location} disabled={busy || Boolean(pending)} run={run}/>}
    {tab === 'rates' && has('orders.rates.manage') && <section><h2>Katalog i stawki</h2>{catalog.map(p => <RateEditor key={`${p.id}:${p.work_rate_minor}:${p.active}`} product={p} busy={busy} save={args => run('rate',args)} />)}</section>}
    {tab === 'shifts' && <section><h2>Zmiany / historia</h2>{shifts.length === 0 && <p>Nie masz jeszcze zmian.</p>}{shifts.map(s => <article key={s.id}><p>{formatTime(s.started_at)} → {formatTime(s.ended_at)}</p>
      {(has('orders.history.own') || has('orders.finance')) && s.ended_at && <button onClick={() => readHistory(s.id,'summary')}>Podsumowanie zmiany {s.id}</button>}
      {has('orders.history.local') && <button onClick={() => readHistory(s.id,'history')}>Historia zmiany {s.id}</button>}</article>)}
      {summary && <article><h2>Podsumowanie zmiany {summary.shift_id}</h2><p>{formatTime(summary.started_at)} → {formatTime(summary.ended_at)}</p>{summary.products.map(p => <p key={p.name}>{p.name} — {p.quantity}</p>)}<p>Wykonano: {summary.total_units} szt.</p><p>Zarobiono: {money(summary.total_amount_minor)}</p></article>}
      {history && <article><h2>Historia zmiany {history.shiftId}</h2>{history.rows.length === 0 && <p>Brak wydanych pozycji w tej zmianie.</p>}{history.rows.map((h,n) => <div key={n}><h3>{h.order} · {h.product} ×{h.quantity}</h3><p>Wykonał: {h.maker}; kroił: {h.cutter}; wydał: {h.issuer}</p><p>Przejęte: {formatTime(h.claimed_at)} · Gotowe: {formatTime(h.ready_at)} · Krojenie: {formatTime(h.cutting_started_at)} → {formatTime(h.cutting_completed_at)} · Wydane: {formatTime(h.issued_at)}</p></div>)}</article>}</section>}
    {['board','all','new','mine','done'].includes(tab) && <>
      {!visibleOrders.length && <p className="empty-state">{L.empty}</p>}
      <OrdersBoard focusOrder={focusOrder} orders={visibleOrders} employee={employee} capabilities={capabilities} shift={shift} disabled={busy || Boolean(pending)} selection={selection} setSelection={setSelection} run={run} now={now} onHistory={tab==='all' ? async o => {
        const n=++historyRequest.current;setEvents(null)
        try { const {data,error}=await supabase.rpc('orders_history',{p_order:o.id});if(error)throw error;if(alive.current && n===historyRequest.current)setEvents({number:o.display_number,rows:data||[]}) }
        catch { if(alive.current && n===historyRequest.current)setMessage('Nie udało się pobrać historii zamówienia.') }
      } : null}/>
    </>}
    {tab === 'all' && events && <section><h2>Historia {events.number}</h2>{events.rows.length === 0 && <p>Brak zdarzeń.</p>}{events.rows.map((e,n)=><p key={n}>{formatTime(e.at)} · {e.event} · {e.actor}</p>)}</section>}
    </div>
    {operatorAllowed && operatorMounted && <div hidden={!operatorActive}><ProductionMode now={now} employee={employee} capabilities={capabilities} orders={orders} shift={shift} location={location} busy={busy} pending={pending} message={message} run={run}/></div>}
  </div>
}
function RateEditor({product,busy,save}) {
  const [rate,setRate]=useState(rateText(product.work_rate_minor)),[active,setActive]=useState(product.active)
  const minor = parseRate(rate)
  return <form className="rate-editor" onSubmit={e=>{e.preventDefault();if (minor !== null) save({product_id:product.id,rate_minor:minor,active})}}>
    <strong>{product.name}<small>Obecnie: {money(product.work_rate_minor)}</small></strong>
    <label>Stawka w zł<input aria-label={`Stawka w zł — ${product.name}`} type="text" inputMode="decimal" required disabled={busy} value={rate} aria-invalid={minor === null} onChange={e=>setRate(e.target.value)}/></label>
    <label>Aktywny<input type="checkbox" disabled={busy} checked={active} onChange={e=>setActive(e.target.checked)}/></label>
    <button disabled={busy || minor === null}>Zapisz stawkę</button>
    {minor === null && <p role="alert">Wpisz kwotę od 0 do 1 000 000 zł, maksymalnie dwa miejsca po przecinku.</p>}
  </form>
}
