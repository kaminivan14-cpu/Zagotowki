import {test,expect} from '@playwright/test'
const uid='30000000-0000-4000-8000-000000000001'
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Warsaw'})
const iso=(hour=8)=>today()+'T'+String(hour).padStart(2,'0')+':00:00+02:00'
async function setup(page,{role='administrator',active=true}={}){
 const state={calls:[],current:active?{id:1,employee_id:1,location_id:1,started_at:new Date(Date.now()-60000).toISOString(),version:1}:null,rows:[]}
 state.rows=[{id:1,employee_id:1,employee_name:'Serhii',location_id:1,location_name:'Lokal A',started_at:iso(),ended_at:null,version:1,status:'active',worked_minutes:null},
 {id:2,employee_id:2,employee_name:'Anna',location_id:1,location_name:'Lokal A',started_at:iso(),ended_at:iso(16),version:1,status:'completed',worked_minutes:480},
 {id:3,employee_id:3,employee_name:'Jan',location_id:1,location_name:'Lokal A',started_at:iso(),ended_at:null,version:1,status:'needs_attention',worked_minutes:null}]
 const caps=['orders.access','orders.work','production.access','worktime.self',...(role==='administrator'?['employees.manage','worktime.access','worktime.read.scope','worktime.correct','worktime.export']:[])]
 const exp=Math.floor(Date.now()/1000)+3600,b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
 const user={id:uid,aud:'authenticated',role:'authenticated',email:'test@example.invalid'}
 const session={access_token:`${b64({alg:'HS256'})}.${b64({sub:uid,exp,role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user}
 await page.addInitScript(s=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(s)),session)
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:5173')return route.continue();if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const name=url.pathname.split('/').pop(),args=route.request().postDataJSON()||{};state.calls.push({name,args});let data=[]
  if(name==='auth_employee_profile')data=[{id:1,name:'Serhii',role,location_id:1,active:true,auth_user_id:uid}]
  if(name==='auth_capabilities')data=caps
  if(name==='user')data=user
  if(name==='Locations')data=[{id:1,name:'Lokal A',active:true},{id:2,name:'Lokal B',active:true}]
  if(name==='worktime_current')data=state.current
  if(name==='orders_shifts')data=state.current?[state.current]:[]
  if(name==='worktime_context')data={timezone:'Europe/Warsaw',employees:[{id:1,name:'Serhii'},{id:2,name:'Anna'}],locations:[{id:1,name:'Lokal A'}]}
  if(name==='worktime_list')data={rows:state.rows.filter(r=>(!args.p_employee||r.employee_id===args.p_employee)&&(!args.p_status||r.status===args.p_status)),next_cursor:null}
  if(name==='worktime_summary')data=[{employee_id:2,employee_name:'Anna',work_days:1,worked_minutes:480,active_sessions:0}]
  if(name==='worktime_calendar')data=[{work_date:today(),sessions:3,worked_minutes:480}]
  if(name==='worktime_events')data=[]
  if(name==='worktime_export_xml')data='<workTimeReport><employee><name>Anna</name></employee></workTimeReport>'
  if(name==='worktime_command'){
   if(args.p_action==='end')state.current=null
   if(args.p_action==='start'&&!state.current)state.current={id:4,employee_id:1,location_id:1,started_at:new Date().toISOString(),version:1}
   if(args.p_action==='correct'){const row=state.rows.find(r=>r.id===args.p_args.shift_id);Object.assign(row,args.p_args,{version:row.version+1})}
   data={shift_id:state.current?.id||1}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 await page.goto('/');return state
}
test('shared worktime panel: list, filters, calendar day, summary, correction and server XML',async({page})=>{
 const s=await setup(page);await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()
 await page.getByText('Narzędzia ▾',{exact:true}).click();await page.getByRole('button',{name:'Czas pracy',exact:true}).click()
 await expect(page.getByRole('cell',{name:'Wymaga uwagi',exact:true})).toBeVisible()
 await expect(page.getByRole('cell',{name:'Zakończona',exact:true})).toBeVisible()
 await page.getByLabel('Status',{exact:true}).selectOption('completed')
 await expect(page.locator('.worktime-table tbody tr')).toHaveCount(1)
 await page.getByRole('button',{name:'Koryguj',exact:true}).click()
 const modal=page.getByRole('dialog',{name:'Korekta sesji'})
 await modal.getByLabel('Powód korekty').fill('Korekta testowa')
 await modal.getByRole('button',{name:'Zapisz korektę'}).click()
 await expect(modal).toHaveCount(0)
 expect(s.calls.find(x=>x.name==='worktime_command').args.p_args.version).toBe(1)
 await page.getByRole('button',{name:'Podsumowanie',exact:true}).click()
 await expect(page.getByRole('cell',{name:'8 h 0 min',exact:true})).toBeVisible()
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Eksportuj XML'}).click();await download
 expect(s.calls.find(x=>x.name==='worktime_export_xml').args.p_status).toBe('completed')
 await page.getByRole('button',{name:'Kalendarz',exact:true}).click()
 await page.locator('.worktime-calendar button').filter({hasText:'3 sesji'}).click()
 await expect(page.getByRole('button',{name:'Cały miesiąc'})).toBeVisible()
 await page.getByRole('button',{name:'Powrót do modułu'}).click()
 await page.getByRole('button',{name:'← Moduły'}).click()
 await page.getByRole('button',{name:/🥣 ZAGOTÓWKI/}).click()
 await page.getByText('Narzędzia ▾',{exact:true}).click();await page.getByRole('button',{name:'Czas pracy',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Czas pracy',exact:true})).toBeVisible()
 expect(s.calls.filter(x=>x.name==='worktime_command'&&x.args.p_action==='start')).toHaveLength(0)
})
for(const close of [false,true])test(`logout choice closes shared shift only when requested: ${close}`,async({page})=>{
 const s=await setup(page)
 await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()
 await page.getByText('Konto ▾',{exact:true}).click();await page.getByRole('button',{name:'Wyloguj',exact:true}).click()
 const modal=page.getByRole('dialog',{name:'Czy zakończyć również czas pracy?'})
 await modal.getByRole('button',{name:close?'Zakończ pracę i wyloguj':'Tylko wyloguj',exact:true}).click()
 await expect(modal).toHaveCount(0)
 expect(s.calls.filter(x=>x.name==='worktime_command'&&x.args.p_action==='end')).toHaveLength(close?1:0)
 expect(Boolean(s.current)).toBe(!close)
})
test('normal user has no panel but can start shared work in production and retain it in Orders',async({page})=>{
 const s=await setup(page,{role:'sushi-master',active:false})
 await page.getByRole('button',{name:/🥣 ZAGOTÓWKI/}).click()
 await expect(page.getByRole('button',{name:'Czas pracy',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Lokal A',exact:true}).click();await page.getByRole('button',{name:'Rozpocznij pracę',exact:true}).click()
 await expect(page.getByRole('button',{name:'Zakończ pracę',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'← Moduły'}).click();await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()
 await expect(page.getByRole('button',{name:'Zakończ zmianę',exact:true})).toBeVisible()
 expect(s.calls.filter(x=>x.name==='worktime_command'&&x.args.p_action==='start')).toHaveLength(1)
 await expect(page.getByRole('button',{name:'Czas pracy',exact:true})).toHaveCount(0)
})
test('failed shift closure never logs out and keeps the session available',async({page})=>{
 const s=await setup(page)
 await page.route('**/rest/v1/rpc/worktime_command',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'UNFINISHED_WORK'})}))
 await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()
 await page.getByText('Konto ▾',{exact:true}).click();await page.getByRole('button',{name:'Wyloguj',exact:true}).click()
 await page.getByRole('button',{name:'Zakończ pracę i wyloguj',exact:true}).click()
 await expect(page.getByRole('dialog')).toBeVisible()
 await expect(page.getByRole('alert')).toContainText('zakończ lub oddaj')
 expect(s.calls.filter(x=>x.name==='logout')).toHaveLength(0)
 expect(s.current).not.toBe(null)
})
for(const width of [375,768,1440])test(`worktime list and calendar tablet layout ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000})
 await setup(page);await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click();await page.getByText('Narzędzia ▾',{exact:true}).click();await page.getByRole('button',{name:'Czas pracy',exact:true}).click()
 await expect(page.locator('.worktime-table tbody tr')).toHaveCount(3)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
 await page.screenshot({path:`tmp/worktime.local/list-${width}.png`,fullPage:true})
 await page.getByRole('button',{name:'Kalendarz',exact:true}).click();await expect(page.locator('.worktime-calendar button').first()).toBeVisible()
 await page.screenshot({path:`tmp/worktime.local/calendar-${width}.png`,fullPage:true})
})
for(const width of [375,768,1440])test(`production compact header and worktime summary ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const s=await setup(page)
 await page.route('**/rest/v1/rpc/worktime_summary',route=>route.fulfill({json:[{employee_id:3,employee_name:'Jan',work_days:2,worked_minutes:1200,active_sessions:1},{employee_id:2,employee_name:'Anna',work_days:1,worked_minutes:480,active_sessions:0}]}))
 await page.getByRole('button',{name:/🥣 ZAGOTÓWKI/}).click()
 await expect(page.getByRole('heading',{name:'Wybierz lokal'})).toBeVisible()
 await expect(page.locator('.module-header')).toContainText('● W pracy')
 await expect(page.getByRole('button',{name:'Zakończ pracę',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Lokal A',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Wybierz lokal'})).toHaveCount(0)
 await expect(page.getByLabel('Lokal',{exact:true})).toHaveValue('1')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
 await page.screenshot({path:`tmp/worktime.local/header-${width}.png`,fullPage:true})
 await page.getByText('Narzędzia ▾',{exact:true}).click();await page.getByRole('button',{name:'Czas pracy',exact:true}).click()
 await expect(page.getByLabel('Od',{exact:true})).toHaveValue(/^\d{2}\.\d{2}\.\d{4}$/)
 await page.getByLabel('Od',{exact:true}).fill('31.02.2026');await expect(page.getByLabel('Od',{exact:true})).toHaveAttribute('aria-invalid','true')
 await page.getByLabel('Od',{exact:true}).fill('01.10.2026')
 await page.getByRole('button',{name:'Podsumowanie',exact:true}).click()
 await expect(page.getByRole('cell',{name:'Wymaga uwagi',exact:true})).toBeVisible()
 await expect(page.getByLabel('Podsumowanie czasu pracy')).toContainText('28 h 0 min')
 await expect(page.getByLabel('Podsumowanie czasu pracy')).toContainText('Liczba pracowników 2')
 expect(s.calls.some(c=>c.name==='worktime_list'&&c.args.p_status==='needs_attention')).toBe(true)
 expect(s.calls.filter(c=>c.name==='worktime_command')).toHaveLength(0)
 await page.screenshot({path:`tmp/worktime.local/summary-${width}.png`,fullPage:true})
 await page.getByRole('button',{name:'Powrót do modułu'}).click();await expect(page.getByLabel('Lokal',{exact:true})).toHaveValue('1')
})

// Some touch/browser focus transitions report relatedTarget=null before click.
// Reproduce that event order in isolated Chromium without a user's browser session.
async function chooseHeaderAction(page,menu,action,input) {
 const trigger=page.getByText(`${menu} ▾`,{exact:true})
 if(input==='touch')await trigger.tap()
 else if(input==='Enter'||input==='Space'){await trigger.focus();await trigger.press(input==='Space'?' ':input)}
 else await trigger.click()
 const button=page.getByRole('button',{name:action,exact:true})
 await expect(button).toBeEnabled()
 if(input==='null-focus') {
  await button.evaluate(el=>el.addEventListener('pointerdown',event=>{
   event.preventDefault()
   el.closest('details').querySelector('summary').blur()
  },{once:true}))
  await button.click({timeout:3000})
 } else if(input==='touch')await button.tap()
 else if(input==='Enter'||input==='Space') {await button.focus();await button.press(input==='Space'?' ':input)}
 else await button.click()
 await expect(page.locator('.module-menu[open]')).toHaveCount(0)
}
for(const width of [375,768,1440])for(const input of ['click','touch','Enter','Space','null-focus'])for(const module of ['orders','production']) {
 test(`header actions ${module} ${input} ${width}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true})
  const page=await context.newPage()
  try {
   const s=await setup(page)
   await page.getByRole('button',{name:module==='orders'?/🍣 ZAMÓWIENIA/:/🥣 ZAGOTÓWKI/}).click()
   if(module==='production'){await page.getByRole('button',{name:'Lokal A',exact:true}).click();await expect(page.getByRole('heading',{name:'📋 Zaplanowane plany',exact:true})).toBeVisible()}
   await page.locator('.module-header').getByRole('combobox',{name:'Lokal',exact:true}).selectOption('2')
   await chooseHeaderAction(page,'Narzędzia','Czas pracy',input)
   await expect(page.getByRole('heading',{name:'Czas pracy',exact:true})).toBeVisible()
   await page.getByRole('button',{name:'Powrót do modułu'}).click()
   await expect(page.locator('.module-header').getByRole('combobox',{name:'Lokal',exact:true})).toHaveValue('2')
   await chooseHeaderAction(page,'Narzędzia','Pracownicy',input)
   await expect(page.getByRole('heading',{name:'Pracownicy',exact:true})).toBeVisible()
   await page.getByRole('button',{name:'← Powrót',exact:true}).click()
   await expect(page.locator('.module-header').getByRole('combobox',{name:'Lokal',exact:true})).toHaveValue('2')
   await chooseHeaderAction(page,'Konto','Wyloguj',input)
   const dialog=page.getByRole('dialog',{name:'Czy zakończyć również czas pracy?'})
   await expect(dialog).toBeVisible()
   expect(s.calls.filter(x=>x.name==='logout')).toHaveLength(0)
   const close=module==='production'
   await dialog.getByRole('button',{name:close?'Zakończ pracę i wyloguj':'Tylko wyloguj',exact:true}).click()
   await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible()
   expect(s.calls.filter(x=>x.name==='worktime_command'&&x.args.p_action==='end')).toHaveLength(close?1:0)
   expect(s.calls.filter(x=>x.name==='logout')).toHaveLength(1)
   expect(Boolean(s.current)).toBe(!close)
   expect(await page.evaluate(()=>localStorage.getItem('sb-auth-tests-auth-token'))).toBeNull()
  }finally{await context.close()}
 })
}
test('header menus dismiss outside, on Tab and Escape, with visible keyboard focus',async({page})=>{
 await setup(page);await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()
 const tools=page.getByText('Narzędzia ▾',{exact:true}),account=page.getByText('Konto ▾',{exact:true})
 await tools.click();await page.getByRole('heading',{name:'Zamówienia',exact:true}).click()
 await expect(page.locator('.module-menu[open]')).toHaveCount(0)
 await tools.focus();await tools.press('Enter');await page.keyboard.press('Tab')
 const first=page.getByRole('button',{name:'Czas pracy',exact:true})
 await expect(first).toBeFocused()
 expect(await first.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid')
 await page.keyboard.press('Escape');await expect(tools).toBeFocused()
 await expect(page.locator('.module-menu[open]')).toHaveCount(0)
 await tools.press('Enter');await account.focus()
 await expect(page.locator('.module-menu[open]')).toHaveCount(0)
})
test('header logout without active work uses existing logout directly',async({page})=>{
 const s=await setup(page,{active:false})
 await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()
 await chooseHeaderAction(page,'Konto','Wyloguj','click')
 await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 expect(s.calls.filter(x=>x.name==='worktime_command')).toHaveLength(0)
 expect(s.calls.filter(x=>x.name==='logout')).toHaveLength(1)
})
