# Orders MVP — lokalna implementacja UAT

## Zakres i stan

Branch `feature/orders`, punkt startowy `origin/main` = `8ec74d74ef0c0fa033b18136d942eed21a6e527f`.
Trzy migracje Orders oraz seed 15 produktów zostały zastosowane na UAT po osobnej zgodzie operatora; verification PASS. Frontend wymaga Preview i hosted smoke. Production nie zostało zmienione.
Dozwolony przyszły cel: `meuzkduxttjcuiynsnaa`. Production jest poza zakresem.
Nie zmieniono sesji Auth, recovery, HMAC, Origin, rate limitingu ani algorytmu PIN.

## Migracje i kompatybilność

1. `202610010001_roles_modules.sql`: prywatne permissions, bezpieczne RPC capabilities, rozszerzenie list ról/constraints istniejącego Auth/PIN. Odczyt planów korzysta z capabilities; Crafter i Sushi Master mają wyłącznie dzisiejszy aktywny plan własnego lokalu. Zarządzanie planami wymaga production.plan.manage. Bez zmian danych pracowników.
2. `202610010002_crafter.sql`: zmienia WYŁĄCZNIE role employee na crafter. Trigger normalizuje stare zapisy employee do crafter dla klientów w okresie przejściowym. Nie usuwa starego aliasu z constraint; nowe UI nie oferuje employee. Nie tworzy kont ani pracowników. Test porównuje wszystkie pozostałe kolumny oraz relację Plan_items.employee_id: identyczne; zmienionych pin_hash = 0.
3. `202610010003_orders.sql`: addytywny schemat Orders, RPC, deny-all bezpośredniego dostępu do tabel, indeksy, constraints, dziennik operacji. Nie zmienia danych Zagotówek.

Historyczne migracje pozostają niezmienione. Ta ścieżka jest przeznaczona dla obecnego bootstrapu UAT, nie dla osobnej ścieżki upgrade Production.

## Role i capabilities

| Capability | Administrator | Manager | Su-chef / Shift-manager | Sushi-master | Crafter / legacy employee |
|---|---|---|---|---|---|
| production.access / production.work.today | tak | tak | tak | tak | tak |
| production.plan.manage / production.history | tak | tak | tak | nie | nie |
| orders.access | tak | tak | tak | tak | nie |
| orders.dispatch | tak | tak | tak | nie | nie |
| orders.work | tak | nie | nie | tak | nie |
| orders.cut / orders.issue | tak | nie | tak | nie | nie |
| orders.history.local | tak | tak | tak | nie | nie |
| orders.history.own | pełny dostęp | nie | nie | tak | nie |
| orders.rates.manage / orders.finance | tak | nie | nie | nie | nie |
| orders.test.generate | tak | tak | nie | nie | nie |
| employees.manage | tak | istniejący zakres lokalny | nie | nie | nie |

Administrator globalnie, pozostałe role we własnym lokalu. Lifecycle archiwizacji nadal tylko administrator. Su-chef i Shift-manager mają te same rekordy permissions, bez duplikacji policies. Rola nadal opisuje stanowisko. Tabela permissions nie ma API do samodzielnej edycji przez klienta.

## Tabele, integralność i dostęp

- Work_shifts: employee/location, snapshot nazwy, started_at/ended_at. UNIQUE częściowy na employee_id dla otwartej zmiany; CHECK końca po początku.
- Order_products: niezależny katalog, name/category/active/is_test/seed_key, work_rate_minor bigint, currency PLN, timestampy. CHECK nieujemnej stawki z ograniczeniem wielkości, UNIQUE seed_key.
- Order_product_mappings: PRIMARY KEY(source,external_product_id), FK katalogu.
- Orders: source/external_order_id UNIQUE, display_number UNIQUE, location i snapshot, received_at, sent_to_kitchen_at, actor i snapshot. Status wyliczany, nie ręcznie zapisywany.
- Order_items: FK order/product, snapshot nazwy/kategorii, external_product_id, quantity integer 1–10000.
- Order_item_assignments: item/employee/shift, snapshot nazwy/roli, quantity, claimed/ready/released, stawka w groszach przy CLAIM, currency, wygenerowana kwota tylko dla gotowej pracy. Nie można jednocześnie zwolnić i zakończyć assignmentu.
- Order_cutting_assignments: source assignment/employee/shift, ilość, snapshot krojącego, start/complete/issue; osobno osoba i zmiana wydającego. CHECK kolejności timestampów.
- Order_events: order/item/assignment/actor, snapshoty nazwy i roli, typ, DB timestamp, bezpieczne metadata. RATE_CHANGED nie ujawnia kwoty w historii operacyjnej.
- app_private.order_operations: UUID PK, actor, action, dokładne argumenty JSONB, wynik, timestamp. Brak REST/grantów klienta.
- app_private.order_imports: source/external ID PK, znormalizowany payload i referencja wyniku; odróżnia retry od zmienionej treści.
- app_private.order_location_mappings: przygotowane przyszłe mapowanie źródła/lokalu.

