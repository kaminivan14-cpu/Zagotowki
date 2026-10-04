import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleAllowed, generatorAllowed } from '../src/orders/environment.js'
import { productionReleaseSteps, productionReleaseSql } from '../scripts/lib/production-release.mjs'
test('Production module policy denies all non-admin/manager roles even with spoofed capabilities',()=>{
 for(const role of ['administrator','manager','su-chef','shift-manager','sushi-master','crafter','employee','director','expert','specialist','owner']){
  for(const module of ['orders','tasks']){
   assert.equal(moduleAllowed('production',role,module,[`${module}.access`]),['administrator','manager'].includes(role))
   assert.equal(moduleAllowed('production',role,module,[]),false)
   assert.equal(moduleAllowed('uat',role,module,[`${module}.access`]),true)
  }
  assert.equal(moduleAllowed('production',role,'production',['production.access']),true)
 }
})
test('Generator requires UAT and capability, production always denies',()=>{
 for(const environment of ['uat','production','development'])for(const capability of [true,false])assert.equal(generatorAllowed(environment,capability?['orders.test.generate']:[]),environment==='uat'&&capability)
})
test('Production upgrade excludes conversion and test seed, commits policy atomically',async()=>{
 const steps=await productionReleaseSteps(),names=steps.map(s=>s.name)
 assert.equal(names[0],'upgrades/production/05_orders_roles.sql')
 assert.equal(names.at(-1),'upgrades/production/06_release_policy.sql')
 for(const name of ['202610010002_crafter.sql','202610030002_orders_uat_generator.sql','202610060002_new_menu_process.sql'])assert.equal(names.some(n=>n.endsWith(name)),false)
 const sql=await productionReleaseSql()
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1)
 assert.equal(sql.includes("SET role='crafter' WHERE role='employee'"),false)
})
