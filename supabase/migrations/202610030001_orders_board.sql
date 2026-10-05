BEGIN;
-- Additive Orders-only upgrade. Existing Set-category lines remain legacy products:
-- there is no trustworthy composition to expand them retroactively.
ALTER TABLE public."Orders" ADD COLUMN ready_at timestamptz,
 ADD COLUMN estimated_prep_minutes integer CHECK(estimated_prep_minutes BETWEEN 1 AND 1440);
ALTER TABLE public."Order_products" ADD COLUMN item_type text NOT NULL DEFAULT 'product'
 CHECK(item_type IN ('product','addon','drink'));
UPDATE public."Order_products" SET item_type=CASE
 WHEN lower(category) IN ('drink','drinks','napój','napoje','beverage','beverages') THEN 'drink'
 WHEN lower(category) IN ('addon','addons','dodatek','dodatki') THEN 'addon' ELSE 'product' END;
ALTER TABLE public."Order_items" ALTER COLUMN order_product_id DROP NOT NULL,
 ADD COLUMN item_type text NOT NULL DEFAULT 'product' CHECK(item_type IN ('product','set','addon','drink')),
 ADD COLUMN parent_item_id bigint,
 ADD CONSTRAINT order_item_product_required CHECK(item_type='set' OR order_product_id IS NOT NULL),
 ADD CONSTRAINT order_item_parent_self CHECK(parent_item_id IS NULL OR parent_item_id<>id),
 ADD CONSTRAINT order_item_order_identity UNIQUE(order_id,id),
 ADD CONSTRAINT order_item_parent FOREIGN KEY(order_id,parent_item_id) REFERENCES public."Order_items"(order_id,id) ON DELETE RESTRICT;
UPDATE public."Order_items" i SET item_type=p.item_type FROM public."Order_products" p WHERE p.id=i.order_product_id;
CREATE INDEX order_item_parent_idx ON public."Order_items"(parent_item_id);
CREATE FUNCTION app_private.orders_validate_parent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent public."Order_items"; BEGIN
 IF NEW.parent_item_id IS NOT NULL THEN
  SELECT * INTO parent FROM public."Order_items" WHERE id=NEW.parent_item_id;
  IF parent.item_type IS DISTINCT FROM 'set' OR NEW.item_type='set' OR NEW.quantity % parent.quantity<>0 THEN RAISE EXCEPTION 'INVALID_SET_COMPONENT'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.quantity<>OLD.quantity OR NEW.item_type<>OLD.item_type OR NEW.parent_item_id IS DISTINCT FROM OLD.parent_item_id) AND
 (EXISTS(SELECT FROM public."Order_items" WHERE parent_item_id=OLD.id) OR EXISTS(SELECT FROM public."Order_item_assignments" WHERE order_item_id=OLD.id)) THEN RAISE EXCEPTION 'IMMUTABLE_ORDER_STRUCTURE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_item_parent_guard BEFORE INSERT OR UPDATE ON public."Order_items" FOR EACH ROW EXECUTE FUNCTION app_private.orders_validate_parent();
