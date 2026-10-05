BEGIN;
-- UAT simulator line classifications only. Catalog rows and RPC locking remain unchanged.
-- No new tables, permissions or public RPCs. The signed issuer check stays in orders_command.
CREATE OR REPLACE FUNCTION app_private.orders_import(p_source text,p_external text,p_location bigint,p_items jsonb,p_test boolean,p_ready_at timestamptz,p_prep integer) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE payload jsonb; previous app_private.order_imports; result_id bigint; line jsonb; child jsonb; prod public."Order_products"; loc public."Locations"; parent_id bigint; qty integer; BEGIN
 payload:=jsonb_build_object('location_id',p_location,'items',p_items,'is_test',p_test);
 IF p_ready_at IS NOT NULL THEN payload:=payload||jsonb_build_object('ready_at',p_ready_at); END IF;
 IF p_prep IS NOT NULL THEN payload:=payload||jsonb_build_object('estimated_prep_minutes',p_prep); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_source||':'||p_external,17));
 SELECT * INTO previous FROM app_private.order_imports WHERE source=p_source AND external_order_id=p_external;
 IF FOUND THEN IF previous.normalized_payload<>payload THEN RAISE EXCEPTION 'IMPORT_CONFLICT'; END IF; RETURN previous.order_id; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
 SELECT * INTO loc FROM public."Locations" WHERE id=p_location AND active IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOCATION_UNMAPPED'; END IF;
 INSERT INTO public."Orders"(source,external_order_id,display_number,location_id,location_name_snapshot,is_test,ready_at,estimated_prep_minutes)
 VALUES(p_source,p_external,'PENDING-'||gen_random_uuid(),p_location,loc.name,p_test,p_ready_at,p_prep) RETURNING id INTO result_id;
 UPDATE public."Orders" SET display_number=(CASE WHEN p_test THEN 'TEST-' ELSE 'ORDER-' END)||lpad(result_id::text,6,'0') WHERE id=result_id;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF line - ARRAY['product_id','quantity','children','item_type'] <> '{}'::jsonb OR coalesce(line->>'quantity','') !~ '^[1-9][0-9]*$' OR (line->>'quantity')::numeric>10000 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  qty:=(line->>'quantity')::integer;
  SELECT * INTO prod FROM public."Order_products" WHERE id=(line->>'product_id')::bigint AND active AND (NOT p_test OR is_test) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNMAPPED'; END IF;
  IF line ? 'item_type' THEN
   IF NOT p_test OR coalesce(line->>'item_type','') NOT IN ('product','set','addon','drink') THEN RAISE EXCEPTION 'INVALID_ITEM_TYPE'; END IF;
   IF (line->>'item_type'='set') IS DISTINCT FROM (line ? 'children') THEN RAISE EXCEPTION 'INVALID_SET'; END IF;
   IF line->>'item_type'<>'set' THEN prod.item_type:=line->>'item_type'; END IF;
  END IF;
  IF line ? 'children' THEN
   IF jsonb_typeof(line->'children') IS DISTINCT FROM 'array' OR jsonb_array_length(line->'children') NOT BETWEEN 1 AND 50 OR prod.item_type='drink' THEN RAISE EXCEPTION 'INVALID_SET'; END IF;
   INSERT INTO public."Order_items"(order_id,order_product_id,product_name_snapshot,category_snapshot,quantity,item_type)
   VALUES(result_id,prod.id,prod.name,prod.category,qty,'set') RETURNING id INTO parent_id;
   FOR child IN SELECT value FROM jsonb_array_elements(line->'children') LOOP
    IF child - ARRAY['product_id','quantity','item_type'] <> '{}'::jsonb OR coalesce(child->>'quantity','') !~ '^[1-9][0-9]*$' OR (child->>'quantity')::numeric*qty>10000 THEN RAISE EXCEPTION 'INVALID_SET_COMPONENT'; END IF;
    SELECT * INTO prod FROM public."Order_products" WHERE id=(child->>'product_id')::bigint AND active AND (NOT p_test OR is_test) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNMAPPED'; END IF;
    IF child ? 'item_type' THEN
     IF NOT p_test OR coalesce(child->>'item_type','') NOT IN ('product','addon','drink') THEN RAISE EXCEPTION 'INVALID_ITEM_TYPE'; END IF;
     prod.item_type:=child->>'item_type';
    END IF;
    INSERT INTO public."Order_items"(order_id,order_product_id,product_name_snapshot,category_snapshot,quantity,item_type,parent_item_id)
    VALUES(result_id,prod.id,prod.name,prod.category,(child->>'quantity')::integer*qty,prod.item_type,parent_id);
   END LOOP;
  ELSE
   INSERT INTO public."Order_items"(order_id,order_product_id,product_name_snapshot,category_snapshot,quantity,item_type)
   VALUES(result_id,prod.id,prod.name,prod.category,qty,prod.item_type);
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public."Order_items" WHERE order_id=result_id AND item_type<>'set')>50 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
 INSERT INTO app_private.order_imports VALUES(p_source,p_external,payload,result_id,now());
 PERFORM app_private.orders_event(result_id,NULL,NULL,'ORDER_CREATED'); RETURN result_id;
END $$;
COMMIT;
