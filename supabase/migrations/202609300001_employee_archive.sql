-- Archiving preserves employee IDs, PIN credentials, Auth users and production history.
BEGIN;
ALTER TABLE public."Employees" ADD COLUMN archived_at timestamptz;
-- All existing Auth/PIN/RLS guards require active IS TRUE. This invariant makes
-- archived accounts fail those same guards, including with an existing JWT.
ALTER TABLE public."Employees" ADD CONSTRAINT employees_archive_inactive
  CHECK (archived_at IS NULL OR active IS FALSE);
DROP FUNCTION public.auth_list_employees();
CREATE FUNCTION public.auth_list_employees()
RETURNS TABLE(id bigint,name text,role text,location_id bigint,active boolean,auth_user_id uuid,archived_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees";
BEGIN
  a:=app_private.actor();
  IF a.role NOT IN ('administrator','manager') THEN RAISE EXCEPTION 'Brak dostępu' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT e.id,e.name,e.role,e.location_id,e.active,e.auth_user_id,e.archived_at
    FROM public."Employees" e WHERE a.role='administrator' OR (e.location_id=a.location_id AND e.archived_at IS NULL) ORDER BY e.name,e.id;
END $$;

CREATE OR REPLACE FUNCTION public.auth_save_employee(p_employee_id bigint,p_name text,p_role text,p_location_id bigint,p_active boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; target public."Employees"; result bigint;
BEGIN
  -- Serialize role/account edits, including the last-administrator check.
  PERFORM pg_advisory_xact_lock(20260923,1);
  a:=app_private.actor();
  IF a.role NOT IN ('administrator','manager') OR p_employee_id=a.id THEN
    RAISE EXCEPTION 'Brak uprawnień do edycji tego konta' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('employee','su-chef','manager','administrator') OR
    p_active IS NULL OR p_name IS NULL OR length(trim(p_name))=0 THEN RAISE EXCEPTION 'Nieprawidłowe dane'; END IF;
  IF p_role<>'administrator' AND p_location_id IS NULL THEN RAISE EXCEPTION 'Wybierz lokal'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Locations" WHERE id=p_location_id AND active IS TRUE) THEN
    RAISE EXCEPTION 'Nieaktywny lub nieistniejący lokal'; END IF;
  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO target FROM public."Employees" WHERE id=p_employee_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pracownik nie istnieje'; END IF;
    IF target.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Najpierw przywróć pracownika' USING ERRCODE='42501'; END IF;
  END IF;
  IF a.role='manager' AND (p_role NOT IN ('employee','su-chef') OR p_location_id IS DISTINCT FROM a.location_id OR
    (p_employee_id IS NOT NULL AND (target.role NOT IN ('employee','su-chef') OR target.location_id IS DISTINCT FROM a.location_id))) THEN
    RAISE EXCEPTION 'Manager zarządza tylko employee i su-chef w swoim lokalu' USING ERRCODE='42501'; END IF;
  IF target.role='administrator' AND target.active IS TRUE AND (p_role<>'administrator' OR NOT p_active)
    AND NOT EXISTS (SELECT 1 FROM public."Employees" WHERE role='administrator' AND active IS TRUE AND auth_user_id IS NOT NULL AND id<>target.id) THEN
    RAISE EXCEPTION 'Nie można usunąć ostatniego aktywnego administratora'; END IF;
  IF p_employee_id IS NULL THEN
    INSERT INTO public."Employees"(name,role,location_id,active) VALUES(trim(p_name),p_role,p_location_id,p_active) RETURNING id INTO result;
  ELSE
    UPDATE public."Employees" SET name=trim(p_name),role=p_role,location_id=p_location_id,active=p_active WHERE id=p_employee_id RETURNING id INTO result;
  END IF;
  RETURN result;
END $$;


-- Uses the same serialization lock and identity guard as auth_save_employee.
-- Explicit desired actions are idempotent; repeated archive preserves its timestamp.
CREATE FUNCTION public.auth_employee_lifecycle(p_employee_id bigint,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; target public."Employees";
BEGIN
  PERFORM pg_advisory_xact_lock(20260923,1);
  a:=app_private.actor();
  IF a.role<>'administrator' OR p_employee_id=a.id THEN
    RAISE EXCEPTION 'Brak dostępu' USING ERRCODE='42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('activate','deactivate','archive','restore') THEN
    RAISE EXCEPTION 'Nieprawidłowa operacja'; END IF;
  SELECT * INTO target FROM public."Employees" WHERE id=p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pracownik nie istnieje'; END IF;
  IF p_action IN ('activate','deactivate') THEN
    PERFORM public.auth_save_employee(target.id,target.name,target.role,target.location_id,p_action='activate');
  ELSIF p_action='archive' THEN
    IF target.archived_at IS NOT NULL THEN RETURN; END IF;
    IF target.role='administrator' AND target.active IS TRUE AND NOT EXISTS
      (SELECT 1 FROM public."Employees" WHERE role='administrator' AND active IS TRUE
        AND auth_user_id IS NOT NULL AND id<>target.id) THEN
      RAISE EXCEPTION 'Nie można usunąć ostatniego aktywnego administratora'; END IF;
    UPDATE public."Employees" SET active=false,archived_at=now() WHERE id=target.id;
  ELSE
    -- A retry must not deactivate a subsequently reactivated employee.
    UPDATE public."Employees" SET active=false,archived_at=NULL
      WHERE id=target.id AND archived_at IS NOT NULL;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.auth_list_employees(),public.auth_employee_lifecycle(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_list_employees(),public.auth_employee_lifecycle(bigint,text) TO authenticated;
COMMIT;
