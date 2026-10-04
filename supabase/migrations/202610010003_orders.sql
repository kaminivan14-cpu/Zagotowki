BEGIN;
CREATE TABLE public."Work_shifts" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, employee_id bigint NOT NULL REFERENCES public."Employees" ON DELETE RESTRICT,
 employee_name_snapshot text NOT NULL, location_id bigint NOT NULL REFERENCES public."Locations" ON DELETE RESTRICT,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), ended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ended_at IS NULL OR ended_at>=started_at));
CREATE UNIQUE INDEX one_open_work_shift ON public."Work_shifts"(employee_id) WHERE ended_at IS NULL;
CREATE INDEX shifts_location_time ON public."Work_shifts"(location_id,started_at);
CREATE TABLE public."Order_products" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL CHECK(length(trim(name))>0), category text NOT NULL,
 active boolean NOT NULL DEFAULT true, work_rate_minor bigint NOT NULL CHECK(work_rate_minor BETWEEN 0 AND 100000000),
 currency text NOT NULL DEFAULT 'PLN' CHECK(currency='PLN'), is_test boolean NOT NULL DEFAULT false,
 seed_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public."Order_product_mappings" (
 source text NOT NULL,external_product_id text NOT NULL,order_product_id bigint NOT NULL REFERENCES public."Order_products" ON DELETE RESTRICT,
 PRIMARY KEY(source,external_product_id));
CREATE INDEX order_product_mapping_fk ON public."Order_product_mappings"(order_product_id);
CREATE TABLE public."Orders" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,source text NOT NULL,external_order_id text NOT NULL,
 display_number text NOT NULL UNIQUE,location_id bigint NOT NULL REFERENCES public."Locations" ON DELETE RESTRICT,
 location_name_snapshot text NOT NULL,is_test boolean NOT NULL DEFAULT false,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sent_to_kitchen_at timestamptz,sent_by_employee_id bigint REFERENCES public."Employees" ON DELETE RESTRICT,sent_by_name_snapshot text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source,external_order_id),
 CHECK((sent_to_kitchen_at IS NULL)=(sent_by_employee_id IS NULL)));
CREATE INDEX orders_location_time ON public."Orders"(location_id,received_at DESC,id DESC);
CREATE TABLE public."Order_items" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id bigint NOT NULL REFERENCES public."Orders" ON DELETE RESTRICT,
 order_product_id bigint NOT NULL REFERENCES public."Order_products" ON DELETE RESTRICT,external_product_id text,
 product_name_snapshot text NOT NULL,category_snapshot text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX order_items_order ON public."Order_items"(order_id);
CREATE INDEX order_items_product ON public."Order_items"(order_product_id);
CREATE TABLE public."Order_item_assignments" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_item_id bigint NOT NULL REFERENCES public."Order_items" ON DELETE RESTRICT,
 employee_id bigint NOT NULL REFERENCES public."Employees" ON DELETE RESTRICT,employee_name_snapshot text NOT NULL,employee_role_snapshot text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),ready_for_cutting_at timestamptz,released_at timestamptz,
 rate_at_claim_minor bigint NOT NULL CHECK(rate_at_claim_minor BETWEEN 0 AND 100000000),currency text NOT NULL CHECK(currency='PLN'),
 amount_earned_minor bigint GENERATED ALWAYS AS (CASE WHEN ready_for_cutting_at IS NOT NULL THEN quantity::bigint*rate_at_claim_minor ELSE 0 END) STORED,
 work_shift_id bigint NOT NULL REFERENCES public."Work_shifts" ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ready_for_cutting_at IS NULL OR released_at IS NULL));
