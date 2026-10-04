BEGIN READ ONLY;
SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public."Work_shifts"'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='public."Work_shifts"'::regclass),
 'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='Work_shifts'),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public."Work_shifts"'::regclass AND NOT tgisinternal),
 'functions',(SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN ('app_private.actor()'::regprocedure,'app_private.has_permission(text)'::regprocedure,'app_private.orders_actor(text,bigint)'::regprocedure,'public.orders_command(text,jsonb,uuid)'::regprocedure,'public.auth_capabilities()'::regprocedure)),
 'worktime_table',to_regclass('public."Work_shift_events"'),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public."Work_shifts"'::regclass)
) AS audit;
COMMIT;
