-- All identities, orders and workflow changes below are synthetic and rolled back.
BEGIN;
INSERT INTO public."Locations"(id,name,active) VALUES(-260001,'ROLE-ACCESS-SMOKE-A',true),(-260002,'ROLE-ACCESS-SMOKE-B',true);
INSERT INTO auth.users(id,email) VALUES('26000000-0000-4000-8000-000000000001','role-access-smoke@example.invalid');
INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(-260001,'ROLE ACCESS SMOKE','administrator',-260001,true,'26000000-0000-4000-8000-000000000001');
DO $test$
DECLARE role_name text; caps text[]; oid bigint; iid bigint; sid bigint; aid bigint; cid bigint; part jsonb; result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','26000000-0000-4000-8000-000000000001',true);
 FOR role_name IN SELECT unnest(ARRAY['administrator','manager','su-chef','shift-manager','sushi-master','crafter']) LOOP
  UPDATE public."Employees" SET role=role_name WHERE id=-260001;
  INSERT INTO public."Orders"(source,external_order_id,display_number,location_id,location_name_snapshot,is_test,sent_to_kitchen_at,sent_by_employee_id)
   VALUES('role-access-transaction',role_name,'ROLE-ACCESS-SMOKE-'||role_name,-260001,'ROLE-ACCESS-SMOKE-A',true,now(),-260001) RETURNING id INTO oid;
  INSERT INTO public."Order_items"(order_id,product_name_snapshot,category_snapshot,quantity,is_external,external_product_id)
   VALUES(oid,'SMOKE — TEST ONLY','test',2,true,'ROLE-SMOKE') RETURNING id INTO iid;
  SET LOCAL ROLE authenticated;
  SELECT array_agg(x) INTO caps FROM public.auth_capabilities() x;
  IF NOT 'orders.access'=ANY(caps) THEN RAISE EXCEPTION 'MODULE DENIED: %',role_name; END IF;
  PERFORM public.orders_board(-260001); PERFORM public.orders_catalog(); PERFORM public.orders_shifts();
  IF role_name<>'administrator' THEN
   BEGIN PERFORM public.orders_board(-260002);RAISE EXCEPTION 'CROSS LOCATION ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  END IF;
  IF role_name IN ('administrator','manager') THEN
   IF NOT 'orders.delete'=ANY(caps) THEN RAISE EXCEPTION 'DELETE REGRESSION'; END IF;
   result:=public.order_delete(-260001,oid,gen_random_uuid());
   IF result->>'deleted_count'<>'1' THEN RAISE EXCEPTION 'DELETE REGRESSION'; END IF;
   PERFORM public.orders_delete_bulk(-260001,ARRAY[oid],gen_random_uuid());
  ELSE
   IF 'orders.delete'=ANY(caps) THEN RAISE EXCEPTION 'DELETE GRANTED'; END IF;
   BEGIN PERFORM public.order_delete(-260001,oid,gen_random_uuid());RAISE EXCEPTION 'DELETE ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   BEGIN PERFORM public.orders_delete_bulk(-260001,ARRAY[oid],gen_random_uuid());RAISE EXCEPTION 'BULK ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   sid:=(public.orders_command('open_shift',jsonb_build_object('location_id',-260001),gen_random_uuid())->>'shift_id')::bigint;
   part:=public.orders_command('claim',jsonb_build_object('order_id',oid,'items',jsonb_build_array(jsonb_build_object('item_id',iid,'quantity',1))),gen_random_uuid());
   PERFORM public.orders_command('claim_all',jsonb_build_object('order_id',oid),gen_random_uuid());
   RESET ROLE;
   FOR aid IN SELECT id FROM public."Order_item_assignments" WHERE order_item_id=iid LOOP
    SET LOCAL ROLE authenticated;
    PERFORM public.orders_command('ready',jsonb_build_object('assignment_id',aid),gen_random_uuid());
    cid:=(public.orders_command('start_cutting',jsonb_build_object('assignment_id',aid,'quantity',1),gen_random_uuid())->>'cutting_id')::bigint;
    PERFORM public.orders_command('complete_cutting',jsonb_build_object('cutting_id',cid),gen_random_uuid());
    PERFORM public.orders_command('issue',jsonb_build_object('cutting_id',cid),gen_random_uuid());
    RESET ROLE;
   END LOOP;
   IF app_private.orders_status(oid)<>'COMPLETED' THEN RAISE EXCEPTION 'WORKFLOW INCOMPLETE: %',role_name;END IF;
   IF EXISTS(SELECT FROM app_private.order_callbacks WHERE order_id=oid) THEN RAISE EXCEPTION 'UNEXPECTED CALLBACK';END IF;
   SET LOCAL ROLE authenticated;
   PERFORM public.orders_command('end_shift',jsonb_build_object('shift_id',sid),gen_random_uuid());
  END IF;
  RESET ROLE;
 END LOOP;
END $test$;
SELECT 'SIX_ROLES_ACCESS_WORKFLOW_SCOPE_DELETE_PASS' result;
ROLLBACK;
