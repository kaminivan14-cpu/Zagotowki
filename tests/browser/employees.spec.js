import { test, expect } from '@playwright/test'
const uid = '00000000-0000-0000-0000-000000000001'
async function setup(page) {
  const employees = [
    { id: 1, name: 'Admin', role: 'administrator', active: true, location_id: null, auth_user_id: uid, archived_at: null },
    { id: 2, name: 'Manager A', role: 'manager', active: true, location_id: 1, auth_user_id: 'test-linked', archived_at: null },
  ]
  const calls = []; let fail = false
  await page.addInitScript(uid => {
    const exp = Math.floor(Date.now()/1000)+3600
    const token = `${btoa('{}')}.${btoa(JSON.stringify({sub:uid,exp}))}.test`
    localStorage.setItem('sb-auth-tests-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,user:{id:uid}}))
  }, uid)
  await page.routeWebSocket(/.*/, socket => socket.close())
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:5173') return route.continue()
    if (url.hostname !== 'auth-tests.supabase.co') return route.abort()
    let data = []
    const path = url.pathname
    if (path.endsWith('/auth_capabilities')) data = ['production.access']
    else if (path.endsWith('/auth_employee_profile')) data = [employees[0]]
    else if (path.endsWith('/Locations')) data = [{id:1,name:'Lokal A',active:true}]
    else if (path.endsWith('/auth_list_employees')) data = employees
    else if (path.endsWith('/auth_employee_lifecycle')) {
      const body = route.request().postDataJSON(); calls.push(body)
      await new Promise(r=>setTimeout(r,200))
      if (fail) return route.fulfill({status:403,json:{message:'sensitive internal failure'}})
      const e = employees.find(e=>e.id===body.p_employee_id)
      if (body.p_action==='archive') {e.active=false;e.archived_at='2026-09-30T10:00:00Z'}
      if (body.p_action==='restore') {e.active=false;e.archived_at=null}
      if (body.p_action==='activate') e.active=true
      if (body.p_action==='deactivate') e.active=false
      data = null
    } else if (path.endsWith('/Plans')) {
      expect(url.searchParams.get('order')).toBe('plan_date.desc,created_at.desc.nullslast,id.desc')
      expect(url.searchParams.get('location_id')).toBe('eq.1')
      expect(route.request().method()).toBe('GET')
      data = [
        {id:2,plan_date:'2026-09-30',created_at:'2026-09-01',Plan_items:[]},
        {id:1,plan_date:'2026-09-29',created_at:'2026-09-30',Plan_items:[]},
      ]
    }
    await route.fulfill({json:data})
  })
  return { calls, fail:()=>{fail=true} }
}
const card = page => page.locator('.produkt').filter({has:page.getByText('Manager A',{exact:true})})
test('employee actions: cancel, deactivate, activate, archive, restore and no duplicate submission', async ({page}) => {
  const {calls} = await setup(page); await page.goto('/')
  await page.getByRole('button',{name:'👥 Pracownicy'}).click()
  await expect(card(page)).toBeVisible()
  await card(page).getByRole('button',{name:'Dezaktywuj',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Anuluj'}).click(); expect(calls).toHaveLength(0)
  await card(page).getByRole('button',{name:'Dezaktywuj',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Dezaktywuj',exact:true}).evaluate(b=>{b.click();b.click()})
  await expect(card(page).getByText(/^Nieaktywny ·/)).toBeVisible()
  await expect(card(page).getByRole('button',{name:'Aktywuj',exact:true})).toBeVisible()
  expect(calls.filter(c=>c.p_action==='deactivate')).toHaveLength(1)
  await expect(card(page).getByRole('button',{name:'Nadaj / resetuj PIN'})).toBeDisabled()
  await card(page).getByRole('button',{name:'Aktywuj',exact:true}).click()
  await expect(card(page).getByText(/^Aktywny ·/)).toBeVisible()
  await expect(card(page).getByRole('button',{name:'Dezaktywuj',exact:true})).toBeVisible()
  await card(page).getByRole('button',{name:'Usuń',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Anuluj'}).click(); expect(calls).toHaveLength(2)
  await card(page).getByRole('button',{name:'Usuń',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Usuń konto'}).evaluate(b=>{b.click();b.click()})
  await expect(page.getByRole('dialog').getByRole('button',{name:'Usuń konto'})).toBeDisabled()
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(card(page)).toHaveCount(0)
  expect(calls.filter(c=>c.p_action==='archive')).toHaveLength(1)
  await page.getByLabel('Widok pracowników').selectOption('archived')
  await card(page).getByRole('button',{name:'Przywróć'}).click(); await expect(card(page)).toHaveCount(0)
  await page.getByLabel('Widok pracowników').selectOption('all'); await expect(card(page)).toBeVisible()
  await expect(card(page).getByText(/^Nieaktywny ·/)).toBeVisible()
  await expect(card(page).getByRole('button',{name:'Aktywuj',exact:true})).toBeVisible()
  expect(calls.map(c=>c.p_action)).toEqual(['deactivate','activate','archive','restore'])
})
test('failed archive keeps employee and confirmation, with generic error', async ({page}) => {
  const state=await setup(page); state.fail(); await page.goto('/')
  await page.getByRole('button',{name:'👥 Pracownicy'}).click()
  await card(page).getByRole('button',{name:'Usuń',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Usuń konto'}).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Nie udało się')
  await expect(page.getByText('sensitive internal failure')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button',{name:'Anuluj'}).click()
  await expect(card(page)).toBeVisible()
})
test('plan request orders by plan date then creation and id, keeping location restriction', async ({page}) => {
  await setup(page); await page.goto('/')
  await page.getByRole('button',{name:'Lokal A',exact:true}).click()
  await expect(page.getByRole('heading',{name:'📋 Zaplanowane plany'})).toBeVisible()
  const dates = await page.locator('.produkty .produkt strong').allTextContents()
  expect(dates[0]).toContain('30.09.2026'); expect(dates[1]).toContain('29.09.2026')
})
