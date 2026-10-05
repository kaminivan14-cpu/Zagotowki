import {test,expect} from '@playwright/test'
async function setup(page,{role='administrator',status='active',started=false}={}) {
 const uid='40000000-0000-4000-8000-000000000001',state={calls:[],deleted:false,items:[1,2,3].map(id=>({id,plan_id:10,nazwa:`Pozycja ${id}`,ilosc:2,jednostka:'kg',priorytet:'normalny',gotowe:false,started_at:started?'2026-09-25T08:00:00Z':null,product_external_id:null}))}
 const plan={id:10,location_id:1,plan_date:'2026-09-25',status}
 await page.clock.install({time:new Date('2026-09-25T12:00:00Z')})
 await page.addInitScript(uid=>{const exp=Math.floor(Date.now()/1000)+86400,b64=v=>btoa(JSON.stringify(v));localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify({access_token:`${b64({alg:'HS256'})}.${b64({sub:uid,exp,role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,user:{id:uid}}))},uid)
 await page.routeWebSocket(/.*/,socket=>socket.close())
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.origin==='http://127.0.0.1:5173')return route.continue()
  if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const name=url.pathname.split('/').pop(),args=route.request().postDataJSON()||{}
  state.calls.push({name,args,method:route.request().method()})
  let data=[]
  if(name==='auth_employee_profile')data=[{id:1,name:'Tester',role,active:true,auth_user_id:uid,location_id:1}]
  if(name==='auth_capabilities')data=['production.access']
  if(name==='user')data={id:uid}
  if(name==='Locations')data=[{id:1,name:'Lokal A',active:true}]
  if(name==='Plans')data=url.searchParams.has('id')?plan:state.deleted||url.searchParams.has('Plan_items.gotowe')?[]:[{...plan,Plan_items:state.items}]
  if(name==='Plan_items')data=state.items
  if(name==='add_plan_item') {state.items.push({id:4,plan_id:10,nazwa:args.p_nazwa,ilosc:args.p_ilosc,jednostka:args.p_jednostka,priorytet:args.p_priorytet,gotowe:false});data=4}
  if(name==='delete_production_plan'){state.deleted=true;data=null}
  await route.fulfill({json:data})
 })
 await page.goto('/');await page.getByRole('button',{name:'Lokal A',exact:true}).click()
 await page.getByRole('button',{name:'📂 Otwórz plan',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Plan 25.09.2026',exact:true})).toBeVisible()
 return state
}
async function action(page,name,input='click') {
 const trigger=page.getByText('Więcej ▾',{exact:true})
 if(input==='touch')await trigger.tap()
 else if(input==='keyboard'){await trigger.focus();await trigger.press('Enter')}
 else await trigger.click()
 const button=page.getByRole('button',{name,exact:true})
 if(input==='touch')await button.tap()
 else if(input==='keyboard'){await button.focus();await button.press(' ')}
 else await button.click()
}
for(const width of [375,768,1440])test(`production plan actions preserve existing workflows ${width}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true}),page=await context.newPage()
 try{
  const s=await setup(page),input=width===375?'touch':width===768?'keyboard':'click'
  await expect(page.locator('.plan-work-heading')).toContainText('Pozostało: 3')
  await expect(page.locator('.plan-status')).toHaveText('Aktywny')
  await expect(page.getByRole('button',{name:'Edytuj plan',exact:true})).toBeHidden()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  await page.screenshot({path:`tmp/production-plan.local/plan-${width}.png`,fullPage:true})
  await page.getByText('Więcej ▾',{exact:true}).click()
  const danger=page.getByRole('button',{name:'Usuń plan',exact:true})
  expect(await danger.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(161, 43, 53)')
  expect(await danger.evaluate(e=>getComputedStyle(e).borderTopStyle)).toBe('solid')
  await page.screenshot({path:`tmp/production-plan.local/menu-${width}.png`,fullPage:true})
  await danger.press('Escape')
  await page.getByRole('button',{name:'+ Dodaj pozycję',exact:true}).click()
  await page.getByRole('combobox',{name:'Produkt',exact:true}).fill('Nowa pozycja')
  await page.getByLabel('Ilość',{exact:true}).fill('4')
  await page.getByRole('button',{name:'Dodaj do planu',exact:true}).click()
  await expect(page.locator('.plan-work-heading')).toContainText('Pozostało: 4')
  expect(s.calls.filter(c=>c.name==='add_plan_item')).toHaveLength(1)
  expect(s.calls.find(c=>c.name==='add_plan_item').args).toMatchObject({p_requester_id:1,p_plan_id:10,p_nazwa:'Nowa pozycja',p_ilosc:4})
  await action(page,'Edytuj plan',input)
  await expect(page.getByRole('heading',{name:'Co przygotować?',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'← Lista planów',exact:true}).click()
  await page.getByRole('button',{name:'📂 Otwórz plan',exact:true}).click()
  await action(page,'Historia',input)
  await expect(page.getByRole('heading',{name:'Historia produkcji',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'← Powrót',exact:true}).click()
  await action(page,'Zapotrzebowanie ogólne',input)
  await expect(page.getByRole('heading',{name:'Zapotrzebowanie ogólne',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'← Powrót do planu',exact:true}).click()
  page.once('dialog',async d=>{expect(d.type()).toBe('confirm');expect(d.message()).toContain('25.09.2026');await d.dismiss()})
  await action(page,'Usuń plan',input)
  expect(s.calls.filter(c=>c.name==='delete_production_plan')).toHaveLength(0)
  await expect(page.locator('.production-plan .module-menu')).not.toHaveAttribute('open','')
  await page.getByRole('button',{name:'← Lista planów',exact:true}).click()
  await expect(page.getByRole('heading',{name:'📋 Zaplanowane plany',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'📂 Otwórz plan',exact:true}).click()
  page.once('dialog',d=>d.accept())
  await action(page,'Usuń plan',input)
  await expect(page.getByRole('heading',{name:'📋 Zaplanowane plany',exact:true})).toBeVisible()
  expect(s.calls.filter(c=>c.name==='delete_production_plan')).toEqual([{name:'delete_production_plan',args:{p_requester_id:1,p_plan_id:10},method:'POST'}])
 }finally{await context.close()}
})
test('production plan worker permissions and menu keyboard focus remain intact',async({page})=>{
 await setup(page,{role:'sushi-master'})
 await expect(page.getByRole('button',{name:'+ Dodaj pozycję',exact:true})).toHaveCount(0)
 const trigger=page.getByText('Więcej ▾',{exact:true});await trigger.focus();await trigger.press(' ');await page.keyboard.press('Tab')
 await expect(page.getByRole('button',{name:'Historia',exact:true})).toBeFocused()
 expect(await page.getByRole('button',{name:'Historia',exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid')
 await expect(page.getByRole('button',{name:'Edytuj plan',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Usuń plan',exact:true})).toHaveCount(0)
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused()
 await expect(page.getByRole('button',{name:'Historia',exact:true})).toBeHidden()
})
for(const status of ['active','completed'])test(`production plan protected history cannot be deleted ${status}`,async({page})=>{
 const s=await setup(page,{status,started:true})
 if(status==='completed'){
  await expect(page.locator('.plan-status')).toHaveText('Zakończony')
  await expect(page.getByRole('button',{name:'+ Dodaj pozycję',exact:true})).toHaveCount(0)
 }
 page.once('dialog',async d=>{expect(d.type()).toBe('alert');expect(d.message()).toContain('nie można usunąć');await d.accept()})
 await action(page,'Usuń plan')
 expect(s.calls.filter(c=>c.name==='delete_production_plan')).toHaveLength(0)
 await expect(page.getByRole('heading',{name:'Plan 25.09.2026',exact:true})).toBeVisible()
})
