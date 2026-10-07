-- Production rollout seed. Explicit invocation only; never added to the UAT generator.
-- Transaction + table lock make check/insert safe on concurrent reruns without changing existing names.
BEGIN;
LOCK TABLE public."Locations" IN SHARE ROW EXCLUSIVE MODE;
DO $$ DECLARE target text; n integer; internal_id bigint; code text; alternatives text[]; existing bigint; BEGIN
 FOREACH target IN ARRAY ARRAY['SB_Podgorna','SB_Katowice'] LOOP
  SELECT count(*) INTO n FROM public."Locations" WHERE name=target;
  IF n>1 THEN RAISE EXCEPTION 'STOP duplicate location name %',target; END IF;
  IF n=0 THEN INSERT INTO public."Locations"(name,active) VALUES(target,true); END IF;
 END LOOP;
 FOR code,alternatives IN SELECT * FROM (VALUES
 ('podgorna',ARRAY['SB_Podgorna']),('czerwca',ARRAY['SB_Poznan 2.0','SB_Poznań 2.0']),
 ('pulaski',ARRAY['SB_Wroclaw','SB_Wrocław']),('damrota',ARRAY['SB_Katowice'])) x(code,names) LOOP
  SELECT count(*),min(id) INTO n,internal_id FROM public."Locations" WHERE name=ANY(alternatives);
  IF n<>1 THEN RAISE EXCEPTION 'STOP missing/ambiguous location for %',code; END IF;
  IF NOT EXISTS(SELECT FROM public."Locations" WHERE id=internal_id AND active IS TRUE) THEN RAISE EXCEPTION 'STOP inactive location for %',code; END IF;
  INSERT INTO app_private.order_location_mappings(source,external_location_id,location_id)
   VALUES('external-v1',code,internal_id) ON CONFLICT(source,external_location_id) DO NOTHING;
  SELECT location_id INTO existing FROM app_private.order_location_mappings WHERE source='external-v1' AND external_location_id=code;
  IF existing IS DISTINCT FROM internal_id THEN RAISE EXCEPTION 'STOP mapping conflict for %',code; END IF;
 END LOOP;
END $$;
COMMIT;
