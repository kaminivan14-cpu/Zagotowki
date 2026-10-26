-- Production: only module entry for existing system roles. Preserve every other grant and scope.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ DECLARE definition text; needle text:='AND (p_role IN (''administrator'',''manager'') OR'; addition text:=E'\n (p_permission=''tasks.access'' AND p_role IN (''owner'',''director'',''expert'',''specialist'')) OR'; BEGIN
 definition:=pg_get_functiondef('app_private.role_has_permission(text,text)'::regprocedure);
 IF position(addition IN definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
 OR position('p_permission<>''orders.test.generate''' IN definition)=0 THEN
  RAISE EXCEPTION 'WORK_ACCESS_POLICY_DRIFT';
 END IF;
 EXECUTE replace(definition,needle,needle||addition);
END $$;
INSERT INTO app_private.role_permissions(role,permission)
 SELECT role,'tasks.access' FROM unnest(ARRAY['owner','director','expert','specialist']) role
 ON CONFLICT DO NOTHING;
COMMIT;
