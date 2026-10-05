// Manual operator tool. It never logs in, reads Keychain or uses linked CLI state.
import {spawnSync} from 'node:child_process'
import {readFileSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs'
import {resolve} from 'node:path'
const ref='meuzkduxttjcuiynsnaa',version='202610050001',name='task_availability_reports'
const raw=process.env.UAT_DATABASE_URL
if(!raw)throw new Error('Set UAT_DATABASE_URL in your terminal; do not send it in chat.')
const u=new URL(raw),user=decodeURIComponent(u.username)
if(!['postgres:','postgresql:'].includes(u.protocol)||!(u.hostname===`db.${ref}.supabase.co`||u.hostname.endsWith('.pooler.supabase.com')&&user===`postgres.${ref}`)||u.pathname!=='/postgres')throw new Error('STOP: only the exact UAT project database is allowed.')
if(process.argv.slice(2).some(x=>!['--apply'].includes(x)))throw new Error('Only optional --apply is supported.')
const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:'postgres',PGUSER:user,PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'require'}
delete env.UAT_DATABASE_URL
function command(binary,args,input){const r=spawnSync(binary,args,{env,input,encoding:'utf8',maxBuffer:32*1024*1024});if(r.error||r.status!==0)throw new Error(`${binary} failed. STOP; no retry or alternate project. ${r.stderr||r.error?.message||''}`);return r.stdout}
const sql=q=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],q)
const folder=resolve('tmp',`tasks-workspace-uat-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(folder,{recursive:true,mode:0o700})
const dump=command('pg_dump',['--schema-only','--schema=public','--schema=app_private','--no-owner','--no-privileges'])
writeFileSync(`${folder}/schema-before.sql`,dump,{mode:0o600});chmodSync(`${folder}/schema-before.sql`,0o600)
const hashes=sql("SELECT md5(pg_get_functiondef('app_private.task_windows(bigint,date,bigint)'::regprocedure)),md5(pg_get_functiondef('app_private.task_capacity(bigint,date)'::regprocedure));").trim()
if(hashes!=='861d43891960c49c4d5b5b5ae515695d|d1ce69470ffb665cd6a1ae653bda7460')throw new Error(`STOP: relevant schema drift. Snapshot: ${folder}`)
if(sql("SELECT to_regprocedure('public.tasks_report_activity(bigint,date,date)') IS NULL AND to_regprocedure('public.tasks_schedule_capacity(bigint,date,date)') IS NULL;").trim()!=='t')throw new Error('STOP: new read functions already exist; inspect deployment history.')
console.log(`UAT ${ref}: snapshot + availability drift check PASS. ${folder}`)
if(process.argv.includes('--apply')){
 const migration=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8')
 // Keep the exact migration and its ledger record in the same transaction.
 const ledger=sql("SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;").trim()==='t'?`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[$migration$${migration}$migration$]);`:''
 sql(migration.replace(/COMMIT;\s*$/,`${ledger}\nCOMMIT;`))
 writeFileSync(`${folder}/schema-after.sql`,command('pg_dump',['--schema-only','--schema=public','--schema=app_private','--no-owner','--no-privileges']),{mode:0o600})
 const result=sql("SELECT to_regprocedure('public.tasks_report_activity(bigint,date,date)') IS NOT NULL,to_regprocedure('public.tasks_schedule_capacity(bigint,date,date)') IS NOT NULL,has_function_privilege('anon','public.tasks_report_activity(bigint,date,date)','EXECUTE'),has_function_privilege('authenticated','public.tasks_report_activity(bigint,date,date)','EXECUTE');").trim()
 if(result!=='t|t|f|t')throw new Error('Post-migration grants/read check failed; stop and inspect.')
 console.log('UAT migration applied; new reads present, anon denied, authenticated granted. No business rows changed.')
}else console.log('Read-only preflight complete. Use --apply only after reviewing the snapshot.')
