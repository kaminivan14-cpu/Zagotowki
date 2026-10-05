import { useContext, useEffect, useRef } from 'react'
import { TaskFeedback } from '../feedback'
export default function Dialog({ title, children, onClose, busy = false, onRetry, hideClose=false }) {
 const feedback = useContext(TaskFeedback)
 const ref = useRef(null)
 useEffect(() => { const el = ref.current; el.showModal(); return () => el.close() }, [])
 return <dialog ref={ref} className="tasks-dialog" aria-label={title} onCancel={e => { e.preventDefault(); if (!busy) onClose() }}><div className="tasks-app"><h2>{title}</h2><p role="alert">{feedback.error}</p>{feedback.error && <button disabled={feedback.busy} type="button" onClick={onRetry || feedback.retry}>Повторити дію</button>}{children}{!hideClose&&<button type="button" disabled={busy} onClick={onClose}>Закрити</button>}</div></dialog>
}
