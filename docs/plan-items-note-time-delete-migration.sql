-- DO RĘCZNEGO PRZEJRZENIA I URUCHOMIENIA. Nie wykonano na Supabase.
-- Źródło: docs/plan-items-schema-audit-result.json.
-- Najpierw migracja, potem frontend. Jedna transakcja; ponowne wykonanie dozwolone.
-- Zachowuje RLS, istniejące ACL i sygnatury. Nowe overloady mają jawne argumenty.
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $audit$
DECLARE actual text;
BEGIN
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.create_production_plan(bigint,bigint,date,jsonb)');
  IF actual IS NULL OR actual NOT IN ('94ebd47cd286427031f4036f28ffb935','bbb2922e987fd7804796b131462d77c6') THEN
    RAISE EXCEPTION 'Definicja create_production_plan różni się od audytu; przerwano migrację';
  END IF;
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.update_production_plan(bigint,bigint,jsonb)');
  IF actual IS NULL OR actual NOT IN ('17e4f7af48868eef66bad6e97046b3b2','aaa8489bc4527328f1ae9eb551abf6b1') THEN
    RAISE EXCEPTION 'Definicja update_production_plan różni się od audytu; przerwano migrację';
  END IF;
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.add_plan_item(bigint,bigint,text,numeric,text,text,bigint)');
  IF actual IS NULL OR actual NOT IN ('cbc1d226a3f1dcb76d7f0cc2c8b6990a','f8155c9de8b34c86a65726f5dee72a91') THEN
    RAISE EXCEPTION 'Definicja add_plan_item różni się od audytu; przerwano migrację';
  END IF;
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.update_plan_item(bigint,bigint,text,numeric,text,text,bigint)');
  IF actual IS NULL OR actual NOT IN ('0818ff5897a1f285e9f28335d2a6e677','abd1d9f1d162bde1dc90621d7e4e2bde') THEN
    RAISE EXCEPTION 'Definicja update_plan_item różni się od audytu; przerwano migrację';
  END IF;
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.delete_plan_item(bigint,bigint)');
  IF actual IS NULL OR actual NOT IN ('4f7a33cd1ed9a779fa17316f9af97bcb','9026737e2f19f64c331f46efcdb2925e') THEN
    RAISE EXCEPTION 'Definicja delete_plan_item różni się od audytu; przerwano migrację';
  END IF;
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.start_plan_item(bigint,bigint)');
  IF actual IS NULL OR actual NOT IN ('d183ffbb20ffcafc2301c45d8aac7b9f') THEN
    RAISE EXCEPTION 'Definicja start_plan_item różni się od audytu; przerwano migrację';
  END IF;
  SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = to_regprocedure('public.complete_plan_item(bigint,bigint)');
  IF actual IS NULL OR actual NOT IN ('6e56635c103150d66c9a8ccc50e59552') THEN
    RAISE EXCEPTION 'Definicja complete_plan_item różni się od audytu; przerwano migrację';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."Plan_items"'::regclass
    AND confrelid = 'public."Plans"'::regclass AND conname = 'Plan_items_plan_id_fkey' AND confdeltype = 'c')
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f'
      AND confrelid IN ('public."Plans"'::regclass, 'public."Plan_items"'::regclass)
      AND conname <> 'Plan_items_plan_id_fkey')
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
      AND tgrelid IN ('public."Plans"'::regclass, 'public."Plan_items"'::regclass)) THEN
    RAISE EXCEPTION 'Zmienione FK lub triggery planów wymagają nowego audytu';
  END IF;
END;
$audit$;

ALTER TABLE public."Plan_items" ADD COLUMN IF NOT EXISTS note text NULL;
ALTER TABLE public."Plan_items" ADD COLUMN IF NOT EXISTS ready_time time without time zone NULL;
DO $columns$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public."Plan_items"'::regclass
    AND attname = 'note' AND atttypid = 'text'::regtype AND NOT attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public."Plan_items"'::regclass
    AND attname = 'ready_time' AND atttypid = 'time without time zone'::regtype AND NOT attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Istniejące kolumny note/ready_time mają niezgodne typy lub NULL';
  END IF;
END;
$columns$;