CREATE FUNCTION app_private.orders_lifecycle(p_order bigint,p_parent bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH items AS (SELECT i.*,
 (SELECT coalesce(sum(a.quantity),0) FROM public."Order_item_assignments" a WHERE a.order_item_id=i.id AND a.released_at IS NULL) taken,
 (SELECT coalesce(sum(c.quantity),0) FROM public."Order_item_assignments" a JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=a.id WHERE a.order_item_id=i.id AND c.issued_at IS NOT NULL) issued
 FROM public."Order_items" i WHERE order_id=p_order AND (p_parent IS NULL OR parent_item_id=p_parent) AND item_type NOT IN ('set','drink'))
 SELECT CASE WHEN count(*)=0 THEN 'done' WHEN bool_and(issued=quantity) THEN 'done' WHEN sum(taken)=0 THEN 'new' WHEN bool_or(taken<quantity) THEN 'partial' ELSE 'in_progress' END FROM items
$$;
-- One source-neutral import path; children.quantity is per ONE set. Database stores totals.
CREATE FUNCTION app_private.orders_import(p_source text,p_external text,p_location bigint,p_items jsonb,p_test boolean,p_ready_at timestamptz,p_prep integer) RETURNS bigint
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
  IF line - ARRAY['product_id','quantity','children'] <> '{}'::jsonb OR coalesce(line->>'quantity','') !~ '^[1-9][0-9]*$' OR (line->>'quantity')::numeric>10000 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  qty:=(line->>'quantity')::integer;
  SELECT * INTO prod FROM public."Order_products" WHERE id=(line->>'product_id')::bigint AND active AND (NOT p_test OR is_test) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNMAPPED'; END IF;
  IF line ? 'children' THEN
   IF jsonb_typeof(line->'children') IS DISTINCT FROM 'array' OR jsonb_array_length(line->'children') NOT BETWEEN 1 AND 50 OR prod.item_type='drink' THEN RAISE EXCEPTION 'INVALID_SET'; END IF;
   INSERT INTO public."Order_items"(order_id,order_product_id,product_name_snapshot,category_snapshot,quantity,item_type)
   VALUES(result_id,prod.id,prod.name,prod.category,qty,'set') RETURNING id INTO parent_id;
   FOR child IN SELECT value FROM jsonb_array_elements(line->'children') LOOP
    IF child - ARRAY['product_id','quantity'] <> '{}'::jsonb OR coalesce(child->>'quantity','') !~ '^[1-9][0-9]*$' OR (child->>'quantity')::numeric*qty>10000 THEN RAISE EXCEPTION 'INVALID_SET_COMPONENT'; END IF;
    SELECT * INTO prod FROM public."Order_products" WHERE id=(child->>'product_id')::bigint AND active AND (NOT p_test OR is_test) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNMAPPED'; END IF;
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
CREATE OR REPLACE FUNCTION app_private.orders_import(p_source text,p_external text,p_location bigint,p_items jsonb,p_test boolean) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT app_private.orders_import(p_source,p_external,p_location,p_items,p_test,NULL,NULL) $$;
CREATE OR REPLACE FUNCTION app_private.orders_status(p_order bigint) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN o.sent_to_kitchen_at IS NULL THEN 'NEW'
 WHEN NOT EXISTS(SELECT FROM public."Order_items" i WHERE i.order_id=o.id AND i.item_type NOT IN ('set','drink') AND i.quantity<>(SELECT coalesce(sum(c.quantity),0) FROM public."Order_item_assignments" a JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=a.id WHERE a.order_item_id=i.id AND c.issued_at IS NOT NULL)) THEN 'COMPLETED'
 WHEN EXISTS(SELECT FROM public."Order_items" i JOIN public."Order_item_assignments" a ON a.order_item_id=i.id JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=a.id WHERE i.order_id=o.id AND i.item_type NOT IN ('set','drink') AND c.issued_at IS NULL) THEN 'CUTTING'
 WHEN EXISTS(SELECT FROM public."Order_items" i JOIN public."Order_item_assignments" a ON a.order_item_id=i.id WHERE i.order_id=o.id AND i.item_type NOT IN ('set','drink') AND a.ready_for_cutting_at IS NOT NULL) THEN 'READY_FOR_CUTTING'
 WHEN EXISTS(SELECT FROM public."Order_items" i JOIN public."Order_item_assignments" a ON a.order_item_id=i.id WHERE i.order_id=o.id AND i.item_type NOT IN ('set','drink') AND a.released_at IS NULL) THEN 'IN_PROGRESS' ELSE 'TO_DO' END
 FROM public."Orders" o WHERE o.id=p_order
$$;
CREATE OR REPLACE FUNCTION public.orders_command(p_action text,p_args jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; permission text; keys text[]; old app_private.order_operations; result jsonb:='{}';
 s public."Work_shifts"; o public."Orders"; i public."Order_items"; w public."Order_item_assignments"; c public."Order_cutting_assignments";
 prod public."Order_products"; loc bigint; oid bigint; sid bigint; q integer; available bigint; line jsonb; selections jsonb; ids jsonb:='[]';
BEGIN
 permission:=CASE p_action WHEN 'create_test' THEN 'orders.test.generate' WHEN 'send' THEN 'orders.dispatch'
 WHEN 'claim' THEN 'orders.work' WHEN 'claim_all' THEN 'orders.work' WHEN 'claim_set' THEN 'orders.work' WHEN 'ready' THEN 'orders.work' WHEN 'release' THEN 'orders.work'
 WHEN 'start_cutting' THEN 'orders.cut' WHEN 'complete_cutting' THEN 'orders.cut' WHEN 'issue' THEN 'orders.issue'
 WHEN 'rate' THEN 'orders.rates.manage' WHEN 'open_shift' THEN 'orders.access' WHEN 'end_shift' THEN 'orders.access' END;
 IF permission IS NULL OR p_operation IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 a:=app_private.orders_actor(permission);
 keys:=CASE p_action WHEN 'create_test' THEN ARRAY['location_id','items'] WHEN 'send' THEN ARRAY['order_id']
 WHEN 'claim' THEN ARRAY['order_id','items'] WHEN 'claim_all' THEN ARRAY['order_id'] WHEN 'claim_set' THEN ARRAY['order_id','set_id','quantity'] WHEN 'ready' THEN ARRAY['assignment_id']
 WHEN 'release' THEN ARRAY['assignment_id'] WHEN 'start_cutting' THEN ARRAY['assignment_id','quantity']
 WHEN 'complete_cutting' THEN ARRAY['cutting_id'] WHEN 'issue' THEN ARRAY['cutting_id']
 WHEN 'rate' THEN ARRAY['product_id','rate_minor','active'] WHEN 'open_shift' THEN ARRAY['location_id'] WHEN 'end_shift' THEN ARRAY['shift_id'] END;
 IF p_args-(keys||CASE WHEN p_action='create_test' THEN ARRAY['ready_at','estimated_prep_minutes'] ELSE ARRAY[]::text[] END)<>'{}'::jsonb OR NOT p_args ?& keys OR EXISTS(SELECT FROM jsonb_each(p_args) WHERE value='null'::jsonb) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('orders-op:'||p_operation::text,18));
 SELECT * INTO old FROM app_private.order_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF old.actor_employee_id<>a.id OR old.operation_type<>p_action OR old.arguments<>p_args THEN RAISE EXCEPTION 'OPERATION_CONFLICT'; END IF;
  RAISE LOG 'orders operation_retry'; RETURN old.result;
 END IF;
 -- Serialize shift opening/ending and work for one employee, including refresh/relogin.
 PERFORM pg_advisory_xact_lock(hashtextextended('orders-employee:'||a.id,19));
 SELECT * INTO a FROM public."Employees" WHERE id=a.id AND active IS TRUE AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.orders_actor(permission);
 IF p_action='open_shift' THEN
  loc:=(p_args->>'location_id')::bigint; PERFORM app_private.orders_actor(permission,loc);
  IF NOT EXISTS(SELECT FROM public."Locations" WHERE id=loc AND active) THEN RAISE EXCEPTION 'LOCATION_UNMAPPED'; END IF;
  SELECT * INTO s FROM public."Work_shifts" WHERE employee_id=a.id AND ended_at IS NULL;
  IF FOUND AND s.location_id<>loc THEN RAISE EXCEPTION 'END_CURRENT_SHIFT'; END IF;
  IF NOT FOUND THEN INSERT INTO public."Work_shifts"(employee_id,employee_name_snapshot,location_id) VALUES(a.id,a.name,loc) RETURNING * INTO s; END IF;
  result:=jsonb_build_object('shift_id',s.id);
 ELSIF p_action='end_shift' THEN
  SELECT * INTO s FROM public."Work_shifts" WHERE id=(p_args->>'shift_id')::bigint AND employee_id=a.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT FROM public."Order_item_assignments" WHERE work_shift_id=s.id AND released_at IS NULL AND ready_for_cutting_at IS NULL)
    OR EXISTS(SELECT FROM public."Order_cutting_assignments" WHERE work_shift_id=s.id AND issued_at IS NULL) THEN RAISE EXCEPTION 'UNFINISHED_WORK'; END IF;
  UPDATE public."Work_shifts" SET ended_at=coalesce(ended_at,clock_timestamp()) WHERE id=s.id;
  result:=jsonb_build_object('shift_id',s.id);
 ELSIF p_action='rate' THEN
  IF (p_args->>'rate_minor')!~'^[0-9]+$' OR jsonb_typeof(p_args->'active')<>'boolean' THEN RAISE EXCEPTION 'INVALID_RATE'; END IF;
  UPDATE public."Order_products" SET work_rate_minor=(p_args->>'rate_minor')::bigint,active=(p_args->>'active')::boolean,updated_at=now()
   WHERE id=(p_args->>'product_id')::bigint RETURNING * INTO prod;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNMAPPED'; END IF;
  PERFORM app_private.orders_event(NULL,NULL,NULL,'RATE_CHANGED',jsonb_build_object('product_id',prod.id));
 ELSIF p_action='create_test' THEN
  -- Signed JWT issuer, not client args or a browser feature flag. Local fixtures use a synthetic auth context.
  IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'iss' IS DISTINCT FROM 'https://meuzkduxttjcuiynsnaa.supabase.co/auth/v1' THEN RAISE EXCEPTION 'UAT_ONLY' USING ERRCODE='42501'; END IF;
  loc:=(p_args->>'location_id')::bigint; PERFORM app_private.orders_actor(permission,loc);
  oid:=app_private.orders_import('uat-simulator',p_operation::text,loc,p_args->'items',true,(p_args->>'ready_at')::timestamptz,(p_args->>'estimated_prep_minutes')::integer);
  result:=jsonb_build_object('order_id',oid);
 ELSE
  IF p_action IN ('send','claim','claim_all','claim_set') THEN oid:=(p_args->>'order_id')::bigint;
  ELSIF p_action IN ('ready','release','start_cutting') THEN
   SELECT * INTO w FROM public."Order_item_assignments" WHERE id=(p_args->>'assignment_id')::bigint;
   SELECT order_id INTO oid FROM public."Order_items" WHERE id=w.order_item_id;
  ELSE
   SELECT * INTO c FROM public."Order_cutting_assignments" WHERE id=(p_args->>'cutting_id')::bigint;
   SELECT * INTO w FROM public."Order_item_assignments" WHERE id=c.source_assignment_id;
   SELECT order_id INTO oid FROM public."Order_items" WHERE id=w.order_item_id;
  END IF;
  SELECT * INTO o FROM public."Orders" WHERE id=oid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM app_private.orders_actor(permission,o.location_id);
  IF p_action='send' THEN
   IF o.sent_to_kitchen_at IS NULL THEN
    UPDATE public."Orders" SET sent_to_kitchen_at=clock_timestamp(),sent_by_employee_id=a.id,sent_by_name_snapshot=a.name,updated_at=now() WHERE id=o.id;
    PERFORM app_private.orders_event(o.id,NULL,NULL,'ORDER_SENT_TO_KITCHEN');
   END IF;
  ELSE
   IF o.sent_to_kitchen_at IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_DISPATCHED'; END IF;
   SELECT * INTO s FROM public."Work_shifts" WHERE employee_id=a.id AND ended_at IS NULL AND location_id=o.location_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_SHIFT'; END IF;
   IF p_action IN ('claim','claim_all','claim_set') THEN
    selections:=p_args->'items';
    IF p_action='claim_all' THEN
     SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',x.id,'quantity',x.remaining)),'[]') INTO selections FROM
      (SELECT it.id,it.quantity-(SELECT coalesce(sum(quantity),0) FROM public."Order_item_assignments" WHERE order_item_id=it.id AND released_at IS NULL) remaining
       FROM public."Order_items" it WHERE it.order_id=o.id AND it.item_type NOT IN ('set','drink')) x WHERE x.remaining>0;
    END IF;
    IF p_action='claim_set' THEN
     SELECT * INTO i FROM public."Order_items" WHERE id=(p_args->>'set_id')::bigint AND order_id=o.id AND item_type='set';
     IF NOT FOUND OR coalesce(p_args->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'INVALID_SET'; END IF;
     q:=(p_args->>'quantity')::integer;
     IF q>i.quantity THEN RAISE EXCEPTION 'CLAIM_CONFLICT'; END IF;
     SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',child.id,'quantity',(child.quantity/i.quantity)*q)),'[]') INTO selections
      FROM public."Order_items" child WHERE child.parent_item_id=i.id AND child.item_type NOT IN ('set','drink');
    END IF;
    IF jsonb_typeof(selections)<>'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'CLAIM_CONFLICT'; END IF;
    IF (SELECT count(DISTINCT value->>'item_id') FROM jsonb_array_elements(selections))<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
    -- Consistent product locking against concurrent rate edits and multi-product claims.
    PERFORM 1 FROM public."Order_products" p WHERE p.id IN (SELECT order_product_id FROM public."Order_items" WHERE order_id=o.id) ORDER BY p.id FOR SHARE;
    FOR line IN SELECT value FROM jsonb_array_elements(selections) ORDER BY (value->>'item_id')::bigint LOOP
     IF line-ARRAY['item_id','quantity']<>'{}'::jsonb OR (line->>'quantity') IS NULL OR (line->>'quantity')!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
     q:=(line->>'quantity')::integer;
     SELECT * INTO i FROM public."Order_items" WHERE id=(line->>'item_id')::bigint AND order_id=o.id;
     IF NOT FOUND OR i.item_type IN ('set','drink') THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
     SELECT i.quantity-coalesce(sum(quantity),0) INTO available FROM public."Order_item_assignments" WHERE order_item_id=i.id AND released_at IS NULL;
     IF q>available THEN RAISE LOG 'orders claim_conflict'; RAISE EXCEPTION 'CLAIM_CONFLICT'; END IF;
     SELECT * INTO prod FROM public."Order_products" WHERE id=i.order_product_id;
     INSERT INTO public."Order_item_assignments"(order_item_id,employee_id,employee_name_snapshot,employee_role_snapshot,quantity,rate_at_claim_minor,currency,work_shift_id)
      VALUES(i.id,a.id,a.name,a.role,q,prod.work_rate_minor,prod.currency,s.id) RETURNING id INTO sid;
     ids:=ids||to_jsonb(sid); PERFORM app_private.orders_event(o.id,i.id,sid,'WORK_CLAIMED',jsonb_build_object('quantity',q));
    END LOOP;
    result:=jsonb_build_object('assignment_ids',ids);
   ELSIF p_action IN ('ready','release') THEN
    SELECT * INTO w FROM public."Order_item_assignments" WHERE id=w.id FOR UPDATE;
    IF w.employee_id<>a.id OR w.work_shift_id<>s.id THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
    IF p_action='ready' THEN
     IF w.released_at IS NOT NULL THEN RAISE EXCEPTION 'WORK_RELEASED'; END IF;
     IF w.ready_for_cutting_at IS NULL THEN
      UPDATE public."Order_item_assignments" SET ready_for_cutting_at=clock_timestamp(),updated_at=now() WHERE id=w.id;
      PERFORM app_private.orders_event(o.id,w.order_item_id,w.id,'WORK_READY_FOR_CUTTING');
     END IF;
    ELSE
     IF w.ready_for_cutting_at IS NOT NULL THEN RAISE EXCEPTION 'WORK_ALREADY_READY'; END IF;
     IF w.released_at IS NULL THEN
      UPDATE public."Order_item_assignments" SET released_at=clock_timestamp(),updated_at=now() WHERE id=w.id;
      PERFORM app_private.orders_event(o.id,w.order_item_id,w.id,'WORK_RELEASED');
     END IF;
    END IF;
   ELSIF p_action='start_cutting' THEN
    SELECT * INTO w FROM public."Order_item_assignments" WHERE id=w.id FOR UPDATE;
    IF w.ready_for_cutting_at IS NULL OR w.released_at IS NOT NULL THEN RAISE EXCEPTION 'WORK_NOT_READY'; END IF;
    IF (p_args->>'quantity')!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
    q:=(p_args->>'quantity')::integer;
    SELECT w.quantity-coalesce(sum(quantity),0) INTO available FROM public."Order_cutting_assignments" WHERE source_assignment_id=w.id;
    IF q>available THEN RAISE EXCEPTION 'CLAIM_CONFLICT'; END IF;
    INSERT INTO public."Order_cutting_assignments"(source_assignment_id,employee_id,employee_name_snapshot,quantity,work_shift_id)
     VALUES(w.id,a.id,a.name,q,s.id) RETURNING id INTO sid;
    result:=jsonb_build_object('cutting_id',sid);
    PERFORM app_private.orders_event(o.id,w.order_item_id,w.id,'CUTTING_STARTED',jsonb_build_object('cutting_id',sid,'quantity',q));
   ELSE
    SELECT * INTO c FROM public."Order_cutting_assignments" WHERE id=c.id FOR UPDATE;
    IF c.employee_id<>a.id OR c.work_shift_id<>s.id THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
    IF p_action='complete_cutting' AND c.completed_at IS NULL THEN
     UPDATE public."Order_cutting_assignments" SET completed_at=clock_timestamp(),updated_at=now() WHERE id=c.id;
     PERFORM app_private.orders_event(o.id,w.order_item_id,w.id,'CUTTING_COMPLETED',jsonb_build_object('cutting_id',c.id));
    ELSIF p_action='issue' THEN
     IF c.completed_at IS NULL THEN RAISE EXCEPTION 'CUTTING_NOT_COMPLETED'; END IF;
     IF c.issued_at IS NULL THEN
      UPDATE public."Order_cutting_assignments" SET issued_at=clock_timestamp(),issued_by_employee_id=a.id,issued_by_name_snapshot=a.name,issued_work_shift_id=s.id,updated_at=now() WHERE id=c.id;
      PERFORM app_private.orders_event(o.id,w.order_item_id,w.id,'ORDER_ITEM_ISSUED',jsonb_build_object('cutting_id',c.id,'quantity',c.quantity));
      IF app_private.orders_status(o.id)='COMPLETED' THEN PERFORM app_private.orders_event(o.id,NULL,NULL,'ORDER_COMPLETED'); END IF;
     END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 INSERT INTO app_private.order_operations VALUES(p_operation,a.id,p_action,p_args,result,now());
 RAISE LOG 'orders operation_success action=%',p_action;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.orders_board(p_location bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access',p_location);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'display_number',o.display_number,'location_id',o.location_id,
 'ready_at',o.ready_at,'estimated_prep_minutes',o.estimated_prep_minutes,'lifecycle',app_private.orders_lifecycle(o.id,NULL),'received_at',o.received_at,'status',app_private.orders_status(o.id),'sent_to_kitchen_at',o.sent_to_kitchen_at,
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('item_type',i.item_type,'parent_item_id',i.parent_item_id,'lifecycle',CASE WHEN i.item_type='set' THEN app_private.orders_lifecycle(o.id,i.id) ELSE NULL END,'id',i.id,'name',i.product_name_snapshot,'quantity',i.quantity,
 'available',i.quantity-(SELECT coalesce(sum(w.quantity),0) FROM public."Order_item_assignments" w WHERE w.order_item_id=i.id AND w.released_at IS NULL),
 'issued',(SELECT coalesce(sum(c.quantity),0) FROM public."Order_item_assignments" w JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=w.id WHERE w.order_item_id=i.id AND c.issued_at IS NOT NULL),
 'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'employee_id',w.employee_id,'employee_name',w.employee_name_snapshot,'quantity',w.quantity,
 'claimed_at',w.claimed_at,'ready_for_cutting_at',w.ready_for_cutting_at,'released_at',w.released_at,
 'cutting_available',w.quantity-(SELECT coalesce(sum(quantity),0) FROM public."Order_cutting_assignments" WHERE source_assignment_id=w.id),
 'cuttings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'employee_id',c.employee_id,'employee_name',c.employee_name_snapshot,'quantity',c.quantity,'started_at',c.started_at,'completed_at',c.completed_at,'issued_at',c.issued_at) ORDER BY c.id),'[]') FROM public."Order_cutting_assignments" c WHERE c.source_assignment_id=w.id)) ORDER BY w.id),'[]') FROM public."Order_item_assignments" w WHERE w.order_item_id=i.id)) ORDER BY i.id),'[]') FROM public."Order_items" i WHERE i.order_id=o.id)) ORDER BY o.received_at DESC,o.id DESC),'[]') INTO result
 FROM public."Orders" o WHERE o.location_id=p_location;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.orders_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'item_type',item_type,'active',active,'is_test',is_test)
 ||CASE WHEN app_private.has_permission('orders.rates.manage') THEN jsonb_build_object('work_rate_minor',work_rate_minor,'currency',currency) ELSE '{}'::jsonb END ORDER BY id),'[]') INTO result FROM public."Order_products";
 RETURN result;
