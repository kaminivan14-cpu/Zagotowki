// Offline synthetic PostgreSQL test. Container has --network none, no host ports.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { productionFixture } from './fixtures/production-schema.mjs'
const database=`upgrade_test_${Date.now()}`,container='zagotowki-upgrade-test'
function sql(query, db=database) {
 return new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'])
  let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x)
  p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));p.stdin.end(query)
 })
}
let checks=0
const equal=(actual,expected)=>{assert.equal(actual,expected);checks++}
const denied=async query=>{await assert.rejects(sql(query));checks++}
const read=n=>readFile(new URL(`../supabase/upgrades/production/${n}`,import.meta.url),'utf8')
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const as=n=>`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid(n)}',false);`
const unmodified=async()=>{
 equal(await sql(`SELECT bool_and((to_jsonb(e)-'auth_user_id'-'pin_legacy'-'archived_at')=s.original)
 FROM public."Employees" e JOIN test_snapshot s ON s.id=e.id`),'t')
 equal(await sql(`SELECT bool_and(convert_to(e.pin_hash,'UTF8')=convert_to(s.original->>'pin_hash','UTF8'))
 FROM public."Employees" e JOIN test_snapshot s ON s.id=e.id`),'t')
}
await sql(`CREATE DATABASE ${database}`,'postgres')
try {
 await sql(`DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}',
 email_confirmed_at timestamptz,encrypted_password text,last_sign_in_at timestamptz,banned_until timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 CREATE PUBLICATION supabase_realtime;`)
 await productionFixture(sql)
 await sql(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'A',true),(2,'B',true);
 INSERT INTO public."Employees"(id,name,role,location_id,active,pin_hash) VALUES
 (1,'Synthetic admin','administrator',NULL,true,extensions.crypt('919191',extensions.gen_salt('bf',6))),
 (2,'Synthetic manager','manager',1,true,extensions.crypt('002222',extensions.gen_salt('bf',6))),
 (3,'Synthetic chef','su-chef',1,true,extensions.crypt('00003333',extensions.gen_salt('bf',6))),
 (4,'Synthetic employee','employee',1,true,extensions.crypt('0004',extensions.gen_salt('bf',6))),
 (5,'Synthetic inactive','employee',2,false,extensions.crypt('000005',extensions.gen_salt('bf',6)));
 ALTER TABLE public."Employees" ALTER COLUMN id RESTART WITH 100;
 CREATE TABLE test_snapshot AS SELECT id,to_jsonb(e) AS original FROM public."Employees" e;
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active'),(2,2,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active');
 INSERT INTO public."Plan_items"(id,plan_id,nazwa,ilosc,jednostka,employee_id) VALUES(1,1,'Synthetic',1,'g',4);`)
 equal(await sql("SET ROLE anon; SELECT id FROM public.login_employee('002222')"),'2')
 await sql(await read('01_prepare.sql')); await sql(await read('02_provisioning_api.sql'))
 await denied(await read('01_prepare.sql'))
 await unmodified()
 await sql("BEGIN; SET ROLE anon; SELECT public.create_employee(1,'Synthetic pre-cutover','employee',1,'00444444'); ROLLBACK;")
 checks++
 equal(await sql("SET ROLE anon; SELECT id FROM public.login_employee('00003333')"),'3')
 equal(await sql("SELECT count(*) FROM public.upgrade_readiness() WHERE NOT ready"),'5')
 const cutover=await read('03_cutover.sql')
 await denied(cutover)
 await denied("SELECT set_config('app.rollout_frontend_release','test-ready-release',false);"+cutover)
 equal(await sql("SELECT phase FROM app_private.production_upgrade"),'prepared')
 equal(await sql("SET ROLE anon; SELECT id FROM public.login_employee('002222')"),'2')
 await denied('SET ROLE anon; SELECT * FROM public.upgrade_candidates()')
 await denied(`SET ROLE authenticated; SELECT public.upgrade_pin_prepare(2)`)
 await sql(`INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password,last_sign_in_at)
 VALUES('${uid(1)}','synthetic-admin@example.test',now(),'test-only-password-hash',now());`)
 await sql(`SET ROLE service_role; SELECT public.upgrade_link_administrator(1,'${uid(1)}'); SELECT public.upgrade_link_administrator(1,'${uid(1)}')`)
 await denied(`SET ROLE service_role; SELECT public.upgrade_pin_prepare(1)`)
 for(const n of [2,3,4,5]) {
  const row=JSON.parse(await sql(`SET ROLE service_role; SELECT row_to_json(x) FROM public.upgrade_pin_prepare(${n}) x`))
  equal(JSON.parse(await sql(`SET ROLE service_role; SELECT row_to_json(x) FROM public.upgrade_pin_prepare(${n}) x`)).provisioning_id,row.provisioning_id)
  await sql(`INSERT INTO auth.users(id,email,raw_app_meta_data,email_confirmed_at) VALUES('${uid(n)}','${row.email}',
   jsonb_build_object('pin_employee_id','${n}','pin_provisioning_id','${row.provisioning_id}'),now())`)
  // Simulate crash after Auth create: repeated preparation recovers the exact account.
  equal(JSON.parse(await sql(`SET ROLE service_role; SELECT row_to_json(x) FROM public.upgrade_pin_prepare(${n}) x`)).auth_user_id,uid(n))
  await Promise.all([1,2].map(()=>sql(`SET ROLE service_role; SELECT public.upgrade_pin_finish(${n},'${uid(n)}')`)))
  checks++
 }
 await unmodified()
 await denied(`SET ROLE service_role; SELECT public.upgrade_pin_finish(2,'${uid(3)}')`)
 await denied(`SET ROLE service_role; SELECT public.upgrade_link_administrator(1,'${uid(2)}')`)
 equal(await sql('SELECT count(*) FROM auth.users'),'5')
 equal(await sql("SELECT count(*) FROM public.upgrade_readiness() WHERE reason='LOGIN_NOT_VERIFIED'"),'3')
 await denied("SELECT set_config('app.rollout_frontend_release','test-ready-release',false);"+cutover)
 // Apply the additive readiness patch to the already-prepared schema.
 const coveragePatch=await read('02b_readiness_coverage.sql')
 await sql(coveragePatch); await sql(coveragePatch)
 await unmodified()
 equal(await sql('SELECT count(*) FROM public.upgrade_readiness() WHERE NOT ready'),'0')
 equal(await sql("SELECT count(*) FROM public.upgrade_login_coverage() WHERE login_status='LOGIN_NOT_TESTED'"),'4')
 equal(await sql("SELECT login_status FROM public.upgrade_login_coverage() WHERE employee_id=1"),'LOGIN_TESTED')
 for(const role of ['anon','authenticated']) {
  await denied(`SET ROLE ${role}; SELECT * FROM public.upgrade_login_coverage()`)
  await denied(`SET ROLE ${role}; SELECT * FROM public.upgrade_readiness()`)
 }
 // Each conflict must block technical readiness and CUTOVER, without changing fixtures.
 for(const mutation of [
  `UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${uid(2)}'`,
  `UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${uid(1)}'`,
  `UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${uid(5)}'`,
  `UPDATE app_private.pin_accounts SET auth_user_id=NULL WHERE employee_id=3`,
  `UPDATE auth.users SET raw_app_meta_data='{}' WHERE id='${uid(4)}'`,
  `UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${uid(2)}'`,
  `UPDATE public."Employees" SET role='invalid' WHERE id=4`,
  `UPDATE public."Locations" SET active=false WHERE id=1`
 ]) {
  equal(await sql(`BEGIN; ${mutation}; SELECT EXISTS(SELECT FROM public.upgrade_readiness() WHERE NOT ready); ROLLBACK;`),'t')
  await denied(`BEGIN; ${mutation}; SELECT set_config('app.rollout_frontend_release','test-ready-release',false);`+cutover)
  equal(await sql('SELECT phase FROM app_private.production_upgrade'),'prepared')
 }
 equal(await sql(`BEGIN; UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${uid(2)}'; SELECT reason FROM public.upgrade_readiness() WHERE employee_id=2; ROLLBACK;`),'AUTH_BANNED')
 equal(await sql(`SELECT count(*) FROM auth.users WHERE last_sign_in_at IS NULL`),'4')
 await unmodified()
 const login=async(pin,source)=>{
  const attempt=randomUUID(),key=String(source).padStart(64,'0')
  equal(await sql(`SET ROLE service_role; SELECT public.pin_reserve('${key}','${attempt}')`),'t')
  return sql(`SET ROLE service_role; SELECT employee_id FROM public.pin_verify('${attempt}','${key}','${pin}')`)
 }
 equal(await login('002222',1),'2');equal(await login('00003333',2),'3');equal(await login('0004',3),'4')
 equal(await login('919191',4),'');equal(await login('000005',5),'')
 // Hosted Auth sign-in timestamp is represented explicitly, never inferred from provisioning.
 await sql(`UPDATE auth.users SET last_sign_in_at=now() WHERE id='${uid(2)}'`)
 equal(await sql('SELECT count(*) FROM public.upgrade_readiness() WHERE NOT ready'),'0')
 equal(await sql("SELECT login_status FROM public.upgrade_login_coverage() WHERE employee_id=2"),'LOGIN_TESTED')
 equal(await sql("SELECT count(*) FROM public.upgrade_login_coverage() WHERE employee_id IN (3,4,5) AND login_status='LOGIN_NOT_TESTED'"),'3')
 await sql("SELECT set_config('app.rollout_frontend_release','test-ready-release',false);"+cutover)
 await unmodified()
 equal(await sql('SELECT phase FROM app_private.production_upgrade'),'cutover')
 equal(await sql("SELECT count(*) FROM public.upgrade_login_coverage() WHERE employee_id IN (3,4,5) AND login_status='LOGIN_NOT_TESTED'"),'3')
 for(const sig of ['login_employee(text)','create_employee(bigint,text,text,bigint,text)','change_employee_pin(bigint,bigint,text)',
 'get_employees(bigint)','update_employee(bigint,bigint,text,text,bigint)','set_employee_active(bigint,bigint,boolean)'])
  for(const role of ['anon','authenticated']) equal(await sql(`SELECT has_function_privilege('${role}','public.${sig}','EXECUTE')`),'f')
 await denied("SET ROLE anon; SELECT * FROM public.\"Plans\"")
 await denied('SET ROLE authenticated; SELECT pin_hash FROM public."Employees"')
 equal(await sql(`SELECT has_sequence_privilege('anon','public."Employees_id_seq"','USAGE')`),'f')
 equal(await sql(`${as(4)} SELECT string_agg(id::text,',') FROM public."Plans"`),`${uid(4)}\n1`)
 equal(await sql(`${as(1)} SELECT count(*) FROM public."Plans"`),`${uid(1)}\n2`)
 await denied(`${as(4)} SELECT public.start_plan_item(2,1)`)
 await sql(`${as(4)} SELECT public.start_plan_item(4,1); SELECT public.complete_plan_item(4,1)`)
 equal(await sql('SELECT employee_id FROM public."Plan_items" WHERE id=1'),'4')
 equal(await login('002222',6),'2');equal(await login('00003333',7),'3');equal(await login('0004',8),'4')
 await sql(`${as(1)} SELECT public.auth_employee_lifecycle(4,'deactivate')`)
 equal(await login('0004',9),'')
 equal(await sql(`${as(4)} SELECT count(*) FROM public."Plans"`),`${uid(4)}\n0`)
 await sql(`${as(1)} SELECT public.auth_employee_lifecycle(4,'activate')`)
 await unmodified()
 // New users: assignment accepts exactly four digits, no legacy exemption.
 const employee=await sql(`${as(1)} SELECT public.auth_save_employee(NULL,'New employee','employee',1,true)`)
 const newId=employee.split('\n').at(-1)
 const row=JSON.parse(await sql(`SET ROLE service_role; SELECT row_to_json(x) FROM public.pin_prepare('${uid(1)}',${newId}) x`))
 await sql(`INSERT INTO auth.users(id,email,raw_app_meta_data,email_confirmed_at) VALUES('${uid(6)}','${row.email}',
 jsonb_build_object('pin_employee_id','${newId}','pin_provisioning_id','${row.provisioning_id}'),now())`)
 await denied(`SET ROLE service_role; SELECT public.pin_finish('${uid(1)}',${newId},'${uid(6)}','123456','${randomUUID()}')`)
 await sql(`SET ROLE service_role; SELECT public.pin_finish('${uid(1)}',${newId},'${uid(6)}','0006','${randomUUID()}')`)
 equal(await login('0006',10),newId)
 equal(await sql(`SELECT pin_legacy FROM public."Employees" WHERE id=${newId}`),'f')
 await unmodified()
 await denied(cutover)
 await sql(await read('04_verify.sql'))
 checks++
 equal(await sql('SELECT count(*) FROM public."Employees" e JOIN test_snapshot s ON s.id=e.id WHERE e.pin_hash IS DISTINCT FROM s.original->>\'pin_hash\''),'0')
 console.info(`Upgrade PostgreSQL: ${checks} checks PASS; all 5 legacy hashes byte/text identical at PREPARE, PROVISION and CUTOVER; zero hash values emitted.`)
} finally { await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres') }