FK zachowują historię przez RESTRICT / domyślne NO ACTION; brak endpointu fizycznego usuwania. Indeksy obejmują lookupy order/item/assignment/location/shift/time. Produkty można dezaktywować, nie kasować historii. Employee lifecycle zachowuje dotychczasowe rekordy.

Nowe publiczne tabele mają RLS enabled, zero grantów anon/authenticated i zero publicznych policies zapisu/odczytu. Klient korzysta wyłącznie z wąskich projekcji SECURITY DEFINER RPC. Nie zwracamy całych rekordów zawierających finanse. SQL ustala actor z auth.uid(), active/archived, permission i location; nie ufa employee_id/rate/role klienta. Stały search_path, kwalifikowane nazwy tabel. Prywatne helpery nie są callable przez klientów.

## Kontrakty RPC

`orders_command(p_action,p_args,p_operation)` ma zamknięty zestaw akcji:
open_shift, end_shift, rate, create_test, send, claim, claim_all, release, ready, start_cutting, complete_cutting, issue.
Każda ma dokładną listę argumentów i własną permission. Nadmiarowe pola są odrzucane. To jeden dispatcher zamiast kilkunastu powielonych wrapperów.

Odczyt: auth_capabilities, orders_board, orders_catalog, orders_shifts, orders_shift_summary, orders_shift_history, orders_history.

## Workflow, ilości i concurrency

NEW → send → DO ZROBIENIA → claim → W TRAKCIE → ready → DO KROJENIA → start_cutting → KROJENIE → complete_cutting → issue → WYDANE.
COMPLETED dopiero gdy wszystkie ilości wydano. Jedno zamówienie może zawierać równocześnie wiele etapów; board pokazuje liczniki i assignmenty, status nagłówka jest prezentacyjny.

Philadelphia ×10: A bierze 6, B bierze pozostałe 4. Każdy kończy własny assignment. Chef widzi dwie gotowe ilości i osoby. Może je kroić i wydać osobno. DB obsługuje również podział krojenia 6+4 pomiędzy dwóch krojących; MVP UI przyjmuje całą pozostałą ilość wybranego assignmentu.

Każda mutacja ilości blokuje ten sam Orders row FOR UPDATE. Dopiero potem wylicza remaining i zapisuje. Multi-claim jest transakcyjny: wszystkie ilości albo rollback. Kolejność blokad produktu jest deterministyczna. Test rzeczywistych oddzielnych połączeń PostgreSQL: ostatnie 4 → 1 sukces, 1 CLAIM_CONFLICT, suma nigdy >10. Dodatkowy test multi-claim potwierdza brak częściowego zapisu.

UUID operacji jest serializowany advisory lock. Retry tego samego actor/action/args zwraca poprzedni wynik, zmiana argumentów = OPERATION_CONFLICT. Frontend zachowuje nierozstrzygnięte UUID i argumenty w sessionStorage (bez danych Auth), mutex blokuje podwójne kliknięcia. PostgreSQL błąd kończy operację; błąd sieci zachowuje UUID do retry. Wynagrodzenie jest wyliczane z pojedynczego assignmentu, nie dopisywane przy retry.

## Zmiany, historia i finanse

