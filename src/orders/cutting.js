import {operational,lifecycle} from './board.js'
// Existing Orders business model routes all operational leaves (product/addon)
// through cutting assignments; sets are containers and drinks never enter it.
// Reuse that explicit item_type contract, never product names.
export const needsCutting=item=>operational(item)
export function cuttingOrders(orders){
 return orders.filter(o=>o.status!=='NEW'&&lifecycle(o)!=='done').flatMap(order=>{
  const leaves=order.items.filter(i=>needsCutting(i)&&i.assignments.some(a=>!a.released_at&&a.cuttings.filter(c=>c.issued_at).reduce((n,c)=>n+c.quantity,0)<a.quantity))
  if(!leaves.length)return []
  const parents=new Set(leaves.map(i=>i.parent_item_id))
  return [{...order,items:order.items.filter(i=>leaves.includes(i)||parents.has(i.id))}]
 })
}
