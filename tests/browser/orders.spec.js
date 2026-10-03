import { test, expect } from '@playwright/test'
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const caps={administrator:['orders.access','production.access','employees.manage','orders.dispatch','orders.work','orders.cut','orders.issue','orders.rates.manage','orders.finance','orders.history.local','orders.test.generate'],manager:['orders.access','production.access','orders.dispatch','orders.test.generate','orders.history.local'], 'sushi-master':['orders.access','production.access','orders.work','orders.history.own'],'su-chef':['orders.access','production.access','orders.cut','orders.issue','orders.history.local'],'shift-manager':['orders.access','production.access','orders.cut','orders.issue','orders.history.local'],crafter:['production.access']}
const now=()=>new Date().toISOString()
function state(){return {orders:[],shifts:[],calls:[],operations:new Map(),serial:1}}
async function setup(page,s,id,role,location=1){
 const user={id:uid(id),aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid'}
 const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),exp=Math.floor(Date.now()/1000)+3600
 const session={access_token:`${b64({alg:'HS256'})}.${b64({sub:user.id,exp,role:'authenticated'})}.synthetic`,refresh_token:'synthetic-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user}
 await page.addInitScript(saved=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(saved)),session)
 await page.routeWebSocket(/.*/,socket=>socket.close())
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:5173')return route.continue();if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const name=url.pathname.split('/').pop(),args=route.request().postDataJSON()||{};let data=[]
  const employee={id,name:`Person ${id}`,role,location_id:location,active:true,auth_user_id:user.id}
  if(name==='auth_employee_profile')data=[employee]
  else if(name==='auth_capabilities')data=caps[role]
  else if(name==='user')data=user
  else if(name==='Locations')data=[{id:location,name:`Lokal ${location}`,active:true}]
  else if(name==='orders_notifications'){if(args.p_ack)s.notices=(s.notices||[]).filter(n=>n.id!==args.p_ack);data=s.notices||[]}
  else if(name==='orders_catalog')data=[{id:1,name:'Philadelphia Salmon',active:true,is_test:true,...(role==='administrator'?{work_rate_minor:200,currency:'PLN'}:{})}]
  else if(name==='orders_shifts')data=s.shifts.filter(x=>x.employee_id===id)
  else if(name==='orders_board')data=s.orders.filter(x=>x.location_id===args.p_location)
  else if(name==='orders_shift_summary')data={shift_id:args.p_shift,started_at:now(),ended_at:now(),products:[{name:'Philadelphia Salmon',quantity:6}],total_units:6,total_amount_minor:1200}
  else if(name==='orders_shift_history')data=s.orders.flatMap(o=>o.items.flatMap(i=>i.assignments.flatMap(w=>w.cuttings.filter(c=>c.issued_at&&c.employee_id===id).map(c=>({order:o.display_number,product:i.name,quantity:c.quantity,maker:w.employee_name,cutter:c.employee_name,issuer:c.employee_name,claimed_at:w.claimed_at,ready_at:w.ready_for_cutting_at,cutting_started_at:c.started_at,cutting_completed_at:c.completed_at,issued_at:c.issued_at})))))
  else if(name==='orders_command'){
   s.calls.push(args);const {p_action:a,p_args:v,p_operation:op}=args
   if(s.operations.has(op))data=s.operations.get(op)
   else {
    const order=s.orders.find(o=>o.id===v.order_id),all=s.orders.flatMap(o=>o.items.flatMap(i=>i.assignments)),w=all.find(w=>w.id===v.assignment_id),c=all.flatMap(w=>w.cuttings).find(c=>c.id===v.cutting_id)
    data={}
    if(a==='create_test'){s.orders.push({id:1,display_number:'TEST-000001',location_id:v.location_id,received_at:now(),status:'NEW',items:[{id:1,name:'Philadelphia Salmon',quantity:v.items[0].quantity,available:v.items[0].quantity,issued:0,assignments:[]}]});data={order_id:1}}
    if(a==='send'){order.status='TO_DO';order.sent_to_kitchen_at=now()}
    if(a==='open_shift'){let shift=s.shifts.find(x=>x.employee_id===id&&!x.ended_at);if(!shift){shift={id:s.serial++,employee_id:id,location_id:location,started_at:now()};s.shifts.push(shift)}data={shift_id:shift.id}}
    if(a==='claim'||a==='claim_all'){
     const rows=a==='claim_all'?order.items.filter(i=>i.available).map(i=>({item_id:i.id,quantity:i.available})):v.items
     for(const row of rows){const i=order.items.find(i=>i.id===row.item_id);i.available-=row.quantity;i.assignments.push({id:s.serial++,employee_id:id,employee_name:employee.name,quantity:row.quantity,claimed_at:now(),ready_for_cutting_at:null,cutting_available:row.quantity,cuttings:[]})}order.status='IN_PROGRESS'
    }
    if(a==='release'){w.released_at=now();const item=s.orders.flatMap(o=>o.items).find(i=>i.assignments.includes(w));item.available+=w.quantity}
    if(a==='ready'){w.ready_for_cutting_at=now();s.orders[0].status='READY_FOR_CUTTING'}
    if(a==='start_cutting'){w.cutting_available-=v.quantity;w.cuttings.push({id:s.serial++,employee_id:id,employee_name:employee.name,quantity:v.quantity,started_at:now(),completed_at:null,issued_at:null});s.orders[0].status='CUTTING'}
    if(a==='complete_cutting')c.completed_at=now()
    if(a==='issue'){c.issued_at=now();s.orders[0].items[0].issued+=c.quantity;if(s.orders[0].items[0].issued===s.orders[0].items[0].quantity)s.orders[0].status='COMPLETED'}
    if(a==='end_shift')s.shifts.find(x=>x.id===v.shift_id).ended_at=now()
    s.operations.set(op,data)
   }
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 await page.goto('/')
}
async function enter(page){await page.getByRole('button',{name:/🍣 ZAMÓWIENIA/}).click()}
test('Orders operational flow: generator, dispatch, split work, cutting, issue, history and private summary',async({browser})=>{
 const s=state(),contexts=[]
 const open=async(id,role)=>{const context=await browser.newContext();contexts.push(context);const page=await context.newPage();await setup(page,s,id,role);await enter(page);return page}
 try{
  const admin=await open(1,'administrator');await admin.getByRole('button',{name:'Generator UAT',exact:true}).click();await admin.getByLabel('Test Philadelphia Salmon').fill('10');await admin.getByRole('button',{name:'Utwórz zamówienie',exact:true}).click();await expect(admin.getByRole('status')).toHaveText('Zapisano.')
  const manager=await open(2,'manager');await manager.getByRole('button',{name:/^Oczekujące/}).click();await manager.getByRole('button',{name:'Przekaż na kuchnię'}).click();await manager.getByRole('button',{name:/^Wszystkie/}).click();await expect(manager.getByRole('heading', {name:'TEST-000001'})).toBeVisible();await expect(manager.getByText('Katalog i stawki',{exact:true})).toHaveCount(0)
  const maker=await open(4,'sushi-master');await maker.getByRole('button',{name:'Rozpocznij zmianę',exact:true}).click();await maker.getByRole('button',{name:'Inna',exact:true}).click();await maker.getByLabel('Ilość — Philadelphia Salmon').fill('6');await maker.getByRole('button',{name:'Weź',exact:true}).click();await maker.getByRole('button',{name:'Moje zadania',exact:true}).click();await maker.getByRole('button',{name:'Oddaj zadanie',exact:true}).click();await maker.getByRole('button',{name:'Potwierdź oddanie',exact:true}).click();await expect(maker.locator('.order-column')).toHaveCount(0);await maker.getByRole('button',{name:/^Wszystkie/}).click();await maker.getByRole('button',{name:'Inna',exact:true}).click();await maker.getByLabel('Ilość — Philadelphia Salmon').fill('6');await maker.getByRole('button',{name:'Weź',exact:true}).click();await expect(maker.getByRole('button',{name:'Gotowe',exact:true})).toBeEnabled();await maker.reload();await enter(maker);await expect(maker.getByRole('button',{name:'Zakończ zmianę',exact:true})).toBeVisible();await maker.getByRole('button',{name:'Moje zadania',exact:true}).click();await maker.getByRole('button',{name:'Gotowe',exact:true}).click();await expect(maker.getByRole('button',{name:'Gotowe',exact:true})).toHaveCount(0)
  const maker2=await open(5,'sushi-master');await maker2.getByRole('button',{name:'Rozpocznij zmianę',exact:true}).click();await maker2.getByRole('button',{name:'Weź całe zamówienie'}).click();await maker2.getByRole('button',{name:'Moje zadania',exact:true}).click();await maker2.getByRole('button',{name:'Gotowe',exact:true}).click()
  const chef=await open(3,'su-chef');await chef.getByRole('button',{name:'Rozpocznij zmianę',exact:true}).click();await expect(chef.getByText('Person 4 ×6',{exact:true})).toBeVisible()
  for(const qty of [6,4]){await chef.getByRole('button',{name:`Rozpocznij krojenie ×${qty}`,exact:true}).click();await chef.getByRole('button',{name:'Zakończ krojenie',exact:true}).click();await chef.getByRole('button',{name:'Wydane',exact:true}).click()}
  await expect(chef.getByText('Wydane',{exact:true})).toBeVisible()
  await chef.getByRole('button',{name:'Zmiany / historia'}).click();await chef.getByRole('button',{name:/Historia zmiany/}).click();await expect(chef.getByText(/Wykonał: Person 4; kroił: Person 3/)).toBeVisible();await expect(chef.getByText(/Zarobiono/)).toHaveCount(0)
  await maker.getByRole('button',{name:'Zakończ zmianę',exact:true}).click();await maker.getByRole('button',{name:'Zmiany / historia'}).click();await maker.getByRole('button',{name:/Podsumowanie zmiany/}).click();await expect(maker.getByText('Zarobiono: 12,00 zł')).toBeVisible();await expect(maker.getByText('Stawka w groszach')).toHaveCount(0)
  expect(s.orders[0].items[0].assignments.filter(w=>!w.released_at).map(w=>w.quantity)).toEqual([6,4])
 }finally{await Promise.allSettled(contexts.map(c=>c.close()))}
})
test('crafter skips module selector and cannot open Orders UI',async({page})=>{await setup(page,state(),6,'crafter');await expect(page.getByRole('button',{name:'Lokal 1',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/ZAMÓWIENIA/})).toHaveCount(0)})
test('shift manager gets operational screens, no catalog rates; local board only',async({page})=>{const s=state();s.orders=[{id:99,location_id:2,display_number:'OTHER-LOCATION',status:'TO_DO',items:[]}];await setup(page,s,7,'shift-manager');await enter(page);await expect(page.getByRole('button',{name:/^Wszystkie/})).toBeVisible();await expect(page.getByText('OTHER-LOCATION')).toHaveCount(0);await expect(page.getByRole('button',{name:'Katalog i stawki'})).toHaveCount(0)})

test('dispatch double click submits one operation',async({page})=>{
 const s=state();s.orders=[{id:1,display_number:'TEST-DOUBLE',location_id:1,received_at:now(),status:'NEW',items:[]}]
 await setup(page,s,2,'manager');await enter(page);await page.getByRole('button',{name:/^Oczekujące/}).click()
 await page.getByRole('button',{name:'Przekaż na kuchnię'}).evaluate(button=>{button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2}))})
 await expect(page.getByRole('status')).toHaveText('Zapisano.')
 expect(s.calls.filter(c=>c.p_action==='send')).toHaveLength(1)
})

