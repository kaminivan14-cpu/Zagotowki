// Offline generator for the read-only Production inventory package (supabase/upgrades/prod/).
// It replays every repository migration in an in-memory PGlite database (no network, no remote access),
// records the catalog after each migration, and writes the "repository expected" data into the generated
// blocks of the prod_*.sql files. Run from the repository root:  node scripts/generate-prod-inventory.mjs
// Re-run it whenever a migration or a Storage policy file changes; the SQL files are otherwise hand-written.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const SCHEMAS = ['public', 'app_private']

// Repository migrations that the Production path deliberately replaces or never runs
// (docs/production-release-readiness.md, upgrades/production/*.sql headers).
export const PROD_PATH = {
  '202609220001_base': 'replaced on PROD by the legacy PREPARE / PROVISION / CUTOVER (upgrades/production/01-03); never run',
  '202609230001_auth': 'replaced on PROD by upgrades/production/01_prepare + 02 + 03_cutover; never run',
  '202609230002_auth_production': 'replaced on PROD by upgrades/production/01-03; never run',
  '202609290001_employee_pin': 'replaced on PROD by the legacy cutover (PIN kept from legacy data); never run',
  '202609300001_employee_archive': 'replaced on PROD by the legacy cutover; never run',
  '202610010001_roles_modules': 'replaced on PROD by upgrades/production/05_orders_roles.sql; never run',
  '202610010002_crafter': 'must NOT run on PROD (automatic role conversion forbidden)',
  '202610030002_orders_uat_generator': 'UAT only; must NOT run on PROD',
  '202610060002_new_menu_process': 'example seed; skipped on PROD',
  '202610070001_manager_email_auth': 'replaced on PROD by upgrades/production/08_invitation_backend.sql; never run',
}

