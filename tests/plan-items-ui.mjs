// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/plan-items-ui.mjs
// Start local Vite first. Every non-local HTTP request is mocked or blocked.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { productionDate } from '../src/planAccess.js'
import { itemDetails, canDeletePlan } from '../src/planItemDetails.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({headless:true})
const dir = process.env.TEST_SCREENSHOTS || '/private/tmp/zagotowki-item-details-results'
fs.mkdirSync(dir,{recursive:true})
async function setup(role='manager',otherLocation=false) {
 const context=await browser.newContext(), page=await context.newPage(), calls=[], errors=[]
 let productsReads=0, dialogs=[], confirm=true
 const plans=[{id:1,plan_date:productionDate(),status:'active',location_id:otherLocation?2:1}]
 let items=[{id:10,plan_id:1,nazwa:'Ryż',product_external_id:100,ilosc:2,jednostka:'kg',priorytet:'normalny',gotowe:false,note:null,ready_time:null}]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('dialog',async d=>{dialogs.push(d.message()); if(confirm) await d.accept(); else await d.dismiss()})
 // Start Vite with VITE_SUPABASE_URL=https://auth-tests.supabase.co and a dummy public key.
 const authId='00000000-0000-0000-0000-000000000001'
 const employee={id:role==='employee'?4:2,name:'Tester',role,location_id:1,active:true,auth_user_id:authId}
 await context.addInitScript(authId=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify({
   access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,
   token_type:'bearer',user:{id:authId,aud:'authenticated',role:'authenticated'},
 })),authId)
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.hostname==='127.0.0.1')return route.continue()
  if(!u.pathname.startsWith('/rest/v1/'))return route.abort()
  const name=u.pathname.split('/').pop();let data=[]
  if(u.pathname.includes('/rpc/')) {
   const b=req.postDataJSON();if(name!=='auth_employee_profile')calls.push({name,body:b})
   if(name==='auth_employee_profile') data=[employee]
   else if(name==='add_plan_item') {data=100+items.length;items.push({id:data,plan_id:b.p_plan_id,nazwa:b.p_nazwa,product_external_id:b.p_product_external_id,ilosc:b.p_ilosc,jednostka:b.p_jednostka,priorytet:b.p_priorytet,note:b.p_note,ready_time:b.p_ready_time,gotowe:false})}
   else if(name==='update_plan_item') Object.assign(items.find(i=>i.id===b.p_item_id),{nazwa:b.p_nazwa,product_external_id:b.p_product_external_id,ilosc:b.p_ilosc,jednostka:b.p_jednostka,priorytet:b.p_priorytet,note:b.p_note,ready_time:b.p_ready_time})
   else if(name==='update_production_plan') items=b.p_items.map((i,n)=>({...i,id:20+n,plan_id:1,gotowe:false}))
   else if(name==='create_production_plan') {data=2;plans.push({id:2,plan_date:b.p_plan_date,location_id:b.p_location_id,status:'active'});items=b.p_items.map((i,n)=>({...i,id:30+n,plan_id:2,gotowe:false}))}
   else if(name==='delete_production_plan') {plans.splice(plans.findIndex(p=>p.id===b.p_plan_id),1);items=[]}
   else throw Error(`Unexpected RPC ${name}`)
  } else {
   assert.equal(req.method(),'GET')
   if(name==='Products') {productsReads++;data=[{id:1,external_id:100,name:'Ryż'},{id:2,external_id:200,name:'Łosoś'}]}
   else if(name==='Locations')data=[{id:1,name:'Lokal testowy',active:true}]
   else if(name==='Plans') {
    data=plans.filter(p=>!u.searchParams.get('id')||String(p.id)===u.searchParams.get('id').slice(3)).filter(p=>!u.searchParams.get('plan_date')?.startsWith('eq.')||p.plan_date===u.searchParams.get('plan_date').slice(3)).map(p=>({...p,Plan_items:items.filter(i=>i.plan_id===p.id)}))
    if(req.headers()['accept']?.includes('vnd.pgrst.object'))data=data[0]??null
   } else if(name==='Plan_items') data=items.filter(i=>!u.searchParams.has('plan_id')||String(i.plan_id)===u.searchParams.get('plan_id').slice(3))
   else throw Error(`Unexpected table ${name}`)
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 await page.routeWebSocket(/.*/,socket=>socket.close())
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Lokal testowy'}).click()
 return {page,context,calls,errors,plans,get items(){return items},dialogs,setConfirm:v=>confirm=v,reads:()=>productsReads}
}
const open = async p=>{await p.getByRole('button',{name:'Otwórz plan'}).first().click();await p.getByRole('heading',{name:'Do zrobienia'}).waitFor()}
const list = async p=>{await p.getByRole('button',{name:'← Lista planów',exact:true}).click();await p.getByRole('heading',{name:'📋 Zaplanowane plany',exact:true}).waitFor()}
try {
 const t=await setup(),p=t.page;await open(p)
 assert.equal(await p.locator('.item-note,.item-ready-time').count(),0)
 await p.getByRole('button',{name:'Dodaj pozycję',exact:false}).click()
 const combo=p.getByRole('combobox',{name:'Produkt',exact:true});await combo.fill('ŁOS');await p.getByRole('option',{name:'Łosoś',exact:true}).click()
 await p.getByRole('spinbutton',{name:'Ilość'}).fill('3');await p.getByRole('combobox',{name:'Jednostka',exact:true}).selectOption('szt.');await p.getByRole('combobox',{name:'Priorytet',exact:true}).selectOption('pilny')
 await p.getByLabel('Gotowe na',{exact:true}).fill('10:30');await p.getByLabel('Notatka',{exact:true}).fill('Na catering\nBez cebuli')
 for (const width of [375,768,1440]) {await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${dir}/add-${width}.png`,fullPage:true})}
 await p.getByRole('button',{name:'Dodaj do planu',exact:true}).click();await p.locator('.item-note').getByText('Na catering',{exact:false}).waitFor()
 assert.equal(t.calls[0].body.p_product_external_id,200);assert.equal(t.calls[0].body.p_note,'Na catering\nBez cebuli');assert.equal(t.calls[0].body.p_ready_time,'10:30');assert.equal(t.reads(),1)
 await p.getByRole('button',{name:'Dodaj pozycję',exact:false}).click();await combo.fill('Własna zupa');await p.getByRole('option',{name:/Dodaj własną/}).click();await p.getByRole('spinbutton',{name:'Ilość'}).fill('2');await p.getByRole('button',{name:'Dodaj do planu',exact:true}).click();await p.locator('.opis-zadania strong').getByText('Własna zupa',{exact:true}).waitFor()
 assert.equal(t.calls[1].body.p_product_external_id,null);assert.equal(t.calls[1].body.p_note,null);assert.equal(t.calls[1].body.p_ready_time,null)
 await list(p);await open(p);await p.getByText('🕐 Gotowe na 10:30',{exact:true}).waitFor()
 const card=p.locator('.zadanie').filter({has:p.getByText('Łosoś',{exact:true})})
 await card.getByRole('button',{name:'✏️ Edytuj',exact:true}).click();assert.equal(await card.getByLabel('Notatka',{exact:true}).inputValue(),'Na catering\nBez cebuli');await card.getByLabel('Gotowe na',{exact:true}).fill('08:00');await card.getByLabel('Notatka',{exact:true}).fill('Drobniej');await card.getByRole('button',{name:'💾 Zapisz'}).click();await p.getByText('🕐 Gotowe na 08:00',{exact:true}).waitFor()
 await p.getByRole('button',{name:'← Edytuj plan',exact:true}).click();await p.getByRole('heading',{name:'Co przygotować?'}).waitFor()
 const edit=p.locator('.produkt').filter({has:p.getByRole('checkbox',{name:'Łosoś',exact:true})});assert.equal(await edit.getByLabel('Notatka',{exact:true}).inputValue(),'Drobniej');assert.equal(await edit.getByLabel('Gotowe na',{exact:true}).inputValue(),'08:00')
 await edit.getByLabel('Notatka',{exact:true}).fill('Po edycji planu');await p.getByRole('button',{name:'Zatwierdź plan'}).click();await p.getByText('Po edycji planu',{exact:true}).waitFor()
 // Clear both optional fields through the item editor.
 await card.getByRole('button',{name:'✏️ Edytuj',exact:true}).click();await card.getByLabel('Gotowe na',{exact:true}).fill('');await card.getByLabel('Notatka',{exact:true}).fill('');await card.getByRole('button',{name:'💾 Zapisz'}).click();await p.getByText('Po edycji planu',{exact:true}).waitFor({state:'hidden'})
 assert.equal(t.calls.at(-1).body.p_note,null);assert.equal(t.calls.at(-1).body.p_ready_time,null)
 // Confirmation cancellation never calls the RPC.
 const n=t.calls.length;t.setConfirm(false);await p.getByRole('button',{name:'🗑 Usuń plan',exact:true}).click();assert.equal(t.calls.length,n);assert(t.dialogs.at(-1).includes(productionDate().split('-').reverse().join('.')))
 t.setConfirm(true);await p.getByRole('button',{name:'🗑 Usuń plan',exact:true}).click();await p.getByRole('heading',{name:'📋 Zaplanowane plany',exact:true}).waitFor();assert.equal(t.calls.at(-1).name,'delete_production_plan');assert.equal(await p.getByRole('button',{name:'Otwórz plan'}).count(),0)
 // Create plan with metadata through PlanningScreen.
 await p.locator('input[type=date]').fill(productionDate(1));await p.getByRole('button',{name:'Utwórz plan'}).click();await p.getByRole('checkbox',{name:'Ryż',exact:true}).check();await p.getByPlaceholder('Ilość').fill('4');await p.getByLabel('Notatka',{exact:true}).fill('Nowy plan');await p.getByLabel('Gotowe na',{exact:true}).fill('14:00');await p.getByRole('button',{name:'Zatwierdź plan'}).click();await p.getByRole('heading',{name:'Do zrobienia'}).waitFor();await p.locator('.item-note').getByText('Nowy plan',{exact:true}).waitFor();assert.equal(t.calls.at(-1).body.p_items[0].ready_time,'14:00');assert.deepEqual(t.errors,[]);await t.context.close()
 for(const role of ['administrator','su-chef','employee']) {
  const t=await setup(role),p=t.page;t.items[0].note='Notatka dla pracownika';t.items[0].ready_time='09:15:00';t.items[0].started_at='2026-01-01T08:00:00Z';await open(p)
  await p.getByText('Notatka dla pracownika',{exact:true}).waitFor();await p.getByText('🕐 Gotowe na 09:15',{exact:true}).waitFor()
  if(role==='employee')assert.equal(await p.getByRole('button',{name:'🗑 Usuń plan',exact:true}).count(),0)
  else {await p.getByRole('button',{name:'🗑 Usuń plan',exact:true}).click();assert.equal(t.calls.length,0);assert(t.dialogs.at(-1).includes('nie można usunąć'))}
  for(const width of [375,768,1440]) {await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${dir}/${role}-${width}.png`,fullPage:true})}
  assert.deepEqual(t.errors,[]);await t.context.close()
 }
 const foreign=await setup('manager',true);await open(foreign.page);assert.equal(await foreign.page.getByRole('button',{name:'🗑 Usuń plan',exact:true}).count(),0);await foreign.context.close()
 assert.equal(canDeletePlan({role:'su-chef',location_id:1},{location_id:2}),false)
 assert.deepEqual(itemDetails({note:'  ',ready_time:''}),{note:null,ready_time:null});assert.throws(()=>itemDetails({ready_time:'25:00'}))
 console.log('PASS: catalog/custom, cached search, metadata create/add/edit/clear/reopen, employee display, delete confirmation/history/visibility, no page errors, RWD 375/768/1440.')
} finally {await browser.close()}
