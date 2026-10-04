import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
// Declarative, offline SQL assembly only: no connection, CLI auth, db push or deployment.
export async function productionReleaseSteps() {
 const base=new URL('../../supabase/',import.meta.url)
 const names=['upgrades/production/05_orders_roles.sql',
  'migrations/202610010003_orders.sql',
  'migrations/202610020001_task_access.sql',
  'migrations/202610020002_task_core.sql',
  'migrations/202610020003_task_approvals.sql',
  'migrations/202610020004_task_planning.sql',
  'migrations/202610020005_task_work.sql',
  'migrations/202610020006_task_balance_reports.sql',
  'migrations/202610020007_task_hardening.sql',
  'migrations/202610020008_task_audit.sql',
  'migrations/202610020009_task_pagination.sql',
  'migrations/202610020010_task_contracts.sql',
  'migrations/202610020011_task_team_calendar.sql',
  'migrations/202610020012_task_role_invariant.sql',
  'migrations/202610030001_orders_board.sql',
  'migrations/202610040001_worktime.sql',
  'migrations/202610050001_task_availability_reports.sql',
  'migrations/202610050002_task_manual_actions.sql',
  'migrations/202610050003_task_execution.sql',
  'migrations/202610060001_tasks_admin_processes.sql',
  'upgrades/production/06_release_policy.sql']
 return Promise.all(names.map(async name=>({name,sql:await readFile(new URL(name,base),'utf8')})))
}
export async function productionReleaseSql() {
 const steps=await productionReleaseSteps()
 const manifest=steps.map(({name,sql})=>({name,sha256:createHash('sha256').update(sql).digest('hex')}))
 const journal=`CREATE TABLE app_private.production_module_releases (release text PRIMARY KEY, manifest jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
 REVOKE ALL ON app_private.production_module_releases FROM PUBLIC,anon,authenticated;
 INSERT INTO app_private.production_module_releases(release,manifest) VALUES ('orders_tasks_v1',$manifest$${JSON.stringify(manifest)}$manifest$::jsonb);`
 // All-or-nothing prevents intermediate broad UAT grants from becoming externally visible.
 return 'BEGIN;\n'+steps.map(({name,sql})=>`-- ${name}\n${sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')}`).join('\n')+'\n'+journal+'\nCOMMIT;'
}