test('manager monitors cutting and issued work without production actions or finance',async({page})=>{
 const s=state(),timestamp=now()
 const cutting={id:1,employee_id:3,employee_name:'Chef A',quantity:2,started_at:timestamp,completed_at:null,issued_at:null}
 s.orders=[{id:1,display_number:'TEST-MONITOR',location_id:1,received_at:timestamp,status:'CUTTING',sent_to_kitchen_at:timestamp,items:[{id:1,name:'Philadelphia Salmon',quantity:2,available:0,issued:0,assignments:[{id:1,employee_id:4,employee_name:'Maker A',quantity:2,claimed_at:timestamp,ready_for_cutting_at:timestamp,cutting_available:0,cuttings:[cutting]}]}]}]
 await setup(page,s,2,'manager');await enter(page)
 await expect(page.getByText('Krojenie',{exact:true})).toBeVisible()
 await expect(page.getByText(/KROJENIE: Chef A ×2/)).toBeVisible()
 await expect(page.getByText(/Maker A ×2/)).toBeVisible()
 const deniedButtons=/^(Weź|Gotowe|Rozpocznij krojenie|Zakończ krojenie|Wydane|Katalog i stawki|Podsumowanie zmiany)/
 await expect(page.getByRole('button',{name:deniedButtons})).toHaveCount(0)
 cutting.completed_at=timestamp;cutting.issued_at=timestamp;s.orders[0].items[0].issued=2;s.orders[0].status='COMPLETED'
 await page.getByRole('button',{name:/^Wszystkie/}).click()
 await expect(page.getByText('Wydane',{exact:true})).toBeVisible({timeout:10000})
 await expect(page.getByText('Zakończone',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:deniedButtons})).toHaveCount(0)
 await expect(page.getByText(/Zarobiono|Stawka w groszach/)).toHaveCount(0)
 expect(s.calls).toHaveLength(0)
})