export async function database() {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  -- Supabase grants new public objects to the API roles by default; 202609220001_base revokes that again.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}',
    email_confirmed_at timestamptz,encrypted_password text,last_sign_in_at timestamptz,banned_until timestamptz,invited_at timestamptz,confirmed_at timestamptz,created_at timestamptz DEFAULT now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
  CREATE PUBLICATION supabase_realtime;
  CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb,UNIQUE(bucket_id,name));
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT,INSERT,DELETE,UPDATE ON storage.objects TO authenticated;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
  CREATE SCHEMA extensions;
  CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
  CREATE FUNCTION extensions.gen_salt(text,integer DEFAULT 6) RETURNS text LANGUAGE sql AS $$ SELECT 'x'::text $$;
  CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql AS $$ SELECT convert_to($1,'UTF8') $$;
  SET search_path = "$user", public, extensions;`)
  return db
}

const rows = async (db, sql) => (await db.query(sql)).rows
const inSchemas = col => `${col} IN (${SCHEMAS.map(s => `'${s}'`).join(',')})`

// One catalog snapshot. Keys identify an object; values describe its definition.
async function snapshot(db) {
  const out = {}
  const put = (kind, key, value) => { (out[kind] ||= {})[key] = value }
  for (const r of await rows(db, `SELECT n.nspname s, c.relname t, c.relkind k, c.relrowsecurity rls, c.relforcerowsecurity force
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${inSchemas('n.nspname')} AND c.relkind IN ('r','p','v','m')`))
    put('table', `${r.s}.${r.t}`, { kind: r.k, rls: r.rls, force: r.force })
  for (const r of await rows(db, `SELECT n.nspname s, c.relname t, a.attname col, format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn, a.attidentity ident,
      pg_get_expr(d.adbin,d.adrelid) def FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE ${inSchemas('n.nspname')} AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped`))
    put('column', `${r.s}.${r.t}.${r.col}`, { type: r.typ, not_null: r.nn, default: r.ident ? `identity ${r.ident === 'a' ? 'always' : 'by default'}` : r.def })
  for (const r of await rows(db, `SELECT n.nspname s, c.relname t, k.conname, k.contype, pg_get_constraintdef(k.oid) def
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${inSchemas('n.nspname')}`))
    put('constraint', `${r.s}.${r.t}.${r.conname}`, { type: r.contype, def: r.def })
  for (const r of await rows(db, `SELECT schemaname s, tablename t, indexname i, indexdef def FROM pg_indexes WHERE ${inSchemas('schemaname')}`))
    put('index', `${r.s}.${r.i}`, { table: `${r.s}.${r.t}`, def: r.def })
  for (const r of await rows(db, `SELECT n.nspname s, c.relname t, g.tgname, pg_get_triggerdef(g.oid) def, g.tgenabled en
      FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE ${inSchemas('n.nspname')} AND NOT g.tgisinternal`))
    put('trigger', `${r.s}.${r.t}.${r.tgname}`, { def: r.def, enabled: r.en })
  for (const r of await rows(db, `SELECT n.nspname s, p.proname, oidvectortypes(p.proargtypes) args, md5(p.prosrc) h, p.prosecdef sd,
      coalesce(array_to_string(p.proconfig,','),'') cfg, pg_get_function_result(p.oid) res, p.prokind kind,
      coalesce((SELECT string_agg(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END, ',' ORDER BY 1)
        FROM aclexplode(p.proacl) x LEFT JOIN pg_roles r ON r.oid=x.grantee
        WHERE x.privilege_type='EXECUTE' AND (x.grantee=0 OR r.rolname IN ('anon','authenticated'))), CASE WHEN p.proacl IS NULL THEN 'PUBLIC' ELSE '' END) ex
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${inSchemas('n.nspname')}`))
    put('function', `${r.s}.${r.proname}(${r.args})`, { md5: r.h, secdef: r.sd, config: r.cfg, result: r.res, kind: r.kind, execute: r.ex })
  for (const r of await rows(db, `SELECT schemaname s, tablename t, policyname p, cmd, array_to_string(roles,',') roles, qual, with_check
      FROM pg_policies WHERE schemaname IN (${[...SCHEMAS, 'storage'].map(s => `'${s}'`).join(',')})`))
    put('policy', `${r.s}.${r.t}.${r.p}`, { cmd: r.cmd, roles: r.roles, qual: r.qual, with_check: r.with_check })
  for (const r of await rows(db, `SELECT n.nspname s, c.relname t, coalesce((SELECT string_agg(p, ',' ORDER BY p) FROM (
        SELECT DISTINCT r.rolname||':'||x.privilege_type p FROM aclexplode(c.relacl) x JOIN pg_roles r ON r.oid=x.grantee
        WHERE r.rolname IN ('anon','authenticated')) q), '') g
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${inSchemas('n.nspname')} AND c.relkind IN ('r','p','v','m')`))
    put('grant', `${r.s}.${r.t}`, { privileges: r.g })
  for (const r of await rows(db, `SELECT id, public, file_size_limit, array_to_string(ARRAY(SELECT unnest(allowed_mime_types) ORDER BY 1), ',') mime FROM storage.buckets`))
    put('bucket', r.id, { public: r.public, file_size_limit: r.file_size_limit, mime: r.mime })
  for (const r of await rows(db, `SELECT role, permission FROM app_private.role_permissions`).catch(() => []))
    put('role_permission', `${r.role}:${r.permission}`, {})
  return out
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export async function generate() {
  const db = await database()
  const files = (await readdir(new URL('supabase/migrations/', root))).filter(f => f.endsWith('.sql')).sort()
  const steps = [...files.map(f => ({ name: f.slice(0, -4), path: `supabase/migrations/${f}` })),
    { name: 'storage/employee-avatar-policies', path: 'supabase/storage/employee-avatar-policies.sql' },
    { name: 'storage/audit-photo-policies', path: 'supabase/storage/audit-photo-policies.sql' },
    { name: 'storage/tasks-private-policies', path: 'supabase/storage/tasks-private-policies.sql' }]
  const objects = {} // kind -> key -> { introduced, changed, value, versions:[{step, md5}] }
  let previous = {}
  const fileHashes = {}
  for (const step of steps) {
    let sql = await read(step.path)
    fileHashes[step.name] = { path: step.path, sha256: createHash('sha256').update(sql).digest('hex') }
    sql = sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;', '')
    try { await db.exec(sql) } catch (e) { throw Error(`${step.path}: ${e.message}`) }
    const now = await snapshot(db)
    for (const [kind, map] of Object.entries(now)) for (const [key, value] of Object.entries(map)) {
      const o = ((objects[kind] ||= {})[key] ||= { introduced: step.name, changed: step.name, value, versions: [] })
      const before = previous[kind]?.[key]
      if (before && !same(before, value)) { o.changed = step.name; o.value = value }
      if (kind === 'function' && (!before || before.md5 !== value.md5)) o.versions.push({ step: step.name, md5: value.md5 })
    }
    for (const [kind, map] of Object.entries(previous)) for (const key of Object.keys(map))
      if (!now[kind]?.[key] && objects[kind]?.[key]) objects[kind][key].dropped = step.name
    previous = now
  }
  // keep only objects that exist at the end of the chain
  for (const kind of Object.keys(objects)) for (const key of Object.keys(objects[kind]))
    if (!previous[kind]?.[key]) delete objects[kind][key]
  // Functions that the Production-only upgrade scripts define or patch in place (expected PROD differences).
  const prodSpecific = {}
  for (const f of (await readdir(new URL('supabase/upgrades/production/', root))).filter(x => x.endsWith('.sql')).sort()) {
    const text = await read(`supabase/upgrades/production/${f}`)
    for (const m of text.matchAll(/(?:FUNCTION\s+|')((?:public|app_private)\.[a-z_0-9]+)\(/g)) (prodSpecific[m[1]] ||= new Set()).add(f)
  }
  return { steps: steps.map(s => s.name), fileHashes, objects, db,
    prodSpecific: Object.fromEntries(Object.entries(prodSpecific).map(([k, v]) => [k, [...v].join(', ')])) }
}

// ---- SQL rendering --------------------------------------------------------------------------------------------
const lit = v => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? String(v) : `'${String(v).replaceAll("'", "''")}'`
const values = (cols, list) => list.length ? `(VALUES\n${list.map(r => '  (' + r.map(lit).join(', ') + ')').join(',\n')}\n) AS v(${cols})` : `(SELECT ${cols.split(',').map(c => 'NULL::text AS ' + c.trim()).join(', ')} WHERE false) AS v`

