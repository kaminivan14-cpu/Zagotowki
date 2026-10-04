BEGIN;
-- Preserve the pre-existing non-null role invariant when expanding its allowlist.
-- The original auth constraint already required a role for every existing employee.
ALTER TABLE public."Employees" ALTER COLUMN role SET NOT NULL;
COMMIT;
