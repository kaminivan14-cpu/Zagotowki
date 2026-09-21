-- ARCHIWALNE: według potwierdzenia użytkownika migracja i RPC są już wdrożone.
-- NIE URUCHAMIAĆ PONOWNIE. Plan_items.product_external_id: bigint NULL z FK.
-- PROPOZYCJA DO PRZEGLĄDU — NIE URUCHOMIONO.
-- Repozytorium nie zawiera schematu ani definicji RPC.
-- Używamy dokładnego typu Products.external_id, bez zgadywania text/bigint/uuid.
DO $$
DECLARE
  external_id_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod)
    INTO STRICT external_id_type
    FROM pg_attribute
    WHERE attrelid = 'public."Products"'::regclass
      AND attname = 'external_id'
      AND attnum > 0 AND NOT attisdropped;

  EXECUTE format(
    'ALTER TABLE public."Plan_items" ADD COLUMN product_external_id %s NULL',
    external_id_type
  );
END $$;

-- Celowo bez IF NOT EXISTS: istniejąca kolumna wymaga sprawdzenia jej typu.
-- Stare pozycje pozostają NULL. Nie uzupełniać ID przez dopasowanie nazw.
-- Przed włączeniem zapisu ID trzeba sprawdzić i dostosować istniejące RPC:
-- create_production_plan, update_production_plan, add_plan_item, update_plan_item.
-- Sam ALTER TABLE nie powoduje zapisywania ID przez dotychczasowe RPC.
-- Nie zmieniamy RLS, ról ani funkcji bez ich aktualnych definicji.
