import {test,expect} from '@playwright/test'
const day=(base,n)=>new Date(Date.parse(base+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
async function setup(page,{today='2026-10-02',paged=false}={}) {
 const uid='50000000-0000-4000-8000-000000000001'
 const categories=[{id:1,name:'Операційні'},{id:2,name:'Проєктні'},{id:3,name:'Стратегічні'},{id:4,parent_id:1,name:'Аудити'},{id:5,parent_id:2,name:'Цифровізація'},{id:6,parent_id:3,name:'Ребрендинг'}]
 const names=['Перевірити документи','Підготувати презентацію','Оновити документацію','Аналіз результатів','Підготувати звіт','Зустріч з командою','Оновити інструкції','Планування спринту','Переглянути бюджет','Підготувати матеріали','Вивчити інструменти','Підсумувати тиждень']
 const tasks=names.map((title,i)=>({id:i+1,title,assigned_to_employee_id:6,category_id:[4,5,6,null][i%4],priority:['high','medium','low','critical'][i%4],estimated_minutes:i===1?null:i===0?330:90,actual_minutes:0,planned_date:day('2026-10-05',Math.min(6,Math.floor(i/2))),planned_start_at:i===0?'2026-10-05T08:00:00Z':null,status:'planned',version:1}))
 tasks.push({id:50,title:'Незапланований аудит',category_id:4,priority:'medium',estimated_minutes:null,planned_date:null,status:'unplanned',version:1,assigned_to_employee_id:6})
 const state={calls:[],tasks}
 await page.addInitScript(uid=>{const exp=Math.floor(Date.now()/1000)+3600,b64=v=>btoa(JSON.stringify(v));localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify({access_token:`${b64({alg:'HS256'})}.${b64({sub:uid,exp,role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,user:{id:uid}}))},uid)
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:5173')return route.continue();if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const name=url.pathname.split('/').pop(),args=route.request().postDataJSON()||{};state.calls.push({name,args})
  const caps=['tasks.access','tasks.create.self','tasks.plan.self'];let data=[]
  if(name==='auth_employee_profile')data=[{id:6,name:'Олена',role:'specialist',active:true,auth_user_id:uid}]
  if(name==='auth_capabilities')data=caps
  if(name==='user')data={id:uid}
  if(name==='tasks_context')data={employee_id:6,today,capabilities:caps,categories,settings:{company_timezone:'Europe/Warsaw',default_daily_task_capacity_minutes:360},manager_id:null}
  if(name==='tasks_assignable_people')data=[{id:6,name:'Олена'}]
  if(name==='tasks_execution_state')data={current:null,started:false,critical:[],task_count:0,planned_minutes:0,capacity_minutes:360}
  if(name==='tasks_planning'){
   const days=[]
   for(let date=args.p_from;date<=args.p_to;date=day(date,1)){
    const rows=tasks.filter(t=>t.planned_date===date)
    days.push({date,capacity_minutes:date==='2026-10-07'?120:360,task_count:rows.length,planned_minutes:rows.reduce((n,t)=>n+(t.estimated_minutes||0),0),unknown_count:rows.filter(t=>t.estimated_minutes==null).length})
   }
   const filtered=tasks.filter(t=>t.planned_date>=args.p_from&&t.planned_date<=args.p_to)
   data={days,tasks:paged?(args.p_cursor?filtered.slice(2):filtered.slice(0,2)):filtered,unplanned:tasks.filter(t=>!t.planned_date),next_cursor:paged&&!args.p_cursor?2:null}
   if(paged&&args.p_cursor)data.unplanned=[]
  }
  if(name==='tasks_details')data={task:tasks.find(t=>t.id===args.p_task),checklist:[],events:[]}
  if(name==='tasks_command'){
   const {p_action:action,p_args:values}=args
   if(action==='create'){data={...values,id:60,version:1,status:'planned',actual_minutes:0};tasks.push(data)}
   if(action==='plan'){data=tasks.find(t=>t.id===values.task_id);Object.assign(data,values,{status:'planned',version:data.version+1})}
  }
  await route.fulfill({json:data})
 })
 await page.goto('/');await page.getByRole('button',{name:'Планування',exact:true}).click();await page.getByRole('button',{name:'Запланувати тиждень',exact:true}).click()
 await expect(page.locator('.planning-day')).toHaveCount(7);await expect(page.locator('.planning-day time').first()).toHaveText(today>='2026-10-02'?'05.10.2026':'28.09.2026')
 return state
}
for(const width of [375,768,1024,1440])test(`weekly planning layout, data and existing create dialog ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1100});const s=await setup(page)
 await expect(page.getByRole('heading',{name:'Планування тижня',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Наступний тиждень',exact:true})).toHaveAttribute('aria-pressed','true')
 const first=page.locator('.planning-day').first()
 await expect(first).toContainText('~5,5 год + 1 без оцінки / 6 год')
 await expect(first).toHaveClass(/load-near/)
 await expect(page.locator('.planning-day').nth(2)).toHaveClass(/load-overloaded/)
 await expect(first).toContainText('10:00')
 await expect(first).toContainText('Операційні · Аудити')
 await expect(first).toContainText('Високий')
 await expect(first).toContainText('Без оцінки')
 await expect(page.locator('.planning-sidebar')).toContainText('12 задач')
 await expect(page.locator('.planning-priority-totals')).toContainText('Критичний')
 await expect(page.getByRole('button',{name:'Скопіювати план минулого тижня'})).toBeDisabled()
 await expect(page.locator('.planning-save')).toHaveText('Усі зміни збережено')
 const boxes=await page.locator('.planning-day').evaluateAll(els=>els.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})))
 expect(new Set(boxes.map(b=>b.x)).size).toBe(1);expect(boxes.every((b,i)=>i===0||b.y>boxes[i-1].y)).toBe(true)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
 await page.screenshot({path:`tmp/tasks-planning.local/week-${width}.png`,fullPage:true})
 await page.locator('.planning-day').nth(3).getByRole('button',{name:'+ Додати задачу',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Створити завдання'})
 await expect(dialog.locator('[name=planned_date]')).toHaveValue('2026-10-08')
 await expect(dialog.getByRole('combobox',{name:'Кому',exact:true})).toHaveValue('6')
 await dialog.getByLabel('Назва',{exact:true}).fill('Нова задача четверга')
 await dialog.getByLabel('Орієнтовний час, хв').fill('30')
 await dialog.getByRole('button',{name:'Створити',exact:true}).click()
 await expect(dialog).toHaveCount(0)
 await expect(page.locator('.planning-day').nth(3)).toContainText('Нова задача четверга')
 expect(s.calls.filter(c=>c.name==='tasks_command'&&c.args.p_action==='create')).toHaveLength(1)
 expect(s.calls.find(c=>c.name==='tasks_command').args.p_args).toMatchObject({planned_date:'2026-10-08',assigned_to_employee_id:6})
 await page.locator('.planning-unplanned').getByRole('button',{name:'Запланувати',exact:true}).click()
 await page.getByLabel('Дата',{exact:true}).fill('09.10.2026')
 await page.getByRole('button',{name:'Зберегти дату',exact:true}).click();await page.getByRole('button',{name:'Закрити',exact:true}).click()
 await expect(page.locator('.planning-unplanned')).not.toContainText('Незапланований аудит')
 expect(s.calls.some(c=>c.name==='tasks_command'&&c.args.p_action==='plan')).toBe(true)
})
for(const today of ['2026-09-28','2026-10-01','2026-10-02','2026-10-04'])test(`planning period availability ${today}`,async({page})=>{
 const s=await setup(page,{today}),weekend=today>='2026-10-02'
 const next=page.getByRole('button',{name:'Наступний тиждень',exact:true}),current=page.getByRole('button',{name:'Поточний тиждень',exact:true})
 if(weekend){await expect(next).toBeEnabled();await expect(next).toHaveAttribute('aria-pressed','true');await current.click()}
 else {await expect(next).toBeDisabled();await expect(page.getByText('Планування наступного тижня доступне з п’ятниці до неділі.',{exact:true})).toBeVisible()}
 await expect(current).toHaveAttribute('aria-pressed','true')
 await expect.poll(()=>s.calls.filter(c=>c.name==='tasks_planning').at(-1).args.p_from).toBe('2026-09-28')
 await page.getByRole('button',{name:'Запланувати місяць',exact:true}).click()
 await expect(page.locator('.task-week')).toHaveCount(4)
 expect(s.calls.filter(c=>c.name==='tasks_planning').at(-1).args.p_to).toBe('2026-10-25')
})
test('planning pagination labels partial summaries and appends remaining tasks',async({page})=>{
 await setup(page,{paged:true})
 await expect(page.locator('.planning-priority-totals')).toContainText('1')
 await expect(page.locator('.planning-sidebar')).toContainText('лише завантажені задачі')
 await page.getByRole('button',{name:'Завантажити ще завдання',exact:true}).click()
 await expect(page.locator('.planning-day .planning-task')).toHaveCount(12)
 await expect(page.locator('.planning-sidebar')).not.toContainText('лише завантажені задачі')
 await expect(page.locator('.planning-unplanned .planning-task')).toHaveCount(1)
})
