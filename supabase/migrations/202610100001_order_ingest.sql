BEGIN;
-- External lines coexist with the original catalog workflow; no historical rows change.
ALTER TABLE public."Orders" ADD COLUMN integration_sbid text UNIQUE,
 ADD COLUMN comment text CHECK(length(comment)<=4000);
ALTER TABLE public."Order_items" ADD COLUMN is_external boolean NOT NULL DEFAULT false,
 ADD COLUMN comment text CHECK(length(comment)<=2000);
ALTER TABLE public."Order_items" DROP CONSTRAINT order_item_product_required,
 ADD CONSTRAINT order_item_product_required CHECK(item_type='set' OR order_product_id IS NOT NULL OR
 (is_external AND item_type='product' AND external_product_id IS NOT NULL)),
 ADD CONSTRAINT external_item_shape CHECK(NOT is_external OR (order_product_id IS NULL AND item_type='product' AND parent_item_id IS NULL));
-- Preserve the human-dispatch invariant for all original orders. Integration dispatch has no fake employee.
ALTER TABLE public."Orders" DROP CONSTRAINT "Orders_check",
 ADD CONSTRAINT "Orders_check" CHECK(
 ((sent_to_kitchen_at IS NULL)=(sent_by_employee_id IS NULL)) OR
 (integration_sbid IS NOT NULL AND source='external-v1' AND sent_to_kitchen_at IS NOT NULL AND sent_by_employee_id IS NULL));
CREATE TABLE app_private.order_ingest_receipts (
 sbid text PRIMARY KEY, order_id bigint NOT NULL UNIQUE REFERENCES public."Orders" ON DELETE RESTRICT,
 payload jsonb NOT NULL, received_at timestamptz NOT NULL);
CREATE TABLE app_private.order_integration_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, request_id uuid NOT NULL,
 sbid text, order_id bigint REFERENCES public."Orders" ON DELETE RESTRICT,
 outcome text NOT NULL, response_status integer NOT NULL, detail text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE app_private.order_callbacks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES public."Orders" ON DELETE RESTRICT,
 sbid text NOT NULL, status text NOT NULL CHECK(status='prepared'), payload jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz, last_attempt_at timestamptz, last_error text, sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(order_id,status));
