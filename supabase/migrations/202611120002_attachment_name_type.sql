-- Attachment hardening (2026-11-12, decision D-39). Additive: patches app_private.task_result_command only.
-- Storage records the MIME type sent by the uploader, so the server additionally requires the file name's
-- extension to match that type (no ".pdf" registered as a Word document, no renamed executables).
-- Content sniffing (magic bytes) would need an Edge Function and is out of scope (see rollout notes).
-- Rollback: re-run 202611120001's patch on top of 202611110001 (the inserted block is delimited below).
DO $$ DECLARE d text; anchor text := '-- end 202611120001'; BEGIN
 d := pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure);
 IF position(anchor IN d) = 0 OR position('202611120002' IN d) > 0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_result_command'; END IF;
 d := replace(d, anchor, anchor || $w$
  -- 202611120002: the file name extension must match the declared type
  IF lower(coalesce(p->>'name','')) !~ (CASE p->>'mime'
     WHEN 'application/pdf' THEN '\.pdf$'
     WHEN 'image/jpeg' THEN '\.(jpg|jpeg)$'
     WHEN 'image/png' THEN '\.png$'
     WHEN 'image/webp' THEN '\.webp$'
     WHEN 'text/plain' THEN '\.(txt|csv)$'
     WHEN 'text/csv' THEN '\.csv$'
     WHEN 'application/msword' THEN '\.doc$'
     WHEN 'application/vnd.ms-excel' THEN '\.(xls|csv)$'
     WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN '\.docx$'
     WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN '\.xlsx$'
     ELSE '\.never-matches$' END) THEN RAISE EXCEPTION 'ATTACHMENT_TYPE'; END IF;
  -- end 202611120002$w$);
 EXECUTE d;
END $$;
