BEGIN;
-- Existing receipts/orders are not rewritten. Legacy receipts remain valid at their original location.
ALTER TABLE app_private.order_ingest_receipts ADD COLUMN external_location text
 CHECK(external_location IN ('podgorna','czerwca','pulaski','damrota'));
CREATE FUNCTION public.order_ingest_routed(p_payload jsonb,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE code text; loc bigint; original_loc bigint; previous app_private.order_ingest_receipts;
 result jsonb; sb text; BEGIN
 IF jsonb_typeof(p_payload->'sbid')='string' THEN sb:=p_payload->>'sbid'; END IF;
 IF jsonb_typeof(p_payload->'location')='string' THEN
  code:=translate(lower(regexp_replace(p_payload->>'location','^[[:space:]]+|[[:space:]]+$','','g')),'ł','l');
 END IF;
 IF code IS NULL OR code NOT IN ('podgorna','czerwca','pulaski','damrota') THEN
  INSERT INTO app_private.order_integration_log(request_id,sbid,outcome,response_status,detail)
   VALUES(p_request,sb,'validation_error',400,'unsupported location: missing, empty, non-string or unknown code');
  RETURN jsonb_build_object('http_status',400,'body',jsonb_build_object('success',false,'error','unsupported location'));
 END IF;
 SELECT location_id INTO loc FROM app_private.order_location_mappings WHERE source='external-v1' AND external_location_id=code FOR SHARE;
 IF NOT FOUND THEN
  INSERT INTO app_private.order_integration_log(request_id,sbid,outcome,response_status,detail) VALUES(p_request,sb,'validation_error',400,'unsupported location: mapping absent for '||code);
  RETURN jsonb_build_object('http_status',400,'body',jsonb_build_object('success',false,'error','unsupported location'));
 END IF;
 -- Reuse the original ingest lock, including compatibility with legacy single-location requests in flight.
 IF sb IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('order-ingest:'||sb,43)); END IF;
 SELECT * INTO previous FROM app_private.order_ingest_receipts WHERE sbid=sb;
 IF FOUND THEN
  SELECT location_id INTO original_loc FROM public."Orders" WHERE id=previous.order_id;
  IF original_loc IS DISTINCT FROM loc OR (previous.external_location IS NOT NULL AND previous.external_location<>code) THEN
   INSERT INTO app_private.order_integration_log(request_id,sbid,order_id,outcome,response_status,detail)
    VALUES(p_request,sb,previous.order_id,'conflict',409,'location differs from original order');
   RETURN jsonb_build_object('http_status',409,'body',jsonb_build_object('success',false,'error','sbid already exists with different content'));
  END IF;
 END IF;
 -- Inactive configured targets fail closed; no fallback to the old environment secret.
 PERFORM 1 FROM public."Locations" WHERE id=loc AND active IS TRUE FOR SHARE;
 IF NOT FOUND THEN
  INSERT INTO app_private.order_integration_log(request_id,sbid,outcome,response_status,detail) VALUES(p_request,sb,'configuration_error',503,'Mapped location inactive for '||code);
  RETURN jsonb_build_object('http_status',503,'body',jsonb_build_object('success',false,'error','Integration unavailable'));
 END IF;
 result:=public.order_ingest(p_payload-'location',loc,p_request);
 IF (result->>'http_status')::integer=200 AND previous.sbid IS NULL THEN
  UPDATE app_private.order_ingest_receipts SET external_location=code WHERE sbid=p_payload->>'sbid';
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.order_ingest_routed(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_ingest_routed(jsonb,uuid) TO service_role;
COMMIT;
