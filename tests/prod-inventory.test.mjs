// Production inventory package (supabase/upgrades/prod/): generated expectations are current, every file is
// read-only, and the gap / history / post-flight logic classifies known database states correctly.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { database, generate, renderBlocks } from '../scripts/generate-prod-inventory.mjs'

const dir = new URL('../supabase/upgrades/prod/', import.meta.url)
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()
const text = Object.fromEntries(await Promise.all(files.map(async f => [f, await readFile(new URL(f, dir), 'utf8')])))

async function build({ skip = [], extra = '' } = {}) {
  const db = await database()
  for (const f of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    if (skip.some(s => f.startsWith(s))) continue
    await db.exec((await readFile(`supabase/migrations/${f}`, 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;', ''))
  }
  await db.exec(await readFile('supabase/storage/employee-avatar-policies.sql', 'utf8'))
  await db.exec(await readFile('supabase/storage/audit-photo-policies.sql', 'utf8'))
  if (skip.includes('202611140001')) {
    // the 2026-10 definition still deployed where 202611140001 is missing
    await db.exec(`CREATE POLICY tasks_file_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='tasks-private' AND (storage.foldername(name))[1]=auth.uid()::text AND app_private.has_permission('tasks.access'));
      CREATE POLICY tasks_file_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id='tasks-private' AND app_private.has_permission('tasks.access') AND ((storage.foldername(name))[1]=auth.uid()::text OR public.tasks_storage_read(name)));`)
  } else await db.exec(await readFile('supabase/storage/tasks-private-policies.sql', 'utf8'))
  if (extra) await db.exec(extra)
  return db
}
const last = async (db, file) => (await db.exec(text[file])).at(-1).rows

test('prod package: all ten files exist, are read-only and their generated blocks are current', async () => {
  for (const f of ['prod_preflight', 'prod_migration_history', 'prod_schema_inventory', 'prod_function_inventory', 'prod_policy_inventory',
    'prod_employee_inventory', 'prod_reference_data_inventory', 'prod_gap_analysis', 'prod_postflight', 'prod_acceptance_checks'])
    assert.ok(text[`${f}.sql`], `${f}.sql missing`)
  for (const [f, sql] of Object.entries(text)) {
    const code = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''")
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT|COPY|VACUUM|REINDEX)\b/i, `${f} must be read-only`)
  }
  const blocks = renderBlocks(await generate())
  for (const [f, sql] of Object.entries(text))
    for (const m of sql.matchAll(/-- <generated:([a-z_]+)>\n([\s\S]*?)\n-- <\/generated:\1>/g))
      assert.equal(m[2], blocks[m[1]], `${f}: block ${m[1]} is stale - run node scripts/generate-prod-inventory.mjs`)
})

test('prod gap analysis and history: complete chain is clean, a Production-like state shows exactly the Storage fix gap', async () => {
  const full = await build()
  assert.deepEqual(await last(full, 'prod_gap_analysis.sql'), [])
  const history = await last(full, 'prod_migration_history.sql')
  assert.equal(history.length, 49)
  assert.ok(history.every(r => r.evidence_status === 'CONFIRMED APPLIED' || r.migration === '202610060002_new_menu_process'), JSON.stringify(history.filter(r => r.evidence_status !== 'CONFIRMED APPLIED')))
  assert.ok((await last(full, 'prod_postflight.sql')).every(r => r.status === 'OK'))

  const prodLike = await build({ skip: ['202611140001'] })
  const gaps = (await last(prodLike, 'prod_gap_analysis.sql')).filter(r => r.section === 1)
  assert.deepEqual(gaps.map(r => [r.category, r.object, r.difference]), [
    ['function', 'public.tasks_storage_select(text)', 'MISSING IN DATABASE'],
    ['policy', 'storage.objects.tasks_file_select', 'DIFFERENT']])
  assert.match(gaps[0].required_action, /Apply supabase\/migrations\/202611140001_attachment_storage_read\.sql/)
  const h = Object.fromEntries((await last(prodLike, 'prod_migration_history.sql')).map(r => [r.migration, r]))
  assert.equal(h['202611140001_attachment_storage_read'].evidence_status, 'CONFIRMED NOT APPLIED')
  assert.equal(h['storage/tasks-private-policies'].evidence_status, 'PARTIALLY APPLIED')
  assert.match(h['storage/tasks-private-policies'].recommendation, /tasks-private-policies-202611140001\.sql/)
  assert.match(h['202610070001_manager_email_auth'].recommendation, /^PROD: do not run/)
  const post = await last(prodLike, 'prod_postflight.sql')
  assert.deepEqual(post.filter(r => r.status === 'FAIL').map(r => r.check_name).sort(), [
    'migration 202611140001_attachment_storage_read', 'migration storage/tasks-private-policies',
    'storage policy tasks_file_select', 'tasks_storage_select callable by authenticated only'])
})

test('prod gap analysis: outdated bodies name their version; PROD policy differences are labelled, unknown drift is not', async () => {
  const old = await build({ skip: ['202611120001', '202611120002', '202611140001'] })
  const rows = (await last(old, 'prod_gap_analysis.sql')).filter(r => r.section === 1)
  const outdated = rows.filter(r => r.difference.startsWith('OUTDATED'))
  assert.deepEqual(outdated.map(r => r.object).sort(), ['app_private.task_notify(bigint, "Tasks", bigint, text, jsonb)', 'app_private.task_result_command(text, jsonb, uuid)'])
  assert.ok(outdated.every(r => r.difference === 'OUTDATED - matches the version from 202611110001_work_hierarchy'))
  const h = Object.fromEntries((await last(old, 'prod_migration_history.sql')).map(r => [r.migration, r.evidence_status]))
  assert.equal(h['202611120001_work_finalize'], 'CONFIRMED NOT APPLIED')
  assert.equal(h['202611120002_attachment_name_type'], 'CONFIRMED NOT APPLIED')

  const drift = await build({ extra: `ALTER TABLE public."Employees" ADD COLUMN legacy_note text;
    DELETE FROM app_private.role_permissions WHERE role='expert' AND permission='tasks.assign';
    INSERT INTO app_private.role_permissions(role,permission) VALUES ('crafter','orders.work'),('crafter','dictionaries.manage');
    CREATE OR REPLACE FUNCTION public.tasks_category_list() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;` })
  const d = Object.fromEntries((await last(drift, 'prod_gap_analysis.sql')).filter(r => r.section === 1).map(r => [r.object, r]))
  assert.equal(d['public.Employees.legacy_note'].difference, 'NOT IN REPOSITORY')
  assert.match(d['expert:tasks.assign'].required_action, /^EXPECTED ON PROD: removed by upgrades\/production\/06/)
  assert.match(d['crafter:orders.work'].required_action, /^EXPECTED ON PROD: added by/)
  assert.match(d['crafter:dictionaries.manage'].required_action, /^Review/)
})