CREATE INDEX assignments_item ON public."Order_item_assignments"(order_item_id);
CREATE INDEX assignments_shift ON public."Order_item_assignments"(work_shift_id);
CREATE INDEX assignments_employee ON public."Order_item_assignments"(employee_id);
CREATE TABLE public."Order_cutting_assignments" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,source_assignment_id bigint NOT NULL REFERENCES public."Order_item_assignments" ON DELETE RESTRICT,
 employee_id bigint NOT NULL REFERENCES public."Employees" ON DELETE RESTRICT,employee_name_snapshot text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),started_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,issued_at timestamptz,
 issued_by_employee_id bigint REFERENCES public."Employees" ON DELETE RESTRICT,issued_by_name_snapshot text,
 work_shift_id bigint NOT NULL REFERENCES public."Work_shifts" ON DELETE RESTRICT,issued_work_shift_id bigint REFERENCES public."Work_shifts" ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(completed_at IS NULL OR completed_at>=started_at),CHECK(issued_at IS NULL OR (completed_at IS NOT NULL AND issued_at>=completed_at AND issued_by_employee_id IS NOT NULL AND issued_work_shift_id IS NOT NULL)));
CREATE INDEX cutting_source ON public."Order_cutting_assignments"(source_assignment_id);
CREATE INDEX cutting_shift ON public."Order_cutting_assignments"(work_shift_id);
CREATE INDEX cutting_issue_shift ON public."Order_cutting_assignments"(issued_work_shift_id);
CREATE TABLE public."Order_events" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id bigint REFERENCES public."Orders" ON DELETE RESTRICT,
 order_item_id bigint REFERENCES public."Order_items" ON DELETE RESTRICT,assignment_id bigint REFERENCES public."Order_item_assignments" ON DELETE RESTRICT,
 employee_id bigint REFERENCES public."Employees" ON DELETE RESTRICT,employee_name_snapshot text,employee_role_snapshot text,
 event_type text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX events_order ON public."Order_events"(order_id,id);
CREATE TABLE app_private.order_operations(operation_id uuid PRIMARY KEY,actor_employee_id bigint NOT NULL REFERENCES public."Employees",
 operation_type text NOT NULL,arguments jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app_private.order_imports(source text NOT NULL,external_order_id text NOT NULL,normalized_payload jsonb NOT NULL,
 order_id bigint REFERENCES public."Orders",created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source,external_order_id));
CREATE TABLE app_private.order_location_mappings(source text NOT NULL,external_location_id text NOT NULL,location_id bigint NOT NULL REFERENCES public."Locations",PRIMARY KEY(source,external_location_id));
REVOKE ALL ON app_private.order_operations,app_private.order_imports,app_private.order_location_mappings FROM PUBLIC,anon,authenticated;
-- No table REST grants at all: operational projections never contain money.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['Work_shifts','Order_products','Order_product_mappings','Orders','Order_items','Order_item_assignments','Order_cutting_assignments','Order_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
END LOOP; END $$;
CREATE FUNCTION app_private.orders_actor(p_permission text,p_location bigint DEFAULT NULL) RETURNS public."Employees"
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN
 a:=app_private.actor();
 IF a.archived_at IS NOT NULL OR NOT app_private.has_permission(p_permission) OR
 (p_location IS NOT NULL AND a.role<>'administrator' AND a.location_id IS DISTINCT FROM p_location) THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
CREATE FUNCTION app_private.orders_event(p_order bigint,p_item bigint,p_assignment bigint,p_type text,p_metadata jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN
 a:=app_private.actor();
 INSERT INTO public."Order_events"(order_id,order_item_id,assignment_id,employee_id,employee_name_snapshot,employee_role_snapshot,event_type,metadata)
 VALUES(p_order,p_item,p_assignment,a.id,a.name,a.role,p_type,p_metadata);
END $$;
-- Canonical creation boundary: normalized mapped products, atomic import, same path for simulator and future adapters.
CREATE FUNCTION app_private.orders_import(p_source text,p_external text,p_location bigint,p_items jsonb,p_test boolean) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE payload jsonb; previous app_private.order_imports; result_id bigint; line jsonb; prod public."Order_products"; loc public."Locations"; BEGIN
 payload:=jsonb_build_object('location_id',p_location,'items',p_items,'is_test',p_test);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_source||':'||p_external,17));
 SELECT * INTO previous FROM app_private.order_imports WHERE source=p_source AND external_order_id=p_external;
 IF FOUND THEN IF previous.normalized_payload<>payload THEN RAISE EXCEPTION 'IMPORT_CONFLICT'; END IF; RETURN previous.order_id; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
 SELECT * INTO loc FROM public."Locations" WHERE id=p_location AND active IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOCATION_UNMAPPED'; END IF;
 INSERT INTO public."Orders"(source,external_order_id,display_number,location_id,location_name_snapshot,is_test)
 VALUES(p_source,p_external,'PENDING-'||gen_random_uuid(),p_location,loc.name,p_test) RETURNING id INTO result_id;
 UPDATE public."Orders" SET display_number=(CASE WHEN p_test THEN 'TEST-' ELSE 'ORDER-' END)||lpad(result_id::text,6,'0') WHERE id=result_id;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF line - ARRAY['product_id','quantity'] <> '{}'::jsonb OR (line->>'quantity') !~ '^[1-9][0-9]*$' OR (line->>'quantity')::numeric>10000 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  SELECT * INTO prod FROM public."Order_products" WHERE id=(line->>'product_id')::bigint AND active AND (NOT p_test OR is_test) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNMAPPED'; END IF;
  INSERT INTO public."Order_items"(order_id,order_product_id,product_name_snapshot,category_snapshot,quantity)
  VALUES(result_id,prod.id,prod.name,prod.category,(line->>'quantity')::integer);
 END LOOP;
 INSERT INTO app_private.order_imports VALUES(p_source,p_external,payload,result_id,now());
 PERFORM app_private.orders_event(result_id,NULL,NULL,'ORDER_CREATED'); RETURN result_id;
