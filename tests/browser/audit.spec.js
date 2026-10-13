import { test, expect } from '@playwright/test'
import { auditDatabase, uid } from '../helpers/audit-db.mjs'
const user={id:uid(1),email:'audit@example.invalid',aud:'authenticated',role:'authenticated'}
function session(){const exp=Math.floor(Date.now()/1000)+3600,b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return {access_token:`${b64({alg:'HS256'})}.${b64({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user}}
async function setup(page){
 const db=await auditDatabase(),state={failSave:false,loseStart:false,failUpload:false,caps:['audit.access'],calls:[],files:new Map()}
 await db.exec(`SET request.jwt.claim.sub='${user.id}'; SET ROLE authenticated;`)
 const command=async(action,args,operation=crypto.randomUUID())=>(await db.query('SELECT public.audit_command($1,$2::jsonb,$3::uuid) AS value',[action,JSON.stringify(args),operation])).rows[0].value
 await command('template_save',{id:crypto.randomUUID(),name:'Kontrola testowa',questions:['Czy sala jest czysta?','Czy sprzęt działa?']})
 await page.addInitScript(saved=>{localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(saved))},session())
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin==='http://127.0.0.1:5173')return route.continue()
  if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const name=url.pathname.split('/').at(-1)
  const isObject=url.pathname.includes('/storage/v1/object/')
  const args=isObject&&req.method()==='POST'&&!url.pathname.includes('/sign/')?{}:req.postDataJSON()||{}
  state.calls.push({name,args})
  let body
  try{
   if(name==='auth_employee_profile')body=[{id:1,name:'Synthetic one',role:'employee',active:true,auth_user_id:user.id,location_id:1}]
   else if(name==='auth_capabilities')body=state.caps
   else if(name==='user')body=user
   else if(name==='logout')body={}
   else if(name==='audit_read')body=(await db.query('SELECT public.audit_read($1,$2::uuid,$3) AS value',[args.p_kind,args.p_id,args.p_status])).rows[0].value
   else if(name==='audit_command'){
    if(args.p_action==='save'&&state.failSave)return route.fulfill({status:503,json:{message:'Test connection failure'}})
    body=await command(args.p_action,args.p_args,args.p_operation)
    if(args.p_action==='start'&&state.loseStart){state.loseStart=false;return route.fulfill({status:503,json:{message:'Lost response'}})}
   }else if(url.pathname.includes('/storage/v1/object/sign/')){
    const path=url.pathname.split('/audit-photos/')[1];body={signedURL:`/object/authenticated/audit-photos/${path}`}
   }else if(isObject&&req.method()==='POST'){
    if(state.failUpload)return route.fulfill({status:503,json:{message:'Upload failed'}})
    const path=url.pathname.split('/audit-photos/')[1]
    const p=(await db.query(`SELECT public.audit_read('history') AS value`)).rows[0].value
    let photo
    for(const a of p){const d=(await db.query(`SELECT public.audit_read('detail',$1) AS value`,[a.id])).rows[0].value;photo||=d.photos.find(x=>x.path===path)}
    await db.query(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('audit-photos',$1,$2::jsonb) ON CONFLICT DO NOTHING`,[path,JSON.stringify({mimetype:photo.mime,size:photo.bytes})])
    body={Key:`audit-photos/${path}`}
   }else if(isObject&&req.method()==='DELETE'){
    for(const path of args.prefixes)await db.query('DELETE FROM storage.objects WHERE name=$1',[path]);body=[]
   }else if(isObject&&req.method()==='GET')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR6kAAAAASUVORK5CYII=','base64')})
   else throw Error(`Unexpected request ${url.pathname}`)
   return route.fulfill({status:200,json:body})
  }catch(e){return route.fulfill({status:400,json:{message:e.message,code:e.code}})}
 })
 return {...state,state,db,command,close:()=>db.close()}
}
async function start(page){await page.goto('/');await page.getByRole('button',{name:'Nowy audyt',exact:false}).click();await page.getByRole('button',{name:'Wybierz wzór'}).click();await page.getByRole('button',{name:'Tak, rozpocznij'}).click();await expect(page.getByRole('heading',{name:'Audyt w trakcie'})).toBeVisible()}
async function saved(page){await expect(page.getByRole('status')).toHaveText('Zapisano')}
test('mobile: start, partial save, reload, resume, finish and immutable Score',async({page},info)=>{
 const f=await setup(page);try{
 await page.setViewportSize({width:390,height:844});await start(page)
 await page.getByRole('combobox',{name:'Lokal',exact:true}).selectOption('2')
 await page.getByRole('button',{name:'TAK',exact:true}).first().click()
 await page.getByLabel('Komentarz (opcjonalnie)').first().fill('Trwały komentarz')
 await saved(page);await page.getByRole('button',{name:'Zapisz i wyjdź'}).click()
 await expect(page.getByText('Wypełnienie: 50%')).toBeVisible();await page.reload()
 await page.getByRole('button',{name:'Historia audytów',exact:false}).click();await page.getByRole('button',{name:'Kontynuuj audyt'}).click()
 await expect(page.getByLabel('Komentarz (opcjonalnie)').first()).toHaveValue('Trwały komentarz')
 await page.getByRole('button',{name:'NIE DOTYCZY',exact:true}).nth(1).click();await saved(page)
 await page.screenshot({path:info.outputPath('audit-mobile-form.png'),fullPage:true})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByRole('button',{name:'Zakończ audyt',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible()
 await page.getByRole('button',{name:'Tak, zakończ'}).click()
 await expect(page.getByText('Wynik (Score): 100%',{exact:true})).toBeVisible()
 await expect(page.getByLabel('Komentarz (opcjonalnie)')).toHaveCount(0)
 await page.screenshot({path:info.outputPath('audit-mobile-result.png'),fullPage:true})
 }finally{await f.close()}
})
test('lost start response is retried once; failed save cannot exit or finish; conflict preserves local edit',async({page})=>{
 const f=await setup(page);try{
 f.state.loseStart=true;await page.goto('/');await page.getByRole('button',{name:'Nowy audyt',exact:false}).click();await page.getByRole('button',{name:'Wybierz wzór'}).click();await page.getByRole('button',{name:'Tak, rozpocznij'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Lost response');await page.getByRole('button',{name:'Tak, rozpocznij'}).click()
 await expect(page.getByRole('heading',{name:'Audyt w trakcie'})).toBeVisible()
 const history=(await f.db.query("SELECT public.audit_read('history') AS value")).rows[0].value;expect(history).toHaveLength(1)
 f.state.failSave=true;await page.getByLabel('Komentarz (opcjonalnie)').first().fill('Zachowaj mnie')
 await expect(page.getByRole('status')).toHaveText('Błąd zapisu');await expect(page.getByRole('button',{name:'Zapisz i wyjdź'})).toBeDisabled();await expect(page.getByRole('button',{name:'Zakończ audyt',exact:true})).toBeDisabled()
 f.state.failSave=false;await page.getByRole('button',{name:'Ponów operację'}).click();await saved(page)
 const a=(await f.db.query("SELECT public.audit_read('detail',$1) AS value",[history[0].id])).rows[0].value
 await f.command('save',{id:a.id,version:a.version,answers:a.answers,location_id:1})
 await page.getByLabel('Komentarz (opcjonalnie)').first().fill('Moja lokalna wersja');await expect(page.getByRole('alert')).toContainText('Konflikt')
 await expect(page.getByLabel('Komentarz (opcjonalnie)').first()).toHaveValue('Moja lokalna wersja')
 }finally{await f.close()}
})
test('template reorder, preview and withdrawal; cancelled start creates nothing',async({page})=>{
 const f=await setup(page);try{
 await page.goto('/');await page.getByRole('button',{name:'Wzory formularzy',exact:false}).click();await page.getByRole('button',{name:'Edytuj',exact:true}).click();await page.getByRole('button',{name:'Pytanie 2 w górę'}).click();await expect(page.getByRole('textbox',{name:'Pytanie 1',exact:true})).toHaveValue('Czy sprzęt działa?');await page.getByRole('button',{name:'Zapisz wzór'}).click()
 await page.getByRole('button',{name:'Podgląd',exact:true}).click();await expect(page.getByRole('dialog').locator('li').first()).toHaveText('Czy sprzęt działa?');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Podgląd',exact:true})).toBeFocused()
 await page.getByRole('button',{name:'Menu AUDYT',exact:false}).click();await page.getByRole('button',{name:'Nowy audyt',exact:false}).click();await page.getByRole('button',{name:'Wybierz wzór'}).click();await page.getByRole('button',{name:'Anuluj / zamknij'}).click()
 expect((await f.db.query("SELECT public.audit_read('history') AS value")).rows[0].value).toHaveLength(0)
 await page.getByRole('button',{name:'Menu AUDYT',exact:false}).click();await page.getByRole('button',{name:'Wzory formularzy',exact:false}).click();await page.getByRole('button',{name:'Usuń wzór',exact:true}).click();await page.getByRole('button',{name:'Tak, usuń wzór'}).click();await expect(page.getByText('Nie ma jeszcze wzorów formularzy. Utwórz pierwszy wzór.')).toBeVisible()
 }finally{await f.close()}
})
test('photo upload failure blocks completion, retry persists, reload shows thumbnail, draft removal cleans storage',async({page})=>{
 const f=await setup(page);try{
 await start(page);f.state.failUpload=true
 const file={name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR6kAAAAASUVORK5CYII=','base64')}
 await page.getByLabel('Galeria',{exact:true}).first().setInputFiles(file)
 await expect(page.getByRole('alert')).toContainText('Upload failed');await expect(page.getByRole('button',{name:'Zakończ audyt',exact:true})).toBeDisabled()
 f.state.failUpload=false;await page.getByRole('button',{name:'Ponów operację'}).click();await expect(page.getByRole('button',{name:'Powiększ zdjęcie'})).toBeVisible();await saved(page)
 await page.getByRole('button',{name:'Zapisz i wyjdź'}).click();await page.reload();await page.getByRole('button',{name:'Historia audytów',exact:false}).click();await page.getByRole('button',{name:'Kontynuuj audyt'}).click();await expect(page.getByRole('button',{name:'Powiększ zdjęcie'})).toBeVisible()
 await page.getByRole('button',{name:'Powiększ zdjęcie'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Usuń audyt w trakcie'}).click();await page.getByRole('button',{name:'Tak, usuń',exact:true}).click();await expect(page.getByText('Brak audytów w tym widoku.')).toBeVisible()
 expect((await f.db.query('SELECT * FROM storage.objects')).rows).toHaveLength(0)
 }finally{await f.close()}
})

test('module ordering, keyboard modal and narrow/enlarged text layout',async({page},info)=>{
 const f=await setup(page);try{
 f.state.caps=['orders.access','production.access','audit.access','tasks.access']
 await page.goto('/');await expect(page.locator('.module-selector>button').nth(2)).toContainText('AUDYT')
 await page.getByRole('button',{name:'📋 AUDYT Audyt lokalu'}).click()
 await page.getByRole('button',{name:'Nowy audyt',exact:false}).click();await page.getByRole('button',{name:'Wybierz wzór'}).click()
 await page.keyboard.press('Tab');expect(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement))).toBe(true)
 await page.getByRole('button',{name:'Tak, rozpocznij'}).click()
 await expect(page.getByRole('heading',{name:'Audyt w trakcie'})).toBeVisible()
 for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='24px');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await page.screenshot({path:info.outputPath('audit-large-text.png'),fullPage:true})
 }finally{await f.close()}
})
