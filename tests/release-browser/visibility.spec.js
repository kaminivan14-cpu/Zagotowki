import {test,expect} from '@playwright/test'
async function setup(page,role,locale='pl'){
 await page.addInitScript(locale=>localStorage.setItem('zagotowki.locale',locale),locale)
 const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid'},exp=Math.floor(Date.now()/1000)+3600,b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
 const session={user,expires_at:exp,expires_in:3600,token_type:'bearer',refresh_token:'synthetic',access_token:`${b64({alg:'HS256'})}.${b64({sub:user.id,exp,role:'authenticated'})}.synthetic`}
 await page.addInitScript(s=>localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(s)),session)
 await page.routeWebSocket(/.*/,s=>s.close())
 const calls=[]
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:5174')return route.continue();if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const n=url.pathname.split('/').pop();calls.push(n);let data=[]
  if(n==='user')data=user
  else if(n==='auth_employee_profile')data=[{id:1,name:'Synthetic',role,location_id:1,active:true,auth_user_id:user.id}]
  // Deliberately broad response: frontend must still enforce Production policy.
  else if(n==='auth_capabilities')data=['production.access','orders.access','tasks.access','orders.test.generate','orders.delete']
  else if(n==='orders_board')data=[{id:1,location_id:1,display_number:'ACCESS-TEST',status:'NEW',items:[]}]
  else if(n==='Locations')data=[{id:1,name:'Synthetic location',active:true}]
  else if(n==='tasks_context')data={capabilities:role==='administrator'?['tasks.admin','processes.read']:[],categories:[],settings:{company_timezone:'Europe/Warsaw'}}
  else if(n==='tasks_execution_state')data={current:null,next:null,active_shift:null,critical:[]}
  else if(n==='organization_structure')data={assignments:[],can_manage:role==='administrator'}
  else if(n==='tasks_admin_directory')data={employees:[],departments:[],categories:[],locations:[],reporting_lines:[],scope_grants:[],settings:{}}
  else if(n==='tasks_processes')data={templates:[],versions:[],instances:[],roles:['administrator','manager']}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 });return calls
}
for(const role of ['administrator','manager','su-chef','shift-manager','sushi-master','crafter','employee','director','expert','specialist','owner'])test(`Production module visibility ${role}`,async({page})=>{
 const calls=await setup(page,role);await page.goto('/')
 if(['administrator','manager','su-chef','shift-manager','sushi-master','crafter'].includes(role)){
  await expect(page.getByRole('button',{name:/ЗАМОВЛЕННЯ/})).toBeVisible();await expect(page.getByRole('button',{name:/Робота|Praca/})).toHaveCount(['administrator','manager'].includes(role)?1:0)
  await page.getByRole('button',{name:/ЗАМОВЛЕННЯ/}).click();await expect(page.getByRole('heading',{name:'Zamówienia',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Generator UAT'})).toHaveCount(0)
  expect(calls.includes('orders_command')).toBe(false)
  await expect.poll(()=>calls).toContain('orders_board')
  await expect(page.getByRole('button',{name:'Usuń wszystkie zamówienia',exact:true,includeHidden:true})).toHaveCount(['administrator','manager'].includes(role)?1:0)
 }else{
  await expect(page.getByRole('button',{name:/ЗАМОВЛЕННЯ/})).toHaveCount(0);await expect(page.getByRole('button',{name:/Робота|Praca/})).toHaveCount(['owner','director','expert','specialist'].includes(role)?1:0)
  await expect(page.getByText('Sprawdzanie modułów…')).toHaveCount(0)
  expect(calls.some(n=>n.startsWith('orders_')||n.startsWith('tasks_'))).toBe(false)
 }
})
for(const role of ['administrator','manager'])test(`Production admin capability ${role}`,async({page})=>{
 await setup(page,role,'uk');await page.goto('/');await page.getByRole('button',{name:/Робота|Praca/}).click()
 if(role==='administrator'){
  await page.getByRole('button',{name:'Адмін панель',exact:true}).click()
  await page.getByRole('button',{name:'Процеси',exact:true}).click();await expect(page.getByRole('button',{name:'Шаблони процесів',exact:true})).toBeVisible()
 }else await expect(page.getByRole('button',{name:'Адмін панель',exact:true})).toHaveCount(0)
})

for(const role of ['administrator','manager','owner','director','expert','specialist'])test(`Production Work opens ${role}`,async({page})=>{
 const calls=await setup(page,role,'uk');await page.goto('/');await page.getByRole('button',{name:/Робота|Praca/}).click()
 await expect(page.getByRole('heading',{name:'Робота',exact:true})).toBeVisible()
 expect(calls).toContain('tasks_context');expect(calls).toContain('tasks_execution_state')
 if(!['administrator'].includes(role)){await expect(page.getByRole('button',{name:'Адмін панель',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Процеси',exact:true})).toHaveCount(0)}
})