END $$;
CREATE FUNCTION app_private.orders_status(p_order bigint) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN o.sent_to_kitchen_at IS NULL THEN 'NEW'
 WHEN NOT EXISTS(SELECT FROM public."Order_items" i WHERE i.order_id=o.id AND i.quantity<>(SELECT coalesce(sum(c.quantity),0) FROM public."Order_item_assignments" a JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=a.id WHERE a.order_item_id=i.id AND c.issued_at IS NOT NULL)) THEN 'COMPLETED'
 WHEN EXISTS(SELECT FROM public."Order_items" i JOIN public."Order_item_assignments" a ON a.order_item_id=i.id JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=a.id WHERE i.order_id=o.id AND c.issued_at IS NULL) THEN 'CUTTING'
 WHEN EXISTS(SELECT FROM public."Order_items" i JOIN public."Order_item_assignments" a ON a.order_item_id=i.id WHERE i.order_id=o.id AND a.ready_for_cutting_at IS NOT NULL) THEN 'READY_FOR_CUTTING'
 WHEN EXISTS(SELECT FROM public."Order_items" i JOIN public."Order_item_assignments" a ON a.order_item_id=i.id WHERE i.order_id=o.id AND a.released_at IS NULL) THEN 'IN_PROGRESS' ELSE 'TO_DO' END
 FROM public."Orders" o WHERE o.id=p_order
