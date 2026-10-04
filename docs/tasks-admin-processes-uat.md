# Tasks: panel administracyjny i procesy — UAT

Gałąź: `feature/orders`. Status przed push: **NOT READY** — implementacja i lokalna regresja gotowe; Preview, migracje UAT i smoke UAT pozostają do wykonania. Production i main nietknięte.

## Pracownicy i uprawnienia

`Employees.role` zachowuje dotychczasowe znaczenie i wartości istniejących kont. Nie ma automatycznej konwersji ról ani przepisywania Auth. Zmiana roli systemowej wymaga jawnego zapisu administratora przez istniejące zabezpieczenia `auth_save_employee`.

Nowe `Employees.production_role` jest wyłącznie organizacyjne: `su-chef`, `shift-manager`, `sushi-master`, `crafter`. Nie bierze udziału w obliczaniu permissions. Jest dostępne tylko dla działu o kodzie `production`; poza nim backend wymusza NULL. Przykład `role=manager`, `production_role=su-chef` pozostaje poprawny. Dotychczasowe role produkcyjne nie są konwertowane.

Departments otrzymuje kody i seed siedmiu działów: marketing, finance, it, quality, hr, operations, production. Istniejące działy o odpowiadających nazwach są wykorzystywane. Kierownik korzysta z Employee_reporting_lines, lokacja z Locations. Zachowane są walidacje aktywności, cykli hierarchii i własnego konta.

Panel jest dostępny przez `tasks.admin`. Dodane capabilities: employees.read/manage, dictionaries.read/manage, processes.read/manage/launch. Otrzymują je role mające już tasks.admin; nie są wyliczane z production_role. Sekcja dostępu jest podsumowaniem, nie nowym edytorem permissions.

## Migracje i model

- `202610060001_tasks_admin_processes.sql`: panel, procesy, wyniki i prywatne pliki.
- `202610060002_new_menu_process.sql`: szkic procesu „Введення нового меню”.

Nowe tabele: Task_admin_events, Process_templates, Process_versions, Process_instances, Task_results, Task_files. RLS włączone, brak bezpośredniego dostępu tabel dla anon/authenticated. Dostęp odbywa się przez kontrolowane RPC. Zmienione istniejące obiekty: Departments.code, Employees.production_role, role_permissions; walidacja i audyt Task_categories; triggery Tasks dla kategorii i dat zależnych od ukończenia. Uruchomienie procesu zapisuje zwykłe Tasks, Task_checklist_items, Task_dependencies i Task_events. Zapis pracownika używa istniejącej hierarchii.

Etapy i szablony zadań są definicją JSON wersji. Opublikowana wersja jest niezmienna. Nowa wersja nie zmienia istniejących instancji. Instancja wskazuje konkretną wersję; zwykłe Tasks przechowują identyfikator instancji/kroku i instrukcje w istniejącym source_metadata. Postęp jest liczony z rzeczywistych statusów Tasks. Nie powstaje równoległy system zadań.

Nowe publiczne RPC: tasks_admin_directory, tasks_processes, tasks_process_task, tasks_result_inbox, tasks_file, tasks_storage_read. Zapis przechodzi przez istniejące tasks_command i jego operation_id/locking/idempotency. Rozszerzone są prywatne dispatch/validate/settings oraz tasks_context (historyczne kategorie). Akcje obejmują pracowników, tworzenie/zapis/publikację/wersjonowanie/duplikację/uruchomienie procesu, rejestrację pliku, zapis i zatwierdzenie wyniku.

Słowniki korzystają z Task_categories: hierarchia, kolejność, aktywacja/dezaktywacja, audyt. Nieaktywna kategoria jest niedostępna dla nowych zadań, ale jej nazwa pozostaje czytelna historycznie.

Seed nowego menu obejmuje 7 etapów i 32 zadania, gałąź marketingową, zależności uruchomienia sprzedaży oraz kontrolę +14/+30 dni od rzeczywistego zakończenia zadania „Запустити продажі”. To szkic do sprawdzenia, przypisania osób i publikacji. Estymaty i terminy szablonu wymagają biznesowej korekty przed użyciem. Warunek uruchomienia jest instrukcją; proces uruchamia się ręcznie.

## Interfejs

Nowe komponenty są w `src/tasks/admin/`: AdminScreen, Processes, Files, TaskResult, labels i style. Panel obejmuje pracowników, strukturę, dostępy, słowniki i procesy. Edytor obsługuje etapy/kroki, zmianę kolejności myszą i klawiaturą, instrukcje, checklisty, zależności, terminy, wyniki, załączniki i potwierdzenie przez wskazaną inną osobę.

