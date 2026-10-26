import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {auditDatabase,uid} from './helpers/audit-db.mjs'
import {moduleAllowed} from '../src/orders/environment.js'
const roles=['owner','director','expert','specialist']
test('Work Production entry adds only tasks.access and preserves scope/RPC guards',async()=>{
 const db=await auditDatabase()
 try{
  await db.exec('DROP TRIGGER employees_role_alias ON public."Employees";')
  await db.exec(await readFile('tests/fixtures/work-access-production-policy.sql','utf8'))
  const matrix=()=>db.query(`SELECT role,permission,app_private.role_has_permission(role,permission) allowed FROM (SELECT DISTINCT role FROM app_private.role_permissions) r CROSS JOIN (SELECT DISTINCT permission FROM app_private.role_permissions)p ORDER BY role,permission`)
  const before=(await matrix()).rows
  const migration=await readFile('supabase/upgrades/production/11_work_module_access.sql','utf8')
  await db.exec(migration);await db.exec(migration)
  await db.exec(await readFile('tests/work-access-smoke.sql','utf8'))
  const after=(await matrix()).rows,unchanged=x=>!roles.includes(x.role)||x.permission!=='tasks.access'
  assert.deepEqual(after.filter(unchanged),before.filter(unchanged))
  for(const role of ['administrator','manager',...roles,'crafter']){
   await db.exec(`UPDATE public."Employees" SET role='${role}',location_id=1 WHERE id=1; SET request.jwt.claim.sub='${uid(1)}'; SET ROLE authenticated;`)
   const allowed=role!=='crafter',caps=(await db.query('SELECT public.auth_capabilities() cap')).rows.map(x=>x.cap)
   assert.equal(caps.includes('tasks.access'),allowed,role)
   assert.equal(moduleAllowed('production',role,'tasks',caps),allowed)
   if(allowed){
    for(const rpc of ['tasks_context()','tasks_assignable_people()','tasks_execution_state()'])await db.query(`SELECT public.${rpc}`)
    if(roles.includes(role)){
     for(const rpc of ['tasks_admin_directory()','tasks_processes()'])await assert.rejects(db.query(`SELECT public.${rpc}`),/TASKS_DENIED/)
     assert.deepEqual((await db.query('SELECT public.tasks_assignable_people() people')).rows[0].people.map(x=>x.id),[1])
     for(const cap of ['tasks.admin','tasks.assign','tasks.plan.scope','tasks.report.scope','processes.read'])assert.ok(!caps.includes(cap),role+cap)
    }
   }else await assert.rejects(db.query('SELECT public.tasks_context()'),/TASKS_DENIED/)
   await db.exec('RESET ROLE')
  }
 }finally{await db.close()}
})
