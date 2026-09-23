# Zapotrzebowanie ogólne i granice implementacji zdjęć

## Wykonane

Przycisk w konkretnym planie otwiera osobny ekran. Odczyt obejmuje wszystkie
Plan_items (także gotowe), paginację, aktualne receptury i lokalny cache tylko na
czas jednego obliczenia. Odświeżenie ponownie odczytuje dane. Wynik nie trafia do bazy.
Istniejące scaleRecipe i extendRecipePath odpowiadają za skalowanie i cykle;
rootScaleFactor jest taki sam na wszystkich poziomach jak w TechnologyCard.
Karta i jej cache pozostają bez zmian.

Sumowanie używa ingredient_external_id + dokładnej jednostki, nigdy nazwy.
Kilogramy i gramy pozostają osobnymi wierszami. Niebezpieczne numery ID, cykle,
braki danych, błędy odczytu i przepełnienia nie dają pozornie poprawnych liczb.
Produkt obecny w katalogu bez składników receptury jest zgłaszany jako brak danych,
a nie traktowany automatycznie jako surowiec. Składnik bez produktu i bez własnej
receptury jest traktowany jako końcowy. Ostrzeżenia zawierają pozycję i ścieżkę.
Przy dowolnym pominięciu ekran jasno oznacza sumy jako niepełne.

## Jednostki — potwierdzony brak danych

Analiza lokalnego docs/plan-items-schema-audit-result.json:
Recipe_ingredients ma ingredient_external_id, netto, brutto, lecz brak jednostki.
Products.gramatura jest podstawą skalowania; Plan_items.jednostka opisuje produkt
zamówiony w planie. Żadne z nich nie dowodzi jednostki brutto końcowego składnika.
Nie sprawdzano ani nie zmieniano produkcyjnej bazy.

Jedyny SQL: docs/production-requirements-photos-migration.sql. Dodaje opcjonalne
Recipe_ingredients.ingredient_unit bez domyślnej wartości i bez backfillu.
Należy uzupełnić je na podstawie wiarygodnego źródła receptur oraz uwzględnić
w importerze (importera nie ma w tym repozytorium). Do tego czasu ekran podaje
ostrzeżenia; przy braku jednostek wszystkich składników nie pokaże żadnych sum.
Ekran obsługuje również brak nowej kolumny przed uruchomieniem migracji.

## Zdjęcia — niewdrożone, konkretna blokada bezpieczeństwa

Frontend wywołuje login_employee(p_pin), zapisuje pracownika w sessionStorage,
i przekazuje p_requester_id do RPC. Brak Supabase Auth lub innego tokenu
potwierdzającego tożsamość. Audytowane RPC ufają podanemu ID. Identyfikator
przekazany w ścieżce Storage, nagłówku lub parametrze nie naprawia tego problemu.
Repozytorium nie zawiera konfiguracji bucketów ani audytu Storage policies.
Nie da się potwierdzić, czy production-photos istnieje na produkcji.

Ponadto audytowane start_plan_item zapisuje czas, ale nie wykonawcę.
complete_plan_item dopiero na końcu ustawia employee_id = p_requester_id;
sprawdza aktywnego pracownika, przypisany lokal, aktywny plan na dziś,
rozpoczęcie i brak wcześniejszego zakończenia, ale nie własność rozpoczętej pracy.
Nie można więc wiarygodnie stwierdzić, kto rozpoczął konkretną pozycję.

Zgodnie z dopuszczonym zakresem częściowej realizacji nie dodano pozornego uploadu,
publicznego bucketu, policies opartych na samym ID ani klucza service_role do klienta.
Nie zmieniono kończenia pozycji, historii ani istniejących zakończonych rekordów.
Obowiązkowe zdjęcie, wybór/podgląd/kompresja, upload i podgląd historii pozostają
niewdrożone; ta migracja ich nie włącza.

## Najmniejsza proponowana dalsza zmiana

Pozostawić PIN i p_requester_id. Dodać serwerową warstwę zdjęć (np. Edge Function)
z krótkotrwałą, niepodrabialną sesją wystawianą po weryfikacji PIN-u; ID w żądaniu
musi odpowiadać sesji. Weryfikacja PIN-u wymaga ograniczenia prób. Bezpośrednie
anonimowe wywołania nie mogą wystawiać uprawnień do zdjęć na podstawie samego ID.

Dodać zapis wykonawcy przy START (np. osobne started_by, ponieważ employee_id
obecnie oznacza kończącego). Tego nie można uzyskać bez małego rozszerzenia START.
Prywatny bucket production-photos oraz tabela zdjęć z id, plan_item_id, storage_path,
uploaded_by i created_at pozwolą przechować wiele zdjęć bez powielania lokalu.
Tabela i bucket mają blokować bezpośredni dostęp klienta; serwer sprawdza sesję,
aktualną rolę/aktywność i lokal przy każdym uploadzie i podglądzie. Employee dodaje
do swojej rozpoczętej pozycji; manager/su-chef oglądają swój lokal, admin wszystkie.
Serwer może wystawiać krótkotrwałe podpisane URL po tych kontrolach.

Zakończenie musi w jednej transakcji zweryfikować zapisany obiekt i metadane oraz
zachować wszystkie obecne kontrole complete_plan_item; stara ścieżka RPC nie może
omijać obowiązku zdjęcia. Potrzebne są idempotencja ponowienia po zerwaniu połączenia,
bezpieczne sprzątanie osieroconych uploadów i zachowanie starych zakończonych rekordów.
Klient: input image/capture, Canvas do JPEG do 1600 px, podgląd i kończenie dopiero
po potwierdzeniu serwera. To propozycja, nie gotowa konfiguracja do włączenia flagą.

## Kontrola ręczna po wdrożeniu

1. Po uzupełnieniu potwierdzonych jednostek porównaj sumy dwóch produktów ze wspólnym
   składnikiem i wielopoziomowym półproduktem z kartami technologicznymi.
2. Sprawdź brak jednostki/receptury, cykl i różne jednostki tego samego ID:
   ostrzeżenia, brak zgadywania i brak łączenia niezgodnych ilości.
3. Otwórz ekran na telefonie, odśwież po zmianie planu/receptury i wróć do planu;
   sprawdź datę, lokal oraz czytelność listy.
