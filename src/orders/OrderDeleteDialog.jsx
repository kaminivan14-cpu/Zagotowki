import ModalClose from '../ui/ModalClose'
import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n/useLocale'
import { deleteLabels } from './delete'
export default function OrderDeleteDialog({ target, busy, message, onClose, onConfirm }) {
 const ref=useRef(null), [word,setWord]=useState(''), locale=useLocale(), t=deleteLabels[locale]
 useEffect(()=>{const previous=document.activeElement;ref.current.showModal();return()=>previous?.focus()},[])
 return <dialog ref={ref} className="order-delete-dialog modal-with-close" aria-labelledby="order-delete-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
  <ModalClose onClose={onClose} disabled={busy}/>
  <form onSubmit={e=>{e.preventDefault();if(!busy && (!target.bulk || ['USUŃ','DELETE'].includes(word.trim())))onConfirm()}}>
   <h2 id="order-delete-title">{target.bulk?t.bulk:t.single}</h2>
   <p>{target.bulk?t.bulkWarning:t.confirm}</p>{!target.bulk && <p>{t.warning}</p>}
   <dl><dt>{t.location}</dt><dd>{target.locationName}</dd><dt>{t.scope}</dt><dd>{target.scope}</dd><dt>{t.count}</dt><dd>{target.orders.length}</dd>
    {!target.bulk && <><dt>Internal order ID</dt><dd>{target.orders[0].id}</dd><dt>SBID</dt><dd>{target.orders[0].integration_sbid || '—'}</dd><dt>{t.items}</dt><dd>{target.orders[0].items.length}</dd></>}
   </dl>
   {target.bulk && <label>{t.type}<input autoComplete="off" autoFocus value={word} disabled={busy} onChange={e=>setWord(e.target.value)}/></label>}
   {message && <p role="alert">{message}</p>}
   <div className="order-delete-actions"><button type="button" disabled={busy} onClick={onClose}>{t.cancel}</button><button className="menu-danger" disabled={busy || (target.bulk && !['USUŃ','DELETE'].includes(word.trim()))}>{t.confirmButton}</button></div>
  </form>
 </dialog>
}
