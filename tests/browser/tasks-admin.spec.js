import {test,expect} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
const sample=JSON.parse(await readFile('tests/fixtures/new-menu-process.json','utf8'))
async function setup(page,{admin=true,accessError=false,productionDepartment=false,diagramDoc=sample}={}){
 let invited=false
 const calls=[],user={id:'20000000-0000-4000-8000-000000000001',email:'admin@example.invalid',aud:'authenticated',role:'authenticated'},caps=['tasks.access','tasks.create.self','worktime.self',...(admin?['tasks.admin','employees.manage','employees.read','dictionaries.manage','dictionaries.read','processes.read','processes.manage','processes.launch']:[])]
 const exp=Math.floor(Date.now()/1000)+3600,b=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
 await page.addInitScript(s=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(s)),{access_token:`${b({alg:'HS256'})}.${b({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})
 let employees=[{id:1,name:'Іван',role:'owner',active:true,linked:true,department_id:1,location_id:1,capabilities:caps},{id:6,name:'Олена',role:'manager',active:true,linked:true,department_id:productionDepartment?2:1,location_id:1,capabilities:['tasks.access']}],categories=[{id:1,name:'Операційні',sort_order:1,active:true,parent_id:null}],versions=[{id:1,template_id:1,number:1,status:'draft',revision:1,definition:structuredClone(diagramDoc)}],templates=[{id:1,name:diagramDoc.name}],instances=[]
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
  else if(name==='tasks_context')data={employee_id:1,today:'2026-10-04',capabilities:caps,categories:categories.filter(c=>c.active),category_history:categories,departments,settings:{company_timezone:'Europe/Warsaw',default_daily_task_capacity_minutes:360}}
  else if(name==='tasks_assignable_people')data=employees
  else if(name==='tasks_execution_state')data={current:null,next:null,critical:[],locations,task_count:0,planned_minutes:0,capacity_minutes:360}
  else if(name==='tasks_result_inbox')data=[]
  else if(name==='organization_structure')data={can_manage:true,assignments:employees.map(e=>({employee_id:e.id,department_id:e.department_id,manager_employee_id:null}))}
  else if(name==='tasks_admin_directory')data={employees,categories,departments,locations,reporting_lines:[],scope_grants:[],audit:[]}
  else if(name==='tasks_processes')data={templates,versions,instances,roles:['owner','manager']}
  else if(name==='tasks_command'){
   const p=args.p_args,a=args.p_action;data={}
   if(a==='admin_employee_save'){const id=p.id||employees.length+10;employees=[...employees.filter(e=>e.id!==id),{...p,id,linked:false,capabilities:[]}];data={id}}
   if(a==='category_save'){const id=p.id||categories.length+1;categories=[...categories.filter(c=>c.id!==id),{...p,id,active:p.active??true}];data={id}}
   if(a==='process_create'){const id=versions.length+1;templates.push({id,name:p.definition.name});versions.push({id,template_id:id,number:1,revision:1,status:'draft',definition:p.definition});data={version_id:id,template_id:id}}
   if(a==='process_save'){const v=versions.find(v=>v.id===p.version_id);v.definition=p.definition;v.revision++;data={version_id:v.id,template_id:v.template_id}}
   if(a==='process_publish'){versions.find(v=>v.id===p.version_id).status='published';data={version_id:p.version_id}}
   if(a==='process_version'||a==='process_duplicate'){const old=versions.find(v=>v.id===p.version_id),v={...structuredClone(old),id:versions.length+1,number:old.number+1,revision:1,status:'draft'};versions.push(v);data={version_id:v.id,template_id:v.template_id}}
   if(a==='process_archive'){templates.find(t=>t.id===p.template_id).active=false}
   if(a==='process_launch'){const v=versions.find(v=>v.id===p.version_id);instances.push({id:instances.length+1,version_id:v.id,number:v.number,name:p.name||v.definition.name,execution_snapshot:structuredClone(v.definition),owner_employee_id:1,starts_on:p.starts_on,deadline:p.deadline,tasks:v.definition.stages.flatMap(s=>s.tasks.map((t,i)=>({id:i+10,title:t.title,status:'planned',stage:s.name})))});data={instance_id:instances.length}}
  }else throw Error('Unexpected request '+name)
  await r.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 });await page.goto('/');return calls
}
async function shot(page,name){await mkdir('tmp/tasks-admin.local',{recursive:true});await page.screenshot({path:`tmp/tasks-admin.local/${name}.png`,fullPage:true})}
for(const width of [375,768,1024,1440])test(`admin employees dictionaries and process editor ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const calls=await setup(page,{productionDepartment:true});await page.getByRole('button',{name:'Адмін панель',exact:true}).click();await expect(page.getByRole('heading',{name:'Працівники',exact:true})).toBeVisible();await shot(page,`employees-${width}`)
 await page.getByRole('button',{name:'Редагувати',exact:true}).last().click();const d=page.getByRole('dialog');await expect(d.getByLabel('Відділ',{exact:true})).toBeDisabled();await d.getByLabel('Виробнича роль',{exact:true}).selectOption('su-chef');await expect(d.getByLabel('Роль у системі')).toHaveValue('manager');await d.getByRole('button',{name:'Зберегти',exact:true}).click();await expect(d).toHaveCount(0);expect(calls.find(c=>c.args.p_action==='admin_employee_save').args.p_args).toMatchObject({role:'manager',production_role:'su-chef'})
 await page.getByRole('button',{name:'Довідники',exact:true}).click();await page.getByRole('button',{name:'Деактивувати',exact:true}).click();await expect(page.getByRole('button',{name:'Відновити',exact:true})).toBeVisible();await page.getByRole('button',{name:'Відновити',exact:true}).click()
 await openProcesses(page);await createWizard(page,'Тестовий процес');await shot(page,`editor-${width}`)
 await d.getByRole('button',{name:'Створити шаблон процесу',exact:true}).click();await expect(d).toHaveCount(0)
 const card=page.locator('.process-summary').filter({hasText:'Тестовий процес'});await card.getByRole('button',{name:/Запустити/}).click()
 await d.getByLabel('Назва запуску').fill('Філадельфія Mango');await expect(d.getByLabel('Дедлайн',{exact:true})).toHaveValue('04.10.2026');await expect(d.getByLabel('Версія',{exact:true})).toHaveCount(0);await d.getByLabel('Дедлайн',{exact:true}).fill('30.11.2026');await d.getByLabel('Запустити за днів до дедлайну').fill('7');await expect(d.getByText('Запланований старт: 23.11.2026')).toBeVisible();
 await d.getByLabel('Відповідальний за процес · Власник').selectOption('1');await d.getByLabel('Підтверджую створення реальних завдань').check();await d.getByRole('button',{name:'Запустити процес',exact:true}).click();await expect(d).toHaveCount(0)
 await expect(page.getByRole('columnheader',{name:'Прогрес',exact:true})).toBeVisible();expect(calls.find(c=>c.args.p_action==='process_launch').args.p_args.role_assignments).toEqual({owner:1});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)

})
test('specialist cannot enter the admin panel',async({page})=>{await setup(page,{admin:false});await expect(page.getByRole('button',{name:'Адмін панель'})).toHaveCount(0)})
test('existing template stages can reorder by keyboard; draft remains same template',async({page})=>{const calls=await setup(page);await openProcesses(page);await page.getByLabel(`Дії: ${sample.name}`).click();await page.getByRole('button',{name:'Редагувати',exact:true}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:/Етапи та завдання/}).click();await d.getByRole('button',{name:'Етап вгору',exact:true}).nth(1).focus();await page.keyboard.press('Enter');await expect(d.getByLabel('Назва етапу 1',{exact:true})).toHaveValue('Калькуляції та документація');await d.getByRole('button',{name:'Зберегти як чернетку'}).click();expect(calls.find(c=>c.args.p_action==='process_save').args.p_args.version_id).toBe(1)})
test('required photo upload uses private storage and existing result command',async({page})=>{
 await setup(page);let saved=null,file=null,finished=false,version=1;const calls=[],task=()=>({id:70,title:'Фото результату',source_type:'process',assigned_to_employee_id:1,status:'in_progress',version,priority:'medium',urgency:'normal',estimated_minutes:15})
 await page.route('**/storage/v1/object/tasks-private/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({Key:'tasks-private/test'})}))
 await page.route('**/rest/v1/rpc/*',async r=>{const name=new URL(r.request().url()).pathname.split('/').at(-1),p=r.request().postDataJSON();let data
  if(name==='worktime_current')data={id:1,started_at:new Date().toISOString()}
  else if(name==='tasks_execution_state')data={current:finished?null:task(),next:null,critical:[],locations:[{id:1,name:'Локал'}],completed_today:finished?1:0}
  else if(name==='tasks_details')data={task:task(),checklist:[],events:[]}
  else if(name==='tasks_process_task')data={step:{result_type:'photo',required_file:true},attachments:[],result:saved?{value:saved}:null}
  else if(name==='tasks_file')data=file
  else if(name==='tasks_command'){calls.push(p);if(p.p_action==='file_register'){file=p.p_args;data=file}else if(p.p_action==='result_save'){saved=p.p_args.value;version++;data={}}else if(p.p_action==='complete'){finished=true;data={}}else return r.fallback()}
  else return r.fallback()
  await r.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 });await page.reload();await expect(page.getByRole('heading',{name:'Фото результату',exact:true})).toBeVisible();await page.getByLabel('Файл для завантаження').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('synthetic-test-image')});await expect(page.getByRole('button',{name:'photo.png',exact:true})).toBeVisible();await page.getByRole('button',{name:'Зберегти результат',exact:true}).click();await expect(page.getByText('Результат збережено',{exact:true})).toBeVisible();expect(calls.find(c=>c.p_action==='file_register').p_args.object_key).toMatch(/^20000000-0000-4000-8000-000000000001\//);expect(saved.file_id).toBe(file.id);await page.getByRole('button',{name:'Закінчити завдання',exact:true}).click();await expect(page.getByRole('heading',{name:'На сьогодні доступних завдань немає'})).toBeVisible()
})
test('designated reviewer sees Ukrainian result confirmation action',async({page})=>{await setup(page);let approved=false;await page.route('**/rest/v1/rpc/tasks_result_inbox',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(approved?[]:[{id:77,title:'Підтвердити ціну',version:4,value:{number:42}}])}));await page.route('**/rest/v1/rpc/tasks_command',async r=>{const p=r.request().postDataJSON();expect(p).toMatchObject({p_action:'result_approve',p_args:{task_id:77,version:4}});approved=true;await r.fulfill({contentType:'application/json',body:'{}'})});await page.reload();await page.getByText('Підтвердження результатів (1)',{exact:true}).click();await page.getByRole('button',{name:'Підтвердити результат',exact:true}).click();await expect(page.getByText('Підтвердження результатів (1)',{exact:true})).toHaveCount(0)})

