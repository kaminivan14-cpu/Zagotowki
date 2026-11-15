import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTree, initialExpanded, visibleRows, toggleExpanded, parentIds, childCount } from '../src/tasks/taskTree.js'
import { recurrenceSummary, isRecurring } from '../src/shared/recurrenceSummary.js'
import { eventChanges } from '../src/tasks/activity.js'
import { legacyListQuery, isLegacyListResponse, hierarchyListKeys } from '../src/tasks/taskFilters.js'
import { notificationText } from '../src/tasks/notifications/notificationText.js'
import { resolveScreen, availableSections } from '../src/tasks/shell/navigation.js'
const rows=[
 {id:1,title:'Root',tree_parent_id:null,depth:0,match:false},
 {id:2,title:'Child',tree_parent_id:1,depth:1,match:false},
 {id:3,title:'Needle',tree_parent_id:2,depth:2,match:true},
 {id:4,title:'Other root',tree_parent_id:null,depth:0,match:true},
]
test('tree helpers group pre-order rows, collapse by default and reveal only the matching chain',()=>{
 const tree=buildTree(rows);assert.deepEqual(tree.map(t=>t.id),[1,4]);assert.equal(tree[0].children[0].children[0].id,3)
 assert.deepEqual([...initialExpanded(rows,false)],[]);assert.deepEqual([...initialExpanded(rows,true)],[1,2])
 assert.deepEqual(visibleRows(rows,new Set()).map(r=>r.id),[1,4]);assert.deepEqual(visibleRows(rows,new Set([1])).map(r=>r.id),[1,2,4]);assert.deepEqual(visibleRows(rows,new Set([2])).map(r=>r.id),[1,4])
 assert.deepEqual([...toggleExpanded(new Set([1]),2)],[1,2]);assert.deepEqual([...toggleExpanded(new Set([1,2]),1)],[2])
 assert.deepEqual(parentIds(rows),[1,2]);assert.equal(childCount(rows,1),1);assert.equal(childCount(rows,4),0)
})
test('recurrence summary describes the stored rule without changing it',()=>{
 assert.equal(recurrenceSummary(null),'Не повторювати');assert.equal(isRecurring({frequency:'none'}),false)
 assert.equal(recurrenceSummary({frequency:'weekly',interval:1,days_of_week:[3,1],end_type:'count',count:3}),'Щотижня (Пн, Ср) · 3 раз(ів)')
 assert.equal(recurrenceSummary({frequency:'daily',interval:2,days_of_week:[],end_type:'until',until:'2026-12-31'}),'Кожні 2 дні · до 31.12.2026')
 assert.equal(recurrenceSummary({frequency:'monthly',interval:1,day_of_month:15,end_type:'never'}),'Щомісяця · 15-го числа')
})
test('activity changes are derived from before/after snapshots with old and new values',()=>{
 const event={event_type:'TASK_UPDATED',metadata:{before:{description:'',deadline_at:'2026-10-01T10:00:00Z',priority:'medium',status:'planned'},after:{description:'Done soon',deadline_at:'2026-10-02T10:00:00Z',priority:'high',status:'planned'}}}
 const changes=eventChanges(event,{zone:'Europe/Warsaw'})
 assert.deepEqual(changes.map(c=>[c.key,c.to]),[['description','9 симв.'],['priority','Високий'],['deadline_at','02.10.2026 12:00']])
 assert.equal(changes[0].from,'порожньо')
 assert.deepEqual(eventChanges({event_type:'TASK_COMPLETED',metadata:{before:{status:'in_progress'},after:{status:'completed'}}}),[])
 assert.deepEqual(eventChanges({event_type:'COMMENT_ADDED',metadata:{text:'x'}}),[])
})
test('notification text names actor, action and task, hiding inaccessible tasks',()=>{
 const t=notificationText({kind:'COMMENT_ADDED',actor:{name:'Олена'},task:{title:'Звіт'},metadata:{text:'Готово'}})
 assert.deepEqual(t,{actor:'Олена',action:'додав(ла) коментар',title:'Звіт',detail:'Готово'})
 assert.equal(notificationText({kind:'TASK_COMPLETED',actor:null,task:null,metadata:{}}).title,'Завдання недоступне')
})
test('hidden sections never resolve to Reports or Schedule and admin stays permission-gated',()=>{
 assert.equal(resolveScreen('reports',['tasks.access']),'work');assert.equal(resolveScreen('schedule',['tasks.access','tasks.admin']),'work')
 assert.equal(resolveScreen('settings',['tasks.access']),'work');assert.equal(resolveScreen('settings',['tasks.access','tasks.admin']),'settings')
 assert.deepEqual(availableSections(['tasks.access']).map(s=>s.id),['work','planning','tasks']);assert.deepEqual(availableSections(['tasks.access','processes.read']).map(s=>s.id),['work','planning','processes','tasks'])
})
test('task deep links parse only positive ids and keep other query parameters',async()=>{
 const {taskIdFromSearch,searchWithTask}=await import('../src/tasks/taskLink.js')
 assert.equal(taskIdFromSearch('?task=42'),42);assert.equal(taskIdFromSearch('?task=0'),null);assert.equal(taskIdFromSearch('?task=-1'),null)
 assert.equal(taskIdFromSearch('?task=1e3'),null);assert.equal(taskIdFromSearch('?task=99999999999999999999'),null);assert.equal(taskIdFromSearch(''),null)
 assert.equal(searchWithTask('?lang=pl',7),'?lang=pl&task=7');assert.equal(searchWithTask('?lang=pl&task=7',null),'?lang=pl');assert.equal(searchWithTask('?task=7',null),'')
})
test('Tasks UI is isolated: no global presentation components or shared class prefix inside src/tasks',async()=>{
 const {readdirSync,readFileSync,statSync}=await import('node:fs');const {join}=await import('node:path')
 const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p]})
 // The legacy Dialog.jsx is kept unused under the file-preservation policy.
 const files=walk('src/tasks').filter(f=>/\.(jsx?|css)$/.test(f)&&!f.endsWith('components/Dialog.jsx'))
 const offenders=[]
 for(const f of files){const s=readFileSync(f,'utf8')
  if(/from\s+"(\.\.\/)+ui\/[A-Za-z]+"/.test(s))offenders.push(f+': imports src/ui')
  if(/import\s+LanguageSwitcher\s+from/.test(s))offenders.push(f+': global LanguageSwitcher')
  if(/from\s+"[^"]*shared\/RecurrenceControl"/.test(s))offenders.push(f+': global RecurrenceControl')
  if(/(^|[^A-Za-z0-9_$-])w-[a-z]/.test(s)||/--w-/.test(s))offenders.push(f+': shared w- prefix')}
 assert.deepEqual(offenders,[])
 const lib=readdirSync('src/tasks/components/ui').filter(n=>n.endsWith('.jsx'))
 for(const n of lib)assert.match(n,/^Tasks[A-Z]/,n)
})
test('legacy list payloads (no tree fields) are nested through parent_task_id; current payloads are untouched',async()=>{
 const {normalizeTreeRows,visibleRows}=await import('../src/tasks/taskTree.js')
 const legacy=[{id:3,title:'C',parent_task_id:2},{id:1,title:'A',parent_task_id:null},{id:2,title:'B',parent_task_id:1},{id:4,title:'Orphan',parent_task_id:99}]
 const n=normalizeTreeRows(legacy)
 assert.deepEqual(n.map(r=>[r.id,r.tree_parent_id,r.depth]),[[1,null,0],[2,1,1],[3,2,2],[4,null,0]])
 assert.deepEqual(visibleRows(n,new Set()).map(r=>r.id),[1,4]);assert.deepEqual(visibleRows(n,new Set([1,2])).map(r=>r.id),[1,2,3,4])
 const current=[{id:1,tree_parent_id:null,depth:0,match:true},{id:2,tree_parent_id:1,depth:1,match:true}]
 assert.equal(normalizeTreeRows(current),current);assert.deepEqual(normalizeTreeRows(undefined),[])
 assert.deepEqual(normalizeTreeRows([{id:5,parent_task_id:5}]).map(r=>r.tree_parent_id),[null],'self-reference is never followed')
})

test('legacy list query drops only the keys the 2026-10-26 tasks_list rejects; legacy responses have no per-view counters',()=>{
 const query={page:2,page_size:10,search:'x',view:'my',tab:'active',status:'',priority:'',assignee:'',category:'',deadline_from:'',deadline_to:'',sort:'deadline',dir:''}
 const legacy=legacyListQuery(query)
 assert.deepEqual(hierarchyListKeys,['view','page_size','dir'])
 assert.deepEqual(Object.keys(legacy).sort(),['assignee','category','deadline_from','deadline_to','page','priority','search','sort','status','tab'])
 assert.equal(query.view,'my','the original query is not mutated')
 assert.equal(isLegacyListResponse({items:[],total:0,page:1,page_size:10,counts:{}}),true)
 assert.equal(isLegacyListResponse({items:[],total:0,views:{my:0,team:0,relevant:0,all:0}}),false)
 assert.equal(isLegacyListResponse(null),false)
})
