-- UAT rollout only, as postgres. Enable Supabase Cron in Dashboard before this step.
-- Date-based routing works even if the job is delayed. This job materializes status/audit.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_extension WHERE extname='pg_cron') THEN
  RAISE EXCEPTION 'ORG_CRON_NOT_ENABLED: enable Cron in Supabase Dashboard > Integrations > Cron';
 END IF;
 IF EXISTS(SELECT FROM cron.job WHERE jobname='organization-structure-activate' AND (command<>'SELECT app_private.org_activate_due()' OR username<>current_user)) THEN
  RAISE EXCEPTION 'ORG_CRON_DRIFT';
 END IF;
END $$;
SELECT cron.schedule('organization-structure-activate','* * * * *','SELECT app_private.org_activate_due()');
COMMIT;
