// Real isolated PostgreSQL/pgcrypto test. No network, no Supabase credentials.
// Start the documented local container first. Only the named test database is touched.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const container = 'zagotowki-pin-test', database = `pin_test_${Date.now()}`
function sql(query, db = database) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'])
    let out='',err=''
    p.stdout.on('data', b=>out+=b); p.stderr.on('data', b=>err+=b)
    p.on('error',reject); p.on('close', code=>code?reject(new Error(err)):resolve(out.trim()))
    p.stdin.end(query)
  })
}
const uid = n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const source = n=>String(n).padStart(64,'0')
const actor = uid(1)
let checks=0
const equal=(actual,expected)=>{assert.equal(actual,expected);checks++}
const denied=async query=>{await assert.rejects(sql(query));checks++}
await sql(`CREATE DATABASE ${database}`,'postgres')
try {
 await sql(`DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
 END $$;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 CREATE PUBLICATION supabase_realtime;`)
 for(const name of ['202609220001_base.sql','202609230001_auth.sql','202609230002_auth_production.sql','202609290001_employee_pin.sql']) {
  await sql(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
 }
 await sql(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'A',true),(2,'B',true);
 INSERT INTO auth.users(id,email) VALUES('${actor}','admin@example.invalid');
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES
 (1,'Admin','administrator',null,true,'${actor}'),(2,'Manager','manager',1,true,null),
 (3,'Chef','su-chef',1,true,null),(4,'Employee','employee',1,true,null),(5,'Employee B','employee',2,true,null);
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active'),(2,2,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active');`)
 for (let n=2;n<=5;n++) {
  const prepared=JSON.parse(await sql(`SELECT row_to_json(x) FROM public.pin_prepare('${actor}',${n}) x`))
  equal(JSON.parse(await sql(`SELECT row_to_json(x) FROM public.pin_prepare('${actor}',${n}) x`)).email,prepared.email)
  await sql(`INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('${uid(n)}','${prepared.email}',
    jsonb_build_object('pin_employee_id','${n}','pin_provisioning_id','${prepared.provisioning_id}'))`)
  equal(JSON.parse(await sql(`SELECT row_to_json(x) FROM public.pin_prepare('${actor}',${n}) x`)).auth_user_id,uid(n))
  const operation=randomUUID(), pin=String(n-1).padStart(4,'0')
  const finish=`SELECT public.pin_finish('${actor}',${n},'${uid(n)}','${pin}','${operation}')`
  await sql(finish); await sql(finish)
  equal(await sql(`SELECT count(*) FROM auth.users WHERE id='${uid(n)}'`),'1')
 }
 const login=async(pin,n=1)=>{
  const attempt=randomUUID();equal(await sql(`SELECT public.pin_reserve('${source(n)}','${attempt}')`),'t')
  return sql(`SELECT auth_user_id FROM public.pin_verify('${attempt}','${source(n)}','${pin}')`)
 }
 for(let n=2;n<=4;n++) equal(await login(String(n-1).padStart(4,'0'),n),uid(n))
 equal(await login('9999',6),'')
 for(const [i,pin] of ['123','12345','abcd'].entries()) equal(await login(pin,10+i),'')
 await sql('UPDATE public."Employees" SET active=false WHERE id=4')
 equal(await login('0003',7),'')
 equal(await sql(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid(4)}',false); SELECT count(*) FROM public."Plans"`),`${uid(4)}\n0`)
 await sql('UPDATE public."Employees" SET active=true WHERE id=4')
 equal(await sql(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid(4)}',false); SELECT string_agg(id::text,',') FROM public."Plans"`),`${uid(4)}\n1`)
 await denied(`UPDATE public."Employees" SET pin_hash=extensions.crypt('0000',extensions.gen_salt('bf',10)) WHERE id=1`)
 await denied(`SET ROLE anon; SELECT pin_hash FROM public."Employees"`)
 await denied(`SET ROLE authenticated; SELECT pin_hash FROM public."Employees"`)
 await denied(`SET ROLE authenticated; SELECT public.pin_reserve('${source(1)}',gen_random_uuid())`)
 await denied(`SET ROLE authenticated; SELECT * FROM app_private.pin_accounts`)
 await denied(`SELECT public.pin_prepare('${uid(2)}',4)`)
 await denied(`SELECT public.pin_finish('${actor}',4,'${uid(4)}','0001',gen_random_uuid())`)
 await sql(`SELECT public.pin_finish('${actor}',4,'${uid(4)}','0044',gen_random_uuid())`)
 // Reset preserves identity; previous PIN no longer verifies.
 await sql('TRUNCATE app_private.pin_attempts; DELETE FROM app_private.pin_sources')
 equal(await login('0003',1),'');equal(await login('0044',1),uid(4))
 // Missing link cannot issue identity, even for a previously provisioned profile.
 await sql('UPDATE public."Employees" SET pin_hash=null,auth_user_id=null WHERE id=5')
 equal(await login('0004',2),'')
 await sql('TRUNCATE app_private.pin_attempts; DELETE FROM app_private.pin_sources')
 const replay=randomUUID()
 equal(await sql(`SELECT public.pin_reserve('${source(29)}','${replay}')`),'t')
 equal(await sql(`SELECT public.pin_reserve('${source(29)}','${replay}')`),'f')
 equal(await sql(`SELECT auth_user_id FROM public.pin_verify('${replay}','${source(29)}','0001')`),uid(2))
 equal(await sql(`SELECT count(*) FROM public.pin_verify('${replay}','${source(29)}','0001')`),'0')
 await denied(`UPDATE public."Employees" SET pin_hash='plaintext' WHERE id=2`)
 for(const n of [2,3]) equal(await sql(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid(n)}',false); SELECT string_agg(id::text,',') FROM public."Plans"`),`${uid(n)}\n1`)
 await sql('TRUNCATE app_private.pin_attempts; DELETE FROM app_private.pin_sources')
 const results=await Promise.all(Array.from({length:12},()=>sql(`SELECT public.pin_reserve('${source(30)}','${randomUUID()}')`)))
 equal(results.filter(x=>x==='t').length,5)
 // Sliding 15-minute failure window: 5 earlier + 5 now, then persistent block.
 await sql("UPDATE app_private.pin_attempts SET created_at=clock_timestamp()-interval '2 minutes'")
 for(let n=0;n<5;n++) equal(await sql(`SELECT public.pin_reserve('${source(30)}','${randomUUID()}')`),'t')
 equal(await sql(`SELECT public.pin_reserve('${source(30)}','${randomUUID()}')`),'f')
 equal(await sql(`SELECT blocked_until>clock_timestamp() FROM app_private.pin_sources WHERE source='${source(30)}'`),'t')
 await sql('TRUNCATE app_private.pin_attempts; DELETE FROM app_private.pin_sources')
 const global=await Promise.all(Array.from({length:25},(_,n)=>sql(`SELECT public.pin_reserve('${source(100+n)}','${randomUUID()}')`)))
 equal(global.filter(x=>x==='t').length,20)
 // Two held verification slots force refusal of a third bcrypt operation.
 await sql('TRUNCATE app_private.pin_attempts; DELETE FROM app_private.pin_sources')
 const attempt=randomUUID();await sql(`SELECT public.pin_reserve('${source(40)}','${attempt}')`)
 const locks=sql('BEGIN; SELECT pg_advisory_xact_lock(20260929,2); SELECT pg_advisory_xact_lock(20260929,3); SELECT pg_sleep(2); COMMIT;')
 await new Promise(r=>setTimeout(r,300))
 equal(await sql(`SELECT count(*) FROM public.pin_verify('${attempt}','${source(40)}','0001')`),'0')
 await locks
 console.log(`PIN PostgreSQL/pgcrypto: ${checks} checks passed (including concurrent connections).`)
} finally { await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres') }
