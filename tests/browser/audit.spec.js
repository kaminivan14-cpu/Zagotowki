import { createHandler } from '../../supabase/functions/audit-photos/handler.mjs'
import { test, expect } from '@playwright/test'
import { auditDatabase, uid } from '../helpers/audit-db.mjs'
const user={id:uid(1),email:'audit@example.invalid',aud:'authenticated',role:'authenticated'}
function session(){const exp=Math.floor(Date.now()/1000)+3600,b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return {access_token:`${b64({alg:'HS256'})}.${b64({sub:user.id,exp,role:'authenticated'})}.test`,refresh_token:'test-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user}}
async function setup(page){
 const db=await auditDatabase({r2:true}),state={failSave:false,loseStart:false,failUpload:false,caps:['audit.access'],calls:[],files:new Map()}
 await db.exec(`SET request.jwt.claim.sub='${user.id}'; SET ROLE authenticated;`)
 const command=async(action,args,operation=crypto.randomUUID())=>(await db.query('SELECT public.audit_command($1,$2::jsonb,$3::uuid) AS value',[action,JSON.stringify(args),operation])).rows[0].value
 await command('template_save',{id:crypto.randomUUID(),name:'Kontrola testowa',questions:['Czy sala jest czysta?','Czy sprzęt działa?']})
 const handler=createHandler({origins:['http://127.0.0.1:5173'],authenticate:async()=>user.id,
  rpc:async args=>{
   await db.exec('RESET ROLE; SET ROLE service_role')
   try{return (await db.query('SELECT public.audit_photo_service($1,$2::uuid,$3::uuid,$4,$5::jsonb) AS value',[args.p_action,args.p_actor,args.p_photo,args.p_version,JSON.stringify(args.p_verified)])).rows[0].value}
   finally{await db.exec('RESET ROLE; SET ROLE authenticated')}
  },r2:{
   putUrl:async p=>({url:`https://audit-r2.test/${p.path}`,headers:{'Content-Type':p.mime,'If-None-Match':'*'}}),
   getUrl:async p=>`https://audit-r2.test/${p.path}`,
   inspect:async p=>{const file=state.files.get(p.path);if(!file)throw Error('AUDIT_PHOTO_MISSING');return new Uint8Array(file)},
   remove:async p=>{state.files.delete(p.path)},
  }})
 let queue=Promise.resolve()
 await page.addInitScript(saved=>{localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify(saved))},session())
 await page.routeWebSocket(/.*/,s=>s.close())
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin==='http://127.0.0.1:5173')return route.continue()
  if(url.hostname==='audit-r2.test'){
   const path=url.pathname.slice(1)
   if(req.method()==='PUT'){
    if(state.failUpload)return route.fulfill({status:503,body:'Upload failed'})
    if(state.files.has(path))return route.fulfill({status:412,body:''})
    state.files.set(path,req.postDataBuffer());return route.fulfill({status:200,body:''})
   }
   return route.fulfill({contentType:'image/jpeg',body:state.files.get(path)})
  }
  if(url.hostname!=='auth-tests.supabase.co')return route.abort()
  const previous=queue;let release;queue=new Promise(resolve=>{release=resolve});await previous
  try {
  const name=url.pathname.split('/').at(-1)
  const args=req.postDataJSON()||{}
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
    if(args.p_action==='save'&&state.saveGate)await state.saveGate
    body=await command(args.p_action,args.p_args,args.p_operation)
    if(args.p_action==='start'&&state.loseStart){state.loseStart=false;return route.fulfill({status:503,json:{message:'Lost response'}})}
   }else if(name==='audit-photos'){
    if(args.action==='complete'&&state.failComplete)return route.fulfill({status:503,json:{error:'Potwierdzenie przerwane'}})
    const response=await handler(new Request(req.url(),{method:'POST',headers:req.headers(),body:req.postData()}))
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
   }
   else throw Error(`Unexpected request ${url.pathname}`)
   return route.fulfill({status:200,json:body})
  }catch(e){return route.fulfill({status:400,json:{message:e.message,code:e.code}})}
  } finally { release() }
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
 const buffer=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=3000;c.height=2000;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,c.width,c.height);return Array.from(new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer()))})
 const file={name:'test.png',mimeType:'image/png',buffer:Buffer.from(buffer)}
 await page.getByLabel('Galeria',{exact:true}).first().setInputFiles(file)
 await expect(page.getByRole('alert')).toContainText('Przesyłanie zdjęcia nie powiodło się');await expect(page.getByRole('button',{name:'Zakończ audyt',exact:true})).toBeDisabled()
 f.state.failUpload=false;await page.getByRole('button',{name:'Ponów operację'}).click();await expect(page.getByRole('button',{name:'Powiększ zdjęcie'})).toBeVisible();await saved(page)
 const stored=(await f.db.query("SELECT public.audit_read('history') AS value")).rows[0].value[0];const detail=(await f.db.query("SELECT public.audit_read('detail',$1) AS value",[stored.id])).rows[0].value;expect(detail.photos[0]).toMatchObject({width:1920,height:1280,mime:'image/jpeg',state:'ready'});expect(detail.photos[0].bytes).toBeLessThan(file.buffer.length)
 await page.getByRole('button',{name:'Zapisz i wyjdź'}).click();await page.reload();await page.getByRole('button',{name:'Historia audytów',exact:false}).click();await page.getByRole('button',{name:'Kontynuuj audyt'}).click();await expect(page.getByRole('button',{name:'Powiększ zdjęcie'})).toBeVisible()
 await page.getByRole('button',{name:'Powiększ zdjęcie'}).click();await expect(page.getByRole('dialog')).toBeVisible()
 const full=page.getByAltText('Powiększone zdjęcie do pytania')
 await expect(full).toBeVisible()
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
  await page.setViewportSize(viewport)
  const dimensions=await full.evaluate(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,fit:getComputedStyle(img).objectFit,natural:img.naturalWidth}))
  expect(dimensions.width).toBeGreaterThan(200);expect(dimensions.height).toBeGreaterThan(80);expect(dimensions.fit).toBe('contain');expect(dimensions.natural).toBe(1920)
 }
 await page.keyboard.press('Escape')
 await expect(page.getByRole('button',{name:'Powiększ zdjęcie'})).toBeFocused()
 await page.getByRole('button',{name:'Usuń audyt w trakcie'}).click();await page.getByRole('button',{name:'Tak, usuń',exact:true}).click();await expect(page.getByText('Brak audytów w tym widoku.')).toBeVisible()
 expect(f.state.files.size).toBe(0)
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