-- create_production_plan(bigint,bigint,date,jsonb)
CREATE OR REPLACE FUNCTION public.create_production_plan(p_requester_id bigint, p_location_id bigint, p_plan_date date, p_items jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role text;
  v_user_location_id bigint;
  v_plan_id bigint;
begin

  select role, location_id
  into v_role, v_user_location_id
  from public."Employees"
  where id = p_requester_id
    and active = true;

  if not found then
    raise exception 'Brak dostępu';
  end if;

  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') then
    raise exception 'Nie masz uprawnień do tworzenia planu';
  end if;

  if v_role <> 'administrator'
     and v_user_location_id IS DISTINCT FROM p_location_id then
    raise exception 'Nie masz uprawnień do tego lokalu';
  end if;

  insert into public."Plans" (
    plan_date,
    status,
    location_id
  )
  values (
    p_plan_date,
    'active',
    p_location_id
  )
  returning id into v_plan_id;

  insert into public."Plan_items" (
    plan_id,
    product_external_id,
    nazwa,
    ilosc,
    jednostka,
    priorytet,
    note,
    ready_time,
    gotowe
  )
  select
    v_plan_id,
    x.product_external_id,
    x.nazwa,
    x.ilosc,
    x.jednostka,
    x.priorytet,
    NULLIF(btrim(x.note), ''),
    x.ready_time,
    false
  from jsonb_to_recordset(p_items) as x(
    product_external_id bigint,
    nazwa text,
    ilosc numeric,
    jednostka text,
    priorytet text,
    note text,
    ready_time time without time zone
  );

  return v_plan_id;

end;
$function$
;

-- update_production_plan(bigint,bigint,jsonb)
CREATE OR REPLACE FUNCTION public.update_production_plan(p_requester_id bigint, p_plan_id bigint, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role text;
  v_user_location_id bigint;
  v_plan_location_id bigint;
begin

  select role, location_id
  into v_role, v_user_location_id
  from public."Employees"
  where id = p_requester_id
    and active = true;

  if not found then
    raise exception 'Brak dostępu';
  end if;

  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') then
    raise exception 'Nie masz uprawnień do edycji planu';
  end if;

  select location_id
  into v_plan_location_id
  from public."Plans"
  where id = p_plan_id
    and status = 'active' FOR UPDATE;

  if not found then
    raise exception 'Nie znaleziono aktywnego planu';
  end if;

  if v_role <> 'administrator'
     and v_user_location_id IS DISTINCT FROM v_plan_location_id then
    raise exception 'Nie masz uprawnień do tego lokalu';
  end if;

  -- Nie wolno usunąć śladów produkcji przez zbiorczą edycję.
  IF EXISTS (SELECT 1 FROM public."Plan_items" WHERE plan_id = p_plan_id
    AND (started_at IS NOT NULL OR completed_at IS NOT NULL OR gotowe IS TRUE OR employee_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Nie można zastąpić pozycji rozpoczętego planu' USING ERRCODE = '55000';
  END IF;

  delete from public."Plan_items"
  where plan_id = p_plan_id;

  insert into public."Plan_items" (
    plan_id,
    product_external_id,
    nazwa,
    ilosc,
    jednostka,
    priorytet,
    note,
    ready_time,
    gotowe
  )
  select
    p_plan_id,
    x.product_external_id,
    x.nazwa,
    x.ilosc,
    x.jednostka,
    x.priorytet,
    NULLIF(btrim(x.note), ''),
    x.ready_time,
    false
  from jsonb_to_recordset(p_items) as x(
    product_external_id bigint,
    nazwa text,
    ilosc numeric,
    jednostka text,
    priorytet text,
    note text,
    ready_time time without time zone
  );

end;
$function$
;

-- add_plan_item(bigint,bigint,text,numeric,text,text,bigint)
CREATE OR REPLACE FUNCTION public.add_plan_item(p_requester_id bigint, p_plan_id bigint, p_nazwa text, p_ilosc numeric, p_jednostka text, p_priorytet text, p_product_external_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_role text;
  v_user_location_id bigint;
  v_plan_location_id bigint;
  v_item_id bigint;
BEGIN

  SELECT role, location_id
  INTO v_role, v_user_location_id
  FROM public."Employees"
  WHERE id = p_requester_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;

  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Nie masz uprawnień do dodawania pozycji';
  END IF;

  SELECT location_id
  INTO v_plan_location_id
  FROM public."Plans"
  WHERE id = p_plan_id
    and status = 'active' FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono aktywnego planu';
  END IF;

  IF v_role <> 'administrator'
     AND v_user_location_id IS DISTINCT FROM v_plan_location_id THEN
    RAISE EXCEPTION 'Nie masz uprawnień do tego lokalu';
  END IF;

  IF p_nazwa IS NULL OR trim(p_nazwa) = '' THEN
    RAISE EXCEPTION 'Nazwa jest wymagana';
  END IF;

  IF p_ilosc IS NULL OR p_ilosc <= 0 THEN
    RAISE EXCEPTION 'Ilość musi być większa od 0';
  END IF;

  IF p_jednostka NOT IN ('g', 'kg', 'ml', 'l', 'szt.') THEN
    RAISE EXCEPTION 'Nieprawidłowa jednostka';
  END IF;

  IF p_priorytet NOT IN ('normalny', 'wysoki', 'pilny') THEN
    RAISE EXCEPTION 'Nieprawidłowy priorytet';
  END IF;

  INSERT INTO public."Plan_items" (
    plan_id,
    product_external_id,
    nazwa,
    ilosc,
    jednostka,
    priorytet,
    gotowe
  )
  VALUES (
    p_plan_id,
    p_product_external_id,
    trim(p_nazwa),
    p_ilosc,
    p_jednostka,
    p_priorytet,
    false
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;

END;
$function$
;

-- add_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone)
CREATE OR REPLACE FUNCTION public.add_plan_item(p_requester_id bigint, p_plan_id bigint, p_nazwa text, p_ilosc numeric, p_jednostka text, p_priorytet text, p_product_external_id bigint, p_note text, p_ready_time time without time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_role text;
  v_user_location_id bigint;
  v_plan_location_id bigint;
  v_item_id bigint;
BEGIN

  SELECT role, location_id
  INTO v_role, v_user_location_id
  FROM public."Employees"
  WHERE id = p_requester_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;

  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Nie masz uprawnień do dodawania pozycji';
  END IF;

  SELECT location_id
  INTO v_plan_location_id
  FROM public."Plans"
  WHERE id = p_plan_id
    and status = 'active' FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono aktywnego planu';
  END IF;

  IF v_role <> 'administrator'
     AND v_user_location_id IS DISTINCT FROM v_plan_location_id THEN
    RAISE EXCEPTION 'Nie masz uprawnień do tego lokalu';
  END IF;

  IF p_nazwa IS NULL OR trim(p_nazwa) = '' THEN
    RAISE EXCEPTION 'Nazwa jest wymagana';
  END IF;

  IF p_ilosc IS NULL OR p_ilosc <= 0 THEN
    RAISE EXCEPTION 'Ilość musi być większa od 0';
  END IF;

  IF p_jednostka NOT IN ('g', 'kg', 'ml', 'l', 'szt.') THEN
    RAISE EXCEPTION 'Nieprawidłowa jednostka';
  END IF;

  IF p_priorytet NOT IN ('normalny', 'wysoki', 'pilny') THEN
    RAISE EXCEPTION 'Nieprawidłowy priorytet';
  END IF;

  INSERT INTO public."Plan_items" (
    plan_id,
    product_external_id,
    nazwa,
    ilosc,
    jednostka,
    priorytet,
    note,
    ready_time,
    gotowe
  )
  VALUES (
    p_plan_id,
    p_product_external_id,
    trim(p_nazwa),
    p_ilosc,
    p_jednostka,
    p_priorytet,
    NULLIF(btrim(p_note), ''),
    p_ready_time,
    false
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;

END;
$function$
;

REVOKE ALL ON FUNCTION public.add_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone) TO anon, authenticated, service_role;

-- update_plan_item(bigint,bigint,text,numeric,text,text,bigint)
CREATE OR REPLACE FUNCTION public.update_plan_item(p_requester_id bigint, p_item_id bigint, p_nazwa text, p_ilosc numeric, p_jednostka text, p_priorytet text, p_product_external_id bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_role text;
  v_user_location_id bigint;
  v_plan_location_id bigint;
  v_started_at timestamptz;
  v_gotowe boolean;
  v_completed_at timestamptz;
  v_employee_id bigint;
BEGIN

  SELECT e.role, e.location_id
  INTO v_role, v_user_location_id
  FROM public."Employees" e
  WHERE e.id = p_requester_id
    AND e.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;

  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Nie masz uprawnień do edycji pozycji';
  END IF;

  PERFORM 1 FROM public."Plans" p
  JOIN public."Plan_items" pi ON pi.plan_id = p.id
  WHERE pi.id = p_item_id FOR UPDATE OF p;

  SELECT
    p.location_id,
    pi.started_at,
    pi.completed_at,
    pi.employee_id,
    COALESCE(pi.gotowe, false)
  INTO
    v_plan_location_id,
    v_started_at,
    v_completed_at,
    v_employee_id,
    v_gotowe
  FROM public."Plan_items" pi
  JOIN public."Plans" p
    ON p.id = pi.plan_id
  WHERE pi.id = p_item_id
    AND p.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono pozycji w aktywnym planie';
  END IF;

  IF v_role <> 'administrator'
     AND v_user_location_id IS DISTINCT FROM v_plan_location_id THEN
    RAISE EXCEPTION 'Nie masz uprawnień do tego lokalu';
  END IF;

  IF v_started_at IS NOT NULL OR v_completed_at IS NOT NULL OR v_employee_id IS NOT NULL OR v_gotowe THEN
    RAISE EXCEPTION 'Nie można edytować rozpoczętej pozycji';
  END IF;

  IF p_nazwa IS NULL OR trim(p_nazwa) = '' THEN
    RAISE EXCEPTION 'Nazwa jest wymagana';
  END IF;

  IF p_ilosc IS NULL OR p_ilosc <= 0 THEN
    RAISE EXCEPTION 'Ilość musi być większa od 0';
  END IF;

  IF p_jednostka NOT IN ('g', 'kg', 'ml', 'l', 'szt.') THEN
    RAISE EXCEPTION 'Nieprawidłowa jednostka';
  END IF;

  IF p_priorytet NOT IN ('normalny', 'wysoki', 'pilny') THEN
    RAISE EXCEPTION 'Nieprawidłowy priorytet';
  END IF;

  UPDATE public."Plan_items"
  SET
    product_external_id = p_product_external_id,
    nazwa = trim(p_nazwa),
    ilosc = p_ilosc,
    jednostka = p_jednostka,
    priorytet = p_priorytet
  WHERE id = p_item_id;

END;
$function$
;

-- update_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone)
CREATE OR REPLACE FUNCTION public.update_plan_item(p_requester_id bigint, p_item_id bigint, p_nazwa text, p_ilosc numeric, p_jednostka text, p_priorytet text, p_product_external_id bigint, p_note text, p_ready_time time without time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_role text;
  v_user_location_id bigint;
  v_plan_location_id bigint;
  v_started_at timestamptz;
  v_gotowe boolean;
  v_completed_at timestamptz;
  v_employee_id bigint;
BEGIN

  SELECT e.role, e.location_id
  INTO v_role, v_user_location_id
  FROM public."Employees" e
  WHERE e.id = p_requester_id
    AND e.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;

  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Nie masz uprawnień do edycji pozycji';
  END IF;

  PERFORM 1 FROM public."Plans" p
  JOIN public."Plan_items" pi ON pi.plan_id = p.id
  WHERE pi.id = p_item_id FOR UPDATE OF p;

  SELECT
    p.location_id,
    pi.started_at,
    pi.completed_at,
    pi.employee_id,
    COALESCE(pi.gotowe, false)
  INTO
    v_plan_location_id,
    v_started_at,
    v_completed_at,
    v_employee_id,
    v_gotowe
  FROM public."Plan_items" pi
  JOIN public."Plans" p
    ON p.id = pi.plan_id
  WHERE pi.id = p_item_id
    AND p.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono pozycji w aktywnym planie';
  END IF;

  IF v_role <> 'administrator'
     AND v_user_location_id IS DISTINCT FROM v_plan_location_id THEN
    RAISE EXCEPTION 'Nie masz uprawnień do tego lokalu';
  END IF;

  IF v_started_at IS NOT NULL OR v_completed_at IS NOT NULL OR v_employee_id IS NOT NULL OR v_gotowe THEN
    RAISE EXCEPTION 'Nie można edytować rozpoczętej pozycji';
  END IF;

  IF p_nazwa IS NULL OR trim(p_nazwa) = '' THEN
    RAISE EXCEPTION 'Nazwa jest wymagana';
  END IF;

  IF p_ilosc IS NULL OR p_ilosc <= 0 THEN
    RAISE EXCEPTION 'Ilość musi być większa od 0';
  END IF;

  IF p_jednostka NOT IN ('g', 'kg', 'ml', 'l', 'szt.') THEN
    RAISE EXCEPTION 'Nieprawidłowa jednostka';
  END IF;

  IF p_priorytet NOT IN ('normalny', 'wysoki', 'pilny') THEN
    RAISE EXCEPTION 'Nieprawidłowy priorytet';
  END IF;

  UPDATE public."Plan_items"
  SET
    product_external_id = p_product_external_id,
    nazwa = trim(p_nazwa),
    ilosc = p_ilosc,
    jednostka = p_jednostka,
    priorytet = p_priorytet,
    note = NULLIF(btrim(p_note), ''),
    ready_time = p_ready_time
  WHERE id = p_item_id;

END;
$function$
;

REVOKE ALL ON FUNCTION public.update_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_plan_item(bigint,bigint,text,numeric,text,text,bigint,text,time without time zone) TO anon, authenticated, service_role;

-- delete_plan_item(bigint,bigint)
CREATE OR REPLACE FUNCTION public.delete_plan_item(p_requester_id bigint, p_item_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_role text;
  v_user_location_id bigint;

  v_plan_location_id bigint;
  v_started_at timestamptz;
  v_gotowe boolean;
  v_completed_at timestamptz;
  v_employee_id bigint;
BEGIN

  -- Kto wykonuje operację?
  SELECT
    e.role,
    e.location_id
  INTO
    v_role,
    v_user_location_id
  FROM public."Employees" e
  WHERE e.id = p_requester_id
    AND e.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;

  -- Tylko administrator, manager i su-chef
  if v_role IS NULL OR v_role not in ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Nie masz uprawnień do usuwania pozycji';
  END IF;

  PERFORM 1 FROM public."Plans" p
  JOIN public."Plan_items" pi ON pi.plan_id = p.id
  WHERE pi.id = p_item_id FOR UPDATE OF p;

  -- Pobieramy pozycję i jej plan
  SELECT
    p.location_id,
    pi.started_at,
    pi.completed_at,
    pi.employee_id,
    COALESCE(pi.gotowe, false)
  INTO
    v_plan_location_id,
    v_started_at,
    v_completed_at,
    v_employee_id,
    v_gotowe
  FROM public."Plan_items" pi
  JOIN public."Plans" p
    ON p.id = pi.plan_id
  WHERE pi.id = p_item_id
    AND p.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono pozycji w aktywnym planie';
  END IF;

  -- Manager i su-chef tylko w swoim lokalu
  IF v_role <> 'administrator'
     AND v_user_location_id IS DISTINCT FROM v_plan_location_id THEN
    RAISE EXCEPTION 'Nie masz uprawnień do tego lokalu';
  END IF;

  -- Rozpoczętej pracy nie wolno usuwać
  IF v_started_at IS NOT NULL OR v_completed_at IS NOT NULL OR v_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Nie można usunąć rozpoczętej pozycji';
  END IF;

  -- Gotowej pozycji tym bardziej nie usuwamy
  IF v_gotowe THEN
    RAISE EXCEPTION 'Nie można usunąć zakończonej pozycji';
  END IF;

  DELETE FROM public."Plan_items"
  WHERE id = p_item_id;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_production_plan(p_requester_id bigint, p_plan_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $delete$
DECLARE
  requester public."Employees"%ROWTYPE;
  target_plan public."Plans"%ROWTYPE;
BEGIN
  SELECT * INTO requester FROM public."Employees"
    WHERE id = p_requester_id AND active = true FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nieaktywny lub nieistniejący pracownik' USING ERRCODE = '42501';
  END IF;
  IF requester.role IS NULL OR requester.role NOT IN ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Brak uprawnień do usuwania planu' USING ERRCODE = '42501';
  END IF;
  -- Ta sama blokada co w audytowanych start_plan_item/complete_plan_item.
  SELECT * INTO target_plan FROM public."Plans" WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan nie istnieje' USING ERRCODE = 'P0002';
  END IF;
  IF requester.role <> 'administrator' AND
    (requester.location_id IS NULL OR requester.location_id IS DISTINCT FROM target_plan.location_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do tego lokalu' USING ERRCODE = '42501';
  END IF;
  IF target_plan.status IS DISTINCT FROM 'active' OR EXISTS (
    SELECT 1 FROM public."Plan_items" WHERE plan_id = p_plan_id AND
      (started_at IS NOT NULL OR completed_at IS NOT NULL OR gotowe IS TRUE OR employee_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Nie można usunąć rozpoczętego lub zakończonego planu. Historia pozostaje zachowana.' USING ERRCODE = '55000';
  END IF;
  DELETE FROM public."Plans" WHERE id = p_plan_id;
END;
$delete$;
REVOKE ALL ON FUNCTION public.delete_production_plan(bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_production_plan(bigint,bigint) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