for(const width of [375,768,1440])test(`email invite for manager in Admin ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const calls=await setup(page,{productionDepartment:true})
 await page.getByRole('button',{name:'Адмін панель',exact:true}).click()
 const row=page.getByRole('row').filter({hasText:'Олена'})
 await expect(row.getByText('Немає доступу',{exact:true})).toBeVisible()
 await row.getByRole('button',{name:'Запросити',exact:true}).click()
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Email',{exact:true}).fill('manager@example.invalid')
 await dialog.getByRole('button',{name:'Надіслати запрошення'}).click()
 await expect(row.getByText('Запрошено',{exact:true})).toBeVisible()
 await expect(row.getByRole('button',{name:'Запросити',exact:true})).toHaveCount(0)
 expect(calls.filter(c=>c.name==='invite-employee')).toHaveLength(1)
})

test('invitation remains available in Actions on access RPC failure and success survives failed refresh',async({page})=>{
 const calls=await setup(page,{accessError:true})
 await page.getByRole('button',{name:'\u0410\u0434\u043c\u0456\u043d \u043f\u0430\u043d\u0435\u043b\u044c',exact:true}).click()
 const row=page.getByRole('row').filter({hasText:'\u041e\u043b\u0435\u043d\u0430'})
 const actions=row.getByRole('cell').last()
 await actions.getByRole('button',{name:'\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u0438',exact:true}).click()
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Email',{exact:true}).fill('controlled@example.invalid')
 await dialog.getByRole('button',{name:'\u041d\u0430\u0434\u0456\u0441\u043b\u0430\u0442\u0438 \u0437\u0430\u043f\u0440\u043e\u0448\u0435\u043d\u043d\u044f'}).click()
 await expect(actions.getByText('\u0417\u0430\u043f\u0440\u043e\u0448\u0435\u043d\u043e',{exact:true})).toBeVisible()
 await expect(actions.getByRole('button',{name:'\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u0438',exact:true})).toHaveCount(0)
 expect(calls.filter(c=>c.name==='invite-employee')).toHaveLength(1)
})

async function openProcesses(page){await page.getByRole('button',{name:'Адмін панель',exact:true}).click();await page.getByRole('button',{name:'Процеси',exact:true}).click()}
async function selectRole(scope,label,name='Власник') {const summary=scope.getByLabel(label,{exact:true});await summary.click();const panel=summary.locator('..');await panel.getByRole('radio',{name,exact:true}).check();await summary.click()}
async function createWizard(page,name){await page.getByRole('button',{name:'Створити процес',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Назва процесу *',{exact:true}).fill(name);await d.getByLabel('Мета *',{exact:true}).fill('Мета');await d.getByLabel('Результат очікуваний *',{exact:true}).fill('Результат');await selectRole(d,'Відповідальна роль');const involved=d.getByLabel('Залучені ролі',{exact:true});await involved.click();await involved.locator('..').getByRole('checkbox',{name:'Власник',exact:true}).check();await involved.click();await d.getByRole('button',{name:'Далі →'}).click();await d.getByRole('button',{name:'＋ Додати етап',exact:true}).click();await d.getByLabel('Назва етапу 1',{exact:true}).fill('Підготовка');await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel('Назва завдання 1.1',{exact:true}).fill('Перевірити');await selectRole(d,'Роль 1.1');await d.getByRole('button',{name:'Далі →'}).click();await expect(d.locator('.process-graph-node')).toHaveCount(1)}
for(const width of [375,768,1440])test(`process wizard shared stages dependencies diagram ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const calls=await setup(page);await openProcesses(page)
 await page.getByLabel('Пошук за назвою та описом').fill('does-not-exist');await expect(page.getByText('Процесів не знайдено')).toBeVisible();await page.getByLabel('Пошук за назвою та описом').fill('')
 await page.getByRole('button',{name:'Переглянути',exact:true}).click();await expect(page.locator('.process-operational-stage')).toHaveCount(7);await page.getByRole('dialog').getByRole('button',{name:'Закрити',exact:true}).click()
 await createWizard(page,'DAG test');const d=page.getByRole('dialog');await d.getByRole('button',{name:'Назад',exact:true}).click();await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel('Назва завдання 1.2').fill('Наступне');await selectRole(d,'Роль 1.2');const deps=d.getByLabel('Залежності: Наступне');await deps.click();await deps.locator('..').getByRole('checkbox',{name:'1.1 Перевірити'}).check();await deps.click();await d.getByRole('button',{name:'Далі →'}).click();await expect(d.locator('.process-graph-node')).toHaveCount(2)
 const nodes=await d.locator('.process-graph-node').evaluateAll(ns=>ns.map(n=>({id:n.dataset.taskKey,level:Number(n.dataset.level)})));expect(nodes.map(n=>n.level)).toEqual([0,1]);await d.locator('.process-graph-node').last().click();await d.getByRole('button',{name:'Додатково',exact:true}).click();await d.getByLabel('Чек-лист',{exact:true}).fill('Перевірити')
 await d.getByRole('button',{name:'Зберегти як чернетку',exact:true}).click();await expect.poll(()=>calls.some(c=>c.args.p_action==='process_create')).toBe(true);const saved=calls.find(c=>c.args.p_action==='process_create').args.p_args.definition;expect(saved.stages[0].tasks[1].depends_on).toEqual([saved.stages[0].tasks[0].key]);expect(saved.stages[0].tasks[1].checklist).toEqual(['Перевірити']);expect(saved.schema_version).toBe(2);await shot(page,`wizard-${width}`)
})

