import { test,expect } from '@playwright/test'
const user={id:'20000000-0000-4000-8000-000000000006',email:'tasks@example.test',aud:'authenticated',role:'authenticated'}
function session(){const exp=Math.floor(Date.now()/1000)+3600,b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return {access_token:`${b64({alg:'HS256'})}.${b64({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user}}
async function setup(page,{role='specialist',critical=false,denied=false}={}){
 const calls=[],today='2026-10-02',caps=['worktime.self','tasks.access','tasks.create.self','tasks.create.request','tasks.plan.self',...(role==='manager'?['tasks.approve']:[])],tasks=[{id:1,title:'Перевірити документи',description:'Перевірте перелік.',priority:'medium',urgency:'normal',estimated_minutes:20,actual_minutes:0,status:'planned',planned_date:today,version:1}],approvals=role==='manager'?[{id:1,title:'Запит колеги',request_type:'task_creation',reason:'Потрібна допомога',requested_value:{},approver_employee_id:6}]:[]
 let current=null,started=false,shift=critical?{id:1,started_at:new Date().toISOString()}:null
 if(critical)tasks.push({id:2,title:'Відписати Лені',urgency:'critical_now',priority:'critical',estimated_minutes:2,status:'unplanned',version:1,ready:true,acknowledged:false})
 await page.addInitScript(saved=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(saved));sessionStorage.setItem('seeded','true')}},session())
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin==='http://127.0.0.1:5173')return route.continue();if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const args=req.postDataJSON() || {},name=url.pathname.split('/').at(-1);calls.push({name,args});let body
  if(name==='auth_employee_profile')body=[{id:6,name:'Олена',role,active:true,auth_user_id:user.id,location_id:role==='manager'?1:null}]
  else if(name==='auth_capabilities')body=caps
  else if(name==='user')body=user
  else if(name==='logout')body={}
  else if(name==='tasks_context'){
   if(denied)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'TASKS_DENIED'})})
   body={employee_id:6,today,capabilities:caps,categories:[{id:1,name:'Операційні'}],departments:[],manager_id:4,settings:{company_timezone:'Europe/Warsaw',default_daily_task_capacity_minutes:360,planning_horizon_days:60,load_balancer_enabled:false}}
  }else if(name==='worktime_current')body=shift
  else if(name==='worktime_command'){shift=args.p_action==='start'?{id:1,started_at:new Date().toISOString()}:null;body=shift||{}}
  else if(name==='tasks_list')body=tasks
  else if(name==='tasks_assignable_people')body=[{id:6,name:'Олена'}]
  else if(name==='tasks_execution_state')body={locations:[{id:1,name:'UAT'}],next:tasks.find(t=>t.status==='planned'),current:tasks.find(t=>t.id===current)||null,started,critical:tasks.filter(t=>t.urgency==='critical_now' && t.status!=='completed' && t.status!=='in_progress'),task_count:tasks.length,planned_minutes:20,capacity_minutes:360}
  else if(name==='tasks_approvals')body=approvals
  else if(name==='tasks_recommendations'||name==='tasks_schedule')body=[]
  else if(name==='tasks_planning'){
   const days=[];for(let d=Date.parse(args.p_from+'T12:00:00Z');d<=Date.parse(args.p_to+'T12:00:00Z');d+=86400000)days.push({date:new Date(d).toISOString().slice(0,10),capacity_minutes:360,planned_minutes:20,unknown_count:0})
   body={days,tasks:tasks.filter(t=>t.planned_date),unplanned:tasks.filter(t=>!t.planned_date)}
  }else if(name==='tasks_details')body={task:tasks.find(t=>t.id===args.p_task),checklist:[],events:[]}
  else if(name==='tasks_report_activity')body={rows:tasks.map(t=>({date:args.p_from,task_id:t.id,title:t.title,kind:'planned',actual_minutes:2}))}
  else if(name==='tasks_schedule_capacity')body=[]
  else if(name==='tasks_command'){
   const a=args.p_args,t=tasks.find(t=>t.id===a.task_id)
   if(args.p_action==='create'||args.p_action==='request_creation'){body={...a,id:tasks.length+1,status:'unplanned',version:1};tasks.push(body)}
   else if(args.p_action==='start_task'){started=true;current=1;tasks[0].status='in_progress';body=tasks[0]}
   else if(args.p_action==='complete'){t.status='completed';current=null;body=null}
   else if(args.p_action==='critical_start'){current=t.id;t.status='in_progress';body=t}
   else if(args.p_action==='critical_decline'){t.acknowledged=true;body=t}
   else if(args.p_action==='plan'){t.planned_date=a.planned_date;t.status='planned';t.version++;body=t}
   else if(args.p_action==='resolve_approval'){approvals.splice(0);body={ok:true}}
   else body={ok:true}
  }else throw new Error(`Unexpected tasks request: ${url.pathname}`)
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
 });return {calls,tasks}
}
test('specialist and director enter only the task module and restore session on reload',async({page})=>{
 const {calls}=await setup(page,{role:'director'});await page.goto('/');await expect(page.getByRole('button',{name:'Розпочати роботу'})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Розпочати роботу'})).toBeVisible();expect(calls.some(c=>c.name==='Products'||c.name==='orders_board')).toBe(false)
})
test('create, plan, work, complete and report use Ukrainian screens',async({page})=>{
 const {calls}=await setup(page);await page.goto('/');await page.getByRole('button',{name:'Створити завдання'}).click();await page.getByLabel('Назва',{exact:true}).fill('Закрити місяць');await page.getByLabel('Орієнтовний час, хв').fill('30');await page.getByRole('button',{name:'Створити',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
 await page.getByRole('button',{name:'Планування',exact:true}).click();await page.getByRole('button',{name:'Запланувати тиждень'}).click();await expect(page.getByText('Незаплановані завдання',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрити місяць'}).click();await page.getByLabel('Дата',{exact:true}).fill('05.10.2026');await page.getByRole('button',{name:'Зберегти дату'}).click();await page.getByRole('button',{name:'Закрити',exact:true}).click()
 await page.getByRole('button',{name:'Запланувати місяць'}).click();await expect(page.locator('.task-week')).toHaveCount(4);expect(calls.filter(c=>c.name==='tasks_planning').at(-1).args.p_to).toBe('2026-10-25')
 await page.getByRole('button',{name:'Робота',exact:true}).click();await page.getByRole('button',{name:'Розпочати роботу'}).click();await page.getByRole('button',{name:'Розпочати завдання'}).click();await expect(page.getByRole('button',{name:'Закінчити завдання',exact:true})).toBeVisible();await expect(page.locator('.execution-task')).toHaveCount(1);await page.getByRole('button',{name:'Закінчити завдання',exact:true}).click();await page.getByRole('button',{name:'Звіти',exact:true}).click();await expect(page.getByRole('heading',{name:'Загальний час'})).toBeVisible();await page.getByRole('button',{name:'Графік',exact:true}).click();await expect(page.locator('.schedule-calendar article')).toHaveCount(28)
})
test('critical refusal requires a reason, survives refresh and does not loop',async({page})=>{
 await setup(page,{critical:true});await page.goto('/');await expect(page.getByRole('dialog',{name:'Критичне завдання'})).toBeVisible();await page.getByRole('button',{name:'Не можу зараз'}).click();await page.getByLabel('Вкажіть причину').fill('Зустріч');await page.getByRole('button',{name:'Зберегти причину'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.reload();await expect(page.getByRole('dialog',{name:'Критичне завдання'})).toHaveCount(0)
})
test('critical start and manager approval',async({page})=>{
 const {calls}=await setup(page,{role:'manager',critical:true});await page.goto('/');await page.getByRole('button',{name:'Почати',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Відписати Лені'})).toBeVisible();await page.getByRole('button',{name:'Планування',exact:true}).click();await page.getByRole('button',{name:'Підтвердити',exact:true}).click();await expect(page.getByText('Немає запитів на погодження.')).toBeVisible();expect(calls.some(c=>c.name==='tasks_command'&&c.args.p_action==='resolve_approval')).toBe(true)
})
test('denied module never renders business controls',async({page})=>{
 await setup(page,{denied:true});await page.goto('/');await expect(page.getByRole('alert')).toHaveText('Немає дозволу на цю дію або дані.');await expect(page.getByRole('button',{name:'Створити завдання'})).toHaveCount(0)
})

for(const width of [1024,768])test(`Tasks visual and touch targets ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await setup(page);await page.goto('/');await page.getByRole('button',{name:'Розпочати роботу'}).click();await page.getByRole('button',{name:'Розпочати завдання'}).click();await expect(page.getByRole('button',{name:'Закінчити завдання',exact:true})).toBeVisible();expect((await page.getByRole('button',{name:'Закінчити завдання',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(64);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('tasks-work.png'),fullPage:true});await page.getByRole('button',{name:'Планування',exact:true}).click();await page.getByRole('button',{name:'Запланувати місяць'}).click();await expect(page.locator('.task-week')).toHaveCount(4);await page.screenshot({path:info.outputPath('tasks-month.png'),fullPage:true})

})
test('uncertain create can be retried inside its dialog with the same operation UUID',async({page})=>{
 const {calls}=await setup(page);let failed=false
 await page.route('**/rest/v1/rpc/tasks_command',async route=>{if(!failed){failed=true;return route.abort('failed')}return route.fallback()})
 await page.goto('/');await page.getByRole('button',{name:'Створити завдання'}).click();await page.getByLabel('Назва',{exact:true}).fill('Повторювана дія');await page.getByRole('button',{name:'Створити',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'Повторити дію'})).toBeVisible()
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tasks-pending:6')))
 await page.getByRole('dialog').getByRole('button',{name:'Повторити дію'}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
 expect(calls.find(c=>c.name==='tasks_command').args.p_operation).toBe(saved.id)
})
