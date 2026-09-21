-- DO RĘCZNEGO URUCHOMIENIA. Nie uruchomiono na produkcji.
-- Transakcyjne: nietypowa definicja istniejącego RPC przerywa CAŁĄ migrację.
-- Przed uruchomieniem: sprawdzić triggery Plans.
-- Dzień produkcji: Europe/Warsaw, niezależnie od strefy sesji PostgreSQL.
BEGIN;

CREATE FUNCTION public.reopen_production_plan(
  p_requester_id bigint,
  p_plan_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $reopen$
DECLARE
  requester public."Employees"%ROWTYPE;
  target_plan public."Plans"%ROWTYPE;
BEGIN
  SELECT * INTO requester FROM public."Employees"
    WHERE id = p_requester_id AND active = true
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nieaktywny lub nieistniejący pracownik' USING ERRCODE = '42501';
  END IF;
  IF requester.role IS NULL OR requester.role NOT IN ('administrator', 'manager', 'su-chef') THEN
    RAISE EXCEPTION 'Brak uprawnień do wznowienia planu' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_plan FROM public."Plans" WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan nie istnieje' USING ERRCODE = 'P0002';
  END IF;
  IF requester.role <> 'administrator' AND
    (requester.location_id IS NULL OR requester.location_id IS DISTINCT FROM target_plan.location_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do tego lokalu' USING ERRCODE = '42501';
  END IF;
  IF target_plan.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Wznowić można wyłącznie zakończony plan' USING ERRCODE = '55000';
  END IF;

  UPDATE public."Plans" SET status = 'active' WHERE id = p_plan_id;
  -- Żadnych operacji na Plan_items ani innych polach Plans.
END;
$reopen$;

-- Tak jak istniejący frontend: identyfikacja przez p_requester_id.
-- To nie wprowadza nowego systemu uwierzytelniania.
REVOKE ALL ON FUNCTION public.reopen_production_plan(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_production_plan(bigint, bigint) TO anon, authenticated;

-- Nie odtwarzamy istniejącej logiki start/complete na podstawie opisu.
-- Pobieramy rzeczywiste definicje z pg_proc i opakowujemy oryginalny blok
-- dodatkowym warunkiem. CREATE OR REPLACE zachowuje tożsamość, ACL i właściciela;
-- nagłówek z pg_get_functiondef zachowuje RETURNS, SECURITY, SET itd.
DO $migration$
DECLARE
  function_name text;
  function_oid oid;
  source text;
  definition text;
  wrapped_source text;
  language_name text;
  argument_names text[];
  marker constant text := '-- ZAGOTOWKI_CURRENT_DATE_GUARD_V1';
BEGIN
  FOREACH function_name IN ARRAY ARRAY['start_plan_item', 'complete_plan_item'] LOOP
    function_oid := to_regprocedure(format('public.%I(bigint,bigint)', function_name));
    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'Brak oczekiwanej sygnatury %(bigint,bigint)', function_name;
    END IF;
    SELECT p.prosrc, pg_get_functiondef(p.oid), l.lanname, p.proargnames
      INTO source, definition, language_name, argument_names
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.oid = function_oid;

    IF position(marker IN source) > 0 THEN CONTINUE; END IF;
    IF language_name <> 'plpgsql' OR
      argument_names[1] IS DISTINCT FROM 'p_requester_id' OR
      argument_names[2] IS DISTINCT FROM 'p_item_id' OR
      source !~* '^[[:space:]]*(DECLARE|BEGIN)([[:space:]]|$)' OR
      source !~* 'END[[:space:]]*;?[[:space:]]*$' THEN
      RAISE EXCEPTION 'Nietypowa definicja %: wymaga ręcznego przeglądu. Migracja przerwana.', function_name;
    END IF;
    IF length(definition) - length(replace(definition, source, '')) <> length(source) THEN
      RAISE EXCEPTION 'Nie można jednoznacznie wyodrębnić ciała %', function_name;
    END IF;

    wrapped_source := E'BEGIN\n' || marker || E'\n' || $guard$
  -- Dotyczy wszystkich ról. Brak lub inna data nie może uruchomić starego RPC.
  -- Blokada planu utrzymuje status/datę stabilne do końca operacji.
  PERFORM 1
  FROM public."Plans" AS date_guard_plan
  JOIN public."Plan_items" AS date_guard_item ON date_guard_item.plan_id = date_guard_plan.id
  WHERE date_guard_item.id = p_item_id
    AND date_guard_plan.plan_date = (now() AT TIME ZONE 'Europe/Warsaw')::date
  FOR UPDATE OF date_guard_plan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operacja jest dostępna wyłącznie dla planu na dziś' USING ERRCODE = '42501';
  END IF;
$guard$ || E'\n' || rtrim(source, E' \t\r\n');
    IF right(wrapped_source, 1) <> ';' THEN wrapped_source := wrapped_source || ';'; END IF;
    wrapped_source := wrapped_source || E'\nEND;\n';
    EXECUTE overlay(definition PLACING wrapped_source FROM position(source IN definition) FOR length(source));
  END LOOP;
END;
$migration$;

COMMIT;

-- Po ręcznej weryfikacji migracji włączyć VITE_PLAN_REOPEN_ENABLED=true
-- i przebudować frontend. Nie włączamy flagi automatycznie.
-- Guard używa dnia Europe/Warsaw; migracja nie zmienia strefy sesji PostgreSQL.