Zachowany jest dotychczasowy ekran wykonawczy jednego zadania, Planning, Schedule, Reports i ich wspólna availability. Zmiany WorktimeProvider dotyczą wyłącznie ukraińskich tekstów dialogu w module Tasks; logika Worktime nie jest zmieniona. Orders i Zagotówki nie otrzymują nowych ekranów ani zmian workflow.

## Weryfikacja lokalna

- Node: 117 PASS, w tym PIN/Auth.
- Playwright, izolowany Chromium: 149 PASS; nowe scenariusze panelu/procesów w 375/768/1024/1440 px.
- PostgreSQL procesów: 60 kontroli, w tym zgodność pełnego seeda z fixture, role, RLS, Storage, wyniki, wersje, zależności, atomowość i konkurencyjny retry.
- Tasks PostgreSQL: 164 PASS.
- Worktime PostgreSQL: 58 PASS.
- Orders PostgreSQL: 189 PASS + 33 kontroli schematu/ról; również ścieżka upgrade Tasks.
- Lokalna regresja Production: PASS (test:migration), bez połączenia z Production.
- lint i build:uat: PASS. Build zgłasza ostrzeżenie o istniejącym głównym chunku >500 kB.

Testy Storage obejmują polityki i metadane w lokalnym PostgreSQL oraz upload/download API mockowane w headless. Nie zastępują rzeczywistego transferu pliku do Storage na UAT.

## UAT i kolejność wdrożenia

Jedyny dozwolony projekt: `meuzkduxttjcuiynsnaa`. Odczytowy snapshot schematu, historii migracji oraz Storage i drift-check: PASS, katalog lokalny `tmp/tasks-admin-processes-preflight-20261004T125617Z`. Snapshoty są poza commitem. Na tym etapie nie zmieniono bazy ani konfiguracji UAT.

1. Commit feature/orders, następnie ręczny `git push origin feature/orders` (GitHub auth użytkownika).
2. Potwierdzić SHA i środowisko Preview/UAT; nie Vercel Production.
3. Ponowić snapshot i drift-check. STOP przy niezgodności. Zastosować wyłącznie dwie wymienione migracje w kolejności, z historią migracji.
4. Sprawdzić nowe RPC, grants/RLS, prywatny Storage, brak zmian istniejących ról kont oraz obiektów Orders/Production/Worktime.
5. Backend smoke w transakcji z rollbackiem, następnie ręczny smoke interfejsu.

Stały adres docelowy: https://zagotowki-git-feature-orders-sbla-b.vercel.app — aktualny commit tej iteracji nie jest jeszcze potwierdzony jako wdrożony. Preview Protection wymaga ręcznego dostępu użytkownika; nie obchodzimy SSO i nie korzystamy z jego sesji.

## Ręczna checklista UAT

- Administrator widzi panel; zwykły pracownik go nie widzi i nie może wywołać RPC administratora.
- Edytuj testowego pracownika: manager + dział produkcyjny + su-chef. Uprawnienia systemowe pozostają manager. Zmień dział na inny: production_role znika i jest NULL.
- Sprawdź kierownika, cykl hierarchii, lokację, dezaktywację i audyt; nie zmieniaj konta używanego do bieżącego testu.
- Utwórz kategorię, dezaktywuj ją i sprawdź brak w nowym zadaniu oraz zachowaną nazwę w starym.
- Otwórz szkic nowego menu, sprawdź 7 etapów/32 zadania; skopiuj go do testów, przypisz aktywnych pracowników z kontami Auth, opublikuj i uruchom.
- Sprawdź wygenerowane zwykłe Tasks w Planning/Work Queue oraz checklisty, zależności i postęp procesu.
- Utwórz nową wersję: istniejąca instancja zachowuje poprzednią definicję.
- Prześlij plik do instrukcji oraz wymagane zdjęcie jako wynik. Sprawdź dostęp uprawnionego pracownika i odmowę obcej osoby, potwierdzenie przez wskazanego recenzenta, potem zakończenie zadania.
- Sprawdź terminy kontroli po rzeczywistym zakończeniu kroku uruchomienia sprzedaży.

## Ograniczenia

- Lista instancji zwraca ostatnie 100; bez paginacji w tej wersji.
- Załączniki do 20 MB, ograniczona lista MIME (PDF, obrazy, tekst/CSV, XLSX, DOCX), bucket prywatny; brak usuwania plików i automatycznego sprzątania osieroconych uploadów.
- Dodanie pracownika nie tworzy automatycznie konta Auth ani zaproszenia; obowiązuje istniejący flow powiązania konta.
- Warunek uruchomienia nie jest schedulerem; wysyłanie wiadomości do zewnętrznych czatów w zadaniach seeda jest pracą ręczną.
- Migracja i smoke UAT: oczekują na push/Preview. Nie deklarujemy gotowości UAT na podstawie samych testów lokalnych.
