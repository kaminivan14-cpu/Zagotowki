import { useState } from 'react'
import { productionTasks, quantityArgs } from './production'

export default function ProductionMode({ employee, capabilities, orders, shift, location, busy, pending, message, run }) {
  const { mine, available } = productionTasks(orders, employee.id, capabilities)
  const blocked = busy || Boolean(pending)
  return <main className="production-mode">
    <p role="status" aria-live="polite">{busy ? 'Zapisywanie…' : message}</p>
    {pending && <aside><p>Najpierw potwierdź poprzednią operację. Nie przejmuj kolejnego zadania.</p><button disabled={busy} onClick={() => run(pending.action, pending.args)}>Ponów tę samą operację</button></aside>}
    {!shift && <section><h2>Rozpocznij pracę</h2><p>Zadania możesz przejmować po rozpoczęciu zmiany w tym lokalu.</p><button className="production-primary" disabled={blocked || !location} onClick={() => run('open_shift', { location_id: Number(location) })}>Rozpocznij zmianę</button></section>}
    <TaskGroup title="Moje aktywne" tasks={mine} empty="Nie masz aktywnych zadań." disabled={blocked || !shift} run={run} />
    <TaskGroup title="Do wzięcia" tasks={available} empty={location ? 'Wszystko przejęte. Nowe zadania pojawią się automatycznie.' : 'Wybierz lokal.'} disabled={blocked || !shift} run={run} />
  </main>
}
function TaskGroup({ title, tasks, empty, disabled, run }) {
  const groups = new Map()
  for (const task of tasks) { if (!groups.has(task.orderId)) groups.set(task.orderId, []); groups.get(task.orderId).push(task) }
  return <section className="production-group"><h2>{title} · {tasks.length}</h2>{!tasks.length && <p className="empty-state">{empty}</p>}
    {[...groups].map(([id, rows]) => <article key={id}><h3>Zamówienie {rows[0].orderNumber}</h3><p className="production-scroll-hint">{rows.length} kart · przesuń w bok, aby zobaczyć kolejne</p><div className="production-cards" role="region" aria-label={`${title} — ${rows[0].orderNumber}`} tabIndex={0}>
      {rows.map(task => <TaskCard key={task.key} task={task} disabled={disabled} run={run} />)}
    </div></article>)}
  </section>
}
function TaskCard({ task, disabled, run }) {
  const [split, setSplit] = useState(false), [custom, setCustom] = useState(false), [digits, setDigits] = useState(''), [confirmRelease, setConfirmRelease] = useState(false)
  const available = ['claim', 'start_cutting'].includes(task.action)
  const label = available ? 'Weź całość' : task.action === 'issue' ? 'Wydane' : 'Gotowe'
  async function take(quantity) {
    const args = quantityArgs(task, quantity)
    if (args && await run(task.action, args)) { setSplit(false); setCustom(false); setDigits('') }
  }
  return <section className="production-task" aria-label={`${task.name} — ${task.status}`}>
    <span className="order-status">{task.status}</span><h3>{task.name}</h3><p className="production-quantity">{task.quantity} <span>szt.</span></p>
    <p>{task.action === 'complete_cutting' ? 'Gotowe przekazuje tę porcję do wydania.' : task.action === 'ready' ? 'Gotowe przekazuje tę porcję do krojenia.' : available ? 'Ilość dostępna do przejęcia' : 'Porcja gotowa do wydania'}</p>
    {confirmRelease ? <div className="production-confirm" role="group" aria-label="Potwierdź oddanie zadania"><p>Oddać {task.quantity} szt. do wspólnej puli?</p><button disabled={disabled} onClick={async () => { if (await run('release', task.release)) setConfirmRelease(false) }}>Tak, oddaj zadanie</button><button disabled={disabled} onClick={() => setConfirmRelease(false)}>Zostaw u mnie</button></div> : <>
      <button className="production-primary" disabled={disabled} onClick={() => available ? take(task.quantity) : run(task.action, task.args)}>{label}</button>
      {available && <button disabled={disabled} aria-expanded={split} onClick={() => { setSplit(!split); setCustom(false); setDigits('') }}>{split ? 'Zamknij podział' : 'Podziel'}</button>}
      {task.release && <button disabled={disabled} onClick={() => setConfirmRelease(true)}>Oddaj zadanie</button>}
    </>}
    {available && split && <div className="production-split"><p>Wybierz ilość — od razu przejmiesz zadanie.</p><div className="production-choices">{[1, 2, 5, 10].map(q => <button key={q} disabled={disabled || q > task.quantity} onClick={() => take(q)}>{q}</button>)}<button disabled={disabled} onClick={() => take(task.quantity)}>Całość</button><button disabled={disabled} aria-expanded={custom} onClick={() => setCustom(!custom)}>Inna</button></div>
      {custom && <div><output aria-label="Wybrana ilość">{digits || '0'} / {task.quantity}</output><div className="production-keypad">{['1','2','3','4','5','6','7','8','9','Wyczyść','0','Cofnij'].map(key => <button key={key} disabled={disabled} onClick={() => setDigits(value => key === 'Wyczyść' ? '' : key === 'Cofnij' ? value.slice(0,-1) : (value + key).replace(/^0+/, '').slice(0,5))}>{key}</button>)}</div><button className="production-primary" disabled={disabled || !quantityArgs(task, Number(digits))} onClick={() => take(Number(digits))}>Weź {digits || '0'} szt.</button></div>}
    </div>}
  </section>
}