Jawne „Rozpocznij zmianę”, nie automatycznie po loginie. Refresh/relogin znajduje tę samą otwartą zmianę. Nie ma zależności od CURRENT_DATE. „Zakończ zmianę” blokuje niedokończoną własną produkcję i niewydane własne krojenie. Zakończona praca Sushi Mastera może jeszcze czekać na kuchni, nie blokuje zakończenia jego zmiany.

Historia Chef używa issued_work_shift_id, nie daty kalendarzowej. Pokazuje produkt, numer, ilość, wykonawcę, krojącego, wydającego i wszystkie czasy. Wydane elementy znikają z live board, pozostają w historii zmiany/zamówienia.

Stawka jest pobierana przez DB przy CLAIM, blokada produktu zapewnia spójność ze zmianą stawki. Integer grosz, PLN, bez float w obliczeniach DB. Test 10×200 → zmiana katalogu na300 → zakończenie nadal2000. Nazwy/role i stawki mają snapshoty. Podsumowanie własnej zakończonej zmiany zwraca produkty/ilości i jedną sumę; nie zwraca stawki ani kwoty assignmentu. Administrator ma dostęp do katalogu stawek i podsumowań dowolnej zakończonej zmiany przez RPC; rozbudowany ekran raportów finansowych jest poza MVP.

Ograniczenie matematyczne: jeżeli zmiana zawiera tylko jeden produkt, użytkownik może wywnioskować jego stawkę z ilości i sumy. Nie da się uniemożliwić tego wnioskowania jednocześnie pokazując wymaganą sumę i ilości. API nie ujawnia dodatkowych finansów.

## Frontend

ModuleShell pobiera capabilities, oferuje „Co robisz?” albo kieruje Craftera do Zagotówek. Przełączenie odmontowuje poprzedni moduł, usuwa polling/subskrypcje, zachowuje sesję Auth. OrdersApp: Nowe/Wszystkie, live board, Moje, Zmiany/historia, generator oraz admin katalog stawek. Lokal wybierany z obecnego chronionego Locations. Duże przyciski, mobile/tablet. Błędy SQL mapowane na ogólne komunikaty; bez optymistycznego sukcesu. Polling co5s i refetch po operacji, DB rozstrzyga concurrency. Na utratę dostępu odczyty czyszczą widoczne dane.

## Seed UAT i import boundary

Dokładnie 15 niezależnych produktów is_test=true:
Philadelphia Salmon, Philadelphia Ebi, California Salmon, California Ebi, Futomaki Salmon, Futomaki Tuna — Roll/200;
Hosomaki Salmon, Hosomaki Cucumber — Maki/100;
Nigiri Salmon, Nigiri Ebi — Nigiri/100;
Gunkan Salmon, Gunkan Tuna — Gunkan/200;
Tempura Roll, Baked Salmon Roll — Hot/300;
Premium Set — Set/300. Premium Set = jedna jednostka.

Seed ma stabilny seed_key i ON CONFLICT DO NOTHING, nie nadpisuje później zmienionych stawek. SQL wymaga jawnego markeru app.orders_seed_project_ref=UAT. Offline helper scripts/orders-uat-seed.mjs sprawdza argument i lokalny link, generuje SQL, niczego sam nie wykonuje. Marker jest zabezpieczeniem procedury operatorskiej, nie dowodem tożsamości dowolnego serwera SQL: operator MUSI zweryfikować zdalny cel przed wykonaniem. Nie dodawać seedu do automatycznego deploymentu.

Generator DB dodatkowo sprawdza issuer podpisanej sesji (request.jwt.claims.iss) dokładnie UAT. Nie ufa lokalowi jako uprawnieniu; manager tylko własny lokal. Tworzy source=uat-simulator, is_test=true i TEST-000001 z sekwencji. Numery mogą mieć luki po rollbacku.

Prywatny orders_import jest wspólnym transakcyjnym twórcą Orders/items. normalize.js waliduje wewnętrzny kontrakt importu/mapowania; nie udaje nieznanego API strony. Brak produktu/lokalu zatrzymuje całość. Powtórzony source/external ID ze zmienioną treścią jest konfliktem. Brak publicznego webhooka. Logi techniczne DB zawierają nazwy operacji, a trwałe events wyłącznie bezpieczne metadata; przyszły adapter musi dodać bezpieczny import_failed, bez surowych payloadów klientów.

