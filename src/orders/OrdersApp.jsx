import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import ProductionMode from './ProductionMode'
import { canUseProductionMode } from './production'
import EmployeesScreen from '../auth/EmployeesScreen'
import { pendingOperation, operationKey, orderError, formatTime, money, rateText, parseRate, orderStatus } from './client'

export default function OrdersApp({ employee, capabilities, onSignOut, onModules }) {
  const [productionMode, setProductionMode] = useState(false)
  const has = name => capabilities.includes(name)
  const [location, setLocation] = useState(employee.location_id || ''), [locations, setLocations] = useState([])
  const [orders, setOrders] = useState([]), [catalog, setCatalog] = useState([]), [shifts, setShifts] = useState([])
  const [employeesOpen, setEmployeesOpen] = useState(false)
  const [tab, setTab] = useState('board'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState({}), [testItems, setTestItems] = useState({}), [summary, setSummary] = useState(null), [history, setHistory] = useState(null), [events, setEvents] = useState(null)
  const [pending, setPending] = useState(() => { try { return JSON.parse(sessionStorage.getItem(operationKey(employee.id))) } catch { return null } })
  const alive = useRef(true), locked = useRef(false), generation = useRef(0), historyRequest = useRef(0)
  const shift = shifts.find(s => !s.ended_at && String(s.location_id) === String(location))
  const load = useCallback(async () => {
    const n = ++generation.current
    try {
      const results = await Promise.all([supabase.rpc('orders_catalog'), supabase.rpc('orders_shifts'), location ? supabase.rpc('orders_board', { p_location: Number(location) }) : Promise.resolve({ data: [] })])
      if (!alive.current || n !== generation.current) return
      if (results.some(r => r.error)) { console.error('orders-read', { code: 'RPC_FAILED' }); setOrders([]); setCatalog([]); setShifts([]); setSummary(null); setHistory(null); setEvents(null); setMessage('Nie udało się odświeżyć danych lub utracono dostęp.'); return }
      setCatalog(results[0].data || []); setShifts(results[1].data || []); setOrders(results[2].data || [])
    } catch { if (alive.current && n === generation.current) { console.error('orders-read', { code: 'NETWORK' }); setOrders([]); setCatalog([]); setShifts([]); setEvents(null); setSummary(null); setHistory(null); setMessage('Brak połączenia. Dane wymagają odświeżenia.') } }
  }, [location])
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
  const visibleOrders = orders.filter(o => (tab !== 'new' || o.status === 'NEW') && (tab !== 'board' || !['COMPLETED','NEW'].includes(o.status)) && (tab !== 'mine' || o.items.some(i => i.assignments.some(isMine))))
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
  if (productionMode && canUseProductionMode(capabilities)) return <ProductionMode employee={employee} capabilities={capabilities} orders={orders} shift={shift} location={location} locations={locations} onLocation={value => { setOrders([]); setLocation(value) }} busy={busy} pending={pending} message={message} run={run} onExit={() => setProductionMode(false)} />
  return <div className="app orders-app"><header className="orders-header"><div><h1>Zamówienia</h1><p>{employee.name}</p></div><div className="header-actions">{canUseProductionMode(capabilities) && <button disabled={busy} onClick={() => setProductionMode(true)}>Tryb produkcyjny</button>}<button disabled={busy} onClick={onModules}>← Wybór modułów</button>{has('employees.manage') && <button disabled={busy} onClick={() => setEmployeesOpen(true)}>Pracownicy</button>}<button disabled={busy} onClick={onSignOut}>Wyloguj</button></div></header>
    <label>Lokal<select value={location} disabled={busy} onChange={e => { ++historyRequest.current; setSelection({}); setOrders([]); setSummary(null); setHistory(null); setEvents(null); setLocation(e.target.value) }}><option value="">Wybierz lokal</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <nav aria-label="Widoki zamówień">{[['board','Live board'],['all','Wszystkie'],...(has('orders.dispatch') ? [['new','Nowe']] : []),...(has('orders.work') ? [['mine','Moje zadania']] : []),['shifts','Zmiany / historia'],...(has('orders.test.generate') ? [['generator','Generator UAT']] : []),...(has('orders.rates.manage') ? [['rates','Katalog i stawki']] : [])].map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <p role="status">{message}</p>{pending && <aside>Operacja oczekuje na potwierdzenie. {action('Ponów tę samą operację',pending.action,pending.args)}</aside>}
    <section className="shift-panel" aria-label="Moja zmiana"><div><h2>Moja zmiana</h2><p>{shift ? `Zmiana od ${formatTime(shift.started_at)}` : 'Brak aktywnej zmiany w tym lokalu'}</p><small>Podgląd zamówień nie wymaga rozpoczęcia zmiany.</small></div>
      {shift ? action('Zakończ zmianę','end_shift',{ shift_id: shift.id }) : action('Rozpocznij zmianę','open_shift',{ location_id: Number(location) },!location)}</section>
    {tab === 'generator' && has('orders.test.generate') && <section><h2>Generator zamówienia testowego</h2><p>Wyłącznie fikcyjne zamówienia UAT.</p>{catalog.filter(p => p.active && p.is_test).map(p => <label key={p.id}>{p.name}<input disabled={busy} aria-label={`Test ${p.name}`} type="number" min="0" max="10000" step="1" value={testItems[p.id] || ''} onChange={e => setTestItems(x => ({ ...x,[p.id]: e.target.value }))} /></label>)}
      {action('Utwórz zamówienie','create_test',{ location_id: Number(location),items: Object.entries(testItems).filter(([,q]) => Number(q)>0).map(([id,q]) => ({product_id:Number(id),quantity:Number(q)})) },!location || !Object.values(testItems).some(q => Number(q)>0))}</section>}
    {tab === 'rates' && has('orders.rates.manage') && <section><h2>Katalog i stawki</h2>{catalog.map(p => <RateEditor key={`${p.id}:${p.work_rate_minor}:${p.active}`} product={p} busy={busy} save={args => run('rate',args)} />)}</section>}
    {tab === 'shifts' && <section><h2>Zmiany / historia</h2>{shifts.length === 0 && <p>Nie masz jeszcze zmian.</p>}{shifts.map(s => <article key={s.id}><p>{formatTime(s.started_at)} → {formatTime(s.ended_at)}</p>
      {(has('orders.history.own') || has('orders.finance')) && s.ended_at && <button onClick={() => readHistory(s.id,'summary')}>Podsumowanie zmiany {s.id}</button>}
      {has('orders.history.local') && <button onClick={() => readHistory(s.id,'history')}>Historia zmiany {s.id}</button>}</article>)}
      {summary && <article><h2>Podsumowanie zmiany {summary.shift_id}</h2><p>{formatTime(summary.started_at)} → {formatTime(summary.ended_at)}</p>{summary.products.map(p => <p key={p.name}>{p.name} — {p.quantity}</p>)}<p>Wykonano: {summary.total_units} szt.</p><p>Zarobiono: {money(summary.total_amount_minor)}</p></article>}
      {history && <article><h2>Historia zmiany {history.shiftId}</h2>{history.rows.length === 0 && <p>Brak wydanych pozycji w tej zmianie.</p>}{history.rows.map((h,n) => <div key={n}><h3>{h.order} · {h.product} ×{h.quantity}</h3><p>Wykonał: {h.maker}; kroił: {h.cutter}; wydał: {h.issuer}</p><p>Przejęte: {formatTime(h.claimed_at)} · Gotowe: {formatTime(h.ready_at)} · Krojenie: {formatTime(h.cutting_started_at)} → {formatTime(h.cutting_completed_at)} · Wydane: {formatTime(h.issued_at)}</p></div>)}</article>}</section>}
    {['board','all','new','mine'].includes(tab) && visibleOrders.length === 0 && <p className="empty-state">{!location ? 'Wybierz lokal, aby zobaczyć zamówienia.' : tab === 'mine' ? 'Nie masz przejętych zadań do wykonania.' : 'Brak zamówień w tym widoku.'}</p>}
    {['board','all','new','mine'].includes(tab) && visibleOrders.map(o => <article key={o.id} className="order-card"><div className="order-heading"><h2>{o.display_number}</h2><span className={`order-status status-${o.status}`}>{orderStatus(o.status)}</span><time>{formatTime(o.received_at)}</time></div>
      {o.status === 'NEW' && has('orders.dispatch') && action('Przekaż na kuchnię','send',{order_id:o.id})}
      {o.status !== 'NEW' && has('orders.work') && tab !== 'mine' && <div className="claim-actions">{action('Weź całe pozostałe','claim_all',{order_id:o.id},!shift || !o.items.some(i => i.available>0))}{action('Weź zaznaczone','claim',{order_id:o.id,items:o.items.filter(i => Number(selection[i.id])>0).map(i => ({item_id:i.id,quantity:Number(selection[i.id])}))},!shift || !o.items.some(i => Number(selection[i.id])>0))}{!shift && <small>Rozpocznij zmianę, aby przejąć zadania.</small>}</div>}
      <div className="order-items" role="region" aria-label={`Pozycje ${o.display_number}`} tabIndex={0}>{o.items.filter(i => (tab !== 'board' || i.issued<i.quantity) && (tab !== 'mine' || i.assignments.some(isMine))).map(i => <section className="order-item" key={i.id}><h3>{i.name}</h3><p className="item-quantity">Zamówiono: {i.quantity} szt.</p><p className="item-counters"><strong>Pozostało: {i.available}</strong><span>Wydane: {i.issued} / {i.quantity}</span></p>
        {has('orders.work') && o.status !== 'NEW' && i.available>0 && tab !== 'mine' && <label className="partial-claim">Weź część — ilość<input disabled={busy} aria-label={`Weź ${i.name}`} type="number" min="0" max={i.available} step="1" value={selection[i.id] || ''} onChange={e => setSelection(x => ({...x,[i.id]:e.target.value}))}/></label>}
        {i.assignments.filter(w => !w.released_at && (tab !== 'board' || w.cuttings.filter(c => c.issued_at).reduce((sum,c) => sum+c.quantity,0)<w.quantity) && (tab !== 'mine' || (w.employee_id===employee.id && !w.ready_for_cutting_at))).map(w => <div key={w.id} className="work-card">
          <strong>{w.employee_name} ×{w.quantity} · {w.ready_for_cutting_at ? 'DO KROJENIA' : 'W TRAKCIE'}</strong><p>Przejęte: {formatTime(w.claimed_at)} · Gotowe: {formatTime(w.ready_for_cutting_at)}</p>
          {w.employee_id===employee.id && !w.ready_for_cutting_at && has('orders.work') && <>{action('Gotowe','ready',{assignment_id:w.id},!shift)}{action('Oddaj zadanie','release',{assignment_id:w.id},!shift)}</>}
          {has('orders.cut') && w.ready_for_cutting_at && w.cutting_available>0 && action(`Rozpocznij krojenie ×${w.cutting_available}`,'start_cutting',{assignment_id:w.id,quantity:w.cutting_available},!shift)}
          {w.cuttings.filter(c => tab !== 'board' || !c.issued_at).map(c => <div key={c.id}><p>{c.issued_at ? 'WYDANE' : 'KROJENIE'}: {c.employee_name} ×{c.quantity} · od {formatTime(c.started_at)}</p>
            {c.employee_id===employee.id && !c.completed_at && has('orders.cut') && action('Zakończ krojenie','complete_cutting',{cutting_id:c.id},!shift)}
            {c.employee_id===employee.id && c.completed_at && !c.issued_at && has('orders.issue') && action('Wydane','issue',{cutting_id:c.id},!shift)}</div>)}
        </div>)}
      </section>)}</div>
      {tab === 'all' && <button onClick={async () => {
        setEvents(null)
        const n = ++historyRequest.current
        try { const {data,error}=await supabase.rpc('orders_history',{p_order:o.id}); if (error) throw error; if (alive.current && n === historyRequest.current) setEvents({ number: o.display_number, rows: data || [] }) }
        catch { console.error('orders-history', { code: 'READ_FAILED' }); if (alive.current && n === historyRequest.current) setMessage('Nie udało się pobrać historii zamówienia. Spróbuj ponownie.') }
      }}>Historia zamówienia {o.display_number}</button>}
    </article>)}
    {tab === 'all' && events && <section><h2>Historia {events.number}</h2>{events.rows.length === 0 && <p>Brak zdarzeń.</p>}{events.rows.map((e,n)=><p key={n}>{formatTime(e.at)} · {e.event} · {e.actor}</p>)}</section>}
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