test('process defaults dropdown dismiss and editable edges share one model',async({page})=>{
 const calls=await setup(page);await openProcesses(page);await createWizard(page,'Shared graph');const d=page.getByRole('dialog');await d.getByRole('button',{name:'Основні дані',exact:false}).click();await expect(d.getByLabel('Інструкція',{exact:true})).toHaveCount(0);await expect(d.getByLabel('Умова запуску',{exact:true})).toHaveCount(0);await d.getByRole('button',{name:/Етапи та завдання/}).click();await expect(d.getByLabel('Тривалість у хвилинах')).toHaveValue('30');await d.getByLabel('Роль 1.1',{exact:true}).click();await expect(d.getByPlaceholder('Пошук ролі…')).toBeVisible();await page.keyboard.press('Escape');await expect(d.getByPlaceholder('Пошук ролі…')).not.toBeVisible();await d.getByLabel('Роль 1.1',{exact:true}).click();await d.getByRole('heading',{name:'Етапи процесу'}).click();await expect(d.getByPlaceholder('Пошук ролі…')).not.toBeVisible();await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel('Назва завдання 1.2').fill('Second');await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel('Назва завдання 1.3').fill('Third');await d.getByRole('button',{name:'Далі →'}).click();const edges=d.locator('svg path[role=button]');await expect(edges).toHaveCount(2);const point=await edges.first().evaluate(p=>{const q=p.getPointAtLength(p.getTotalLength()/2),m=p.getScreenCTM();return {x:q.x*m.a+q.y*m.c+m.e,y:q.x*m.b+q.y*m.d+m.f}});await page.mouse.click(point.x,point.y);await expect(d.getByRole('heading',{name:'Залежність',exact:true})).toBeVisible();await edges.first().focus();await page.keyboard.press('Enter');const successor=d.getByRole('combobox',{name:'Наступне завдання',exact:true});await successor.selectOption({label:'1.3 Third'});await d.getByRole('button',{name:'Застосувати',exact:true}).click();await d.getByRole('button',{name:'Назад',exact:true}).click();await d.getByLabel('Залежності: Third').click();await expect(d.getByRole('checkbox',{name:'1.1 Перевірити'})).toBeChecked();await expect(d.getByRole('checkbox',{name:'1.2 Second'})).toBeChecked();await page.keyboard.press('Escape');await d.getByRole('button',{name:'Зберегти як чернетку',exact:true}).click();await expect.poll(()=>calls.some(c=>c.args.p_action==='process_create')).toBe(true);const saved=calls.find(c=>c.args.p_action==='process_create').args.p_args.definition;expect(saved.stages[0].tasks[2].depends_on).toHaveLength(2);expect(saved.stages[0].tasks[1].depends_on).toEqual([])
})

