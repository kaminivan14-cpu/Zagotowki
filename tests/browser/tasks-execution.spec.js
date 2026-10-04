import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
async function setup(page,{active=false,empty=false,critical=false}={}){
 const calls=[],user={id:'20000000-0000-4000-8000-000000000006',email:'execution@example.invalid',aud:'authenticated',role:'authenticated'},caps=['tasks.access','tasks.create.self','worktime.self']
 const exp=Math.floor(Date.now()/1000)+3600,b=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
 await page.addInitScript(s=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(s)),{access_token:`${b({alg:'HS256'})}.${b({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})
 const make=(id,title)=>({id,title,assigned_to_employee_id:6,created_by_employee_id:6,description:'Перевірте інструкцію та виконайте завдання.',priority:'medium',urgency:'normal',status:'planned',version:1,estimated_minutes:15})
 let tasks=empty?[]:[make(1,'Перевірити склад'),make(2,'Оновити журнал')],current=null,previous=null,shift=active?{id:5,started_at:new Date().toISOString()}:null,urgent=null
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async r=>{
  const req=r.request(),url=new URL(req.url());if(url.origin==='http://127.0.0.1:5173')return r.continue();if(url.hostname!=='auth-tests.supabase.co')return r.abort()
  const name=url.pathname.split('/').at(-1),args=req.postDataJSON()||{};calls.push({name,args});let data
  if(name==='user')data=user
  else if(name==='auth_employee_profile')data=[{id:6,name:'Олена',role:'specialist',location_id:1,active:true,auth_user_id:user.id}]
  else if(name==='auth_capabilities')data=caps
  else if(name==='worktime_current')data=shift
  else if(name==='worktime_command'){shift=args.p_action==='start'?(shift||{id:5,started_at:new Date().toISOString()}):null;data=shift||{}}
  else if(name==='tasks_context')data={employee_id:6,today:'2026-10-04',capabilities:caps,categories:[],settings:{company_timezone:'Europe/Warsaw'}}
  else if(name==='tasks_result_inbox')data=[]
  else if(name==='tasks_assignable_people')data=[{id:6,name:'Олена'}]
  else if(name==='tasks_execution_state')data={current,next:tasks.find(t=>t.status==='planned')||null,critical:urgent?[urgent]:[],locations:[{id:1,name:'Локал A'}],session_started_at:current?new Date(Date.now()-65000).toISOString():null,completed_today:tasks.filter(t=>t.status==='completed').length,task_count:tasks.length,planned_minutes:30,capacity_minutes:360}
  else if(name==='tasks_details')data={task:tasks.find(t=>t.id===args.p_task)||current,checklist:[],events:[]}
  else if(name==='tasks_command'){
   const t=tasks.find(t=>t.id===args.p_args.task_id)||urgent
   if(args.p_action==='start_task'){t.status='in_progress';t.version++;current=t;if(critical&&!urgent)urgent={...make(3,'Негайне завдання'),urgency:'critical_now',ready:true}}
   if(args.p_action==='critical_start'){previous=current;previous.status='paused';current={...urgent,status:'in_progress'};urgent=null}
   if(args.p_action==='complete'){current.status='completed';current=previous;previous=null;if(current)current.status='in_progress'}
   data=current||{}
  }else throw Error('Unexpected RPC '+name)
  await r.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 });await page.goto('/');return calls
}
async function shot(page,state,width){await mkdir('tmp/tasks-execution.local',{recursive:true});await page.screenshot({path:`tmp/tasks-execution.local/${state}-${width}.png`,fullPage:true})}
for(const width of [375,768,1440])test(`single-task execution and recovery ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});const calls=await setup(page)
 await expect(page.getByRole('button',{name:'Розпочати роботу',exact:true})).toBeEnabled();await shot(page,'start-work',width)
 await page.getByRole('button',{name:'Розпочати роботу',exact:true}).click();await expect(page.getByRole('heading',{name:'Перевірити склад',exact:true})).toBeVisible();await expect(page.getByText('Оновити журнал',{exact:true})).toHaveCount(0);await expect(page.locator('.execution-task')).toHaveCount(1);await shot(page,'current-task',width)
 expect(calls.filter(c=>c.name==='worktime_command'&&c.args.p_action==='start')).toHaveLength(1)
 expect(calls.filter(c=>c.name==='tasks_command')).toHaveLength(0)
 await page.getByRole('button',{name:'Розпочати завдання',exact:true}).click();await expect(page.getByRole('timer')).toBeVisible();await shot(page,'in-progress',width)
 await page.reload();await expect(page.getByRole('heading',{name:'Перевірити склад',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Закінчити завдання',exact:true})).toBeVisible()
 expect(calls.filter(c=>c.name==='worktime_command')).toHaveLength(1);expect(calls.filter(c=>c.args.p_action==='start_task')).toHaveLength(1)
 await page.getByRole('button',{name:'Закінчити завдання',exact:true}).click();await expect(page.getByRole('heading',{name:'Оновити журнал',exact:true})).toBeVisible();await expect(page.getByRole('timer')).toHaveCount(0)
 expect(calls.find(c=>c.args.p_action==='complete').args.p_args.advance).toBe(false)
 await page.getByRole('button',{name:'Розпочати завдання',exact:true}).click();await page.getByRole('button',{name:'Закінчити завдання',exact:true}).click();await expect(page.getByRole('heading',{name:'На сьогодні доступних завдань немає'})).toBeVisible();await shot(page,'no-next-task',width)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByRole('button',{name:'Завершити роботу',exact:true}).click();await expect(page.getByRole('button',{name:'Розпочати роботу',exact:true})).toBeVisible();expect(calls.filter(c=>c.name==='worktime_command'&&c.args.p_action==='end')).toHaveLength(1)
})
test('existing shift restores candidate without creating another shift',async({page})=>{const calls=await setup(page,{active:true});await expect(page.getByRole('button',{name:'Розпочати завдання',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Розпочати завдання',exact:true})).toBeVisible();expect(calls.some(c=>c.name==='worktime_command')).toBe(false)})
test('critical interrupt completes and resumes previous task',async({page})=>{await setup(page,{active:true,critical:true});await page.getByRole('button',{name:'Розпочати завдання',exact:true}).click();await expect(page.getByRole('dialog',{name:'Критичне завдання'})).toBeVisible();await page.getByRole('button',{name:'Почати',exact:true}).click();await expect(page.getByRole('heading',{name:'Негайне завдання',exact:true})).toBeVisible();await page.getByRole('button',{name:'Закінчити завдання',exact:true}).click();await expect(page.getByRole('heading',{name:'Перевірити склад',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Закінчити завдання',exact:true})).toBeVisible()})
