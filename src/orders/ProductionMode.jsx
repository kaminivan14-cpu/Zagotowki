import { useState } from 'react'
import OrderHeader from './OrderHeader'
import { orderDeadline } from './board'
import { labels as L } from './labels'
import { productionTasks, quantityArgs } from './production'

export default function ProductionMode({ employee, capabilities, orders, shift, location, busy, pending, message, run, now }) {
  const { mine, available } = productionTasks(orders, employee.id, capabilities)
  const blocked = busy || Boolean(pending)
  return <main className="production-mode">
    <p role="status" aria-live="polite">{busy ? 'Zapisywanie…' : message}</p>
    {pending && <aside><p>Najpierw potwierdź poprzednią operację. Nie przejmuj kolejnego zadania.</p><button disabled={busy} onClick={() => run(pending.action, pending.args)}>Ponów tę samą operację</button></aside>}
    {!shift && <section><h2>Rozpocznij pracę</h2><p>Zadania możesz przejmować po rozpoczęciu zmiany w tym lokalu.</p><button className="production-primary" disabled={blocked || !location} onClick={() => run('open_shift', { location_id: Number(location) })}>Rozpocznij zmianę</button></section>}
    <h2>{L.myActive} · {mine.length}</h2>
    <p>{L.availableWork} · {available.length}</p>
    {!mine.length && !available.length && <p className="empty-state">{L.empty}</p>}
    <div className="orders-horizontal" role="region" aria-label={L.operatorBoard} tabIndex={0}>
     {orders.filter(o=>[...mine,...available].some(t=>t.orderId===o.id)).map(order=>{
      const tasks=[...mine,...available].filter(t=>t.orderId===order.id), urgency=orderDeadline(order,now)
      const groups=new Map()
      for(const task of tasks) {
       const key=task.parentId ? `set:${task.parentId}` : `item:${task.itemId}`
       if(!groups.has(key))groups.set(key,[])
       groups.get(key).push(task)
      }
      return <article key={order.id} data-order-id={order.id} className={`order-column deadline-${urgency?.level || 'normal'}`}>
       <OrderHeader order={order} urgency={urgency} now={now}/>
       {[...groups].map(([key,rows])=>{
        const parent=order.items.find(i=>i.id===rows[0].parentId)
        return <section key={key} className={parent?'operator-set':'operator-items'}>
         {parent && <h3>{parent.name} ×{parent.quantity}</h3>}
         <div className={parent?'set-components':undefined}>{rows.map(task=><TaskCard key={task.key} task={task} disabled={blocked || !shift} run={run}/>)}</div>
        </section>
       })}
      </article>
     })}
    </div>
  </main>
}
function TaskCard({ task, disabled, run }) {
  const [split, setSplit] = useState(false), [custom, setCustom] = useState(false), [digits, setDigits] = useState(''), [confirmRelease, setConfirmRelease] = useState(false)
  const available = ['claim', 'start_cutting'].includes(task.action)
  const label = available ? 'Weź całość' : task.action === 'issue' ? 'Wydane' : 'Gotowe'
  async function take(quantity) {
    const args = quantityArgs(task, quantity)
    if (args && await run(task.action, args)) { setSplit(false); setCustom(false); setDigits('') }
  }
  return <section data-work-key={task.key} className="production-task" aria-label={`${task.name} — ${task.status}`}>
    <div className="compact-title"><strong>{task.name}</strong><span>×{task.quantity}</span></div><span className="order-status">{task.status}</span>
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
