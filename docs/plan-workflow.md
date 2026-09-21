# Zakres zmian planów

Zarządzający widzą wszystkie plany wybranego lokalu, w tym zakończone i historyczne. Zakończony (`completed`) plan jest tylko do odczytu; edycja następuje po wznowieniu. Przywrócenie statusu nie resetuje postępu pozycji. Blokada zbiorczej edycji rozpoczętych/zakończonych pozycji pozostaje.

„← Lista planów” porzuca lokalny formularz i odświeża listę przez SELECT, bez RPC. Podczas zapisu jest zablokowane — rozpoczętego zapisu serwerowego nie da się anulować nawigacją.

Employee: aktywne plany własnego location_id, dziś → dziś + 7 włącznie (8 dat). Europe/Warsaw jest strefą dnia w UI. Lista i ponowny odczyt przy otwarciu sprawdzają lokal, datę i status. Przyszłe plany są tylko do odczytu; karty technologiczne pozostają dostępne. Handlery dodatkowo blokują operacje. Są to zabezpieczenia klienta, nie zamiennik RPC/RLS.

## SQL do ręcznego wdrożenia

`plan-workflow-migration.sql` NIE zostało uruchomione. Zgodnie z informacją użytkownika start_plan_item i complete_plan_item obecnie sprawdzają aktywność, lokal i status, ale NIE datę. Backend wymaga tej poprawki przed uznaniem przyszłych planów za bezpiecznie tylko odczytowe.

Nowe RPC reopen_production_plan(p_requester_id bigint, p_plan_id bigint): aktywny Employees, role administrator/manager/su-chef, manager/su-chef wyłącznie swój lokal, plan completed. Pod blokadą rekordu zmienia wyłącznie Plans.status na active. Sprawdzić triggery Plans przed wdrożeniem, aby wykluczyć pośredni reset pozycji. Ponowne wywołanie dla active jest odrzucane zgodnie z wymaganiem completed.

Poprawka start/complete odczytuje rzeczywiste definicje funkcji z bazy, zachowuje ich treść i nagłówek, dodaje zewnętrzny blok PL/pgSQL sprawdzający Plans.plan_date = CURRENT_DATE dla wszystkich ról. Istniejąca autoryzacja i logika pozycji pozostają w oryginalnym zagnieżdżonym bloku. Nie rekonstruuje ich z opisu. Nietypowa sygnatura/język/format ciała przerywa całą transakcję zamiast zgadywać. W takim przypadku potrzebna jest pełna definicja do ręcznego dostosowania. Migracja została wykonana testowo na lokalnym PostgreSQL (PGlite) z izolowanymi tabelami i przykładowymi istniejącymi funkcjami. Sprawdzono kompilację, zachowanie ich treści/ACL/ustawień, kontrolę daty oraz wznowienie bez zmian pozycji. Nie wykonywano jej na produkcyjnych definicjach RPC.

Ważna granica dnia: CURRENT_DATE używa strefy sesji bazy. UI używa Europe/Warsaw. Skrypt zawiera jawne polecenia kontroli strefy; nie zmienia jej. Należy potwierdzić zgodność przy wdrożeniu.

complete_production_plan, według użytkownika, już ogranicza role i lokal. Nie zmieniamy go. Nie rozluźniamy warunku active w RPC edycji. update_production_plan, add_plan_item, update_plan_item, delete_plan_item wymagają potwierdzenia zachowania na wznowionym active planie, ale do edycji po wznowieniu nie jest potrzebne dopuszczanie completed.

## Włączenie wznowienia

Przycisk jest przygotowany, lecz domyślnie nieaktywny, bo nowego RPC jeszcze nie ma na produkcji. Po ręcznym wdrożeniu i sprawdzeniu SQL ustawić VITE_PLAN_REOPEN_ENABLED=true i przebudować frontend. Nie ma fallbacku UPDATE/INSERT; po RPC aplikacja ponownie odczytuje plan i pozycje. Nie aktualizuje lokalnie statusów pozycji.

Skrypt bazuje na istniejącym modelu p_requester_id, zgodnie z wymaganiem użytkownika; nie wprowadza Supabase Auth ani zmian RLS. Nie dowodzi odporności tego modelu na podszywanie się. Sprawdzenie bezpośrednich grantów/RLS i UNIQUE(location_id, plan_date) pozostaje osobnym audytem; frontend zachowuje sprawdzanie duplikatu przed tworzeniem planu.
