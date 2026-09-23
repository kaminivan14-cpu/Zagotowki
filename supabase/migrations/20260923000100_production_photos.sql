-- Etap przygotowawczy, do ręcznego uruchomienia. Nie włącza uploadu ani kończenia.
-- Zdjęcia są opcjonalne: zero rekordów zdjęć jest poprawne również dla gotowej pozycji.
-- Brak triggera/warunku wymagającego zdjęcia przy kończeniu Plan_items.
BEGIN;

CREATE TABLE public."Production_photos" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_item_id bigint NOT NULL REFERENCES public."Plan_items"(id) ON DELETE RESTRICT,
  storage_path text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NULL,
  CONSTRAINT production_photos_path CHECK (
    storage_path = plan_item_id::text || '/' || id::text || '.jpg'
  )
);
CREATE INDEX production_photos_item_idx ON public."Production_photos"(plan_item_id);
COMMENT ON COLUMN public."Production_photos".uploaded_by IS
  'Etap Auth: przypisywane wyłącznie przez backend z auth.uid(); nullable na czas integracji.';
ALTER TABLE public."Production_photos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Production_photos" FROM PUBLIC, anon, authenticated;
-- Brak policies/grantów klienta do czasu integracji feature/auth.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('production-photos', 'production-photos', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bariera dotyczy tylko tego bucketu, także przy istniejących szerokich policies.
-- Przy integracji Auth usunąć ją dopiero wraz z docelowymi kontrolami Storage.
CREATE POLICY production_photos_pending_auth ON storage.objects
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'production-photos')
WITH CHECK (bucket_id <> 'production-photos');

COMMIT;
