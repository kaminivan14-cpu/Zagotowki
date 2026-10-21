-- Production-safe synthetic transaction. No existing actor is impersonated.
-- All fixtures and mutations roll back; queued jobs are never visible to workers.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
INSERT INTO public."Locations"(id,name,active) VALUES(-210001,'ORDERS-DELETE-SMOKE-A',true),(-210002,'ORDERS-DELETE-SMOKE-B',true);
INSERT INTO auth.users(id,email) VALUES
 ('21000000-0000-4000-8000-000000000001','orders-delete-admin@example.invalid'),
 ('21000000-0000-4000-8000-000000000002','orders-delete-manager@example.invalid'),
 ('21000000-0000-4000-8000-000000000003','orders-delete-employee@example.invalid');
INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES
 (-210001,'ORDERS-DELETE-SMOKE-ADMIN','administrator',-210001,true,'21000000-0000-4000-8000-000000000001'),
 (-210002,'ORDERS-DELETE-SMOKE-MANAGER','manager',-210001,true,'21000000-0000-4000-8000-000000000002'),
 (-210003,'ORDERS-DELETE-SMOKE-EMPLOYEE','employee',-210001,true,'21000000-0000-4000-8000-000000000003');
INSERT INTO public."Orders"(id,display_number,source,external_order_id,location_id,location_name_snapshot,is_test,integration_sbid) OVERRIDING SYSTEM VALUE
 SELECT -211000-n,'ORDERS-DELETE-SMOKE-'||n,'external-v1','ORDERS-DELETE-SMOKE-'||n,CASE WHEN n=5 THEN -210002 ELSE -210001 END,'ORDERS-DELETE-SMOKE',true,'ORDERS-DELETE-SMOKE-'||n FROM generate_series(1,7)n;
INSERT INTO public."Order_items"(order_id,product_name_snapshot,category_snapshot,quantity,is_external,external_product_id)
 SELECT id,'SYNTHETIC — DO NOT PREPARE','test',1,true,'DELETE-SMOKE' FROM public."Orders" WHERE id BETWEEN -211007 AND -211001 AND is_test;
INSERT INTO app_private.order_callbacks(order_id,sbid,status,payload) VALUES
 (-211001,'ORDERS-DELETE-SMOKE-1','prepared','{}'),(-211006,'ORDERS-DELETE-SMOKE-6','prepared','{}');
UPDATE app_private.order_callbacks SET lease_token='21000000-0000-4000-8000-000000000099',lease_until=now()+interval '1 minute' WHERE order_id=-211006;
DO $smoke$
DECLARE r jsonb; op uuid:=gen_random_uuid(); sid bigint; aid bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000003',true);
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.order_delete(-210001,-211001,gen_random_uuid());
  RAISE EXCEPTION 'SMOKE ordinary role unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 r:=public.order_delete(-210001,-211001,op);
 IF r<> '{"success":true,"deleted_count":1}'::jsonb THEN RAISE EXCEPTION 'SMOKE admin single'; END IF;
 IF public.order_delete(-210001,-211001,op)<>r THEN RAISE EXCEPTION 'SMOKE retry'; END IF;
 IF public.order_delete(-210001,-211001,gen_random_uuid())->>'deleted_count'<>'0' THEN RAISE EXCEPTION 'SMOKE idempotency'; END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT FROM app_private.order_callbacks WHERE order_id=-211001 AND cancelled_at IS NOT NULL AND next_attempt_at IS NULL) THEN RAISE EXCEPTION 'SMOKE callback cancellation'; END IF;
 IF NOT EXISTS(SELECT FROM public."Order_items" WHERE order_id=-211001) THEN RAISE EXCEPTION 'SMOKE retained items'; END IF;
 UPDATE public."Orders" SET sent_to_kitchen_at=now() WHERE id=-211007;
 SET LOCAL ROLE authenticated;
 sid:=(public.orders_command('open_shift','{"location_id":-210001}',gen_random_uuid())->>'shift_id')::bigint;
 aid:=(public.orders_command('claim_all','{"order_id":-211007}',gen_random_uuid())->'assignment_ids'->>0)::bigint;
 PERFORM public.orders_command('ready',jsonb_build_object('assignment_id',aid),gen_random_uuid());
 PERFORM public.orders_command('start_cutting',jsonb_build_object('assignment_id',aid,'quantity',1),gen_random_uuid());
 BEGIN
  PERFORM public.worktime_command('end',jsonb_build_object('shift_id',sid,'module','orders'),gen_random_uuid());
  RAISE EXCEPTION 'SMOKE active work unexpectedly ignored';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNFINISHED_WORK' THEN RAISE; END IF; END;
 PERFORM public.order_delete(-210001,-211007,gen_random_uuid());
 PERFORM public.worktime_command('end',jsonb_build_object('shift_id',sid,'module','orders'),gen_random_uuid());
 RESET ROLE;
 IF NOT EXISTS(SELECT FROM public."Work_shifts" WHERE id=sid AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'SMOKE worktime stranded'; END IF;
 IF NOT EXISTS(SELECT FROM public."Order_cutting_assignments" WHERE source_assignment_id=aid AND completed_at IS NULL AND issued_at IS NULL) THEN RAISE EXCEPTION 'SMOKE work history changed'; END IF;

 IF NOT EXISTS(SELECT FROM public."Order_events" WHERE order_id=-211001 AND event_type='ORDER_DELETED' AND employee_id=-210001) THEN RAISE EXCEPTION 'SMOKE single audit'; END IF;
 PERFORM set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000002',true);
 SET LOCAL ROLE authenticated;
 r:=public.order_delete(-210001,-211002,gen_random_uuid());
 IF r->>'deleted_count'<>'1' THEN RAISE EXCEPTION 'SMOKE manager single'; END IF;
 BEGIN
  PERFORM public.orders_delete_bulk(-210001,ARRAY[-211003,-211005]::bigint[],gen_random_uuid());
  RAISE EXCEPTION 'SMOKE cross-location allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.orders_delete_bulk(-210001,ARRAY[-211003,-211006]::bigint[],gen_random_uuid());
  RAISE EXCEPTION 'SMOKE leased callback allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CALLBACK_IN_FLIGHT' THEN RAISE; END IF; END;
 r:=public.orders_delete_bulk(-210001,ARRAY[-211003,-211004]::bigint[],gen_random_uuid());
 IF r->>'deleted_count'<>'2' THEN RAISE EXCEPTION 'SMOKE bulk count'; END IF;
 IF jsonb_array_length(public.orders_board(-210001))<>1 THEN RAISE EXCEPTION 'SMOKE board exclusion'; END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM public."Orders" WHERE id IN (-211005,-211006) AND deleted_at IS NULL)<>2 THEN RAISE EXCEPTION 'SMOKE unaffected scopes'; END IF;
 IF NOT EXISTS(SELECT FROM public."Order_events" WHERE event_type='ORDERS_BULK_DELETED' AND employee_id=-210002 AND metadata->>'deleted_count'='2') THEN RAISE EXCEPTION 'SMOKE bulk audit'; END IF;
 IF EXISTS(SELECT FROM public."Order_items" i LEFT JOIN public."Orders" o ON o.id=i.order_id WHERE o.id IS NULL) THEN RAISE EXCEPTION 'SMOKE orphan items'; END IF;
 IF has_function_privilege('anon','public.order_delete(bigint,bigint,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','app_private.orders_delete_apply(bigint,bigint[],uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'SMOKE ACL'; END IF;
END $smoke$;
SELECT 'ORDERS_DELETE_SYNTHETIC_SMOKE_PASS' AS result;
ROLLBACK;