for (const viewport of [{width:1024,height:768},{width:768,height:1024},{width:1440,height:900},{width:375,height:844}]) {
 test(`Orders visual audit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await page.emulateMedia({colorScheme:'dark'})
  const s=state();s.orders=[{id:1,display_number:'TEST-000123',location_id:1,received_at:now(),status:'TO_DO',items:Array.from({length:6},(_,n)=>({id:n+1,name:['Philadelphia Salmon','California Ebi','Futomaki Tuna','Hosomaki Cucumber','Premium Set','Tempura Roll'][n],quantity:10,available:10,issued:0,assignments:[]}))}]
  await setup(page,s,1,'administrator');await enter(page)
  await expect(page.getByRole('heading',{name:'TEST-000123'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  const rows=page.locator('.compact-item');expect(await rows.count()).toBe(6)
  const bounds=await rows.evaluateAll(els=>els.map(e=>e.getBoundingClientRect().x));expect(new Set(bounds).size).toBe(1)
  await page.screenshot({path:`tmp/pin-audit.local/orders-${viewport.width}.png`,fullPage:true})
  await page.getByRole('button',{name:'Katalog i stawki',exact:true}).click()
  await page.getByLabel('Stawka w zł — Philadelphia Salmon').fill('12,50')
  await page.getByRole('button',{name:'Zapisz stawkę',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('Zapisano.')
  expect(s.calls.find(c=>c.p_action==='rate').p_args.rate_minor).toBe(1250)
  await page.screenshot({path:`tmp/pin-audit.local/rates-${viewport.width}.png`,fullPage:true})
  await page.getByRole('button',{name:'Pracownicy',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Pracownicy',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'← Powrót',exact:true}).click()
  await page.getByRole('button',{name:'← Wybór modułów',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Co robisz?'})).toBeVisible()
 })
}


for (const width of [375,768,1440]) test(`compact horizontal board, sets and deadlines ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900})
 const s=state(),base=Date.now(),line=(id,name,type='product')=>({id,name,item_type:type,quantity:2,available:2,issued:0,assignments:[]})
 s.orders=Array.from({length:5},(_,n)=>({id:n+1,display_number:`BOARD-${n+1}`,location_id:1,status:'TO_DO',ready_at:n?new Date(base+([0,29,9,-12,90][n])*60000).toISOString():null,estimated_prep_minutes:n?18:null,items:[line(100*n+1,'Roll'),line(100*n+2,'Sos','addon'),line(100*n+3,'Ukryty napój','drink')]}))
 s.orders[0].items.unshift({...line(80,'Lunch','set'),quantity:2})
 s.orders[0].items[1].parent_item_id=80;s.orders[0].items[2].parent_item_id=80
 await setup(page,s,4,'sushi-master');await enter(page)
 await page.getByRole('button',{name:'Rozpocznij zmianę',exact:true}).click()
 const rail=page.getByRole('region',{name:'Tablica zamówień'})
 expect(await rail.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await expect(page.getByText('Ukryty napój',{exact:true})).toHaveCount(0)
 await expect(page.getByText('Sos',{exact:true})).toHaveCount(5)
 const first=page.locator('.order-column').first()
 await expect(first.getByText(/Wydać o|Czas przygotowania|Po czasie/)).toHaveCount(0)
 await expect(page.locator('.deadline-warning')).toHaveCount(1)
 await expect(page.locator('.deadline-urgent')).toHaveCount(1)
 await expect(page.locator('.deadline-overdue')).toHaveCount(1)
 await expect(first.locator('.set-components')).toBeVisible()
 await first.getByRole('button',{name:'Zwiń zestaw'}).click();await expect(first.locator('.set-components')).toHaveCount(0)
 await first.getByRole('button',{name:'Rozwiń zestaw'}).click()
 await first.getByLabel('Zaznacz Lunch').check()
 await expect(first.getByRole('button',{name:'Weź zaznaczone (2)'})).toBeEnabled()
 await first.getByRole('button',{name:'Weź zaznaczone (2)'}).click()
 expect(s.calls.find(c=>c.p_action==='claim').p_args.items).toEqual([{item_id:1,quantity:2},{item_id:2,quantity:2}])
 await page.screenshot({path:`tmp/orders-board.local/board-${width}.png`,fullPage:true})
})