END $$;
-- Persist each threshold once per order using the existing event log.
CREATE UNIQUE INDEX order_deadline_event_once ON public."Order_events"(order_id,event_type)
 WHERE event_type IN ('DEADLINE_30','DEADLINE_10','DEADLINE_OVERDUE');
CREATE TABLE app_private.order_notice_ack (
 employee_id bigint NOT NULL REFERENCES public."Employees", event_id bigint NOT NULL REFERENCES public."Order_events",
 acknowledged_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(employee_id,event_id));
REVOKE ALL ON app_private.order_notice_ack FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.orders_notifications(p_location bigint,p_ack bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access',p_location);
 -- Roles with equivalent operational chef capabilities, never merely a dispatch role.
 IF NOT app_private.has_permission('orders.cut') OR NOT app_private.has_permission('orders.issue') THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public."Order_events"(order_id,event_type,metadata)
 SELECT o.id,t.kind,jsonb_build_object('ready_at',o.ready_at) FROM public."Orders" o
 CROSS JOIN (VALUES('DEADLINE_30',interval '30 minutes'),('DEADLINE_10',interval '10 minutes'),('DEADLINE_OVERDUE',interval '0 minutes')) t(kind,threshold)
 WHERE o.location_id=p_location AND o.ready_at IS NOT NULL AND o.ready_at<=now()+t.threshold
 AND app_private.orders_lifecycle(o.id,NULL)<>'done'
 ON CONFLICT(order_id,event_type) WHERE event_type IN ('DEADLINE_30','DEADLINE_10','DEADLINE_OVERDUE') DO NOTHING;
 IF p_ack IS NOT NULL THEN
  IF NOT EXISTS(SELECT FROM public."Order_events" e JOIN public."Orders" o ON o.id=e.order_id WHERE e.id=p_ack AND o.location_id=p_location AND e.event_type IN ('DEADLINE_30','DEADLINE_10','DEADLINE_OVERDUE')) THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
  INSERT INTO app_private.order_notice_ack(employee_id,event_id) VALUES(a.id,p_ack) ON CONFLICT DO NOTHING;
 END IF;
 -- Only the latest threshold per order is displayed. Acks persist across devices.
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ready_at,x.id),'[]') INTO result FROM (
 SELECT e.id,e.order_id,e.event_type,o.display_number,o.ready_at FROM public."Order_events" e JOIN public."Orders" o ON o.id=e.order_id
 WHERE o.location_id=p_location AND app_private.orders_lifecycle(o.id,NULL)<>'done'
 AND e.event_type=CASE WHEN o.ready_at<=now() THEN 'DEADLINE_OVERDUE' WHEN o.ready_at<=now()+interval '10 minutes' THEN 'DEADLINE_10' ELSE 'DEADLINE_30' END
 AND NOT EXISTS(SELECT FROM app_private.order_notice_ack r WHERE r.employee_id=a.id AND r.event_id=e.id)
 ) x;
 RETURN result;
END $$;
-- Close inherited function grants; preserve all unrelated functions, roles and tables.
REVOKE ALL ON FUNCTION app_private.orders_validate_parent(),app_private.orders_lifecycle(bigint,bigint),app_private.orders_import(text,text,bigint,jsonb,boolean,timestamptz,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.orders_notifications(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orders_notifications(bigint,bigint) TO authenticated;
COMMIT;
