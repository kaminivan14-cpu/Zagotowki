-- Production schema inventory (READ-ONLY): what exists in public / app_private right now.
-- Run one numbered query at a time ("Run selected") to export a section; a whole-file run shows S7 (summary).
-- The comparison with the repository is prod_gap_analysis.sql; this file only lists.

-- S1. Tables and views: RLS, estimated rows, size.
SELECT n.nspname AS schema, c.relname AS table_name, c.relkind AS kind, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       c.reltuples::bigint AS estimated_rows, pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r', 'p', 'v', 'm')
ORDER BY 1, 2;

-- S2. Columns: type, nullability, default / identity.
SELECT n.nspname AS schema, c.relname AS table_name, a.attnum AS position, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null,
       CASE WHEN a.attidentity <> '' THEN 'identity ' || CASE a.attidentity WHEN 'a' THEN 'always' ELSE 'by default' END
            ELSE pg_get_expr(d.adbin, d.adrelid) END AS default_expr
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1, 2, 3;

-- S3. Constraints (p primary key, f foreign key, u unique, c check, x exclusion).
SELECT n.nspname AS schema, c.relname AS table_name, k.conname AS constraint_name, k.contype AS type, pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'app_private')
ORDER BY 1, 2, 3;

-- S4. Indexes.
SELECT schemaname AS schema, tablename AS table_name, indexname AS index_name, indexdef AS definition
FROM pg_indexes WHERE schemaname IN ('public', 'app_private') ORDER BY 1, 2, 3;

-- S5. Triggers (enabled: O = origin/local, D = disabled, R = replica, A = always).
SELECT n.nspname AS schema, c.relname AS table_name, g.tgname AS trigger_name, g.tgenabled AS enabled, pg_get_triggerdef(g.oid) AS definition
FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'app_private') AND NOT g.tgisinternal ORDER BY 1, 2, 3;

-- S6. Views and their definitions.
SELECT schemaname AS schema, viewname AS view_name, definition FROM pg_views WHERE schemaname IN ('public', 'app_private') ORDER BY 1, 2;

-- S7. Summary.
SELECT n.nspname AS schema,
       count(*) FILTER (WHERE c.relkind IN ('r', 'p')) AS tables,
       count(*) FILTER (WHERE c.relkind IN ('v', 'm')) AS views,
       count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND NOT c.relrowsecurity) AS tables_without_rls,
       (SELECT count(*) FROM pg_indexes i WHERE i.schemaname = n.nspname) AS indexes,
       (SELECT count(*) FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid WHERE t.relnamespace = n.oid AND NOT g.tgisinternal) AS triggers,
       (SELECT count(*) FROM pg_constraint k JOIN pg_class t ON t.oid = k.conrelid WHERE t.relnamespace = n.oid) AS constraints
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r', 'p', 'v', 'm')
GROUP BY n.nspname, n.oid ORDER BY 1;