test('chef notification persists once as a badge and dismissal survives reload',async({page})=>{
 const s=state();s.notices=[{id:1,order_id:12,event_type:'DEADLINE_30',display_number:'TEST-000012'}]
 await setup(page,s,3,'su-chef');await enter(page)
 await expect(page.getByText('Uwaga: zamówienie TEST-000012 do wydania za 30 min.',{exact:true})).toHaveCount(1)
 await page.getByRole('button',{name:'Przeczytane'}).click()
 await expect(page.getByText('Uwaga dla su-chefa')).toHaveCount(0)
 await page.reload();await enter(page);await expect(page.getByText('Uwaga dla su-chefa')).toHaveCount(0)
})
test('set quantity buttons send one-set and full-set intents through the same command RPC',async({page})=>{
 const s=state();s.orders=[{id:1,display_number:'LUNCH',location_id:1,status:'TO_DO',items:[
 {id:1,name:'Lunch',item_type:'set',quantity:2,available:2,issued:0,assignments:[]},
 {id:2,name:'Roll',item_type:'product',parent_item_id:1,quantity:4,available:4,issued:0,assignments:[]},
 ]}]
 await setup(page,s,4,'sushi-master');await enter(page);await page.getByRole('button',{name:'Rozpocznij zmianę',exact:true}).click()
 await page.getByRole('button',{name:'Weź 1/2 zestawów',exact:true}).click()
 await expect(page.getByRole('status')).toHaveText('Zapisano.')
 expect(s.calls.find(c=>c.p_action==='claim_set').p_args).toEqual({order_id:1,set_id:1,quantity:1})
 await page.getByRole('button',{name:'Weź cały zestaw (2)',exact:true}).click()
 await expect(page.getByRole('status')).toHaveText('Zapisano.')
 expect(s.calls.filter(c=>c.p_action==='claim_set').at(-1).p_args.quantity).toBe(2)
})
