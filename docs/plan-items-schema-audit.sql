-- WYŁĄCZNIE ODCZYT METADANYCH. To nie jest migracja.
-- Uruchom całość w Supabase SQL Editor i przekaż wynik JSON.
-- Nie odczytuje rekordów, PIN-ów ani kluczy API.
BEGIN TRANSACTION READ ONLY;
WITH tables AS (
  SELECT c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
), functions AS (
  SELECT p.*, n.nspname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND (p.proname IN ('create_production_plan', 'update_production_plan',
      'add_plan_item', 'update_plan_item', 'delete_plan_item',
      'start_plan_item', 'complete_plan_item', 'complete_production_plan',
      'reopen_production_plan') OR p.oid IN (
        SELECT tgfoid FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM tables) AND NOT tgisinternal
    ))
)
SELECT jsonb_build_object(
  'tables', (SELECT jsonb_agg(to_jsonb(t)) FROM tables t),
  'columns', (SELECT jsonb_agg(jsonb_build_object(
    'table', t.relname, 'column', a.attname,
    'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
    'default', pg_get_expr(d.adbin, d.adrelid)))
    FROM tables t JOIN pg_attribute a ON a.attrelid = t.oid
    LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped),
  'constraints', (SELECT jsonb_agg(jsonb_build_object(
    'table', c.conrelid::regclass::text, 'name', c.conname,
    'definition', pg_get_constraintdef(c.oid))) FROM pg_constraint c
    WHERE c.conrelid IN (SELECT oid FROM tables) OR c.confrelid IN (SELECT oid FROM tables)),
  'triggers', (SELECT jsonb_agg(jsonb_build_object(
    'table', t.tgrelid::regclass::text, 'definition', pg_get_triggerdef(t.oid)))
    FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (SELECT oid FROM tables)),
  'policies', (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname = 'public'),
  'grants', (SELECT jsonb_agg(to_jsonb(g)) FROM information_schema.table_privileges g WHERE table_schema = 'public'),
  'functions', (SELECT jsonb_agg(jsonb_build_object(
    'signature', f.oid::regprocedure::text, 'definition', pg_get_functiondef(f.oid),
    'owner', pg_get_userbyid(f.proowner), 'acl', f.proacl)) FROM functions f)
) AS schema_audit;
ROLLBACK;