export function renderBlocks({ steps, fileHashes, objects, prodSpecific }) {
  const o = objects, list = (kind, f) => Object.entries(o[kind] || {}).sort(([a], [b]) => a < b ? -1 : 1).map(([k, x]) => f(k, x))
  const blocks = {}
  blocks.expected_tables = `SELECT * FROM ${values('object, relkind, rls, force_rls, introduced_by, changed_by',
    list('table', (k, x) => [k, x.value.kind, x.value.rls, x.value.force, x.introduced, x.changed]))}`
  blocks.expected_columns = `SELECT * FROM ${values('object, data_type, not_null, default_expr, introduced_by, changed_by',
    list('column', (k, x) => [k, x.value.type, x.value.not_null, x.value.default, x.introduced, x.changed]))}`
  blocks.expected_constraints = `SELECT * FROM ${values('object, contype, definition, introduced_by, changed_by',
    list('constraint', (k, x) => [k, x.value.type, x.value.def, x.introduced, x.changed]))}`
  blocks.expected_indexes = `SELECT * FROM ${values('object, table_name, definition, introduced_by, changed_by',
    list('index', (k, x) => [k, x.value.table, x.value.def, x.introduced, x.changed]))}`
  blocks.expected_triggers = `SELECT * FROM ${values('object, definition, enabled, introduced_by, changed_by',
    list('trigger', (k, x) => [k, x.value.def, x.value.enabled, x.introduced, x.changed]))}`
  blocks.expected_functions = `SELECT * FROM ${values('object, md5, security_definer, config, result_type, execute_roles, introduced_by, changed_by',
    list('function', (k, x) => [k, x.value.md5, x.value.secdef, x.value.config, x.value.result, x.value.execute, x.introduced, x.changed]))}`
  blocks.expected_function_versions = `SELECT * FROM ${values('object, migration, md5, version_no',
    Object.entries(o.function || {}).sort(([a], [b]) => a < b ? -1 : 1).flatMap(([k, x]) => x.versions.map((v, i) => [k, v.step, v.md5, String(i + 1)])))}`
  blocks.expected_policies = `SELECT * FROM ${values('object, cmd, roles, qual, with_check, introduced_by, changed_by',
    list('policy', (k, x) => [k, x.value.cmd, x.value.roles, x.value.qual, x.value.with_check, x.introduced, x.changed]))}`
  blocks.expected_grants = `SELECT * FROM ${values('object, privileges, introduced_by, changed_by',
    list('grant', (k, x) => [k, x.value.privileges, x.introduced, x.changed]))}`
  blocks.expected_buckets = `SELECT * FROM ${values('object, public, file_size_limit, mime_types, introduced_by, changed_by',
    list('bucket', (k, x) => [k, x.value.public, String(x.value.file_size_limit ?? ''), x.value.mime, x.introduced, x.changed]))}`
  blocks.expected_role_permissions = `SELECT * FROM ${values('object, introduced_by',
    list('role_permission', (k, x) => [k, x.introduced]))}`
  blocks.repository_files = `SELECT * FROM ${values('migration, path, sha256, position, prod_path_note',
    steps.map((s, i) => [s, fileHashes[s].path, fileHashes[s].sha256, String(i + 1), PROD_PATH[s] || null]))}`
  blocks.prod_specific_functions = `SELECT * FROM ${values('object_name, upgrade_files',
    Object.entries(prodSpecific).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => [k, v]))}`
  return blocks
}

export async function writeBlocks(blocks) {
  const dir = new URL('supabase/upgrades/prod/', root)
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql'))) {
    let text = await readFile(new URL(file, dir), 'utf8'), changed = false
    text = text.replace(/-- <generated:([a-z_]+)>\n[\s\S]*?-- <\/generated:\1>/g, (all, name) => {
      if (!blocks[name]) throw Error(`${file}: unknown generated block ${name}`)
      changed = true
      return `-- <generated:${name}>\n${blocks[name]}\n-- </generated:${name}>`
    })
    if (changed) await writeFile(new URL(file, dir), text)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await generate()
  if (process.argv[2] === '--json') { const plain = { ...result }; delete plain.db; console.log(JSON.stringify(plain)); process.exit(0) }
  await writeBlocks(renderBlocks(result))
  const count = k => Object.keys(result.objects[k] || {}).length
  console.log(`steps ${result.steps.length}; tables ${count('table')}, columns ${count('column')}, constraints ${count('constraint')}, ` +
    `indexes ${count('index')}, triggers ${count('trigger')}, functions ${count('function')}, policies ${count('policy')}, ` +
    `buckets ${count('bucket')}, role permissions ${count('role_permission')}`)
}