## Lokalna weryfikacja

- npm test: pełne unit/integration i istniejące PGlite bootstrap/Auth/lifecycle.
- npm run test:browser: Playwright, prawdziwy SDK i UI, z mockowanym transportem Auth/RPC. To nie jest test hosted Supabase.
- node tests/orders-database.mjs: rzeczywisty izolowany PostgreSQL/pgcrypto, role/PIN, credential preservation, RLS, concurrency, idempotency, finanse, shift przez północ, historie.
- node tests/pin-database.mjs i node tests/production-upgrade.mjs: regresje wyłącznie na lokalnych fikcyjnych fixtures.
- npm run lint; npm run build; git diff --check.

Kontenery testowe: public.ecr.aws/supabase/postgres:17.6.1.166, --network none, bez portów; nazwy zagotowki-orders-test / zagotowki-pin-test / zagotowki-upgrade-test. Runner tworzy i usuwa własną bazę testową. Nigdy nie podawać zdalnego DSN.

## Przyszły deployment UAT — wymaga osobnej zgody

1. Sprawdzić branch/SHA, backup UAT i schema drift, dokładny ref UAT lokalnie i zdalnie, stan starych pięciu migracji. Nie stosować tych plików do Production.
2. Zaplanować krótkie kontrolowane okno UAT bez ruchu starego klienta. Zachować standardową kolejność CLI 001→002→003, następnie aktywować kompatybilny Preview przed wznowieniem testów. Migracja001 rozumie obie nazwy,002 wykonuje rename,003 dodaje Orders. Nie zmieniać kolejności ani maskować historii wersji.
3. Zweryfikować lokalnie/remote listę wyłącznie trzech nowych migracji przed zatwierdzeniem zapisu. Nie używać BASE ponownie.
4. Po migracji: sprawdzić capabilities, brak direct grants, hashes unchanged, mapping i dzisiejszy plan Craftera.
5. Wykonać seed15 po ponownym potwierdzeniu ref; sprawdzić count/is_test i brak wpływu na Products.
6. Nowych Edge Functions brak. Istniejący PIN/backend używa rozszerzonych SQL allowlists; nie wymaga zmiany sekretów, sesji, HMAC ani deploymentu.
7. Preview feature/orders WYŁĄCZNIE URL/key UAT; obecny gateway dopuszcza Preview na UAT. Nie zmieniać Production env.
8. Utworzyć/wyznaczyć WYŁĄCZNIE fikcyjne testowe role w UAT, przez istniejące bezpieczne admin operacje; nie resetować istniejących PIN-ów w ramach migracji.
9. Hosted smoke: sześć ról, Auth/PIN/recovery, moduły, generator→dispatch→claim6+4→gotowe→cut→issue→history→summary; dwa urządzenia konflikt; locality/inactive/archive; Products/plany/lifecycle regresja.

## Rollback UAT

Zatrzymać pracę modułu i wrócić do ostatniego kompatybilnego frontendu (znającego crafter oraz capabilities). Nie wracać bez analizy do starego klienta znającego wyłącznie employee. Nie usuwać nowych tabel, eventów, Auth users ani credentials. Zachować wszystkie testowe historie/assignments/stawki. Ewentualny odwrót nazwy roli wymaga osobnej wersjonowanej migracji i testów, nie automatycznego UPDATE. Nie odwracać claim/issue przez kasowanie rekordów.

## Ograniczenia MVP

Brak prawdziwego API/webhooka, danych klientów, płatności, magazynu, grafików HR, anulowania/korekt i rozbudowanych raportów. UI krojenia bierze całą pozostałą ilość; DB umożliwia podział. Brak przejęcia osieroconej pracy po dezaktywacji pracownika — wymaga przyszłej jawnej audytowanej operacji, nie ręcznego kasowania. Board/historia bez paginacji, odpowiednie dla małego UAT, przed większym obciążeniem konieczne paginacja i pomiary. sessionStorage utrzymuje retry po refresh, ale nie po zamknięciu karty; po utracie tego kontekstu należy odczytać stan przed ponowieniem intencji. Brak nowych testów hosted — tylko po zgodzie na UAT deployment. Lokalne PASS nie oznacza wykonania hosted smoke.

