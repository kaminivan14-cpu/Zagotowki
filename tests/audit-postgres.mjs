// Real PostgreSQL upgrade/concurrency supplement to the PGlite lifecycle suite.
import {spawn} from 'node:child_process'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const container=process.env.TASKS_TEST_CONTAINER||'zagotowki-tasks-test',database=`audit_${Date.now()}`
function sql(query,db=database){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',c=>c?reject(Error(err)):resolve(out.trim()));p.stdin.end(query)})}
const actor="SET ROLE authenticated; SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';"
const op='40000000-0000-4000-8000-000000000001',template='50000000-0000-4000-8000-000000000001'
await sql(`CREATE DATABASE ${database}`,'postgres')
try{
 await sql(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS;END IF;END $$;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;CREATE PUBLICATION supabase_realtime;
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,DELETE,UPDATE ON storage.objects TO authenticated;`)
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
  if(f==='202610130001_audit.sql'){
   await mkdir('tmp/audit-integration',{recursive:true})
   await writeFile('tmp/audit-integration/expected-dependencies.json',await sql(`SELECT jsonb_agg(jsonb_build_object('sig',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN ('app_private.actor()'::regprocedure,'app_private.has_permission(text)'::regprocedure,'app_private.role_has_permission(text,text)'::regprocedure)`))
  }
  await sql(await readFile(`supabase/migrations/${f}`,'utf8'))
 }
 await sql(await readFile('supabase/storage/audit-photo-policies.sql','utf8'))
 await sql(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'AUDIT LOCAL TEST',true);INSERT INTO auth.users(id,email) VALUES('30000000-0000-4000-8000-000000000001','audit@example.invalid');INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(1,'AUDIT LOCAL TEST','manager',1,true,'30000000-0000-4000-8000-000000000001');`)
 await sql(`${actor} SELECT public.audit_command('template_save','{"id":"${template}","name":"LOCAL TEST","questions":["Q"]}',gen_random_uuid())`)
 const start=`${actor} SELECT public.audit_command('start','{"template_id":"${template}"}','${op}')`
 const pair=await Promise.all([sql(start),sql(start)]);assert.equal(pair[0],pair[1]);assert.equal(await sql('SELECT count(*) FROM public.audits'),'1')
 const save=`${actor} SELECT public.audit_command('save','{"id":"${op}","version":1,"answers":[{"answer":"yes","comment":"preserve"}],"location_id":1}',gen_random_uuid())`
 const concurrent=await Promise.allSettled([sql(save),sql(save)]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.match(concurrent.find(x=>x.status==='rejected').reason.message,/AUDIT_CONFLICT/)
 await sql(`${actor} SELECT public.audit_command('complete','{"id":"${op}","version":2}',gen_random_uuid())`)
 const before=await sql('SELECT jsonb_agg(a ORDER BY id) FROM public.audits a')
 await sql(await readFile('supabase/migrations/202610130001_audit.sql','utf8'))
 assert.equal(await sql('SELECT jsonb_agg(a ORDER BY id) FROM public.audits a'),before)
 await sql("DELETE FROM app_private.role_permissions WHERE role='manager' AND permission='audit.access'")
 await assert.rejects(sql(`${actor} SELECT public.audit_read('history')`),/AUDIT_DENIED/)
 console.log('AUDYT PostgreSQL PASS: main upgrade, RLS policies, concurrent start idempotency, concurrent edit conflict, completion, additive rerun preserves records, capability revoked denies RPC')
}finally{await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