CREATE INDEX order_callback_pending ON app_private.order_callbacks(next_attempt_at) WHERE sent_at IS NULL;
ALTER TABLE app_private.order_ingest_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.order_integration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.order_callbacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.order_ingest_receipts,app_private.order_integration_log,app_private.order_callbacks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.order_ingest_log(p_request uuid,p_status integer,p_detail text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_status NOT IN(400,401,405,413,415,500,503) OR p_detail NOT IN
 ('unauthorized','method','body_too_large','content_type','invalid_json','configuration','database_unavailable') THEN RAISE EXCEPTION 'INVALID_LOG'; END IF;
 INSERT INTO app_private.order_integration_log(request_id,outcome,response_status,detail)
 VALUES(p_request,'rejected',p_status,p_detail);
END $$;
CREATE FUNCTION public.order_ingest(p_payload jsonb,p_location bigint,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb; line jsonb; normalized jsonb:='[]'; previous app_private.order_ingest_receipts;
 oid bigint; stamp timestamptz; sb text; loc public."Locations"; problem text; q integer;
BEGIN
 -- Database boundary independently validates all input, including calls from trusted backend.
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN problem:='JSON object is required';
 ELSIF p_payload-ARRAY['sbid','items','comment']<>'{}' THEN problem:='unsupported field';
 ELSIF jsonb_typeof(p_payload->'sbid') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'sbid')) NOT BETWEEN 1 AND 200 THEN problem:='sbid is required (1-200 characters)';
 ELSIF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN problem:='items is required';
 ELSIF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 THEN problem:='items must contain 1-50 lines';
 ELSIF p_payload ? 'comment' AND (jsonb_typeof(p_payload->'comment') IS DISTINCT FROM 'string' OR length(p_payload->>'comment')>4000) THEN problem:='invalid order comment';
 END IF;
 IF problem IS NULL THEN
  sb:=p_payload->>'sbid';
  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
   IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN problem:='invalid item'; EXIT; END IF;
   IF line-ARRAY['sku','title','quantity','comment']<>'{}' THEN problem:='unsupported item field'; EXIT; END IF;
   IF jsonb_typeof(line->'sku') IS DISTINCT FROM 'string' OR length(btrim(line->>'sku')) NOT BETWEEN 1 AND 200 THEN problem:='item.sku is required'; EXIT; END IF;
   IF jsonb_typeof(line->'title') IS DISTINCT FROM 'string' OR length(btrim(line->>'title')) NOT BETWEEN 1 AND 300 THEN problem:='item.title is required'; EXIT; END IF;
   IF line ? 'quantity' THEN
    IF jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' THEN problem:='quantity must be an integer from 1 to 10000'; EXIT; END IF;
    IF (line->>'quantity')::numeric NOT BETWEEN 1 AND 10000 OR trunc((line->>'quantity')::numeric)<>(line->>'quantity')::numeric THEN problem:='quantity must be an integer from 1 to 10000'; EXIT; END IF;
   END IF;
   IF line ? 'comment' AND (jsonb_typeof(line->'comment') IS DISTINCT FROM 'string' OR length(line->>'comment')>2000) THEN problem:='invalid item comment'; EXIT; END IF;
   q:=coalesce((line->>'quantity')::numeric,1)::integer;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('sku',line->>'sku','title',line->>'title','quantity',q,'comment',coalesce(line->>'comment','')));
  END LOOP;
 END IF;
 IF jsonb_typeof(p_payload->'sbid')='string' AND length(p_payload->>'sbid') BETWEEN 1 AND 200 THEN sb:=p_payload->>'sbid'; END IF;
 IF problem IS NOT NULL THEN
  INSERT INTO app_private.order_integration_log(request_id,sbid,outcome,response_status,detail) VALUES(p_request,sb,'validation_error',400,problem);
  RETURN jsonb_build_object('http_status',400,'body',jsonb_build_object('success',false,'error',problem));
 END IF;
 b:=jsonb_build_object('sbid',sb,'items',normalized,'comment',coalesce(p_payload->>'comment',''));
 PERFORM pg_advisory_xact_lock(hashtextextended('order-ingest:'||sb,43));
 SELECT * INTO previous FROM app_private.order_ingest_receipts WHERE sbid=sb;
 IF FOUND THEN
  IF previous.payload<>b THEN
   INSERT INTO app_private.order_integration_log(request_id,sbid,order_id,outcome,response_status) VALUES(p_request,sb,previous.order_id,'conflict',409);
   RETURN jsonb_build_object('http_status',409,'body',jsonb_build_object('success',false,'error','sbid already exists with different content'));
  END IF;
  INSERT INTO app_private.order_integration_log(request_id,sbid,order_id,outcome,response_status) VALUES(p_request,sb,previous.order_id,'duplicate',200);
  RETURN jsonb_build_object('http_status',200,'body',jsonb_build_object('success',true,'sbid',sb,'received_at',previous.received_at,'duplicate',true));
 END IF;
 SELECT * INTO loc FROM public."Locations" WHERE id=p_location AND active IS TRUE FOR SHARE;
 IF NOT FOUND THEN
  INSERT INTO app_private.order_integration_log(request_id,sbid,outcome,response_status,detail) VALUES(p_request,sb,'configuration_error',503,'Configured location missing or inactive');
  RETURN jsonb_build_object('http_status',503,'body',jsonb_build_object('success',false,'error','Integration unavailable'));
 END IF;
 stamp:=clock_timestamp();
 INSERT INTO public."Orders"(source,external_order_id,integration_sbid,display_number,location_id,location_name_snapshot,received_at,sent_to_kitchen_at,comment)
 VALUES('external-v1',sb,sb,'PENDING-'||gen_random_uuid(),loc.id,loc.name,stamp,stamp,b->>'comment') RETURNING id INTO oid;
 UPDATE public."Orders" SET display_number='ORDER-'||lpad(oid::text,6,'0') WHERE id=oid;
 FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
  INSERT INTO public."Order_items"(order_id,order_product_id,external_product_id,product_name_snapshot,category_snapshot,quantity,item_type,is_external,comment)
  VALUES(oid,NULL,line->>'sku',line->>'title','External',(line->>'quantity')::integer,'product',true,line->>'comment');
 END LOOP;
 INSERT INTO app_private.order_ingest_receipts VALUES(sb,oid,b,stamp);
 INSERT INTO public."Order_events"(order_id,event_type,metadata) VALUES(oid,'ORDER_CREATED',jsonb_build_object('source','external-v1')),(oid,'ORDER_SENT_TO_KITCHEN',jsonb_build_object('source','external-v1'));
 INSERT INTO app_private.order_integration_log(request_id,sbid,order_id,outcome,response_status) VALUES(p_request,sb,oid,'created',200);
 RETURN jsonb_build_object('http_status',200,'body',jsonb_build_object('success',true,'sbid',sb,'received_at',stamp));