test('photo preparation decodes HEIC and respects JPEG EXIF orientation',async({page})=>{
 await page.goto('/')
 const {readFile}=await import('node:fs/promises')
 const heic=Array.from(await readFile('tests/fixtures/audit/synthetic.heic'))
 const result=await page.evaluate(async heic=>{
  const {preparePhoto}=await import('/src/audit/preparePhoto.js')
  const converted=await preparePhoto(new File([new Uint8Array(heic)],'test.heic',{type:'image/heic'}))
  const c=document.createElement('canvas');c.width=80;c.height=40;c.getContext('2d').fillRect(0,0,80,40)
  const jpg=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg'))).arrayBuffer())
  // EXIF little-endian orientation=6: rotate 90 degrees clockwise.
  const exif=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0])
  const oriented=await preparePhoto(new File([jpg.slice(0,2),exif,jpg.slice(2)],'rotate.jpg',{type:'image/jpeg'}))
  const broken=await preparePhoto(new File([jpg.slice(0,5)],'broken.jpg')).then(()=>false,()=>true)
  return {heic:{width:converted.width,height:converted.height,mime:converted.mime},jpeg:{width:oriented.width,height:oriented.height},broken}
 },heic)
 expect(result).toEqual({heic:{width:80,height:40,mime:'image/jpeg'},jpeg:{width:40,height:80},broken:true})
})


test('pending upload can be confirmed after reloading audit without choosing the file again',async({page})=>{
 const f=await setup(page);try {
  await start(page);f.state.failComplete=true
  const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=40;c.height=20;return Array.from(new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer()))})
  await page.getByLabel('Galeria',{exact:true}).first().setInputFiles({name:'retry.png',mimeType:'image/png',buffer:Buffer.from(bytes)})
  await expect(page.getByRole('alert')).toContainText('Potwierdzenie przerwane')
  expect(f.state.files.size).toBe(1)
  await page.getByRole('button',{name:'Otwórz aktualną wersję',exact:true}).click()
  await page.getByRole('button',{name:'Odrzuć lokalne zmiany i otwórz'}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  f.state.failComplete=false
  await page.getByRole('button',{name:'Sprawdź zapis zdjęcia'}).click()
  await expect(page.getByRole('button',{name:'Powiększ zdjęcie'})).toBeVisible();await saved(page)
  expect(f.state.files.size).toBe(1)
 } finally {await f.close()}
})


test('background comment save retains focus and saves text typed during an earlier request',async({page})=>{
 const f=await setup(page);let release
 try {
  await start(page)
  const comment=page.getByLabel('Komentarz (opcjonalnie)').first()
  f.state.saveGate=new Promise(resolve=>{release=resolve})
  await comment.fill('Pierwsza część')
  await expect.poll(()=>f.state.calls.filter(c=>c.args.p_action==='save').length).toBe(1)
  await expect(comment).toBeFocused();await expect(comment).toBeEnabled()
  await page.keyboard.type(' i druga część')
  await expect(comment).toHaveValue('Pierwsza część i druga część')
  f.state.saveGate=null;release()
  await saved(page)
  await expect(comment).toBeFocused()
  await expect(comment).toHaveValue('Pierwsza część i druga część')
  const saves=f.state.calls.filter(c=>c.args.p_action==='save')
  expect(saves).toHaveLength(2)
  expect(saves[0].args.p_args.answers[0].comment).toBe('Pierwsza część')
  expect(saves[1].args.p_args.answers[0].comment).toBe('Pierwsza część i druga część')
  expect(saves[1].args.p_args.version).toBe(saves[0].args.p_args.version+1)
  await page.getByRole('button',{name:'Zapisz i wyjdź'}).click()
  await page.getByRole('button',{name:'Kontynuuj audyt'}).click()
  await expect(comment).toHaveValue('Pierwsza część i druga część')
 } finally {release?.();await f.close()}
})
