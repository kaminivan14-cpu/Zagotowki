BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Additive archive: preserve assignments, earnings, worktime, receipts and events.
ALTER TABLE public."Orders"
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by bigint REFERENCES public."Employees"(id) ON DELETE RESTRICT,
 ADD COLUMN delete_reason text CHECK(length(delete_reason)<=1000);
ALTER TABLE app_private.order_callbacks ADD COLUMN cancelled_at timestamptz;
INSERT INTO app_private.role_permissions(role,permission) VALUES
 ('administrator','orders.delete'),('manager','orders.delete') ON CONFLICT DO NOTHING;

CREATE FUNCTION app_private.orders_delete_apply(p_location_id bigint,p_order_ids bigint[],p_operation uuid,p_mode text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; o public."Orders"; old app_private.order_operations;
 args jsonb; result jsonb; n integer:=0; ids bigint[]; stamp timestamptz;
BEGIN
 IF p_location_id IS NULL OR p_operation IS NULL OR p_mode NOT IN ('single','bulk')
 OR p_order_ids IS NULL OR cardinality(p_order_ids)=0 OR cardinality(p_order_ids)>10000
 OR array_position(p_order_ids,NULL) IS NOT NULL OR length(p_reason)>1000
 OR (p_mode='single' AND cardinality(p_order_ids)<>1) THEN RAISE EXCEPTION 'INVALID_DELETE_SCOPE'; END IF;
 a:=app_private.orders_actor('orders.delete',p_location_id);
 IF a.role NOT IN ('administrator','manager') THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_order_ids) id;
 args:=jsonb_build_object('location_id',p_location_id,'order_ids',ids,'reason',p_reason);
 PERFORM pg_advisory_xact_lock(hashtextextended('orders-op:'||p_operation::text,18));
 -- Lock identity to prevent a concurrent role/location change during deletion.
 SELECT * INTO a FROM public."Employees" WHERE id=a.id FOR SHARE;
 PERFORM app_private.orders_actor('orders.delete',p_location_id);
 IF a.role NOT IN ('administrator','manager') THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM app_private.order_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF old.actor_employee_id<>a.id OR old.operation_type<>'delete_'||p_mode OR old.arguments<>args THEN RAISE EXCEPTION 'OPERATION_CONFLICT'; END IF;
  RETURN old.result;
 END IF;
 -- Lock the complete explicit snapshot in stable order. Reject cross-location IDs.
 PERFORM 1 FROM public."Orders" WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public."Orders" WHERE id=ANY(ids) AND location_id=p_location_id)<>cardinality(ids) THEN
  RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM app_private.order_callbacks WHERE order_id=ANY(ids) ORDER BY id FOR UPDATE;
 -- A worker may already have the payload outside the DB transaction. Never claim
 -- deletion succeeded while such a send can still occur, even for an expired lease.
 IF EXISTS(SELECT FROM app_private.order_callbacks WHERE order_id=ANY(ids) AND sent_at IS NULL AND lease_token IS NOT NULL) THEN
  RAISE EXCEPTION 'CALLBACK_IN_FLIGHT';
 END IF;
 stamp:=clock_timestamp();
 FOR o IN SELECT * FROM public."Orders" WHERE id=ANY(ids) AND deleted_at IS NULL ORDER BY id LOOP
  UPDATE public."Orders" SET deleted_at=stamp,deleted_by=a.id,delete_reason=nullif(btrim(p_reason),''),updated_at=stamp WHERE id=o.id;
  UPDATE app_private.order_callbacks SET cancelled_at=stamp,next_attempt_at=NULL
   WHERE order_id=o.id AND sent_at IS NULL AND cancelled_at IS NULL;
  PERFORM app_private.orders_event(o.id,NULL,NULL,'ORDER_DELETED',jsonb_build_object(
   'mode',p_mode,'operation_id',p_operation,'sbid',o.integration_sbid,'location_id',p_location_id,'reason',p_reason));
  n:=n+1;
 END LOOP;
 result:=jsonb_build_object('success',true,'deleted_count',n);
 IF p_mode='bulk' THEN
  PERFORM app_private.orders_event(NULL,NULL,NULL,'ORDERS_BULK_DELETED',jsonb_build_object(
   'operation_id',p_operation,'location_id',p_location_id,'order_ids',ids,'deleted_count',n,'reason',p_reason));
 END IF;
 INSERT INTO app_private.order_operations(operation_id,actor_employee_id,operation_type,arguments,result)
 VALUES(p_operation,a.id,'delete_'||p_mode,args,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.orders_delete_apply(bigint,bigint[],uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.order_delete(p_location_id bigint,p_order_id bigint,p_operation uuid,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app_private.orders_delete_apply(p_location_id,ARRAY[p_order_id],p_operation,'single',p_reason)
$$;
CREATE FUNCTION public.orders_delete_bulk(p_location_id bigint,p_order_ids bigint[],p_operation uuid,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app_private.orders_delete_apply(p_location_id,p_order_ids,p_operation,'bulk',p_reason)
$$;
REVOKE ALL ON FUNCTION public.order_delete(bigint,bigint,uuid,text),public.orders_delete_bulk(bigint,bigint[],uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.order_delete(bigint,bigint,uuid,text),public.orders_delete_bulk(bigint,bigint[],uuid,text) TO authenticated;

-- Guard each surgical edit against schema drift. CREATE OR REPLACE retains ACLs.
DO $patch$
DECLARE spec record; definition text;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
 ('public.orders_board(bigint)','WHERE o.location_id=p_location;','WHERE o.location_id=p_location AND o.deleted_at IS NULL;',1),
 ('public.orders_notifications(bigint,bigint)','WHERE o.location_id=p_location AND','WHERE o.deleted_at IS NULL AND o.location_id=p_location AND',2),
 ('public.orders_command(text,jsonb,uuid)','PERFORM app_private.orders_actor(permission,o.location_id);','PERFORM app_private.orders_actor(permission,o.location_id); IF o.deleted_at IS NOT NULL THEN RAISE EXCEPTION ''ORDER_DELETED''; END IF;',1),
 ('app_private.order_prepared_callback()','IF o.integration_sbid IS NULL THEN','IF o.deleted_at IS NOT NULL OR o.integration_sbid IS NULL THEN',1),
 ('public.order_callback_claim()','WHERE sent_at IS NULL AND exhausted_at IS NULL','WHERE cancelled_at IS NULL AND sent_at IS NULL AND exhausted_at IS NULL',1),
 ('public.order_callback_result(bigint,uuid,boolean,text)','IF NOT FOUND OR j.lease_token','IF NOT FOUND OR j.cancelled_at IS NOT NULL OR j.lease_token',1),
 ('public.orders_command(text,jsonb,uuid)','FROM public."Order_item_assignments" WHERE work_shift_id=s.id AND released_at IS NULL AND ready_for_cutting_at IS NULL','FROM public."Order_item_assignments" delete_work JOIN public."Order_items" delete_item ON delete_item.id=delete_work.order_item_id JOIN public."Orders" delete_order ON delete_order.id=delete_item.order_id WHERE delete_work.work_shift_id=s.id AND delete_work.released_at IS NULL AND delete_work.ready_for_cutting_at IS NULL AND delete_order.deleted_at IS NULL',1),
 ('public.orders_command(text,jsonb,uuid)','FROM public."Order_cutting_assignments" WHERE work_shift_id=s.id AND issued_at IS NULL','FROM public."Order_cutting_assignments" delete_cut JOIN public."Order_item_assignments" delete_work ON delete_work.id=delete_cut.source_assignment_id JOIN public."Order_items" delete_item ON delete_item.id=delete_work.order_item_id JOIN public."Orders" delete_order ON delete_order.id=delete_item.order_id WHERE delete_cut.work_shift_id=s.id AND delete_cut.issued_at IS NULL AND delete_order.deleted_at IS NULL',1),
 ('public.worktime_command(text,jsonb,uuid)','FROM public."Order_item_assignments" WHERE work_shift_id=s.id AND released_at IS NULL AND ready_for_cutting_at IS NULL','FROM public."Order_item_assignments" delete_work JOIN public."Order_items" delete_item ON delete_item.id=delete_work.order_item_id JOIN public."Orders" delete_order ON delete_order.id=delete_item.order_id WHERE delete_work.work_shift_id=s.id AND delete_work.released_at IS NULL AND delete_work.ready_for_cutting_at IS NULL AND delete_order.deleted_at IS NULL',2),
 ('public.worktime_command(text,jsonb,uuid)','FROM public."Order_cutting_assignments" WHERE work_shift_id=s.id AND issued_at IS NULL','FROM public."Order_cutting_assignments" delete_cut JOIN public."Order_item_assignments" delete_work ON delete_work.id=delete_cut.source_assignment_id JOIN public."Order_items" delete_item ON delete_item.id=delete_work.order_item_id JOIN public."Orders" delete_order ON delete_order.id=delete_item.order_id WHERE delete_cut.work_shift_id=s.id AND delete_cut.issued_at IS NULL AND delete_order.deleted_at IS NULL',2)
 ) AS edits(signature,before_text,after_text,expected) LOOP
  definition:=pg_get_functiondef(spec.signature::regprocedure);
  IF (length(definition)-length(replace(definition,spec.before_text,'')))/length(spec.before_text)<>spec.expected THEN
   RAISE EXCEPTION 'ORDERS_DELETE_SCHEMA_DRIFT: %',spec.signature;
  END IF;
  EXECUTE replace(definition,spec.before_text,spec.after_text);
 END LOOP;
END $patch$;
COMMIT;
