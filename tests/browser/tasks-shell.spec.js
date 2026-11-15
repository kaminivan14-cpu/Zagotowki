import {test,expect} from '@playwright/test'
// TODO: import {mkdir} from 'node:fs/promises' (screenshots disabled)
// Work module update: compact header + sidebar (РБ-001..003), hierarchical list (РБ-007/009/010/011),
// workspace with subtasks, attachments, activity (РБ-012/014) and the notification centre (РБ-013).
const user={id:'20000000-0000-4000-8000-000000000006',email:'shell@example.invalid',aud:'authenticated',role:'authenticated'}
const person=(id,name)=>({id,name,avatar_path:null})
function fixtures(){
 const today='2026-10-02'
 const base=(id,title,extra={})=>({id,title,status:'planned',priority:'medium',urgency:'normal',estimated_minutes:30,actual_minutes:0,deadline_at:'2026-10-20T15:00:00Z',overdue:false,assigned_to_employee_id:6,created_by_employee_id:6,assignee:person(6,'Олена'),category:{id:1,name:'Продукт'},checklist:[],version:1,description:'',parent_task_id:null,tree_parent_id:null,depth:0,match:true,progress:null,...extra})
 const rows=[
  base(1,'Запуск нової позиції в меню',{progress:{done:1,total:3,percent:33},priority:'high'}),
  base(2,'Розробка концепції',{tree_parent_id:1,depth:1,parent_task_id:1,status:'in_progress'}),
  base(3,'Маркетингова підготовка',{tree_parent_id:1,depth:1,parent_task_id:1,progress:{done:0,total:1,percent:0}}),
  base(4,'Підготувати макети',{tree_parent_id:3,depth:2,parent_task_id:3,assignee:person(8,'Іван'),assigned_to_employee_id:8}),
  base(5,'Провести інвентаризацію',{priority:'low',deadline_at:'2026-09-30T15:00:00Z',overdue:true}),
  base(6,'Навчання нового кухаря',{category:{id:2,name:'HR'}}),
 ]
 const notifications=[
  {id:11,kind:'COMMENT_ADDED',read_at:null,created_at:new Date(Date.now()-120000).toISOString(),task_id:1,event_type:'COMMENT_ADDED',metadata:{text:'Перевірте рецептуру'},actor:person(8,'Іван'),task:{id:1,title:'Запуск нової позиції в меню',status:'planned'}},
  {id:10,kind:'PROGRESS_CHANGED',read_at:'2026-10-01T10:00:00Z',created_at:'2026-10-01T09:00:00Z',task_id:1,event_type:'TASK_COMPLETED',metadata:{},actor:person(8,'Іван'),task:{id:1,title:'Запуск нової позиції в меню',status:'planned'}},
 ]
 return {today,rows,notifications}
}
async function setup(page,{width=1440,extraCaps=[],deniedTask=null,path='/'}={}){
 await page.setViewportSize({width,height:1000})
 const calls=[],caps=['worktime.self','tasks.access','tasks.create.self','tasks.assign','tasks.plan.scope','tasks.read.scope','tasks.admin','processes.read',...extraCaps],f=fixtures()
 let unread=1,rows=f.rows
 const exp=Math.floor(Date.now()/1000)+3600,b=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
 await page.addInitScript(s=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(s)),{access_token:`${b({alg:'HS256'})}.${b({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async r=>{
  const req=r.request(),url=new URL(req.url());if(url.origin==='http://127.0.0.1:5173')return r.continue();if(url.hostname!=='auth-tests.supabase.co')return r.abort()
  if(url.pathname.includes('/storage/v1/object/sign/')){const body=req.postDataJSON()||{};calls.push({name:'storage_sign',args:{path:url.pathname,...body}});return r.fulfill({contentType:'application/json',body:JSON.stringify({signedURL:`/object/sign/${url.pathname.split('/object/sign/')[1]}?token=t`})})}
  const name=url.pathname.split('/').at(-1),args=req.postDataJSON()||{};calls.push({name,args});let data
  if(name==='user')data=user
  else if(name==='auth_employee_profile')data=[{id:6,name:'Олена Коваль',role:'manager',active:true,auth_user_id:user.id,location_id:1}]
  else if(name==='auth_capabilities')data=caps
  else if(name==='worktime_current')data=null
  else if(name==='tasks_context')data={employee_id:6,today:f.today,capabilities:caps,categories:[{id:1,name:'Продукт'},{id:2,name:'HR'}],category_history:[{id:1,name:'Продукт'},{id:2,name:'HR'}],departments:[],settings:{company_timezone:'Europe/Warsaw'}}
  else if(name==='tasks_assignable_people')data=[person(6,'Олена Коваль'),person(8,'Іван')]
  else if(name==='tasks_execution_state')data={current:null,next:null,critical:[],locations:[{id:1,name:'Локал'}],task_count:0,planned_minutes:0,capacity_minutes:360}
  else if(name==='tasks_result_inbox')data=[]
  else if(name==='tasks_notifications_unread')data=unread
  else if(name==='organization_structure')data={version_id:null,today:f.today,can_manage:true,versions:[],employees:[],departments:[],assignments:[],directors:[],events:[]}
  else if(name==='tasks_file')data={id:args.p_id,name:'menu-draft.pdf',object_key:'20000000-0000-4000-8000-000000000001/a1a1',mime:'application/pdf'}
  else if(name==='tasks_admin_directory')data={employees:[],categories:[],departments:[],locations:[],reporting_lines:[],scope_grants:[],audit:[]}
  else if(name==='tasks_notifications'){const items=f.notifications.filter(n=>args.p_filter==='unread'?!n.read_at:args.p_filter==='read'?n.read_at:true);data={items,unread,latest_id:11}}
  else if(name==='tasks_parent_candidates')data=rows.filter(t=>t.id!==args.p_task&&(!args.p_search||t.title.toLowerCase().includes(args.p_search.toLowerCase()))).map(t=>({id:t.id,title:t.title,status:t.status,parent_task_id:t.parent_task_id,assignee:t.assignee.name}))
  else if(name==='tasks_list'){const q=args.p_query;const search=(q.search||'').toLowerCase();let items=rows;if(search){const match=rows.filter(t=>t.title.toLowerCase().includes(search));const keep=new Set();for(const m of match){let cur=m;while(cur){keep.add(cur.id);cur=rows.find(t=>t.id===cur.tree_parent_id)}}items=rows.filter(t=>keep.has(t.id)).map(t=>({...t,match:match.includes(t)}))}
   if(q.view==='team')items=items.filter(t=>t.assigned_to_employee_id===8);const roots=items.filter(t=>t.tree_parent_id===null||!items.some(x=>x.id===t.tree_parent_id));data={items,total:roots.length,matching:items.filter(t=>t.match).length,page:1,page_size:10,counts:{all:6,active:6,completed:0,overdue:1},views:{my:5,team:1,relevant:6,all:6},team_available:true,assignees:[person(6,'Олена'),person(8,'Іван')]}}
  else if(name==='tasks_details'&&args.p_task===deniedTask)return r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'TASKS_DENIED',details:null,hint:null})})
  else if(name==='tasks_details'){const t=rows.find(x=>x.id===args.p_task)||rows[0];const children=rows.filter(x=>x.parent_task_id===t.id).map(c=>({...c,progress:c.progress}));data={task:{...t,source_metadata:{recurrence:{frequency:'weekly',interval:1,days_of_week:[1,3],end_type:'never'}},created_at:'2026-09-20T08:00:00Z'},assignee:t.assignee,creator:person(6,'Олена Коваль'),parent:t.parent_task_id?{id:t.parent_task_id,title:rows.find(x=>x.id===t.parent_task_id).title,status:'planned'}:null,ancestors:t.parent_task_id?[{id:t.parent_task_id,title:rows.find(x=>x.id===t.parent_task_id).title,status:'planned'}]:[],children,children_hidden:0,incomplete_children:children.filter(c=>c.status!=='completed').length,progress:t.progress,checklist:[{id:1,text:'Узгодити з шефом',completed:false,sort_order:0}],attachments:[{id:'a1a1a1a1-0000-4000-8000-000000000001',name:'menu-draft.pdf',mime:'application/pdf',size_bytes:204800,created_at:'2026-09-30T12:00:00Z',uploaded_by:person(8,'Іван'),can_remove:true}],dependencies:[],permissions:{edit:true,assign:true,delete:true,attach:true,work:true},events:[{id:1,task_id:t.id,event_type:'TASK_CREATED',actor_employee_id:6,created_at:'2026-09-20T08:00:00Z',metadata:{before:null,after:{}},actor:person(6,'Олена Коваль')},{id:2,task_id:t.id,event_type:'TASK_UPDATED',actor_employee_id:6,created_at:'2026-09-21T09:00:00Z',metadata:{before:{description:'',deadline_at:'2026-10-10T15:00:00Z'},after:{description:'Новий опис',deadline_at:'2026-10-20T15:00:00Z'}},actor:person(6,'Олена Коваль')},{id:3,task_id:t.id,event_type:'COMMENT_ADDED',actor_employee_id:8,created_at:'2026-09-22T09:00:00Z',metadata:{text:'Перевірте рецептуру'},actor:person(8,'Іван')}]}}
  else if(name==='tasks_command'){const a=args.p_action,p=args.p_args
   if(a==='notification_read'){unread=0;f.notifications[0].read_at=new Date().toISOString();data={id:p.id,read_at:f.notifications[0].read_at}}
   else if(a==='notifications_read_all'){unread=0;f.notifications.forEach(n=>n.read_at=n.read_at||new Date().toISOString());data={updated:1}}
   else if(a==='create'){const t={...rows[0],id:rows.length+1,title:p.title,parent_task_id:p.parent_task_id||null,tree_parent_id:p.parent_task_id||null,depth:p.parent_task_id?1:0,progress:null,version:1};rows=[...rows,t];data=t}
   else if(a==='delete'){rows=rows.filter(t=>t.id!==p.task_id);data={...p,deleted_at:new Date().toISOString()}}
   else data={...rows.find(t=>t.id===p.task_id),version:2,...p}
  }else throw Error('Unexpected request '+name)
  await r.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 });await page.goto(path);if(!extraCaps.length)await expect(page.getByRole('navigation',{name:'Розділи роботи'})).toBeVisible();return calls
}
// TODO: screenshots disabled on request; keep the helper signature so call sites stay intact.
async function shot(_page, _name) {}
for(const width of [375,768,1440])test(`compact header, sidebar and hidden sections ${width}`,async({page})=>{
 await setup(page,{width});const nav=page.getByRole('navigation',{name:'Розділи роботи'})
 await expect(nav.getByRole('button')).toHaveText(['Робота','Планування','Процеси','Завдання'])
 await expect(page.getByRole('button',{name:'Звіти',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Графік',exact:true})).toHaveCount(0)
 await expect(page.getByRole('banner').getByLabel('Мова',{exact:true})).toBeVisible();await expect(page.locator('select[aria-label="Мова"]:visible')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Адмін панель',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Налаштування',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Сповіщення: 1 непрочитаних',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Створити завдання',exact:true})).toHaveCount(1)
 await expect(page.getByRole('banner').getByRole('button',{name:'Модулі',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Обліковий запис',exact:true}).click();await expect(page.getByRole('button',{name:'Вийти',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Модулі',exact:true})).toHaveCount(1);await page.keyboard.press('Escape')
 await shot(page,`shell-${width}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await nav.getByRole('button',{name:'Завдання',exact:true}).click();await expect(nav.getByRole('button',{name:'Завдання',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('heading',{name:'Мої завдання'})).toBeVisible()
 await page.getByRole('button',{name:'Адмін панель',exact:true}).click();await expect(page.getByRole('navigation',{name:'Адміністрування'})).toBeVisible();await expect(nav.getByRole('button',{name:'Завдання',exact:true})).toHaveAttribute('aria-pressed','false')
})
test('hierarchical list: collapsed by default, expand/collapse all, context chain, quick create and safe delete',async({page})=>{
 const calls=await setup(page);await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click()
 const rowsOf=()=>page.locator('.task-tree tbody tr.task-tree-row')
 await expect(rowsOf()).toHaveCount(3);await expect(page.getByText('1/3')).toBeVisible();await expect(page.locator('.task-tree-row').filter({hasText:'Навчання нового кухаря'}).locator('.tk-progress-none')).toHaveText('—')
 await page.getByRole('button',{name:'Вид',exact:true}).click();await page.getByRole('button',{name:'Розгорнути всі підзавдання',exact:true}).click();await expect(rowsOf()).toHaveCount(6);await expect(page.locator('.task-tree-row.depth-2')).toHaveCount(1)
 await shot(page,'list-expanded-1440')
 await page.getByRole('button',{name:'Згорнути всі підзавдання',exact:true}).click();await expect(rowsOf()).toHaveCount(3)
 await page.getByPlaceholder('Пошук завдань...').fill('макети');await expect(rowsOf()).toHaveCount(3);await expect(page.locator('.task-tree-row.is-context')).toHaveCount(2);await expect(page.getByText('Підготувати макети')).toBeVisible()
 // context ancestors are never selection or bulk targets (plan §4.8)
 await expect(page.locator('.task-tree-row.is-context input[type=checkbox]')).toHaveCount(2)
 for(const box of await page.locator('.task-tree-row.is-context input[type=checkbox]').all())await expect(box).toBeDisabled()
 await page.getByLabel('Вибрати сторінку').check();await expect(page.getByText('Вибрано: 1',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Зняти вибір',exact:true}).click()
 await page.getByPlaceholder('Пошук завдань...').fill('');await expect(page.locator('.task-tree-row.is-context')).toHaveCount(0)
 await page.getByRole('button',{name:'Режим перегляду',exact:true}).click();await page.getByRole('option',{name:/Завдання команди/}).click();await expect(page.getByRole('heading',{name:'Завдання команди'})).toBeVisible();expect(calls.filter(c=>c.name==='tasks_list').at(-1).args.p_query.view).toBe('team')
 await page.getByRole('button',{name:'Режим перегляду',exact:true}).click();await page.getByRole('option',{name:/Мої завдання/}).click()
 await page.getByLabel('Дії: Навчання нового кухаря',{exact:true}).click();await page.getByRole('menuitem',{name:'Додати підзавдання'}).click();await page.getByLabel('Назва підзавдання',{exact:true}).fill('Скласти план');await page.getByRole('button',{name:'Додати',exact:true}).click()
 await expect.poll(()=>calls.find(c=>c.args.p_action==='create')?.args.p_args).toEqual({title:'Скласти план',parent_task_id:6})
 await page.getByLabel('Дії: Провести інвентаризацію',{exact:true}).click();await page.getByRole('menuitem',{name:'Видалити завдання'}).click();const confirm=page.getByRole('dialog');await expect(confirm.getByRole('heading',{name:'Видалити завдання?'})).toBeVisible();await expect(confirm).toContainText('Провести інвентаризацію');await confirm.getByRole('button',{name:'Скасувати',exact:true}).click();expect(calls.some(c=>c.args.p_action==='delete')).toBe(false)
 await page.getByLabel('Дії: Провести інвентаризацію',{exact:true}).click();await page.getByRole('menuitem',{name:'Видалити завдання'}).click();await page.getByRole('dialog').getByRole('button',{name:'Видалити',exact:true}).click();await expect.poll(()=>calls.find(c=>c.args.p_action==='delete')?.args.p_args.task_id).toBe(5);await expect(page.getByText('Провести інвентаризацію')).toHaveCount(0)
})
for(const width of [375,1440])test(`task workspace: breadcrumb, description, subtasks, attachments, activity, parent field ${width}`,async({page})=>{
 const calls=await setup(page,{width});await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click()
 await page.getByRole('button',{name:'#1 Запуск нової позиції в меню',exact:true}).click();const d=page.getByRole('dialog')
 await expect(d.getByRole('heading',{name:'Запуск нової позиції в меню'})).toBeVisible();await expect(d.getByText('Незавершених підзавдань: 2')).toBeVisible();await expect(d.getByRole('heading',{name:/Підзавдання/})).toContainText('1/3')
 await expect(d.locator('.task-subtask')).toHaveCount(2);await expect(d.locator('.task-attachment-name',{hasText:'menu-draft.pdf'})).toBeVisible();await expect(d.getByText('Іван',{exact:true}).first()).toBeVisible()
 await expect(d.locator('.task-activity-changes')).toContainText('Дедлайн');await expect(d.locator('.task-activity-comment')).toHaveText('Перевірте рецептуру');await expect(d.getByText('Щотижня (Пн, Ср)')).toBeVisible()
 await shot(page,`workspace-${width}`)
 await d.getByRole('button',{name:'Додати опис',exact:true}).click();await d.getByRole('textbox',{name:'Опис',exact:true}).fill('Новий опис завдання');await d.getByRole('button',{name:'Зберегти опис',exact:true}).click();await expect.poll(()=>calls.find(c=>c.args.p_action==='update')?.args.p_args).toEqual({task_id:1,version:1,description:'Новий опис завдання'})
 await d.getByRole('button',{name:'Додати підзавдання',exact:true}).click();await d.getByLabel('Назва підзавдання',{exact:true}).fill('Нове підзавдання');await d.getByRole('button',{name:'Додати',exact:true}).click();await expect.poll(()=>calls.find(c=>c.args.p_action==='create')?.args.p_args).toEqual({title:'Нове підзавдання',parent_task_id:1})
 await d.getByRole('button',{name:'Обрати батьківське завдання',exact:true}).click();await d.getByRole('searchbox',{name:'Пошук завдань',exact:true}).fill('кухаря');await d.getByRole('option',{name:/Навчання нового кухаря/}).click();await expect.poll(()=>calls.find(c=>c.args.p_action==='set_parent')?.args.p_args).toEqual({task_id:1,version:1,parent_task_id:6})
 await d.getByRole('button',{name:'Видалити menu-draft.pdf',exact:true}).click();await page.getByRole('dialog').filter({hasText:'Видалити вкладення?'}).getByRole('button',{name:'Видалити',exact:true}).click();await expect.poll(()=>calls.find(c=>c.args.p_action==='attachment_remove')?.args.p_args.file_id).toBe('a1a1a1a1-0000-4000-8000-000000000001')
 await d.getByRole('button',{name:'Розробка концепції',exact:false}).first().click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Розробка концепції'})).toBeVisible();await expect(page.getByRole('dialog').getByRole('button',{name:'Запуск нової позиції в меню',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('notification centre lists, filters, marks read and opens the task',async({page})=>{
 const calls=await setup(page);await page.getByRole('button',{name:'Сповіщення: 1 непрочитаних',exact:true}).click()
 const panel=page.getByRole('region',{name:'Сповіщення'});await expect(panel.locator('li')).toHaveCount(2);await expect(panel.locator('li.is-unread')).toHaveCount(1);await expect(panel).toContainText('Іван додав(ла) коментар')
 await panel.getByRole('button',{name:'Непрочитані'}).click();await expect(panel.locator('li')).toHaveCount(1)
 await shot(page,'notifications-1440')
 await panel.locator('li').first().getByRole('button').first().click();await expect.poll(()=>calls.find(c=>c.args.p_action==='notification_read')?.args.p_args).toEqual({id:11});await expect(page.getByRole('dialog').getByRole('heading',{name:'Запуск нової позиції в меню'})).toBeVisible()
 await page.getByRole('dialog').locator('.tk-modal-close').click();await expect(page.getByRole('button',{name:'Сповіщення',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Сповіщення',exact:true}).click();await panel.getByRole('button',{name:'Всі',exact:true}).click();await expect(panel.locator('li.is-unread')).toHaveCount(0)
})
test('notification centre states: counter failure is shown (not a silent zero), list error, empty inbox',async({page})=>{
 await setup(page)
 const fail=r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'XX000',message:'boom',details:null,hint:null})})
 await page.route(/rpc\/tasks_notifications_unread$/,fail);await page.route(/rpc\/tasks_notifications$/,fail)
 await page.reload()
 const bell=page.getByRole('button',{name:'Сповіщення: не вдалося оновити кількість',exact:true})
 await expect(bell).toBeVisible();await expect(bell.locator('.work-bell-stale')).toHaveCount(1);await expect(bell.locator('.work-bell-count')).toHaveCount(0)
 await expect(page.getByRole('alert').filter({hasText:'Сервер ще не оновлено'})).toHaveCount(0)
 await bell.click();const panel=page.getByRole('region',{name:'Сповіщення'})
 await expect(panel.getByRole('button',{name:/Повторити/})).toBeVisible()
 // the server recovers: empty inbox, counter is fresh again
 await page.unroute(/rpc\/tasks_notifications$/);await page.unroute(/rpc\/tasks_notifications_unread$/)
 await page.route(/rpc\/tasks_notifications_unread$/,r=>r.fulfill({contentType:'application/json',body:'0'}))
 await page.route(/rpc\/tasks_notifications$/,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({items:[],unread:0,latest_id:null})}))
 await panel.getByRole('button',{name:/Повторити/}).click();await expect(panel).toContainText('Сповіщень поки немає.')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.getByRole('button',{name:'Сповіщення',exact:true})).toBeVisible();await expect(page.locator('.work-bell-stale')).toHaveCount(0)
})
test('notification centre: mark all as read sends the newest seen id; an inaccessible task is shown, not opened',async({page})=>{
 const calls=await setup(page)
 const items=[{id:21,kind:'TASK_CREATED',read_at:null,created_at:new Date().toISOString(),task_id:1,event_type:'TASK_CREATED',metadata:{},actor:{id:2,name:'Ольга'},task:{id:1,title:'Нове для вас',status:'planned',deleted:false}},
  {id:20,kind:'TASK_DELETED',read_at:null,created_at:new Date().toISOString(),task_id:9,event_type:'TASK_DELETED',metadata:{},actor:{id:2,name:'Ольга'},task:null}]
 let unread=2
 await page.route(/rpc\/tasks_notifications_unread$/,r=>r.fulfill({contentType:'application/json',body:String(unread)}))
 await page.route(/rpc\/tasks_notifications$/,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({items:items.map(n=>({...n,read_at:unread?null:new Date().toISOString()})),unread,latest_id:21})}))
 await page.reload();await page.getByRole('button',{name:'Сповіщення: 2 непрочитаних',exact:true}).click()
 const panel=page.getByRole('region',{name:'Сповіщення'})
 await expect(panel.locator('li.is-unread')).toHaveCount(2);await expect(panel).toContainText('Ольга призначив(ла) вам завдання')
 const gone=panel.locator('li').nth(1);await expect(gone).toContainText('Завдання недоступне');await expect(gone.locator('.work-notification')).toBeDisabled()
 await page.route(/rpc\/tasks_command$/,async r=>{const a=r.request().postDataJSON();calls.push({name:'tasks_command',args:a});if(a.p_action==='notifications_read_all')unread=0;await r.fulfill({contentType:'application/json',body:JSON.stringify({updated:2})})})
 await panel.getByRole('button',{name:'Позначити всі як прочитані'}).click()
 await expect.poll(()=>calls.find(c=>c.args.p_action==='notifications_read_all')?.args.p_args).toEqual({before_id:21})
 await expect(panel.locator('li.is-unread')).toHaveCount(0);await expect(page.getByRole('button',{name:'Сповіщення',exact:true})).toBeVisible()
})
test('task deep link opens the workspace, stays in sync and Back to modules leaves Tasks',async({page})=>{
 await setup(page);await page.goto('/?task=1');const d=page.getByRole('dialog')
 await expect(d.getByRole('heading',{name:'Запуск нової позиції в меню'})).toBeVisible();await expect(d.getByLabel('Мова',{exact:true})).toHaveCount(0)
 await d.locator('.tk-modal-close').click();await expect(d).toHaveCount(0);await expect.poll(()=>new URL(page.url()).searchParams.get('task')).toBeNull()
 await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click()
 await page.getByRole('button',{name:/Провести інвентаризацію/}).first().click();await expect(d).toHaveCount(1);await expect.poll(()=>new URL(page.url()).searchParams.get('task')).toBe('5')
 await d.locator('.tk-modal-close').click();await page.getByRole('banner').getByRole('button',{name:'Модулі',exact:true}).click()
 await expect(page.getByRole('navigation',{name:'Розділи роботи'})).toHaveCount(0);expect(new URL(page.url()).searchParams.get('task')).toBeNull()
})
test('deep links: invalid ids are ignored, denied tasks show an error, switching tasks keeps the URL in sync',async({page})=>{
 const calls=await setup(page,{deniedTask:77});const d=page.getByRole('dialog')
 for(const bad of ['abc','0','-3','1.5','99999999999999999999']){await page.goto(`/?task=${bad}`);await expect(page.getByRole('navigation',{name:'Розділи роботи'})).toBeVisible();await expect(d).toHaveCount(0)}
 expect(calls.filter(c=>c.name==='tasks_details')).toHaveLength(0)
 await page.goto('/?task=77');await expect(d).toHaveCount(1);await expect(d.getByRole('alert').filter({hasText:'Немає дозволу на цю дію або дані.'}).first()).toBeVisible()
 await expect(d.getByRole('heading',{name:'Запуск нової позиції в меню'})).toHaveCount(0)
 await d.locator('.tk-modal-close').click();await expect.poll(()=>new URL(page.url()).searchParams.get('task')).toBeNull()
 await page.goto('/?task=1&lang=x');await expect(d.getByRole('heading',{name:'Запуск нової позиції в меню'})).toBeVisible();expect(new URL(page.url()).searchParams.get('lang')).toBe('x')
 await d.locator('.tk-modal-close').click();await expect.poll(()=>page.url()).toContain('lang=x');expect(new URL(page.url()).searchParams.get('task')).toBeNull()
 await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click()
 await page.getByRole('button',{name:/Провести інвентаризацію/}).first().click();await expect.poll(()=>new URL(page.url()).searchParams.get('task')).toBe('5')
 await d.locator('.tk-modal-close').click();await page.getByRole('button',{name:/Навчання нового кухаря/}).first().click();await expect.poll(()=>new URL(page.url()).searchParams.get('task')).toBe('6')
 await expect(d.getByRole('heading',{name:'Навчання нового кухаря'})).toBeVisible()
})
test('module navigation: without a task link the module selector stays first; a task link opens Tasks directly',async({page})=>{
 await setup(page,{extraCaps:['orders.access']})
 await expect(page.getByRole('button',{name:/ЗАМОВЛЕННЯ/})).toBeVisible();await expect(page.getByRole('navigation',{name:'Розділи роботи'})).toHaveCount(0)
 await page.getByRole('button',{name:/^Робота/}).click();await expect(page.getByRole('navigation',{name:'Розділи роботи'})).toBeVisible()
 await page.getByRole('banner').getByRole('button',{name:'Модулі',exact:true}).click();await expect(page.getByRole('button',{name:/ЗАМОВЛЕННЯ/})).toBeVisible()
 await page.goto('/?task=1');await expect(page.getByRole('dialog').getByRole('heading',{name:'Запуск нової позиції в меню'})).toBeVisible()
 await page.getByRole('dialog').locator('.tk-modal-close').click();await page.getByRole('banner').getByRole('button',{name:'Модулі',exact:true}).click()
 await expect(page.getByRole('button',{name:/ЗАМОВЛЕННЯ/})).toBeVisible();expect(new URL(page.url()).searchParams.get('task')).toBeNull()
 await page.reload();await expect(page.getByRole('button',{name:/ЗАМОВЛЕННЯ/})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('Reports and Schedule are disabled: no navigation entry, no screen, even with reporting capabilities',async({page})=>{
 const calls=await setup(page,{extraCaps:['tasks.report.scope','tasks.schedule.manage']});await expect(page.getByRole('navigation',{name:'Розділи роботи'})).toBeVisible()
 const nav=page.getByRole('navigation',{name:'Розділи роботи'})
 await expect(nav.getByRole('button')).toHaveText(['Робота','Планування','Процеси','Завдання'])
 for(const name of ['Звіти','Графік'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0)
 await expect(page.getByRole('heading',{name:/Звіти|Графік/})).toHaveCount(0)
 expect(calls.some(c=>/report|schedule_events|tasks_schedule/.test(c.name))).toBe(false)
})
test('attachments show name, author and upload date; open and download go through the server read check',async({page})=>{
 await page.addInitScript(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(String(u));return null}})
 const calls=await setup(page);await page.goto('/?task=1');const d=page.getByRole('dialog')
 const row=d.locator('.task-attachment').filter({hasText:'menu-draft.pdf'})
 await expect(row.locator('.task-attachment-name')).toHaveText('menu-draft.pdf');await expect(row).toContainText('Іван');await expect(row).toContainText('200 KB');await expect(row).toContainText(/30\.09\.2026/)
 await row.getByRole('button',{name:'Завантажити menu-draft.pdf',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__opened.length)).toBe(1)
 expect(calls.find(c=>c.name==='tasks_file')?.args).toEqual({p_id:'a1a1a1a1-0000-4000-8000-000000000001'})
 expect(await page.evaluate(()=>window.__opened[0])).toMatch(/download=menu-draft\.pdf/)
 await row.getByRole('button',{name:'Відкрити menu-draft.pdf',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__opened.length)).toBe(2)
 expect(await page.evaluate(()=>window.__opened[1])).not.toMatch(/download=/)
 expect(calls.filter(c=>c.name==='tasks_file')).toHaveLength(2)
 await expect(d.locator('input[type="file"]')).toHaveAttribute('accept',/\.doc(,|$)/);await expect(d.locator('input[type="file"]')).toHaveAttribute('accept',/\.xls(,|$)/)
})

// Visual audit without screenshots: consistent control sizes, no legacy palette, no horizontal overflow.
async function audit(page,scope){
 return page.evaluate(sel=>{
  const root=document.querySelector(sel)||document.body,visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}
  const legacy='rgb(137, 159, 148)'
  const md=[...root.querySelectorAll('.tk-btn-md')].filter(visible).map(e=>Math.round(e.getBoundingClientRect().height))
  const fields=[...root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]),select,textarea')].filter(visible)
  return {md:[...new Set(md)],fieldMin:Math.min(...fields.map(e=>e.getBoundingClientRect().height),99),
   legacy:[...root.querySelectorAll('button,input,select,textarea')].filter(visible).filter(e=>getComputedStyle(e).borderTopColor===legacy).map(e=>e.outerHTML.slice(0,80)),
   nativeButtons:[...root.querySelectorAll('button:not(.tk-btn)')].filter(visible).filter(e=>!e.closest('.tk-tabs,.tk-menu-items,.tk-popover-panel,[role=listbox],.task-tree,.tk-pagination,.tk-segment')&&!e.matches('[role],.tk-modal-close,.task-attachment-name,.task-subtask-title,.work-notification,.tk-menu-item,.tk-language select')).map(e=>e.className+'|'+(e.textContent||'').trim().slice(0,20)),
   overflow:document.documentElement.scrollWidth>innerWidth}
 },scope)
}
for(const width of [375,768,1440])test(`visual audit: Tasks screens use one control system ${width}`,async({page})=>{
 await setup(page,{width})
 const check=async(label,scope='.work-shell')=>{const a=await audit(page,scope)
  expect(a.overflow,label+': horizontal overflow').toBe(false)
  expect(a.legacy,label+': legacy-styled controls').toEqual([])
  expect(a.md.length<=1,label+': medium buttons share one height '+a.md).toBe(true)
  expect(a.fieldMin,label+': form controls at least 32px').toBeGreaterThanOrEqual(32)
  return a}
 await check('work')
 await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click();await expect(page.locator('.task-tree')).toBeVisible()
 await check('task list')
 await page.getByRole('button',{name:'Створити завдання',exact:true}).first().click();await expect(page.getByRole('dialog')).toBeVisible()
 await check('create dialog','dialog[open]');await page.getByRole('dialog').locator('.tk-modal-close').click()
 await page.goto('/?task=1');await expect(page.getByRole('dialog').getByRole('heading',{name:'Запуск нової позиції в меню'})).toBeVisible()
 const w=await check('task workspace','dialog[open]');expect(w.nativeButtons,'unexpected native buttons in the workspace').toEqual([])
})
test('bulk delete: parents are excluded, one request per task, partial failure is reported',async({page})=>{
 const calls=await setup(page)
 await page.route(/rpc\/tasks_command$/,async r=>{const a=r.request().postDataJSON();if(a.p_action==='delete'&&a.p_args.task_id===5)return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'TASKS_DENIED'})});return r.fallback()})
 await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click();await expect(page.locator('.task-tree')).toBeVisible()
 for(const name of ['Запуск нової позиції в меню','Провести інвентаризацію','Навчання нового кухаря'])await page.getByLabel(`Вибрати: ${name}`,{exact:true}).check()
 await expect(page.getByRole('region',{name:'Дії з вибраними завданнями'})).toContainText('Вибрано: 3')
 await page.getByRole('button',{name:'Видалити вибрані',exact:true}).click()
 const confirm=page.getByRole('dialog').filter({hasText:'Видалити вибрані завдання?'})
 await expect(confirm).toContainText('Буде видалено завдань: 2');await expect(confirm).toContainText('#1 Запуск нової позиції в меню')
 await confirm.getByRole('button',{name:'Видалити',exact:true}).dblclick()
 const status=page.locator('.tk-bulk-result');await expect(status).toContainText('Видалено завдань: 1');await expect(status).toContainText('Не вдалося видалити: Провести інвентаризацію');await expect(status).toContainText('Пропущено (мають підзавдання): Запуск нової позиції в меню')
 const deletes=calls.filter(c=>c.name==='tasks_command'&&c.args.p_action==='delete').map(c=>c.args.p_args.task_id)
 expect(deletes.filter(id=>id===6)).toHaveLength(1);expect(deletes).not.toContain(1)
})
test('legacy backend: missing Work-module functions show a notice and subtasks still nest under their parent',async({page})=>{
 await setup(page)
 await page.route(/rpc\/tasks_notifications_unread$/,r=>r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'Could not find the function public.tasks_notifications_unread',details:null,hint:null})}))
 // Like the 2026-10-26 tasks_list: any of view / page_size / dir is rejected; responses are flat and have no `views`.
 const legacyQueries=[]
 await page.route(/rpc\/tasks_list$/,r=>{const q=r.request().postDataJSON().p_query;legacyQueries.push(q)
  if(['view','page_size','dir'].some(k=>k in q))return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'INVALID_QUERY',details:null,hint:null})})
  return r.fulfill({contentType:'application/json',body:JSON.stringify({total:3,page:1,page_size:10,counts:{active:3},items:[
  {id:2,title:'Legacy child',status:'planned',priority:'medium',parent_task_id:1,deadline_at:null},
  {id:1,title:'Legacy parent',status:'planned',priority:'high',parent_task_id:null,deadline_at:null},
  {id:3,title:'Legacy root',status:'planned',priority:'low',parent_task_id:null,deadline_at:null}]})})})
 await page.reload()
 await expect(page.getByRole('alert').filter({hasText:'Сервер ще не оновлено'})).toBeVisible()
 await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click()
 const rows=page.locator('.task-tree tbody tr.task-tree-row');await expect(rows).toHaveCount(2)
 await page.getByRole('button',{name:'Розгорнути: Legacy parent',exact:true}).click()
 await expect(rows).toHaveCount(3);await expect(rows.nth(1)).toHaveClass(/depth-1/);await expect(rows.nth(1)).toContainText('Legacy child')
 await expect(page.getByText('Показано 1–3 з 3 завдань')).toBeVisible()
 // the list fell back to the legacy contract: no error, a notice, «Всі завдання», no unsupported keys afterwards
 await expect(page.getByRole('status').filter({hasText:'Сервер ще не підтримує режими перегляду'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Всі завдання'})).toBeVisible()
 await expect(page.getByText('Не вдалося завантажити завдання')).toHaveCount(0)
 expect(legacyQueries.some(q=>'view' in q)).toBe(true)
 expect(['view','page_size','dir'].some(k=>k in legacyQueries.at(-1))).toBe(false)
 await page.getByRole('button',{name:'Режим перегляду',exact:true}).click()
 await expect(page.getByRole('option',{name:/Мої завдання/})).toBeDisabled()
 await page.keyboard.press('Escape')
 await expect(page.getByRole('button',{name:'Напрямок сортування',exact:true})).toBeDisabled()
})
test('create dialog: the parent picker links the new task to the chosen parent',async({page})=>{
 const calls=await setup(page);await page.getByRole('button',{name:'Створити завдання',exact:true}).first().click();const d=page.getByRole('dialog')
 await d.getByLabel('Назва',{exact:true}).fill('Дочірнє з форми')
 await d.getByRole('button',{name:'Обрати батьківське завдання',exact:true}).click();await d.locator('.tk-create-side').getByRole('searchbox',{name:'Пошук завдань',exact:true}).fill('кухаря');await d.locator('.tk-create-side').getByRole('option',{name:/Навчання нового кухаря/}).click()
 await expect(d.locator('.task-parent-value')).toContainText('Навчання нового кухаря')
 await d.getByRole('button',{name:'Створити',exact:true}).click();await expect(d).toHaveCount(0)
 expect(calls.find(c=>c.args.p_action==='create').args.p_args).toMatchObject({title:'Дочірнє з форми',parent_task_id:6})
})
test('view selector changes the server scope and, with tab, sort and density, survives a page reload',async({page})=>{
 const calls=await setup(page);const listCalls=()=>calls.filter(c=>c.name==='tasks_list').map(c=>c.args.p_query)
 // Default view «Мої завдання» with an explicit page size (D-46: working-tree change of 2026-11-14, supersedes D-33)
 await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click();await expect(page.getByRole('heading',{name:'Мої завдання'})).toBeVisible()
 expect(listCalls().at(-1)).toMatchObject({view:'my',page_size:10,dir:''})
 await page.getByRole('button',{name:'Режим перегляду',exact:true}).click();await page.getByRole('option',{name:/Всі завдання/}).click()
 await expect(page.getByRole('heading',{name:'Всі завдання'})).toBeVisible();await expect.poll(()=>listCalls().at(-1).view).toBe('all')
 await page.getByRole('button',{name:/^Завершені/}).click();await expect.poll(()=>listCalls().at(-1).tab).toBe('completed')
 await page.getByRole('button',{name:/^Активні/}).click()
 await page.getByLabel('Сортування',{exact:true}).selectOption('priority');await expect.poll(()=>listCalls().at(-1)).toMatchObject({sort:'priority',dir:''})
 await page.getByRole('button',{name:'Напрямок сортування',exact:true}).click();await expect.poll(()=>listCalls().at(-1).dir).toBe('asc')
 const row=page.locator('.task-tree tbody tr.task-tree-row').first();const tall=await row.evaluate(e=>e.getBoundingClientRect().height)
 await page.getByRole('button',{name:'Вид',exact:true}).click();await page.getByLabel('Компактні рядки').check();await page.keyboard.press('Escape')
 await expect.poll(()=>row.evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(tall)
 await page.reload();await page.getByRole('navigation',{name:'Розділи роботи'}).getByRole('button',{name:'Завдання',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Всі завдання'})).toBeVisible();await expect.poll(()=>listCalls().at(-1)).toMatchObject({view:'all',tab:'active',sort:'priority',dir:'asc'})
 await expect.poll(()=>page.locator('.task-tree tbody tr.task-tree-row').first().evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(tall)
})
