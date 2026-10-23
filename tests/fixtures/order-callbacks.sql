-- Local-only callback baseline matching Production preflight 2026-10-21.
ALTER TABLE app_private.order_callbacks ADD COLUMN exhausted_at timestamptz, ADD COLUMN lease_token uuid, ADD COLUMN lease_until timestamptz;
CREATE TABLE app_private.order_callback_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO app_private.order_callback_settings VALUES(true,false);
REVOKE ALL ON app_private.order_callback_settings FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.order_callback_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE j app_private.order_callbacks;t timestamptz:=clock_timestamp();BEGIN
 IF NOT (SELECT enabled FROM app_private.order_callback_settings WHERE singleton) THEN RETURN NULL;END IF;
 SELECT * INTO j FROM app_private.order_callbacks
 WHERE sent_at IS NULL AND exhausted_at IS NULL
 AND (lease_until IS NULL OR lease_until<=t)
 AND (next_attempt_at<=t OR (attempts=0 AND next_attempt_at IS NULL))
 ORDER BY coalesce(next_attempt_at,created_at),id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- An interrupted final attempt is terminal; never send attempt 16.
 IF j.attempts>=15 THEN
  UPDATE app_private.order_callbacks SET exhausted_at=t,next_attempt_at=NULL,
   lease_token=NULL,lease_until=NULL,last_error='Retry limit reached (15 attempts); final worker lease expired' WHERE id=j.id;
  INSERT INTO app_private.order_integration_log(request_id,sbid,order_id,outcome,response_status,detail)
   VALUES(gen_random_uuid(),j.sbid,j.order_id,'callback_exhausted',504,'Prepared callback retry limit reached: 15 total attempts');
  RETURN NULL;
 END IF;
 UPDATE app_private.order_callbacks SET attempts=attempts+1,last_attempt_at=t,
 lease_token=gen_random_uuid(),lease_until=t+interval '90 seconds',
 next_attempt_at=t+interval '150 seconds' WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('id',j.id,'token',j.lease_token,'attempt',j.attempts,'payload',j.payload);
END $function$;

CREATE OR REPLACE FUNCTION public.order_callback_result(p_id bigint, p_token uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE j app_private.order_callbacks;t timestamptz:=clock_timestamp();BEGIN
 IF p_success IS NULL THEN RAISE EXCEPTION 'INVALID_CALLBACK_RESULT';END IF;
 SELECT * INTO j FROM app_private.order_callbacks WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.lease_token IS DISTINCT FROM p_token OR p_token IS NULL OR j.sent_at IS NOT NULL OR j.exhausted_at IS NOT NULL THEN RETURN false;END IF;
 UPDATE app_private.order_callbacks SET
  sent_at=CASE WHEN p_success THEN t ELSE NULL END,
  exhausted_at=CASE WHEN NOT p_success AND attempts>=15 THEN t ELSE NULL END,
  next_attempt_at=CASE WHEN NOT p_success AND attempts<15 THEN t+interval '1 minute' ELSE NULL END,
  last_error=CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error,'Callback delivery failed'),1000) END,
  lease_token=NULL,lease_until=NULL WHERE id=p_id;
 INSERT INTO app_private.order_integration_log(request_id,sbid,order_id,outcome,response_status,detail)
 VALUES(gen_random_uuid(),j.sbid,j.order_id,
  CASE WHEN p_success THEN 'callback_sent' WHEN j.attempts>=15 THEN 'callback_exhausted' ELSE 'callback_retry' END,
  CASE WHEN p_success THEN 200 ELSE 502 END,
  CASE WHEN p_success THEN 'Prepared callback delivered' WHEN j.attempts>=15 THEN 'Prepared callback retry limit reached: 15 total attempts' ELSE 'Prepared callback failed; retry in 1 minute' END);
 RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.order_callback_claim(),public.order_callback_result(bigint,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_callback_claim(),public.order_callback_result(bigint,uuid,boolean,text) TO service_role;