## Wyniki końcowe — 30.09.2026

| Kontrola | Wynik |
|---|---|
| npm test | 65 PASS / 0 FAIL |
| Pełny browser przed dodatkowym testem double-click | 30 PASS / 0 FAIL |
| Końcowy browser Orders po ostatniej poprawce | 4 PASS / 0 FAIL (3 powtórzone + 1 nowy) |
| Orders real PostgreSQL | 128 kontroli PASS |
| PIN real PostgreSQL | 70 kontroli PASS |
| Upgrade fixture real PostgreSQL | 126 kontroli PASS |
| test:migration | PASS |
| lint | PASS |
| build | PASS; ostrzeżenie chunk >500kB |
| git diff --check | PASS |
| Hosted UAT smoke | NIE WYKONANO — brak deploymentu |

W trakcie końcowej regresji jeden przebieg browser wykrył wyścig: pole ilości było edytowalne podczas zapisu otwarcia zmiany. Poprawiono blokadę pól podczas requestu; kolejne przebiegi PASS. Nie pominięto testu ani nie zwiększano timeoutu, żeby ukryć błąd.

Manager monitoruje wszystkie etapy własnego lokalu, w tym krojenie i wydane pozycje w widoku Wszystkie. Nie ma orders.work/orders.cut/orders.issue; DB odrzuca claim/ready/start_cutting/complete_cutting/issue również przy bezpośrednim RPC. Dispatch i generator UAT pozostają dostępne.

Korekta permissions Managera przed UAT: PostgreSQL 154/154 PASS (w tym bezpośrednie odmowy claim/ready/start_cutting/complete_cutting/issue i odczyt CUTTING/COMPLETED); browser Orders 5/5 PASS; unit Orders 4/4 PASS; lint i diff-check PASS. Manager nie widzi finansów. Pozostałe role bez zmiany zakresu.

Finalna regresja przed commitem: npm test 65/65, pełny browser 32/32, Orders PostgreSQL154/154, PIN PostgreSQL70/70, lokalny upgrade fixture126/126, migration tests/lint/build/diff-check PASS. Build: ostrzeżenie chunk >500kB.

## Poziomy board Orders — 2026-10-03

Zastępuje wcześniejszy widok dużych kart produktu i osobny Tryb produkcyjny.
Istniejący shell i moduły Tasks/Robota/Zagotówki pozostają bez zmian. Widok Orders
ma polski słownik labels.js, filtry cyklu new/partial/in_progress/done i zachowuje
etapy operacyjne NEW/TO_DO/IN_PROGRESS/READY_FOR_CUTTING/CUTTING/COMPLETED dla
kompatybilności istniejących klientów/RPC. Kolumny zamówień 380 px przewijają się
poziomo, na telefonie zajmują niemal całą szerokość. Pozycje są pionowymi wierszami.

Migracja: `202610030001_orders_board.sql` (wyłącznie Orders, stare migracje niezmienione).
- Orders.ready_at timestamptz i estimated_prep_minutes integer 1–1440, oba nullable.
- Order_products.item_type: product/addon/drink. Kategorie Drink/Drinks/Napój/Napoje/
  Beverage/Beverages i Addon/Addons/Dodatek/Dodatki są migrowane jawnie; brak nazw produktów.
- Order_items.item_type: product/set/addon/drink; parent_item_id, FK do tego samego
  zamówienia, brak zagnieżdżonych zestawów, ilość komponentu podzielna przez ilość setu.
- Istniejące pozycje kategorii Set pozostają starymi produktami: brak definicji
  komponentów w źródle nie pozwala uczciwie odtworzyć składu.
- Zestaw jest tylko grupą. W importowanym children.quantity jest ilością na JEDEN
  zestaw; baza zapisuje child.quantity * parent.quantity. Przykład set x2 i roll x2
  na zestaw daje 4 rolki. Claim_set quantity=1 pobiera 2 rolki, nie 1 ani 4.