$$;
-- One audited dispatcher with a closed action/argument contract. No dynamic SQL.
CREATE FUNCTION public.orders_command(p_action text,p_args jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; permission text; keys text[]; old app_private.order_operations; result jsonb:='{}';
 s public."Work_shifts"; o public."Orders"; i public."Order_items"; w public."Order_item_assignments"; c public."Order_cutting_assignments";
 prod public."Order_products"; loc bigint; oid bigint; sid bigint; q integer; available bigint; line jsonb; selections jsonb; ids jsonb:='[]';
BEGIN
 permission:=CASE p_action WHEN 'create_test' THEN 'orders.test.generate' WHEN 'send' THEN 'orders.dispatch'
 WHEN 'claim' THEN 'orders.work' WHEN 'claim_all' THEN 'orders.work' WHEN 'ready' THEN 'orders.work' WHEN 'release' THEN 'orders.work'
 WHEN 'start_cutting' THEN 'orders.cut' WHEN 'complete_cutting' THEN 'orders.cut' WHEN 'issue' THEN 'orders.issue'
 WHEN 'rate' THEN 'orders.rates.manage' WHEN 'open_shift' THEN 'orders.access' WHEN 'end_shift' THEN 'orders.access' END;
 IF permission IS NULL OR p_operation IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 a:=app_private.orders_actor(permission);
 keys:=CASE p_action WHEN 'create_test' THEN ARRAY['location_id','items'] WHEN 'send' THEN ARRAY['order_id']
 WHEN 'claim' THEN ARRAY['order_id','items'] WHEN 'claim_all' THEN ARRAY['order_id'] WHEN 'ready' THEN ARRAY['assignment_id']
 WHEN 'release' THEN ARRAY['assignment_id'] WHEN 'start_cutting' THEN ARRAY['assignment_id','quantity']
 WHEN 'complete_cutting' THEN ARRAY['cutting_id'] WHEN 'issue' THEN ARRAY['cutting_id']
 WHEN 'rate' THEN ARRAY['product_id','rate_minor','active'] WHEN 'open_shift' THEN ARRAY['location_id'] WHEN 'end_shift' THEN ARRAY['shift_id'] END;
 IF p_args-keys<>'{}'::jsonb OR NOT p_args ?& keys OR EXISTS(SELECT FROM jsonb_each(p_args) WHERE value='null'::jsonb) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
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
  oid:=app_private.orders_import('uat-simulator',p_operation::text,loc,p_args->'items',true);
  result:=jsonb_build_object('order_id',oid);
 ELSE
  IF p_action IN ('send','claim','claim_all') THEN oid:=(p_args->>'order_id')::bigint;
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
   IF p_action IN ('claim','claim_all') THEN
    selections:=p_args->'items';
    IF p_action='claim_all' THEN
     SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',x.id,'quantity',x.remaining)),'[]') INTO selections FROM
      (SELECT it.id,it.quantity-(SELECT coalesce(sum(quantity),0) FROM public."Order_item_assignments" WHERE order_item_id=it.id AND released_at IS NULL) remaining
       FROM public."Order_items" it WHERE it.order_id=o.id) x WHERE x.remaining>0;
    END IF;
    IF jsonb_typeof(selections)<>'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'CLAIM_CONFLICT'; END IF;
    IF (SELECT count(DISTINCT value->>'item_id') FROM jsonb_array_elements(selections))<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
    -- Consistent product locking against concurrent rate edits and multi-product claims.
    PERFORM 1 FROM public."Order_products" p WHERE p.id IN (SELECT order_product_id FROM public."Order_items" WHERE order_id=o.id) ORDER BY p.id FOR SHARE;
    FOR line IN SELECT value FROM jsonb_array_elements(selections) ORDER BY (value->>'item_id')::bigint LOOP
     IF line-ARRAY['item_id','quantity']<>'{}'::jsonb OR (line->>'quantity') IS NULL OR (line->>'quantity')!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
     q:=(line->>'quantity')::integer;
     SELECT * INTO i FROM public."Order_items" WHERE id=(line->>'item_id')::bigint AND order_id=o.id;
     IF NOT FOUND THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
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
CREATE FUNCTION public.orders_board(p_location bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access',p_location);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'display_number',o.display_number,'location_id',o.location_id,
 'received_at',o.received_at,'status',app_private.orders_status(o.id),'sent_to_kitchen_at',o.sent_to_kitchen_at,
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.product_name_snapshot,'quantity',i.quantity,
 'available',i.quantity-(SELECT coalesce(sum(w.quantity),0) FROM public."Order_item_assignments" w WHERE w.order_item_id=i.id AND w.released_at IS NULL),
 'issued',(SELECT coalesce(sum(c.quantity),0) FROM public."Order_item_assignments" w JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=w.id WHERE w.order_item_id=i.id AND c.issued_at IS NOT NULL),
 'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'employee_id',w.employee_id,'employee_name',w.employee_name_snapshot,'quantity',w.quantity,
 'claimed_at',w.claimed_at,'ready_for_cutting_at',w.ready_for_cutting_at,'released_at',w.released_at,
 'cutting_available',w.quantity-(SELECT coalesce(sum(quantity),0) FROM public."Order_cutting_assignments" WHERE source_assignment_id=w.id),
 'cuttings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'employee_id',c.employee_id,'employee_name',c.employee_name_snapshot,'quantity',c.quantity,'started_at',c.started_at,'completed_at',c.completed_at,'issued_at',c.issued_at) ORDER BY c.id),'[]') FROM public."Order_cutting_assignments" c WHERE c.source_assignment_id=w.id)) ORDER BY w.id),'[]') FROM public."Order_item_assignments" w WHERE w.order_item_id=i.id)) ORDER BY i.id),'[]') FROM public."Order_items" i WHERE i.order_id=o.id)) ORDER BY o.received_at DESC,o.id DESC),'[]') INTO result
 FROM public."Orders" o WHERE o.location_id=p_location;
 RETURN result;
END $$;
CREATE FUNCTION public.orders_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'active',active,'is_test',is_test)
 ||CASE WHEN app_private.has_permission('orders.rates.manage') THEN jsonb_build_object('work_rate_minor',work_rate_minor,'currency',currency) ELSE '{}'::jsonb END ORDER BY id),'[]') INTO result FROM public."Order_products";
 RETURN result;
