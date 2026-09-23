-- ZAGOTÓWKI — jednostki receptur. Wyłącznie do ręcznego uruchomienia.
-- Rozszerzenie wcześniejszej migracji ingredient_unit; można uruchomić ponownie.
-- Products.base_unit: kolumna D arkusza „Półprodukty” (jednostka gramatury).
-- Recipe_ingredients.ingredient_unit: kolumna F arkusza „Ingredienty”
-- (jednostka BRUTTO konkretnego wiersza; nie wnioskuj jej z Netto ani z Products).
-- Dozwolone wartości źródłowe po normalizacji: g, ml, szt.; NULL = brak danych.
-- Import: trim, małe litery, szt -> szt.; brak jednostki przerywa nowy import.
-- NULL pozostaje dozwolony dla istniejących/nieuzupełnionych danych.
-- Nie zgaduj jednostek i nie konwertuj g <-> ml. Bez automatycznego backfillu.
-- Jeśli istniejące jednostki są niekanoniczne, CHECK przerwie całą transakcję.
-- Należy je wtedy zweryfikować w źródle i poprawić przez istniejący import.
BEGIN;

ALTER TABLE public."Products"
  ADD COLUMN IF NOT EXISTS base_unit text;

ALTER TABLE public."Recipe_ingredients"
  ADD COLUMN IF NOT EXISTS ingredient_unit text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."Products"'::regclass
      AND conname = 'products_base_unit_allowed'
  ) THEN
    ALTER TABLE public."Products" ADD CONSTRAINT products_base_unit_allowed
      CHECK (base_unit IS NULL OR base_unit IN ('g', 'ml', 'szt.'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."Recipe_ingredients"'::regclass
      AND conname = 'recipe_ingredients_unit_allowed'
  ) THEN
    ALTER TABLE public."Recipe_ingredients" ADD CONSTRAINT recipe_ingredients_unit_allowed
      CHECK (ingredient_unit IS NULL OR ingredient_unit IN ('g', 'ml', 'szt.'));
  END IF;
END;
$$;

COMMENT ON COLUMN public."Products".base_unit IS
  'Jednostka gramatury bazowej z kolumny D arkusza Półprodukty: g, ml, szt.; NULL = nieznana.';
COMMENT ON COLUMN public."Recipe_ingredients".ingredient_unit IS
  'Jednostka BRUTTO z kolumny F arkusza Ingredienty dla tego wiersza receptury: g, ml, szt.; NULL = nieznana.';

COMMIT;
