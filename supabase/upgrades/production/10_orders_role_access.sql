-- Production only: module access and existing work/cut/issue workflow; no administrative grants.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ DECLARE definition text; needle text:='AND (p_role IN (''administrator'',''manager'') OR'; BEGIN
 definition:=pg_get_functiondef('app_private.role_has_permission(text,text)'::regprocedure);
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
 OR position('p_permission<>''orders.test.generate''' IN definition)=0 THEN
  RAISE EXCEPTION 'ORDERS_ACCESS_POLICY_DRIFT';
 END IF;
 EXECUTE replace(definition,needle,needle||E'\n (p_permission IN (''orders.access'',''orders.work'',''orders.cut'',''orders.issue'') AND p_role IN (''su-chef'',''shift-manager'',''sushi-master'',''crafter'')) OR');
END $$;
INSERT INTO app_private.role_permissions(role,permission)
 SELECT role,permission FROM unnest(ARRAY['su-chef','shift-manager','sushi-master','crafter']) role
 CROSS JOIN unnest(ARRAY['orders.access','orders.work','orders.cut','orders.issue']) permission
 ON CONFLICT DO NOTHING;
COMMIT;
