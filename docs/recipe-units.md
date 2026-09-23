# Jednostki źródłowe receptur

Stan ustalono na podstawie lokalnego audytu
`docs/plan-items-schema-audit-result.json` i kodu aplikacji. Nie odczytywano ani
nie zmieniano produkcyjnego schematu i nie uruchamiano importu.

## Przechowywanie

Ten sam plik `docs/production-requirements-photos-migration.sql` rozszerza istniejące
tabele, bez zmiany ID, external_id ani ich ograniczeń unikalności:

| Źródło | Pole Supabase | Znaczenie |
| --- | --- | --- |
| Półprodukty, D | Products.base_unit | Jednostka gramatury bazowej z C |
| Ingredienty, F | Recipe_ingredients.ingredient_unit | Jednostka Brutto z E konkretnego wiersza |

Oba pola dopuszczają wyłącznie `g`, `ml`, `szt.` lub NULL. Nie są uzupełniane
wartościami domyślnymi. Import ma trimować, zamieniać litery na małe i `szt` na
`szt.`. Importer odrzuca pustą jednostkę i nieobsługiwane wartości, zgłaszając błąd
z nazwą arkusza i numerem wiersza. Nie wolno kopiować jednostki z Netto ani zgadywać
jej z nazwy ingredientu. Przykładowo Jajko: Brutto 10 i jednostka szt., niezależnie
od wartości Netto 375.

SQL można uruchomić ponownie, również po wcześniejszej wersji z samym
ingredient_unit. Jeżeli istniejące wartości nie spełniają nowych CHECK,
transakcja zostanie przerwana bez częściowej zmiany schematu — bez zgadywania
lub automatycznej utraty danych. Wymagają weryfikacji i normalizacji w importerze.

## Import — Apps Script w repozytorium

`scripts/google-apps-script/sync-products.js` to rozszerzona wersja istniejącego
Apps Script dostarczonego przez użytkownika. Kod można wkleić do pliku `.gs`
w istniejącym projekcie Apps Script. Nazwy arkuszy pozostają dokładnie
`Polprodukty` i `Ingredienty`, a funkcja uruchamiana ręcznie/triggerem nadal nazywa
się `syncAllViaEdge`. W repozytorium nie ma sekretów; SUPABASE_URL i SYNC_TOKEN
pozostają w dotychczasowych Script Properties.

Odczyt obejmuje A:D i A:F. Importer dodaje base_unit i ingredient_unit do istniejących
obiektów JSON. Trimuje jednostki, sprowadza litery do małych, zamienia szt na szt.
Brak jednostki lub inna wartość przerywa import z nazwą arkusza, wierszem i kolumną.
Walidacja obu arkuszy oraz kontrola duplikatów następuje przed pierwszym żądaniem.
NULL w schemacie pozostaje dozwolony dla dotychczasowych/nieuzupełnionych danych,
ale nowy importer wymaga jednostki w każdym niepustym wierszu.

Zachowano ID, dotychczasową wysyłkę produktów i partie ingredientów po 500 oraz
istniejący kontrakt sync_token. To rozszerzenie tego samego importera.

### Brakuje kodu Edge Function sync-products

Nie ma go w repozytorium ani w dostarczonym załączniku. Nie tworzono nowej funkcji.
Potrzebny jest pełny aktualny kod wdrożonej `sync-products` (zwykle index.ts)
i importowane lokalne pliki pomocnicze, bez sekretów. Nie można jeszcze potwierdzić,
że funkcja akceptuje/zapisuje nowe pola lub że powtórzenie synchronizacji jest
idempotentne. HTTP 200 nie dowodzi zapisu nowych pól, jeśli funkcja je pomija.

Przed synchronizacją trzeba rozszerzyć istniejące mapowanie/walidację Edge Function:
Products.base_unit oraz Recipe_ingredients.ingredient_unit mają przechodzić do
zapisów Supabase, z tym samym zakresem jednostek. Audyt zawiera UNIQUE
Products(external_id) oraz UNIQUE
Recipe_ingredients(product_external_id, ingredient_external_id). Istniejący upsert
musi wykorzystywać te klucze i aktualizować nowe pola, zachowując ID rekordów.
Weryfikacja tej części jest zablokowana do otrzymania kodu funkcji.

## Obliczenia

Zapotrzebowanie pobiera oba pola i używa BRUTTO. Normalizacja obsługuje wyłącznie
trim, wielkość liter i alias `szt`. Sumy są grupowane po stabilnym ID i jednostce.
`g` i `ml` tego samego ID pozostają osobnymi wierszami; brak lub nieobsługiwana
jednostka powoduje pominięcie gałęzi z ostrzeżeniem.

Wspólny scaleRecipe otrzymał opcjonalny parametr jednostki bazy. Zapotrzebowanie
podaje go jawnie (również NULL, jeżeli brakuje danych), więc nie przyjmuje domyślnie
gramów. Ilość planu jest dzielona przez gramaturę bazową w tej samej jednostce.
Zachowano istniejące kg → g wyłącznie dla ilości planu; `kg` nie jest dozwoloną
jednostką źródłową obu arkuszy. `l` i inne nieobsługiwane jednostki planu powodują
ostrzeżenie. Nie ma konwersji g ↔ ml ani masa ↔ sztuki.

Przy rekurencji porównujemy jednostkę Brutto wiersza wskazującego półprodukt
z jednostką bazy tego półproduktu. Różnica lub brak blokuje gałąź. Nie wymagamy,
aby jednostka produktu końcowego była taka sama jak jego surowców: produkt w ml
może prawidłowo zawierać jajka w szt. oraz cukier w g. Wszystkie poziomy nadal
używają jednego rootScaleFactor; nie dzielimy ponownie przez bazę dziecka.

Nie zmieniono komponentu ani loadera TechnologyCard. Jego dotychczasowe wywołania
scaleRecipe bez nowego parametru zachowują dotychczasowe działanie dla g/kg.
Karta nie wyświetla nowych jednostek; obsługa nowych jednostek dotyczy obecnie
Zapotrzebowania. Przed migracją/importem ekran pokazuje ostrzeżenia o brakach.

## Kolejność ręczna

1. Uruchom SQL: `docs/production-requirements-photos-migration.sql`.
2. Po dostarczeniu, poprawieniu i ręcznym wdrożeniu istniejącej Edge Function
   sync-products wklej zapisany Apps Script do istniejącego projektu i uruchom
   import obu arkuszy z kolumnami D/F. Ponowienie nie powinno zmieniać ID ani
   liczby rekordów dla niezmienionego źródła. Nie uruchamiaj importu przed
   potwierdzeniem obsługi nowych pól i upsertu po stronie Edge Function.
3. W aplikacji odśwież Zapotrzebowanie: sprawdź sumy g/ml/szt., Jajko po Brutto,
   zgodny półprodukt w rekurencji i ostrzeżenie przy rzeczywistej niezgodności.

Żaden z tych kroków nie został wykonany automatycznie.