test('process language changes without replacing business data or draft',async({page})=>{
 await setup(page);await openProcesses(page);await createWizard(page,'Keep original title');const d=page.getByRole('dialog');await d.getByLabel('Мова',{exact:true}).selectOption('pl');await expect(d.getByRole('button',{name:'Dodaj etap',exact:false})).toBeVisible();await expect(d.getByRole('button',{name:/Diagram procesu/})).toBeVisible();await d.getByRole('button',{name:/Dane podstawowe/}).click();await expect(d.getByLabel('Nazwa procesu *',{exact:true})).toHaveValue('Keep original title');await expect(d.getByRole('combobox',{name:'Powtarzaj proces',exact:true})).toHaveValue('none');await d.getByLabel('Język',{exact:true}).selectOption('uk');await expect(d.getByLabel('Назва процесу *',{exact:true})).toHaveValue('Keep original title')
})

for(const width of [375,768,1440])test(`diagram target drag validates and synchronizes form ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const calls=await setup(page);await openProcesses(page);await createWizard(page,'Rewire');const d=page.getByRole('dialog');await d.getByRole('button',{name:'Назад',exact:true}).click()
 for(const [number,name] of [['1.2','Second'],['1.3','Third']]){await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel(`Назва завдання ${number}`).fill(name)}
 await d.getByRole('button',{name:'Далі →'}).click();await d.getByRole('button',{name:'Вмістити',exact:true}).click()
 const edges=d.locator('.process-connector-hit'),nodes=d.locator('.process-graph-node');await expect(edges).toHaveCount(2)
 // The large pointer hit area must never have a marker. The visible marker has fixed SVG units.
 expect(await edges.evaluateAll(ns=>ns.every(n=>!n.hasAttribute('marker-end')))).toBe(true);await expect(d.locator('marker')).toHaveAttribute('markerUnits','userSpaceOnUse')
 await edges.last().focus();await page.keyboard.press('Enter')
 const handle=d.getByRole('button',{name:'Змінити наступне завдання',exact:true})
 async function dropOn(target){const a=await handle.boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up()}
 await dropOn(nodes.first());await expect(d.getByText('Залежності не можуть утворювати коло.',{exact:true})).toBeVisible();await expect(edges).toHaveCount(2)
 await page.keyboard.press('Escape');await expect(handle).toHaveCount(0);await expect(d).toBeVisible()
 await expect(d.locator('.process-diagram').getByRole('button',{name:'＋ Додати завдання',exact:true})).toHaveCount(0)
 // Drag the black arrow itself, with no prior selection or handle click.
 const arrow=await edges.first().evaluate(p=>{const q=p.getPointAtLength(p.getTotalLength()-6),m=p.getScreenCTM();return {x:q.x*m.a+q.y*m.c+m.e,y:q.x*m.b+q.y*m.d+m.f}})
 await page.mouse.move(arrow.x,arrow.y);await page.mouse.down();await expect(handle).toBeVisible();const target=await nodes.last().boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();await expect(handle).toHaveCount(0)
 await d.getByRole('button',{name:'Назад',exact:true}).click();await d.getByLabel('Залежності: Third').click();await expect(d.getByRole('checkbox',{name:'1.1 Перевірити'})).toBeChecked();await expect(d.getByRole('checkbox',{name:'1.2 Second'})).toBeChecked();await page.keyboard.press('Escape')
 await d.getByRole('button',{name:'Зберегти як чернетку',exact:true}).click();await expect.poll(()=>calls.some(c=>c.args.p_action==='process_create')).toBe(true);const saved=calls.find(c=>c.args.p_action==='process_create').args.p_args.definition;expect(saved.stages[0].tasks[1].depends_on).toEqual([]);expect(saved.stages[0].tasks[2].depends_on).toEqual([saved.stages[0].tasks[1].key,saved.stages[0].tasks[0].key])
 await d.getByRole('button',{name:'Далі →'}).click();await page.screenshot({path:`tmp/tasks-admin.local/rewire-${width}.png`,fullPage:true})
})

test('large saved diagram remains readable and supports zoom pan and keyboard cancellation',async({page})=>{
 await page.setViewportSize({width:1440,height:1000})
 const definition={...structuredClone(sample),stages:[{key:'large-stage',name:'Large graph',tasks:Array.from({length:40},(_,i)=>({key:`task-${i}`,title:`Task ${i+1} with a long descriptive title`,responsible_role:'owner',duration_minutes:30,depends_on:i===0?[]:[`task-${Math.floor((i-1)/3)}`]}))}]}
 await setup(page,{diagramDoc:definition});await openProcesses(page);await page.locator('.process-summary details summary').click();await page.getByRole('button',{name:'Редагувати',exact:true}).click()
 const d=page.getByRole('dialog');await d.getByRole('button',{name:/3 Діаграма процесу/}).click();await expect(d.locator('.process-graph-node')).toHaveCount(40)
 await d.getByRole('button',{name:'Вмістити',exact:true}).click();await shot(page,'large-diagram-fit')
 await d.getByRole('button',{name:'Автовирівнювання',exact:true}).click();await expect(d.locator('.process-graph-tools output')).toHaveText('100%')
 const scroller=d.locator('.process-graph-scroll');await d.getByRole('button',{name:'Переміщення',exact:true}).click();const box=await scroller.boundingBox();await page.mouse.move(box.x+600,box.y+120);await page.mouse.down();await page.mouse.move(box.x+100,box.y+120,{steps:10});await page.mouse.up();expect(await scroller.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0)
 await d.getByRole('button',{name:'Вибір',exact:true}).click();await d.getByRole('button',{name:'Вмістити',exact:true}).click();const edges=d.locator('.process-connector-hit');await edges.first().focus();await page.keyboard.press('Enter');const handle=d.getByRole('button',{name:'Змінити наступне завдання',exact:true});await handle.focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');await expect(handle).toHaveCount(0);await expect(edges).toHaveCount(39)
 await edges.first().focus();await page.keyboard.press('Enter');await d.locator('.process-terminal.start').click();await expect(handle).toHaveCount(0);await expect(d).toBeVisible()
})

for(const width of [375,1440])test(`create dependency from selected task ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1100});const calls=await setup(page);await openProcesses(page);await createWizard(page,'New connection');const d=page.getByRole('dialog');await d.getByRole('button',{name:'Назад',exact:true}).click();await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel('Назва завдання 1.2').fill('Target');await d.getByLabel('Залежності: Target').click();await d.getByRole('checkbox',{name:'1.1 Перевірити'}).uncheck();await page.keyboard.press('Escape');await d.getByRole('button',{name:'Далі →'}).click();await d.getByRole('button',{name:'Вмістити',exact:true}).click()
 const nodes=d.locator('.process-graph-node');await nodes.first().click();const port=d.getByRole('button',{name:'Додати залежність',exact:true});await expect(port).toBeVisible();const a=await port.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();const b=await nodes.last().boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await expect(d.locator('.process-draft-connector')).toHaveCount(1);await page.mouse.up();await expect(d.locator('.process-connector-hit')).toHaveCount(1)
 await d.getByRole('button',{name:'Назад',exact:true}).click();await d.getByLabel('Залежності: Target').click();await expect(d.getByRole('checkbox',{name:'1.1 Перевірити'})).toBeChecked();await page.keyboard.press('Escape');await d.getByRole('button',{name:'Зберегти як чернетку',exact:true}).click();await expect.poll(()=>calls.some(c=>c.args.p_action==='process_create')).toBe(true)
 await d.getByRole('button',{name:'Далі →'}).click();await d.getByRole('button',{name:'Скасувати зміну зв’язку',exact:true}).click();await expect(d.locator('.process-connector-hit')).toHaveCount(0);await d.getByRole('button',{name:'Скасувати зміну зв’язку',exact:true}).click();await expect(d.locator('.process-connector-hit')).toHaveCount(1);await expect(d.getByRole('button',{name:'Скасувати зміну зв’язку',exact:true})).toBeDisabled()
})

