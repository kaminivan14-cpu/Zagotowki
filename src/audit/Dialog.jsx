import ModalClose from '../ui/ModalClose'
import { useEffect, useRef } from 'react'
// Native modal supplies focus containment, Escape and return-focus behavior.
export default function Dialog({ title, children, onClose, busy }) {
 const ref = useRef(null)
 useEffect(() => {
  const previous = document.activeElement, el = ref.current
  el.showModal()
  return () => { el.close(); if(previous?.isConnected) previous.focus() }
 }, [])
 return <dialog ref={ref} className="audit-dialog modal-with-close" aria-label={title} onCancel={e => { e.preventDefault(); if(!busy) onClose() }}>
  <ModalClose onClose={onClose} disabled={busy}/><h2>{title}</h2>{children}<button disabled={busy} onClick={onClose}>Anuluj / zamknij</button>
 </dialog>
}
