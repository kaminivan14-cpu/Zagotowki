import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
for(const url of ['postgresql://postgres:synthetic@db.ssheqxdgsmndiutthxvd.supabase.co/postgres','postgresql://postgres.ssheqxdgsmndiutthxvd:synthetic@aws-0.eu.pooler.supabase.com/postgres','postgresql://postgres:synthetic@example.invalid/postgres'])test('UAT operator tool rejects non-UAT target before any command: '+new URL(url).hostname,()=>{
 const r=spawnSync(process.execPath,['scripts/tasks-workspace-uat.mjs','--apply'],{encoding:'utf8',env:{...process.env,UAT_DATABASE_URL:url,PATH:'/nonexistent'}})
 assert.notEqual(r.status,0);assert.match(r.stderr,/only the exact UAT project database is allowed/);assert.doesNotMatch(r.stderr,/pg_dump failed|psql failed/)
})
