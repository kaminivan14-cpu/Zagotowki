import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const tables = ['Employees', 'Locations', 'Plans', 'Plan_items', 'Products', 'Recipe_ingredients']
const uid = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('empty database: BASE -> Auth 001 -> Auth 002 -> UAT seed', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const rows = async (sql, params) => (await db.query(sql, params)).rows
  const denied = async (sql, code) => assert.rejects(db.query(sql), e => !code || e.code === code)
  const as = async (n, role = 'authenticated') => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${n ? uid(n) : ''}',false); SET ROLE ${role}`)
  }
  // Only Supabase platform scaffolding: no application tables, RPCs or audit fixtures.
  // Deliberately permissive platform defaults test that BASE closes inherited grants.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
    CREATE PUBLICATION supabase_realtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated;`)
  assert.equal((await rows("SELECT * FROM pg_tables WHERE schemaname='public'")).length, 0)
  await db.exec(await read('../supabase/migrations/202609220001_base.sql'))
  for (const role of ['anon', 'authenticated']) {
    await as(null, role)
    for (const table of tables) await denied(`SELECT * FROM public."${table}"`, '42501')
    await denied('SELECT public.start_plan_item(1,1)', '42501')
    await denied(`SELECT nextval('public."Employees_id_seq"')`, '42501')
  }
  await db.exec('RESET ROLE')
  await db.exec(await read('../supabase/migrations/202609230001_auth.sql'))
  await db.exec(await read('../supabase/migrations/202609230002_auth_production.sql'))
  const seed = await read('../supabase/seeds/uat.sql')
  assert.doesNotMatch(seed, /pin_hash|auth_user_id|INSERT INTO\s+auth\.|session_replication_role/i)
  await db.exec(seed)
  assert.deepEqual((await rows(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity ORDER BY relname`)).map(r => r.relname), [...tables].sort())
  assert.deepEqual((await rows(`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'`)).map(r => r.tablename), ['Plan_items'])
  assert.equal((await rows(`SELECT * FROM information_schema.columns WHERE table_schema='public' AND column_name='pin_hash'`)).length, 0)
  assert.equal((await rows('SELECT * FROM auth.users')).length, 0)
  assert.equal((await rows('SELECT * FROM public."Employees" WHERE auth_user_id IS NOT NULL')).length, 0)
  for (const [table, count] of [['Products',123],['Recipe_ingredients',284],['Locations',2],['Employees',9],['Plans',6],['Plan_items',18]]) {
    assert.equal((await rows(`SELECT count(*)::int AS n FROM public."${table}"`))[0].n, count, table)
  }
  // Fingerprints calculated independently from the approved backup catalog, not from seed SQL.
  // Normalize numeric representation only; names, NULLs and units must remain exact.
  const products = (await rows('SELECT external_id,name,gramatura,base_unit FROM public."Products" ORDER BY external_id'))
    .map(r => [Number(r.external_id),r.name,Number(r.gramatura),r.base_unit])
  const ingredients = (await rows('SELECT product_external_id,ingredient_external_id,ingredient_name,netto,brutto,ingredient_unit FROM public."Recipe_ingredients" ORDER BY product_external_id,ingredient_external_id'))
    .map(r => [Number(r.product_external_id),Number(r.ingredient_external_id),r.ingredient_name,
      r.netto===null ? null : Number(r.netto),r.brutto===null ? null : Number(r.brutto),r.ingredient_unit])
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  assert.equal(digest(products),'1fa2b22d76204aa0eda3b2c9e7bc66d27a6b810d47133eba0eb60627c76ae02b')
  assert.equal(digest(ingredients),'d8270e332c4ebf2c52c570d212461c836e56508fe350fda859d17ee7a0c4d1b1')
  const constraints = await rows(`SELECT contype,count(*)::int AS n FROM pg_constraint
    WHERE conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r')
    GROUP BY contype`)
  const counts = Object.fromEntries(constraints.map(r => [r.contype,r.n]))
  for (const [type,n] of Object.entries({p:6,f:7,u:4,c:4})) assert.equal(counts[type],n,`constraint ${type}`)
  assert.equal((await rows(`SELECT * FROM information_schema.columns WHERE table_schema='public' AND column_name='id' AND is_identity='YES'`)).length,6)
  for (const signature of [
    'create_production_plan(bigint,bigint,date,jsonb)', 'update_production_plan(bigint,bigint,jsonb)',
    'complete_production_plan(bigint,bigint)', 'reopen_production_plan(bigint,bigint)',
    'delete_production_plan(bigint,bigint)', 'delete_plan_item(bigint,bigint)',
    'start_plan_item(bigint,bigint)', 'complete_plan_item(bigint,bigint)',
    'add_plan_item(bigint,bigint,text,numeric,text,text,bigint)',
    'add_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone)',
    'update_plan_item(bigint,bigint,text,numeric,text,text,bigint)',
    'update_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone)',
    'auth_employee_profile()', 'auth_list_employees()',
    'auth_save_employee(bigint,text,text,bigint,boolean)', 'auth_employee_names(bigint,bigint[])',
    'auth_link_employee(uuid,bigint,uuid)', 'set_updated_at()',
  ]) assert.ok((await rows('SELECT to_regprocedure($1) AS f',[`public.${signature}`]))[0].f, signature)
  assert.equal((await rows(`SELECT * FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
    ('public."Products"'::regclass,'public."Recipe_ingredients"'::regclass)`)).length,2)
  await denied(`INSERT INTO public."Locations"(id) VALUES(1)`, '23505')
  await denied(`INSERT INTO public."Plans"(location_id,plan_date) VALUES(999,CURRENT_DATE)`, '23503')
  await denied(`INSERT INTO public."Plans"(location_id,plan_date) SELECT location_id,plan_date FROM public."Plans" LIMIT 1`, '23505')
  await denied(`INSERT INTO public."Products"(external_id,name,gramatura) SELECT external_id,name,gramatura FROM public."Products" LIMIT 1`, '23505')
  await denied(`INSERT INTO public."Recipe_ingredients"(product_external_id,ingredient_external_id,ingredient_name)
    SELECT product_external_id,ingredient_external_id,ingredient_name FROM public."Recipe_ingredients" LIMIT 1`, '23505')
  await denied(`UPDATE public."Products" SET base_unit='kg'`, '23514')
  await denied(`UPDATE public."Recipe_ingredients" SET ingredient_unit='l'`, '23514')
  await denied(`INSERT INTO public."Employees"(name,role,location_id) VALUES('Invalid','owner',1)`, '23514')
  await denied(`INSERT INTO public."Employees"(name,role) VALUES('Invalid','employee')`, '23514')
  await denied(`INSERT INTO public."Plan_items"(employee_id) VALUES(999)`, '23503')
  await denied(`INSERT INTO public."Plan_items"(product_external_id) VALUES(-999)`, '23503')
  await denied(`INSERT INTO public."Recipe_ingredients"(product_external_id,ingredient_external_id,ingredient_name) VALUES(-999,1,'Invalid')`, '23503')
  assert.equal((await rows(`SELECT * FROM public."Plan_items" WHERE
    gotowe IS DISTINCT FROM (completed_at IS NOT NULL) OR (completed_at IS NOT NULL AND
    (started_at IS NULL OR employee_id IS NULL OR completed_at<started_at))`)).length,0)
  // Server importer rights, update triggers and default identity values work without client grants.
  await as(null,'service_role')
  await db.exec(`BEGIN;
    INSERT INTO public."Products"(external_id,name,gramatura,updated_at) VALUES(-1,'UAT trigger',1,'2000-01-01');
    INSERT INTO public."Recipe_ingredients"(product_external_id,ingredient_external_id,ingredient_name,updated_at)
      VALUES(-1,-1,'UAT trigger','2000-01-01');
    UPDATE public."Products" SET name='UAT updated' WHERE external_id=-1;
    UPDATE public."Recipe_ingredients" SET ingredient_name='UAT updated' WHERE product_external_id=-1;`)
  for (const table of ['Products','Recipe_ingredients']) {
    const key = table==='Products' ? 'external_id' : 'product_external_id'
    assert.equal((await rows(`SELECT updated_at>'2000-01-02'::timestamptz AS changed FROM public."${table}" WHERE ${key}=-1`))[0].changed,true)
  }
  await db.exec('ROLLBACK; RESET ROLE')
  // Seeding twice must fail without modifying fixtures.
  await assert.rejects(db.exec(seed), /requires empty application tables/)
  await db.exec('ROLLBACK')
  assert.equal((await rows('SELECT count(*)::int AS n FROM public."Plan_items"'))[0].n,18)
  // Only the test creates synthetic Auth identities; seed intentionally leaves every account unlinked.
  for (let n=1;n<=8;n++) {
    await db.query('INSERT INTO auth.users(id) VALUES($1)',[uid(n)])
    await db.query('UPDATE public."Employees" SET auth_user_id=$1 WHERE id=$2',[uid(n),n])
  }
  await as(null,'anon')
  for (const table of tables) await denied(`SELECT * FROM public."${table}"`, '42501')
  await denied('SELECT public.auth_employee_profile()', '42501')
  await denied('SELECT public.start_plan_item(4,4)', '42501')
  await db.exec('RESET ROLE')
  assert.equal((await rows(`SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND has_function_privilege('anon',p.oid,'EXECUTE')`)).length,0)
  // Employee gets only today's active plan in their location, including child item RLS.
  await as(4)
  assert.deepEqual((await rows('SELECT id FROM public."Plans"')).map(r=>r.id),[2])
  assert.deepEqual((await rows('SELECT DISTINCT plan_id FROM public."Plan_items"')).map(r=>r.plan_id),[2])
  await denied('SELECT * FROM public."Employees"','42501')
  await denied('SELECT public.auth_list_employees()','42501')
  await denied('UPDATE public."Plan_items" SET gotowe=true','42501')
  await denied('SELECT public.start_plan_item(2,4)','42501') // spoofed requester
  await denied('SELECT public.start_plan_item(4,13)','42501') // foreign location
  await denied('SELECT public.start_plan_item(4,7)','42501') // tomorrow
  await denied('SELECT public.complete_plan_item(4,1)','42501') // yesterday
  await denied('SELECT public.complete_plan_item(4,4)') // must start first
  await rows('SELECT public.start_plan_item(4,4)')
  await denied('SELECT public.start_plan_item(4,4)')
  await rows('SELECT public.complete_plan_item(4,4)')
  await denied('SELECT public.complete_plan_item(4,4)')
  assert.deepEqual((await rows('SELECT gotowe,employee_id,started_at IS NOT NULL AS started,completed_at IS NOT NULL AS completed FROM public."Plan_items" WHERE id=4'))[0],
    {gotowe:true,employee_id:4,started:true,completed:true})
  for (const n of [2,3,5,6,1]) {
    await as(n)
    const expected = n===1 ? [1,2,3,4,5,6] : n<=3 ? [1,2,3] : [4,5,6]
    assert.deepEqual((await rows('SELECT id FROM public."Plans" ORDER BY id')).map(r=>r.id),expected)
    if (n!==1) await denied(`SELECT public.complete_production_plan(${n},${n<=3 ? 5 : 2})`)
    await denied(`SELECT public.start_plan_item(${n},${n<=3 ? 7 : 16})`,'42501')
  }
  await as(3)
  await denied("SELECT public.auth_save_employee(NULL,'UAT Forbidden','employee',1,true)",'42501')
  await rows('SELECT public.complete_production_plan(3,2)')
  await as(4)
  assert.equal((await rows('SELECT * FROM public."Plans"')).length,0)
  await denied('SELECT public.complete_plan_item(4,5)','42501')
  await as(2)
  await rows('SELECT public.reopen_production_plan(2,2)')
  // Exercise baseline RPC bodies after Auth wrapping, not merely their existence.
  const planId = (await rows(`SELECT public.create_production_plan(2,1,
    (now() AT TIME ZONE 'Europe/Warsaw')::date+2,'[]'::jsonb) AS id`))[0].id
  assert.ok(planId>6)
  await rows(`SELECT public.update_production_plan(2,${planId},'[]'::jsonb)`)
  const itemId = (await rows(`SELECT public.add_plan_item(2,${planId},'UAT RPC',1,'g','normalny',NULL,'UAT note','12:00'::time) AS id`))[0].id
  await rows(`SELECT public.update_plan_item(2,${itemId},'UAT edited',2,'g','normalny',NULL,NULL,NULL::time)`)
  assert.equal((await rows(`SELECT nazwa FROM public."Plan_items" WHERE id=${itemId}`))[0].nazwa,'UAT edited')
  await rows(`SELECT public.delete_plan_item(2,${itemId})`)
  await rows(`SELECT public.delete_production_plan(2,${planId})`)
  const created = (await rows("SELECT public.auth_save_employee(NULL,'UAT New','employee',1,true) AS id"))[0].id
  assert.ok(created>9) // identity sequence after explicit seed IDs
  await denied("SELECT public.auth_save_employee(NULL,'UAT Forbidden','administrator',NULL,true)",'42501')
  await as(1)
  await rows('SELECT public.start_plan_item(1,13)') // admin without assigned location
  await rows('SELECT public.complete_plan_item(1,13)')
  assert.equal((await rows('SELECT employee_id FROM public."Plan_items" WHERE id=13'))[0].employee_id,1)
  for (const n of [8,9]) {
    await as(n)
    assert.equal((await rows('SELECT * FROM public."Plans"')).length,0)
    await denied(`SELECT public.start_plan_item(${n},4)`,'42501')
  }
})
