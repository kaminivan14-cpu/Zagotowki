-- Authenticated production operations, preserving the current-day/active-plan rules.
BEGIN;
CREATE OR REPLACE FUNCTION public.start_plan_item(p_requester_id bigint,p_item_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; p public."Plans"; item public."Plan_items";
BEGIN
  PERFORM app_private.assert_requester(p_requester_id); a:=app_private.actor();
  SELECT plan.* INTO p FROM public."Plans" plan JOIN public."Plan_items" i ON i.plan_id=plan.id WHERE i.id=p_item_id FOR UPDATE OF plan;
  IF NOT FOUND OR p.status IS DISTINCT FROM 'active' OR p.plan_date IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Warsaw')::date
    OR (a.role<>'administrator' AND a.location_id IS DISTINCT FROM p.location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do aktywnego planu na dziś' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public."Plan_items" WHERE id=p_item_id AND plan_id=p.id FOR UPDATE;
  IF NOT FOUND OR item.started_at IS NOT NULL OR item.gotowe IS TRUE THEN RAISE EXCEPTION 'Pozycja nie jest dostępna do rozpoczęcia'; END IF;
  UPDATE public."Plan_items" SET started_at=now(),completed_at=NULL,gotowe=false WHERE id=p_item_id;
END $$;

CREATE OR REPLACE FUNCTION public.complete_plan_item(p_requester_id bigint,p_item_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DECLARE a public."Employees"; p public."Plans"; item public."Plan_items";
BEGIN
  PERFORM app_private.assert_requester(p_requester_id); a:=app_private.actor();
  SELECT plan.* INTO p FROM public."Plans" plan JOIN public."Plan_items" i ON i.plan_id=plan.id WHERE i.id=p_item_id FOR UPDATE OF plan;
  IF NOT FOUND OR p.status IS DISTINCT FROM 'active' OR p.plan_date IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Warsaw')::date
    OR (a.role<>'administrator' AND a.location_id IS DISTINCT FROM p.location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do aktywnego planu na dziś' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public."Plan_items" WHERE id=p_item_id AND plan_id=p.id FOR UPDATE;
  IF NOT FOUND OR item.started_at IS NULL OR item.gotowe IS TRUE THEN RAISE EXCEPTION 'Pozycja nie jest dostępna do zakończenia'; END IF;
  UPDATE public."Plan_items" SET completed_at=now(),gotowe=true,employee_id=a.id WHERE id=p_item_id;
END $$;
REVOKE ALL ON FUNCTION public.start_plan_item(bigint,bigint),public.complete_plan_item(bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_plan_item(bigint,bigint),public.complete_plan_item(bigint,bigint) TO authenticated;
COMMIT;
