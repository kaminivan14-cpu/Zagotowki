import {test,expect} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
const sample=JSON.parse(await readFile('tests/fixtures/new-menu-process.json','utf8'))
async function setup(page,{admin=true,accessError=false}={}){
 let invited=false;let orgVersions=[],orgAssignments=[{employee_id:6,department_id:1,manager_employee_id:1},{employee_id:8,department_id:1,manager_employee_id:6},{employee_id:9,department_id:1,manager_employee_id:8}],orgDirectors=[]
 const calls=[],user={id:'20000000-0000-4000-8000-000000000001',email:'admin@example.invalid',aud:'authenticated',role:'authenticated'},caps=['tasks.access','tasks.create.self','worktime.self',...(admin?['tasks.admin','employees.manage','employees.read','dictionaries.manage','dictionaries.read','processes.read','processes.manage','processes.launch']:[])]
 const exp=Math.floor(Date.now()/1000)+3600,b=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
 await page.addInitScript(s=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(s)),{access_token:`${b({alg:'HS256'})}.${b({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})
 let employees=[{id:1,name:'Іван',role:'owner',active:true,linked:true,department_id:1,location_id:1,capabilities:caps},{id:6,name:'Олена',role:'manager',active:true,linked:true,department_id:1,location_id:1,capabilities:['tasks.access']}],categories=[{id:1,name:'Операційні',sort_order:1,active:true,parent_id:null}],versions=[{id:1,template_id:1,number:1,status:'draft',revision:1,definition:structuredClone(sample)}],templates=[{id:1,name:sample.name}],instances=[]
 employees.push({id:8,name:'Працівник A',role:'specialist',active:true},{id:9,name:'Працівник B',role:'specialist',active:false});
 const departments=[{id:1,code:'marketing',name:'Маркетинг',active:true},{id:2,code:'production',name:'Виробничий',active:true}],locations=[{id:1,name:'Локал A'}]
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async r=>{
  const req=r.request(),url=new URL(req.url());if(url.origin==='http://127.0.0.1:5173')return r.continue();if(url.hostname!=='auth-tests.supabase.co')return r.abort()
  const name=url.pathname.split('/').at(-1),args=req.postDataJSON()||{};calls.push({name,args});let data
  if(name==='user')data=user
  else if(name==='auth_employee_profile')data=[{...employees[0],auth_user_id:user.id}]
  else if(name==='auth_capabilities')data=caps
  else if(name==='auth_email_access'&&accessError)return r.fulfill({status:404,json:{code:'PGRST202',message:'missing RPC'}})
  else if(name==='auth_email_access')data=[{employee_id:6,access_state:invited?'invited':'none',can_invite:!invited}]
  else if(name==='invite-employee'){invited=true;data={success:true}}
  else if(name==='worktime_current')data=null
  else if(name==='tasks_context')data={employee_id:1,today:'2026-10-04',capabilities:caps,categories:categories.filter(c=>c.active),category_history:categories,departments,settings:{company_timezone:'Europe/Warsaw'}}
  else if(name==='tasks_assignable_people')data=employees
  else if(name==='tasks_execution_state')data={current:null,next:null,critical:[],locations,task_count:0,planned_minutes:0,capacity_minutes:360}
  else if(name==='tasks_result_inbox')data=[]
  else if(name==='tasks_admin_directory')data={employees,categories,departments,locations,reporting_lines:[],scope_grants:[],audit:[]}
  else if(name==='tasks_admin_state')data={scope_grants:[],reporting_lines:[],capacity:[],recurring:[]}
  else if(name==='tasks_access_directory')data={roles:['owner','administrator','director','manager','expert','specialist','crafter'].map(role=>({role,user_count:employees.filter(e=>e.role===role).length,capabilities:role==='owner'?caps:role==='manager'?['tasks.access','orders.access']:role==='crafter'?['production.access']:[]})),employees:employees.map(e=>({...e,capabilities:e.role==='owner'?caps:e.role==='manager'?['tasks.access','orders.access']:[],hierarchy_ids:e.id===6?[8]:[],manager_id:e.id===8?6:null})),departments,locations,scope_grants:[]}
  else if(name==='organization_structure')data={version_id:args.p_version||null,today:'2026-10-04',can_manage:true,versions:orgVersions,employees,departments,assignments:orgAssignments,directors:orgDirectors,events:[]}
  else if(name==='organization_command'){
   const p=args.p_args,a=args.p_action
   if(a==='create')orgVersions.push({id:1,name:p.name,status:'draft',effective_status:'draft',revision:1,created_at:'2026-10-04T10:00:00Z'})
   if(a==='assignment'){orgAssignments=[...orgAssignments.filter(x=>x.employee_id!==p.employee_id),p];orgVersions[0].revision++}
   if(a==='director'){orgDirectors=[p];orgVersions[0].revision++}
   if(a==='schedule'){orgVersions[0].status='scheduled';orgVersions[0].effective_status='scheduled';orgVersions[0].effective_from=p.effective_from;orgVersions[0].revision++}
   if(a==='cancel'){orgVersions[0].status='cancelled';orgVersions[0].effective_status='cancelled';orgVersions[0].revision++}
   data={id:1,revision:orgVersions[0].revision}
  }
  else if(name==='tasks_processes')data={templates,versions,instances}
  else if(name==='tasks_command'){
   const p=args.p_args,a=args.p_action;data={}
   if(a==='admin_employee_save'){const id=p.id||employees.length+10;employees=[...employees.filter(e=>e.id!==id),{...p,id,linked:false,capabilities:[]}];data={id}}
   if(a==='category_save'){const id=p.id||categories.length+1;categories=[...categories.filter(c=>c.id!==id),{...p,id,active:p.active??true}];data={id}}
   if(a==='process_create'){const id=versions.length+1;templates.push({id,name:p.definition.name});versions.push({id,template_id:id,number:1,revision:1,status:'draft',definition:p.definition});data={version_id:id,template_id:id}}
   if(a==='process_save'){const v=versions.find(v=>v.id===p.version_id);v.definition=p.definition;v.revision++;data={version_id:v.id,template_id:v.template_id}}
   if(a==='process_publish'){versions.find(v=>v.id===p.version_id).status='published';data={version_id:p.version_id}}
   if(a==='process_version'||a==='process_duplicate'){const old=versions.find(v=>v.id===p.version_id),v={...structuredClone(old),id:versions.length+1,number:old.number+1,revision:1,status:'draft'};versions.push(v);data={version_id:v.id,template_id:v.template_id}}
   if(a==='process_launch'){const v=versions.find(v=>v.id===p.version_id);instances.push({id:instances.length+1,version_id:v.id,number:v.number,name:v.definition.name,owner_employee_id:1,starts_on:p.starts_on,tasks:v.definition.stages.flatMap(s=>s.tasks.map((t,i)=>({id:i+10,title:t.title,status:'planned',stage:s.name})))});data={instance_id:instances.length}}
  }else throw Error('Unexpected request '+name)
  await r.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 });await page.goto('/');return calls
}
for(const width of [375,768,1440])test(`access role/user navigation and responsive ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await setup(page)
 await page.getByRole('button',{name:'Адмін панель',exact:true}).click();await page.getByRole('button',{name:'Доступи',exact:true}).click()
 const screen=page.locator('.access-screen')
 await expect(screen.getByRole('button',{name:'Ролі',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(screen.locator('.access-role')).toHaveCount(7)
 const manager=screen.locator('.access-role').filter({has:page.getByRole('heading',{name:'Менеджер',exact:true})})
 await expect(manager.getByText('Користувачів: 1',{exact:true})).toBeVisible()
 await manager.getByRole('button').focus();await page.keyboard.press('Enter')
 const dialog=page.getByRole('dialog');await expect(dialog.getByText('Олена',{exact:true})).toBeVisible()
 await expect(dialog.locator('.access-modules li').filter({hasText:'Замовлення'})).toHaveAttribute('data-allowed','true')
 await expect(dialog.locator('.access-modules li').filter({hasText:'Адмін панель'})).toHaveAttribute('data-allowed','false')
 await dialog.getByRole('button',{name:'Закрити',exact:true}).click()
 await screen.getByRole('button',{name:'Переглянути дозволи: Директор',exact:true}).click()
 await expect(dialog.getByText('Користувачів із цією роллю ще немає')).toBeVisible();await dialog.getByRole('button',{name:'Закрити',exact:true}).click()
 await mkdir('tmp/access/screenshots',{recursive:true});await page.screenshot({path:`tmp/access/screenshots/roles-${width}.png`,fullPage:true})
 await screen.getByRole('button',{name:'Працівники',exact:true}).click()
 await screen.getByRole('button',{name:'Переглянути: Олена',exact:true}).click()
 await expect(dialog.getByText('Системна роль: Менеджер')).toBeVisible();await expect(dialog.getByText('Працівник A',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Явних винятків немає')).toBeVisible()
 await page.screenshot({path:`tmp/access/screenshots/details-${width}.png`,fullPage:true})
 await dialog.getByRole('button',{name:'Закрити',exact:true}).click()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('access error retains roles as unknown and supports retry',async({page})=>{
 await setup(page);let fail=true
 await page.route('**/rest/v1/rpc/tasks_access_directory',r=>fail?r.fulfill({status:503,json:{message:'Synthetic failure'}}):r.fallback())
 await page.getByRole('button',{name:'Адмін панель',exact:true}).click();await page.getByRole('button',{name:'Доступи',exact:true}).click()
 const screen=page.locator('.access-screen');await expect(screen.getByText('Не вдалося завантажити дозволи',{exact:false})).toBeVisible()
 await expect(screen.locator('.access-role')).toHaveCount(6)
 await expect(screen.locator('[aria-label="Недоступно"]')).toHaveCount(0)
 await screen.getByRole('button',{name:'Переглянути дозволи: Менеджер',exact:true}).click()
 const dialog=page.getByRole('dialog');await expect(dialog.getByText('Не вдалося завантажити дозволи',{exact:true}).last()).toBeVisible()
 fail=false;await dialog.getByRole('button',{name:'Повторити',exact:true}).click()
 await expect(dialog.locator('.access-modules li').filter({hasText:'Замовлення'})).toHaveAttribute('data-allowed','true')
})
