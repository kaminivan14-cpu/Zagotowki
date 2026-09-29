import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const read = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const uid = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
test('employee lifecycle: permissions, history, archive invariant and existing-session RLS', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE PUBLICATION supabase_realtime;`)
  for (const n of ['202609220001_base.sql','202609230001_auth.sql','202609230002_auth_production.sql','202609300001_employee_archive.sql']) await db.exec(await read(n))
  await db.exec(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'A',true),(2,'B',true);
    INSERT INTO auth.users(id) VALUES('${uid(1)}'),('${uid(2)}'),('${uid(3)}');
    INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES
      (1,'Admin','administrator',NULL,true,'${uid(1)}'),(2,'Manager','manager',1,true,'${uid(2)}'),(3,'Employee','employee',1,true,'${uid(3)}');
    INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active');
    INSERT INTO public."Plan_items"(id,plan_id,employee_id) VALUES(1,1,3);`)
  const as = n => db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid(n)}',false); SET ROLE authenticated`)
  const call = (id, action) => db.query('SELECT public.auth_employee_lifecycle($1,$2)',[id, action])
  const rows = async sql => (await db.query(sql)).rows
  await as(2); await assert.rejects(call(3,'archive'),{code:'42501'})
  await as(1); await assert.rejects(call(1,'archive'),{code:'42501'})
  await call(3,'deactivate'); await call(3,'deactivate')
  await as(3); assert.equal((await rows('SELECT * FROM public.auth_employee_profile()')).length,0)
  assert.equal((await rows('SELECT * FROM public."Plans"')).length,0)
  await assert.rejects(db.query('SELECT public.start_plan_item(3,1)'),{code:'42501'})
  await as(1); await call(3,'activate'); await call(3,'activate')
  await as(3); assert.equal((await rows('SELECT * FROM public."Plans"')).length,1)
  await as(1); await call(3,'archive')
  const archived = (await rows('SELECT * FROM public.auth_list_employees()')).find(e => e.id === 3)
  assert.equal(archived.active,false); assert.ok(archived.archived_at)
  await call(3,'archive'); assert.deepEqual((await rows('SELECT * FROM public.auth_list_employees()')).find(e=>e.id===3),archived)
  await assert.rejects(call(3,'activate'),{code:'42501'})
  await assert.rejects(db.query("SELECT public.auth_save_employee(3,'Employee','employee',1,true)"),{code:'42501'})
  await as(2); assert.equal((await rows('SELECT * FROM public.auth_list_employees()')).some(e=>e.id===3),false)
  await as(3); assert.equal((await rows('SELECT * FROM public."Plan_items"')).length,0)
  await as(1); assert.deepEqual(await rows('SELECT employee_id FROM public."Plan_items"'),[{employee_id:3}])
  assert.deepEqual(await rows('SELECT * FROM public.auth_employee_names(1,ARRAY[3]::bigint[])'),[{id:3,name:'Employee'}])
  await db.exec('RESET ROLE')
  await assert.rejects(db.query('UPDATE public."Employees" SET active=true WHERE id=3'),{code:'23514'})
  await as(1); await call(3,'restore'); await call(3,'restore')
  const restored = (await rows('SELECT * FROM public.auth_list_employees()')).find(e=>e.id===3)
  assert.equal(restored.active,false); assert.equal(restored.archived_at,null); assert.equal(restored.auth_user_id,uid(3))
  await call(3,'activate'); await call(3,'restore')
  await as(3); assert.equal((await rows('SELECT * FROM public.auth_employee_profile()')).length,1)
  await as(1); assert.equal((await rows('SELECT * FROM public.auth_list_employees()')).length,3)
  await db.exec('RESET ROLE; SET ROLE anon'); await assert.rejects(call(3,'archive'),{code:'42501'})
})

test('existing plans: plan_date DESC wins over creation time; creation/id break ties without writes', async t => {
  const db=new PGlite(); t.after(()=>db.close())
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE PUBLICATION supabase_realtime;')
  await db.exec(await read('202609220001_base.sql'))
  await db.exec(`INSERT INTO public."Locations"(id,name) VALUES(1,'A'),(2,'B'),(3,'C');
    INSERT INTO public."Plans"(id,location_id,plan_date,created_at) VALUES
      (1,1,'2026-09-27','2026-09-30'),(2,1,'2026-09-29','2026-09-01'),
      (3,1,'2026-09-28','2026-09-29'),(4,2,'2026-09-29','2026-09-02'),
      (5,3,'2026-09-29','2026-09-02');`)
  const before=(await db.query('SELECT * FROM public."Plans" ORDER BY id')).rows
  const ordered=(await db.query('SELECT id FROM public."Plans" ORDER BY plan_date DESC,created_at DESC NULLS LAST,id DESC')).rows
  assert.deepEqual(ordered.map(p=>p.id),[5,4,2,3,1])
  assert.deepEqual((await db.query('SELECT * FROM public."Plans" ORDER BY id')).rows,before)
})