END $$;
REVOKE ALL ON FUNCTION public.order_ingest(jsonb,bigint,uuid),public.order_ingest_log(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_ingest(jsonb,bigint,uuid),public.order_ingest_log(uuid,integer,text) TO service_role;

-- Guarded surgical changes preserve the existing command authorization, locks and idempotency.
DO $$ DECLARE def text; old text; BEGIN
 SELECT pg_get_functiondef('public.orders_command(text,jsonb,uuid)'::regprocedure) INTO def;
 old:='VALUES(i.id,a.id,a.name,a.role,q,prod.work_rate_minor,prod.currency,s.id)';
 IF position(old IN def)=0 THEN RAISE EXCEPTION 'STOP: orders_command baseline drift'; END IF;
 EXECUTE replace(def,old,'VALUES(i.id,a.id,a.name,a.role,q,CASE WHEN i.is_external THEN 0 ELSE prod.work_rate_minor END,CASE WHEN i.is_external THEN ''PLN'' ELSE prod.currency END,s.id)');
 SELECT pg_get_functiondef('public.orders_board(bigint)'::regprocedure) INTO def;
 old:='''ready_at'',o.ready_at';
 IF position(old IN def)=0 OR position('''name'',i.product_name_snapshot' IN def)=0 THEN RAISE EXCEPTION 'STOP: orders_board baseline drift'; END IF;
 def:=replace(def,old,'''integration_sbid'',o.integration_sbid,''comment'',o.comment,'||old);
 EXECUTE replace(def,'''name'',i.product_name_snapshot','''name'',i.product_name_snapshot,''comment'',i.comment,''external_sku'',i.external_product_id,''is_external'',i.is_external');
END $$;
CREATE FUNCTION app_private.order_prepared_callback() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public."Orders"; stamp timestamptz; BEGIN
 IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT ord.* INTO o FROM public."Orders" ord JOIN public."Order_items" i ON i.order_id=ord.id
 JOIN public."Order_item_assignments" a ON a.order_item_id=i.id WHERE a.id=NEW.source_assignment_id FOR UPDATE OF ord;
 IF o.integration_sbid IS NULL THEN RETURN NEW; END IF;
 IF EXISTS(SELECT FROM public."Order_items" i WHERE i.order_id=o.id AND i.item_type NOT IN ('set','drink') AND i.quantity<>(
  SELECT coalesce(sum(c.quantity),0) FROM public."Order_item_assignments" a JOIN public."Order_cutting_assignments" c ON c.source_assignment_id=a.id
  WHERE a.order_item_id=i.id AND a.released_at IS NULL AND c.completed_at IS NOT NULL)) THEN RETURN NEW; END IF;
 stamp:=clock_timestamp();
 INSERT INTO app_private.order_callbacks(order_id,sbid,status,payload) VALUES(o.id,o.integration_sbid,'prepared',jsonb_build_object('sbid',o.integration_sbid,'status','prepared','prepared_at',stamp)) ON CONFLICT(order_id,status) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.order_prepared_callback() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER external_order_prepared AFTER UPDATE OF completed_at ON public."Order_cutting_assignments" FOR EACH ROW EXECUTE FUNCTION app_private.order_prepared_callback();
COMMIT;
