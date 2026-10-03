import { labels as L } from './labels'
export default function OrderNotices({notices,error,onView,onRead,busy}) {
 return <div className="order-notifications" aria-live="polite">
 {error && <p>{L.noticesFailed}</p>}
 {notices.map(n=><aside key={n.id} className={`order-notice notice-${n.event_type}`}>
  <div className="notice-copy"><strong>{L.noticeTitle}</strong><p>{L.noticeShort(n.event_type,n.display_number)}</p></div>
  <div className="notice-actions"><button onClick={()=>onView(n.order_id)}>{L.viewOrder}</button><button disabled={busy} onClick={()=>onRead(n.id)}>{L.dismiss}</button><button disabled={busy} aria-label={L.closeNotice} onClick={()=>onRead(n.id)}>×</button></div>
 </aside>)}
 </div>
}
