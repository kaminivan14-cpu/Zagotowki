// Offline SQL preparation only. Never connects to any Supabase project.
// Operator must separately verify the destination before executing the generated SQL.
import { readFile } from 'node:fs/promises'
const target = 'meuzkduxttjcuiynsnaa'
if (process.argv.length !== 4 || process.argv[2] !== '--project-ref' || process.argv[3] !== target) throw new Error('UAT_ONLY')
if ((await readFile('supabase/.temp/project-ref', 'utf8')).trim() !== target) throw new Error('LINKED_TARGET_MISMATCH')
const source = await readFile('supabase/seeds/orders-uat.sql', 'utf8')
process.stdout.write(source.replace('BEGIN;', `BEGIN; SET LOCAL app.orders_seed_project_ref='${target}';`))