test('saved process stage headers and collapse controls stay in their own areas',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await setup(page);await openProcesses(page);await page.locator('.process-summary details summary').click();await page.getByRole('button',{name:'Редагувати',exact:true}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:/3 Діаграма процесу/}).click();await expect(d.locator('.process-graph-band')).toHaveCount(sample.stages.length)
 for(const band of await d.locator('.process-graph-band').all()){await expect(band.locator('.process-band-heading strong')).toHaveCount(1);await expect(band.getByRole('button')).toHaveCount(1);const delta=await band.evaluate(e=>{const h=e.querySelector('.process-band-heading strong').getBoundingClientRect(),b=e.querySelector('button').getBoundingClientRect();return Math.abs(h.y+h.height/2-b.y-b.height/2)});expect(delta).toBeLessThan(2)}
 await shot(page,'separate-stage-headers')
})

test('dependency undo is one step per click and preserves task edits',async({page})=>{
 const calls=await setup(page);await openProcesses(page);await createWizard(page,'Undo edges');const d=page.getByRole('dialog');await d.getByRole('button',{name:'Назад',exact:true}).click()
 for(const [number,name] of [['1.2','Second'],['1.3','Third']]){await d.getByRole('button',{name:'＋ Додати завдання',exact:true}).click();await d.getByLabel(`Назва завдання ${number}`).fill(name)}
 await d.getByRole('button',{name:'Далі →'}).click();const undo=d.getByRole('button',{name:'Скасувати зміну зв’язку',exact:true}),edges=d.locator('.process-connector-hit');await expect(undo).toBeDisabled()
 await edges.first().focus();await page.keyboard.press('Enter');await d.getByRole('combobox',{name:'Наступне завдання',exact:true}).selectOption({label:'1.3 Third'});await d.getByRole('button',{name:'Застосувати',exact:true}).click()
 await edges.first().focus();await page.keyboard.press('Enter');await d.getByRole('button',{name:'Видалити зв’язок',exact:true}).click();await expect(edges).toHaveCount(1)
 await d.getByRole('button',{name:'Назад',exact:true}).click();await d.getByLabel('Назва завдання 1.2').fill('Keep this title');await d.getByRole('button',{name:'Далі →'}).click()
 await undo.click();await expect(edges).toHaveCount(2);await expect(undo).toBeEnabled();await undo.click();await expect(undo).toBeDisabled();await expect(edges).toHaveCount(2)
 await d.getByRole('button',{name:'Назад',exact:true}).click();await expect(d.getByLabel('Назва завдання 1.2')).toHaveValue('Keep this title');await d.getByLabel('Залежності: Third').click();await expect(d.getByRole('checkbox',{name:'1.1 Перевірити'})).not.toBeChecked();await expect(d.getByRole('checkbox',{name:'1.2 Keep this title'})).toBeChecked();await page.keyboard.press('Escape')
 await d.getByRole('button',{name:'Зберегти як чернетку',exact:true}).click();await expect.poll(()=>calls.some(c=>c.args.p_action==='process_create')).toBe(true);const tasks=calls.find(c=>c.args.p_action==='process_create').args.p_args.definition.stages[0].tasks;expect(tasks[1].depends_on).toEqual([tasks[0].key]);expect(tasks[2].depends_on).toEqual([tasks[1].key])
})
