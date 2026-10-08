import { spawn } from 'node:child_process'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const container=process.env.TASKS_TEST_CONTAINER || 'zagotowki-tasks-test', database=`worktime_${Date.now()}`
export const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
function sql(query,db=database){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));p.stdin.end(query)})}
const as=n=>`SET ROLE authenticated; SET request.jwt.claim.sub='${uid(n)}';`
const rpc=(n,name,args='')=>sql(`${as(n)} SELECT public.${name}(${args});`).then(JSON.parse)
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
const denied=async(p,pattern)=>{await assert.rejects(p,pattern);checks++}
await sql(`CREATE DATABASE ${database}`,'postgres')
try {
 await sql(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role; CREATE PUBLICATION supabase_realtime;`)
 await sql(`CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);`)
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
 if(f==='202610040001_worktime.sql') {await mkdir('tmp/worktime.local',{recursive:true});await writeFile('tmp/worktime.local/expected-before.json',await sql(await readFile('tests/fixtures/worktime-schema-audit.sql','utf8')))}
 await sql(await readFile(`supabase/migrations/${f}`,'utf8'))
 }

 await sql(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'Local A',true),(2,'Local B',true);
 INSERT INTO auth.users(id,email) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'work-'||n||'@example.invalid' FROM generate_series(1,6)n;
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) SELECT n,CASE WHEN n=4 THEN 'A & <B>' ELSE 'Person '||n END,(ARRAY['administrator','manager','manager','sushi-master','crafter','sushi-master'])[n],CASE WHEN n IN(3,6) THEN 2 WHEN n=1 THEN NULL ELSE 1 END,true,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,6)n;`)
 const cmd=(n,action,args,op=randomUUID())=>sql(`${as(n)} SELECT public.worktime_command('${action}',${literal(args)},'${op}');`).then(JSON.parse)
 const range="'2026-10-01','2026-10-31'"
 const current=n=>sql(`${as(n)} SELECT public.worktime_current();`).then(x=>x?JSON.parse(x):null)
 for(const n of [4,5,6]){await denied(rpc(n,'worktime_context'),/WORKTIME_DENIED/);await denied(rpc(n,'worktime_list',range),/WORKTIME_DENIED/);await denied(rpc(n,'worktime_export_xml',range),/WORKTIME_DENIED/)}
 for(const role of ['anon','authenticated'])for(const table of ['Work_shifts','Work_shift_events'])await denied(sql(`SET ROLE ${role};SELECT * FROM public."${table}"`),/permission denied/)
 const op=randomUUID(),start={location_id:1,module:'production'}
 const opened=await cmd(4,'start',start,op);eq(await cmd(4,'start',start,op),opened)
 const other=await cmd(4,'start',{location_id:1,module:'orders'});eq(other.shift_id,opened.shift_id)
 eq((await current(4)).started_from_module,'production')
 const legacy=JSON.parse(await sql(`${as(4)} SELECT public.orders_command('open_shift','{"location_id":1}','${randomUUID()}')`))
 eq(legacy.shift_id,opened.shift_id)
 const simultaneous=await Promise.all([cmd(5,'start',start),cmd(5,'start',start)]);eq(simultaneous[0].shift_id,simultaneous[1].shift_id)
 eq(await sql('SELECT count(*) FROM public."Work_shifts" WHERE employee_id=5 AND ended_at IS NULL'),'1')
 await denied(cmd(4,'start',{location_id:2,module:'orders'}),/WORKTIME_DENIED/)
 await denied(cmd(2,'end',{shift_id:opened.shift_id,module:'orders'}),/WORKTIME_DENIED/)
 const endOp=randomUUID();const ended=await cmd(4,'end',{shift_id:opened.shift_id,module:'orders'},endOp)
 eq(await cmd(4,'end',{shift_id:opened.shift_id,module:'orders'},endOp),ended)
 eq(await current(4),null)
 eq(await cmd(4,'start',start,op),opened);eq(await current(4),null)
 await Promise.all([cmd(4,'end',{shift_id:opened.shift_id,module:'orders'}),cmd(4,'end',{shift_id:opened.shift_id,module:'orders'})])
 eq(await sql(`SELECT count(*) FROM public."Work_shift_events" WHERE work_shift_id=${opened.shift_id}`),'2')
 const correct={shift_id:opened.shift_id,version:ended.version,started_at:'2026-10-01T22:00:00+02:00',ended_at:'2026-10-02T06:00:00+02:00',reason:'Poprawa godziny'}
 const fixOp=randomUUID(),fixed=await cmd(2,'correct',correct,fixOp);eq(await cmd(2,'correct',correct,fixOp),fixed)
 await denied(cmd(2,'correct',correct),/VERSION_CONFLICT/)
 await denied(cmd(3,'correct',{...correct,version:fixed.version}),/WORKTIME_DENIED/)
 await denied(cmd(2,'correct',{...correct,version:fixed.version,reason:''}),/INVALID_CORRECTION/)
 await denied(cmd(2,'correct',{...correct,version:fixed.version,ended_at:'2026-10-01T20:00:00+02:00'}),/INVALID_CORRECTION/)
 const list=await rpc(2,'worktime_list',range);eq(list.rows.find(r=>r.id===opened.shift_id).worked_minutes,480);eq(list.rows.find(r=>r.id===opened.shift_id).work_date,'2026-10-01')
 eq((await rpc(3,'worktime_list',range)).rows.length,0)
 const summary=await rpc(2,'worktime_summary',range);eq(summary.find(x=>x.employee_id===4).worked_minutes,480)
 eq(summary.find(x=>x.employee_id===5).worked_minutes,0)
 const xml=await sql(`${as(2)} SELECT public.worktime_export_xml(${range});`)
 assert.match(xml,/A &amp; &lt;B&gt;/);assert.match(xml,/<workedMinutes>480<\/workedMinutes>/);checks++
 eq(await sql(`${as(2)} SELECT xml_is_well_formed_document(public.worktime_export_xml(${range}));`),'t')
 const calendar=await rpc(2,'worktime_calendar',range);eq(calendar.find(x=>x.work_date==='2026-10-01').sessions,1)
 const races=await Promise.allSettled([cmd(2,'correct',{...correct,version:fixed.version,reason:'Korekta A'}),cmd(2,'correct',{...correct,version:fixed.version,reason:'Korekta B'})])
 eq(races.filter(r=>r.status==='fulfilled').length,1);eq(races.filter(r=>r.status==='rejected'&&/VERSION_CONFLICT/.test(r.reason.message)).length,1)
 fixed.version++
 const history=await rpc(2,'worktime_events',opened.shift_id)
 eq(history.map(x=>x.event_type),['WORK_SHIFT_CREATED','WORK_SHIFT_ENDED','WORK_SHIFT_CORRECTED','WORK_SHIFT_CORRECTED']);eq(history[2].reason,'Poprawa godziny');eq(history[2].actor_employee_id,2)
 await denied(sql(`UPDATE public."Work_shift_events" SET reason='tamper'`),/APPEND_ONLY/)
 const active5=await current(5)
 await cmd(2,'correct',{shift_id:active5.id,version:active5.version,started_at:'2026-10-01T08:00:00+02:00',ended_at:null,reason:'Otwarte od wczoraj'})
 eq((await rpc(2,'worktime_list',range+",NULL,NULL,'needs_attention'")).rows.some(r=>r.id===active5.id),true)
 await cmd(4,'start',{location_id:1,module:'orders'})
 await denied(cmd(2,'correct',{...correct,version:fixed.version,ended_at:null}),/SHIFT_OVERLAP/)
 await cmd(6,'start',{location_id:2,module:'orders'})
 eq((await rpc(1,'worktime_context')).locations.length,2);eq((await rpc(2,'worktime_context')).locations.length,1)
 eq((await rpc(1,'worktime_list',range)).rows.some(x=>x.employee_id===6),true)
 eq((await rpc(2,'worktime_list',range)).rows.some(x=>x.employee_id===6),false)
 // SQL fixtures retain real actor/audit; no client table access.
 await sql(`${as(1)} RESET ROLE; INSERT INTO public."Work_shifts"(employee_id,employee_name_snapshot,location_id,started_at,ended_at) SELECT 4,'A & <B>',1,'2026-10-02 08:00+02'::timestamptz+n*interval '2 minutes','2026-10-02 08:01+02'::timestamptz+n*interval '2 minutes' FROM generate_series(1,105)n;`)
 const page=await rpc(2,'worktime_list',range);eq(page.rows.length,100)
 const page2=await rpc(2,'worktime_list',range+',NULL,NULL,NULL,'+page.next_cursor);assert.ok(page2.rows.length>0);eq(new Set([...page.rows,...page2.rows].map(x=>x.id)).size,page.rows.length+page2.rows.length)
 await denied(rpc(2,'worktime_list',"'2025-01-01','2026-12-31'"),/INVALID_RANGE/)
 await sql('UPDATE public."Employees" SET active=false WHERE id=2')
 await denied(rpc(2,'worktime_summary',range),/aktywnego/)
 await sql('UPDATE public."Employees" SET active=false,archived_at=now() WHERE id=2')
 await denied(rpc(2,'worktime_context'),/WORKTIME_DENIED|aktywnego/)
 await denied(sql('TRUNCATE public."Work_shift_events"'),/APPEND_ONLY/)
 // Warsaw fall-back is 9 real hours for 22:00->06:00 across DST.
 eq(await sql(`SELECT extract(epoch FROM ('2026-10-25 06:00 Europe/Warsaw'::timestamptz-'2026-10-24 22:00 Europe/Warsaw'::timestamptz))/3600`),'9.0000000000000000')
 console.log(`Worktime PostgreSQL PASS (${checks} checks)`)
} finally {await sql(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`,'postgres')}