END $$;
CREATE FUNCTION public.orders_shifts() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'location_id',location_id,'started_at',started_at,'ended_at',ended_at) ORDER BY started_at DESC),'[]') INTO result FROM public."Work_shifts" WHERE employee_id=a.id;
 RETURN result;
END $$;
CREATE FUNCTION public.orders_shift_summary(p_shift bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; s public."Work_shifts"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.access'); SELECT * INTO s FROM public."Work_shifts" WHERE id=p_shift;
 IF NOT FOUND OR (a.role<>'administrator' AND (a.id<>s.employee_id OR NOT app_private.has_permission('orders.history.own'))) OR s.ended_at IS NULL THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('shift_id',s.id,'started_at',s.started_at,'ended_at',s.ended_at,'currency','PLN',
 'total_units',coalesce(sum(w.quantity),0),'total_amount_minor',coalesce(sum(w.amount_earned_minor),0),
 'products',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT i.product_name_snapshot AS name,sum(z.quantity) AS quantity FROM public."Order_item_assignments" z JOIN public."Order_items" i ON i.id=z.order_item_id WHERE z.work_shift_id=s.id AND z.ready_for_cutting_at IS NOT NULL GROUP BY i.product_name_snapshot ORDER BY i.product_name_snapshot)x)) INTO result
 FROM public."Order_item_assignments" w WHERE w.work_shift_id=s.id AND w.ready_for_cutting_at IS NOT NULL;
 RETURN result;
END $$;
CREATE FUNCTION public.orders_shift_history(p_shift bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; s public."Work_shifts"; result jsonb; BEGIN
 a:=app_private.orders_actor('orders.history.local'); SELECT * INTO s FROM public."Work_shifts" WHERE id=p_shift;
 IF NOT FOUND OR (a.role<>'administrator' AND s.employee_id<>a.id) THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.orders_actor('orders.history.local',s.location_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('order',o.display_number,'product',i.product_name_snapshot,'quantity',c.quantity,
 'maker',w.employee_name_snapshot,'cutter',c.employee_name_snapshot,'issuer',c.issued_by_name_snapshot,
 'claimed_at',w.claimed_at,'ready_at',w.ready_for_cutting_at,'cutting_started_at',c.started_at,'cutting_completed_at',c.completed_at,'issued_at',c.issued_at) ORDER BY c.issued_at),'[]') INTO result
 FROM public."Order_cutting_assignments" c JOIN public."Order_item_assignments" w ON w.id=c.source_assignment_id
 JOIN public."Order_items" i ON i.id=w.order_item_id JOIN public."Orders" o ON o.id=i.order_id
 WHERE c.issued_work_shift_id=s.id AND c.issued_at IS NOT NULL;
 RETURN result;
END $$;
CREATE FUNCTION public.orders_history(p_order bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public."Orders"; result jsonb; BEGIN
 SELECT * INTO o FROM public."Orders" WHERE id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDERS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.orders_actor('orders.access',o.location_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('event',event_type,'actor',employee_name_snapshot,'role',employee_role_snapshot,'at',created_at,'item_id',order_item_id,'assignment_id',assignment_id,'metadata',metadata) ORDER BY id),'[]') INTO result FROM public."Order_events" WHERE order_id=p_order;
 RETURN result;
END $$;
-- Explicit allowlist; no PUBLIC default execute and no private helpers exposed.
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname LIKE 'orders_%') OR (n.nspname='app_private' AND p.proname LIKE 'orders_%') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
END LOOP; END $$;
COMMIT;