- Istniejący orders_command ma nową akcję claim_set {order_id,set_id,quantity}.
  Zachowuje blokadę order/employee/operation, aktualne autoryzacje i dziennik UUID.
  Claim_all pomija grupy i napoje; claim odrzuca ich bezpośrednie przejęcie.
- Status kuchni pomija napoje bez usuwania danych lub automatycznego oznaczania ich
  jako wydane. Dodatki mają osobne przypisania tak jak zwykłe produkty.
- Jeśli część komponentów została już przejęta, dostępne pełne zestawy to minimum
  pozostałych wielokrotności komponentów. Resztę można brać jako pojedyncze komponenty.

Źródła terminów: jawne ready_at/estimated_prep_minutes w neutralnym kontrakcie
normalizeOrder → orders_import; generator UAT przyjmuje je opcjonalnie przez
orders_command(create_test). Brak integracji z konkretnym zewnętrznym dostawcą:
nie ma w repo prawdziwego source payload ani algorytmu szacowania. Nie wymyślono ich.
ready_at w imporcie wymaga strefy czasowej. UI wyświetla czas w strefie przeglądarki.
Istniejące zamówienia bez tych pól nie pokazują placeholderów.

Alerty: >30 min normal, <=30 warning, <=10 urgent, po terminie overdue. Spokojne
obramowania i badge, bez zalewania tła. Zdarzenia DEADLINE_30/10/OVERDUE w istniejącym
Order_events, unikalne (order_id,event_type), tworzone przy polling RPC
orders_notifications. Wymaga orders.cut ORAZ orders.issue oraz dostępu do lokalu.
Badge jest trwały do potwierdzenia przez użytkownika (order_notice_ack); reload
nie odtwarza potwierdzonego alertu. Przy spóźnionym wejściu pokazuje się tylko
najpilniejszy próg. Nie ma crona: gdy widok su-chefa jest zamknięty, alert pojawi
się dopiero przy kolejnym odczycie; nie ma gwarancji dostarczenia w tle. Próg jest
jednorazowy dla zamówienia, brak osobnego cyklu alertów po zmianie terminu.

Testy lokalne:
- 88 testów Node PASS, w tym importy, alerty, PIN, Auth, Tasks i ilości.
- 54 Playwright headless PASS, profile i API syntetyczne; bez sesji użytkownika.
- PostgreSQL Orders: 177 sprawdzeń PASS zarówno baseline, jak i upgrade po Tasks;
  rzeczywista współbieżność połączeń: jeden sukces i jeden CLAIM_CONFLICT.
- PostgreSQL Tasks: 111 sprawdzeń PASS bez zmian w kodzie Tasks.
- test:migration PASS (legacy Production/RLS); lint i build:uat PASS.
- Audyt screenshotów 375/768/1440 px; brak poziomego overflow strony, poziomy board.

Snapshot UAT przed zmianą: tmp/orders-board.local/uat-schema-before.sql (lokalny,
ignorowany przez Git). Odczyt funkcji zgodny ze starym Orders i zapisanymi zmianami
owner z Tasks; nowe pola nie były obecne. Deploy wymaga wyłącznie nowego frontendu
Preview oraz tej jednej migracji; nie uruchamiać db push obejmującego inne migracje.
Nie wdrażać Edge Functions ani zmieniać sekretów. Target UAT: meuzkduxttjcuiynsnaa.
Status wdrożenia/smoke należy potwierdzić osobno — lokalne testy nie dowodzą deployu.

Ręczny smoke: nowy e-mail/hasło lub istniejąca sesja UAT → Orders → su-chef badge;
maker przejmuje całe zamówienie, zaznaczone, 1/2 setu i część komponentu; drugi maker
bierze pozostałe; dodatki niezależne; chef kroi i wydaje; ukryty napój nie blokuje
ukończenia. Sprawdzić terminy null/31/30/10/po czasie i ack po reloadzie. Użyć
wyłącznie syntetycznych zamówień UAT; istniejący generator nie wymyśla receptur setów.
