# Supabase Auth: review i wdrożenie

## Zakres

Logowanie e-mail/hasło i utrzymywana sesja Supabase zastępują PIN. `auth.users`
potwierdza tożsamość, a `Employees.auth_user_id` łączy ją z istniejącym pracownikiem.
Role pozostają dokładnie: `employee`, `su-chef`, `manager`, `administrator`.
Identyfikatory Employees i historyczne `Plan_items.employee_id` nie są zmieniane.
Brak automatycznego dopasowywania osób po nazwisku ani usuwania historii.

Nie wdrażamy zdjęć, magazynu ani szybkiego PIN-u na wspólnym urządzeniu.
Na wspólnym tablecie trzeba wylogować poprzednie konto. Sama zmiana nazwiska
w interfejsie nigdy nie zmienia tożsamości uwierzytelnionej przez backend.

## Uprawnienia

| Rola | Dostęp |
|---|---|
| employee | Wyłącznie aktywny plan DZISIAJ we własnym lokalu; START/koniec tylko dziś |
| su-chef | Własny lokal, zarządzanie planami i historia, bez kont pracowników |
| manager | Własny lokal i produkcja; zarządzanie employee/su-chef w tym lokalu |
| administrator | Wszystkie lokale i role; START/koniec także bez przypisanego lokalu |

Edycja własnej roli/aktywności przez panel jest zabroniona. Manager nie może
tworzyć/awansować managera ani administratora. Role i aktywność są odczytywane
z bazy przy każdej operacji, nie z edytowalnego user_metadata ani samej przeglądarki.
Dezaktywacja blokuje następne operacje mimo ważnego tokenu. Interfejs odświeża profil
co minutę i po odzyskaniu focusu. Wcześniej wyświetlone dane mogą być widoczne do
tego odświeżenia; dane już pobrane nie mogą zostać zdalnie „cofnięte”.

Pracownik nie ma dostępu do zakończonych planów przez RLS; historia jest dostępna
rolom zarządzającym. Jeżeli historia ma być dostępna także employee, potrzebna jest
osobna polityka ograniczająca ją do uzgodnionego zakresu.

## Architektura i kompatybilność

### Bootstrap pustego projektu i seed UAT

Repozytorium odtwarza schemat aplikacji w kolejności:

1. `supabase/migrations/202609220001_base.sql`
2. `supabase/migrations/202609230001_auth.sql`
3. `supabase/migrations/202609230002_auth_production.sql`
4. Opcjonalnie, wyłącznie na zweryfikowanym UAT: `supabase/seeds/uat.sql`.

Baza musi mieć infrastrukturę Supabase: role `anon`, `authenticated`, `service_role`,
`auth.users`, `auth.uid()` i publikację `supabase_realtime`. Migracja bazowa nie tworzy
obiektów zarządzanych przez platformę. Odtwarza sześć tabel, identity, ograniczenia,
indeksy, triggery i wymagane RPC na podstawie lokalnego snapshotu z 2026-09-23.
Nie wymaga dostępu do backupów podczas uruchomienia. Nie odtwarza kolumny `pin_hash`,
starych endpointów kont/PIN, właścicieli ani szerokich ACL ze snapshotu.
Zachowuje ciała RPC produkcyjnych, ograniczając ich `search_path` do `pg_catalog`;
odwołania do tabel aplikacji są kwalifikowane schematem. START/koniec są następnie
zastępowane przez migrację Auth 002.

Już BASE włącza RLS bez polityk klienckich, odbiera dostęp klientom do tabel,
sekwencji i funkcji, ogranicza default privileges roli wykonującej migracje oraz
przyznaje uprawnienia serwerowe `service_role`. Auth jawnie ustanawia dostęp
uwierzytelnionej aplikacji. Wszystkie trzy migracje należy wykonać tą samą zaufaną
rolą migracyjną. Nie udostępniać aplikacji przed ukończeniem obu migracji Auth.

BASE jest wyłącznie dla pustego schematu aplikacyjnego. Nie uruchamiać go na
istniejącym PROD ani oznaczać jako wykonanego bez odrębnego planu uzgodnienia
historii migracji. Po BASE nie wykonywać skryptów historycznych z `docs/`: ich
efekty są już zawarte w schemacie, a stare granty/RPC mogą naruszyć zabezpieczenia.

Seed jest oddzielny i nie jest automatycznym `supabase/seed.sql`. Wymaga pustych
tabel aplikacji i odmawia ponownego załadowania. Zawiera 123 produkty i 284 wiersze
receptur, z zachowanymi wartościami źródłowymi jednostek (także NULL), bez zgadywania
lub konwersji. Nowe wewnętrzne ID katalogu powstają przez identity; powiązania
zachowują `external_id`. Pozostałe rekordy są fikcyjne: dwa lokale, dziewięciu
pracowników (cztery role, oba lokale, konto nieaktywne i niepowiązane), sześć planów
na wczoraj/dziś/jutro według Europe/Warsaw i 18 pozycji. Plany wczorajsze są
zakończone, dzisiejsze obejmują pozycje oczekujące/rozpoczęte/gotowe, a jutrzejsze
oczekują na rozpoczęcie. Seed nie tworzy użytkowników Auth ani ich powiązań.
Kontrolowane konta testerów i powiązanie pierwszego administratora to osobny etap.

Przed późniejszym uruchomieniem należy jawnie zweryfikować docelowy projekt UAT.
Nie polegać na zapisanym linku CLI ani lokalnym `.env`, które mogą wskazywać PROD.
Sam warunek pustych tabel nie identyfikuje środowiska i nie zastępuje tej kontroli.

`npm test` obejmuje `tests/bootstrap.test.mjs`: pusty PGlite z minimalnymi atrapami
platformy Supabase, następnie dokładnie BASE → Auth 001 → Auth 002 → seed.
Test sprawdza strukturę, ograniczenia, RLS, ACL, role, zakres lokalu/daty, START/koniec,
integralność danych i odmowę ponownego seedu. Nie wymaga lokalnych backupów ani sieci.
Nie potwierdza usług Auth/SMTP, gateway Edge Functions, PostgREST, dostarczania
Realtime, Storage ani konfiguracji hostowanego projektu.

- `src/auth/AuthGate.jsx`: sesja, profil, odcięcie niezalogowanego użytkownika,
  ekran hasła; przełączenie tożsamości/roli/lokalu ponownie montuje App i czyści stan.
- `src/auth/EmployeesScreen.jsx`: pracownicy, uprawnienia i zaproszenie na e-mail.
- `202609230001_auth.sql`: powiązanie kont, RPC zarządzania, RLS, wyłączenie starego PIN-u.
- `202609230002_auth_production.sql`: START/koniec z autoryzacją konta, blokadą
  planu i pozycji oraz dostępem administratora we wszystkich lokalach.
- `invite-employee`: weryfikuje token przez Auth `getUser`, następnie aktualne
  uprawnienia przed zaproszeniem i ponownie przed powiązaniem konta.

Pozostałe RPC produkcyjne zachowują istniejące ciała i parametry. Migracja
opakowuje je obowiązkowym sprawdzeniem `p_requester_id == pracownik(auth.uid())`.
To parametr zgodności z obecnym frontendem, nie dowód tożsamości.
Obie migracje Auth muszą być wdrożone razem. Przy aktualizacji istniejącej bazy
brakujące zmiany historyczne z `docs/` muszą poprzedzać Auth; świeży bootstrap
z BASE już je zawiera. Ich późniejsze uruchomienie może odtworzyć niechronione RPC/publiczne granty.
Każda następna migracja produkcyjna musi zachować kontrolę tożsamości i ACL.

Migracja odbiera PUBLIC/anon/authenticated uprawnienia do wszystkich istniejących
niepochodzących z rozszerzeń funkcji w `public`, a przywraca tylko zatwierdzone
RPC produkcyjne i nowe endpointy Auth. Uprawnienia service_role pozostają.
To celowe odcięcie starych i potencjalnie alternatywnych ścieżek PIN/account API.
Należy sprawdzić pełną listę funkcji na staging; integracja korzystająca z innego
RPC jako anon/authenticated wymaga jawnego dostosowania. Import produktów przez
service_role pozostaje niezależny. Rozszerzenia PostgreSQL nie są modyfikowane.

RLS zastępuje dotychczasowe polityki na sześciu tabelach: Employees, Locations,
Plans, Plan_items, Products, Recipe_ingredients. Brak anonimowego dostępu do nich.
Employees nie jest odczytywane bezpośrednio: RPC zwracają tylko bezpieczne pola,
nigdy pin_hash. Zapisy produkcji i pracowników są dostępne przez kontrolowane RPC.
Schemat `app_private` nie może znajdować się na liście schematów wystawionych przez API.

## Warunki przed scaleniem / uruchomieniem na produkcji

Ta gałąź nie zmienia zdalnego Supabase. Repozytorium zawiera historyczny audyt,
nie potwierdzenie aktualnego stanu produkcji. Merge uruchamiający automatyczny deploy
frontendu wymaga skoordynowania z migracją; frontend Auth nie działa na starej bazie.

1. Wykonać kopię bazy i eksport aktualnych definicji/grantów/RLS. Na osobnym projekcie
   staging odtworzyć bieżący schemat, w tym wcześniejsze migracje produkcji/jednostek.
   Sprawdzić wszystkie publiczne widoki, funkcje, tabele i integracje poza sześcioma
   tabelami powyżej. Widoki SECURITY DEFINER nie mogą omijać nowego RLS.
2. Zweryfikować `Employees`: poprawne cztery role, lokal dla każdego nie-administratora,
   generowanie ID, nullowalny pin_hash (jeżeli istnieje w starszym schemacie) oraz
   brak kolizji nazw nowych funkcji/kolumn. Świeży BASE nie tworzy kolumny PIN.
   Migracja odrzuca niespójne dane zamiast przypisywać domyślne role.
3. W Supabase Auth włączyć e-mail/hasło, wyłączyć publiczne zapisy (Allow new users
   to sign up), skonfigurować SMTP i ograniczenia prób, minimum 12 znaków hasła.
   Ustawić Site URL oraz dokładny redirect `https://ADRES_APLIKACJI/?auth=password`.
   W e-mailach zaproszeń/resetu używać potwierdzonego redirectu (np. ConfirmationURL),
   nie odsyłać wszystkich linków na sztywno do Site URL bez parametrów.
4. Utworzyć/zweryfikować konto pierwszego administratora przez zaufany Dashboard.
   Uruchomić obie migracje na staging. Powiązać **konkretny istniejący rekord**
   administratora z jego zweryfikowanym UUID. Nie tworzyć nowego pracownika tylko
   dlatego, że dotychczasowy nie ma konta Auth. Przykład (wartości zastępcze):

   ```sql
   UPDATE public."Employees"
   SET auth_user_id = '<UUID_Z_AUTH>'::uuid
   WHERE id = <ID_ISTNIEJACEGO_ADMINISTRATORA>
     AND role = 'administrator' AND active IS TRUE AND auth_user_id IS NULL;
   -- Sprawdź, że zmieniono dokładnie jeden właściwy rekord.
   ```

5. Wdrożyć Edge Function `invite-employee`; ustawić jej sekret `INVITATION_APP_URL`
   na dokładny adres aplikacji (fallback: `APP_URL`). Osobny adres zaproszeń pozwala
   zachować konfigurację proxy PIN. SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY to zmienne serwerowe.
   `verify_jwt=false` w konfiguracji gateway jest celowe: sam handler weryfikuje
   token w Auth, również przy nowych kluczach podpisujących. Nie usuwać `getUser`.
6. Frontend dostaje VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY (publiczny klucz
   anon lub publishable tego samego projektu). VITE_SUPABASE_ANON_KEY ma pierwszeństwo;
   dotychczasowe VITE_SUPABASE_PUBLISHABLE_KEY jest fallbackiem tylko przy pustym/brakującym
   ANON_KEY. Dla Vercel Preview ustawić zmienne w zakresie Preview/właściwego brancha;
   nie zmieniać zakresu Production. Zmiana wymaga nowego builda frontendu.
   Nie wprowadzać service_role, haseł ani tokenów do Git, VITE_* lub logów.
7. Przejść poniższe scenariusze na staging, uzyskać review, następnie zaplanować
   krótkie okno przełączenia bazy + frontendu na produkcji. Zaprosić/powiązać
   pozostałych pracowników przez ich istniejące rekordy.

Migracje są jednokrotne (zarządzane historią migracji Supabase). Błąd pierwszej
migracji wycofuje jej transakcję; nie ignorować go ani usuwać kontroli schematu.
Po przełączeniu nie przywracać samego starego frontendu PIN. Przy awarii wstrzymać
ruch i naprawić wdrożenie lub odtworzyć skoordynowaną kopię w oknie serwisowym,
uwzględniając zapisy powstałe po migracji. Nie przywracać anonimowych grantów jako
obejścia problemu z sesją.

## Zaproszenia i odzyskiwanie po awarii

### Odzyskiwanie hasła w frontendzie

„Nie pamiętam hasła” wywołuje `resetPasswordForEmail` z redirectem na bieżący
adres aplikacji z `?auth=password`. Ten adres musi być dopuszczony w Auth URL
Configuration właściwego środowiska. Odpowiedź nie ujawnia, czy e-mail ma konto.

Frontend zapisuje wyłącznie informację o trybie formularza przed utworzeniem
klienta Supabase: SDK może usunąć hash `type=recovery`, zanim React zasubskrybuje
zdarzenia. Obsługiwany jest także `PASSWORD_RECOVERY`; marker `?auth=password`
utrzymuje ekran po odświeżeniu strony. Nie zapisujemy dodatkowej kopii tokenów.

Formularz „Ustaw nowe hasło” wymaga ważnej sesji, co najmniej 12 znaków i zgodnego
powtórzenia. Zapis używa `updateUser({ password })`. Po sukcesie użytkownik widzi
potwierdzenie i wybiera przejście do aplikacji (z dotychczasową kontrolą profilu)
lub wylogowanie. Błąd/wygasły link blokuje zapis, również przy starszej sesji
w przeglądarce; można wrócić do logowania i poprosić o nowy link.

Regresje są sprawdzane lokalnie w Playwright z prawdziwym SDK i mockowanym API,
w tym callback przetworzony przed startem Reacta. Dostarczenie wiadomości i
redirect na prawdziwym UAT nadal wymagają smoke testu tego środowiska.

Najpierw utwórz/edytuj rekord pracownika, potem wybierz „Zaproś do aplikacji”.
Adres musi należeć do tej osoby. Pracownik ustawia własne hasło z linku.
Manager nie ustawia i nie poznaje hasła pracownika; odzyskiwanie hasła jest na
ekranie logowania. Konto już istniejące w Auth wymaga sprawdzonego ręcznego
powiązania przez administratora bazy, zamiast zgadywania tożsamości po e-mailu.

Wysłanie e-maila i zapis w bazie nie są jedną transakcją. Jeśli zaproszenie zostało
wysłane, a powiązanie się nie udało (np. równoległa edycja), niepołączone konto nie
ma dostępu do danych. Administrator sprawdza Auth i Employees, weryfikuje osobę
i powiązuje właściwy UUID. Nie ponawiać masowo zaproszeń ani automatycznie usuwać
konta Auth — mogło już istnieć. Endpoint zwraca 409; nie ujawnia tokenów.

### UAT Orders: naprawa brakującej funkcji (2026-10-01)

Projekt: `meuzkduxttjcuiynsnaa`, branch `feature/orders`. Production nietknięty.
Frontend wywołuje `supabase.functions.invoke('invite-employee', ...)`, czyli
`https://meuzkduxttjcuiynsnaa.supabase.co/functions/v1/invite-employee`
przy poprawnym VITE_SUPABASE_URL UAT. Vercel Preview musi mieć URL tego projektu
i jego publiczny klucz. Nie dodawać klucza service_role do frontendu.
Konfiguracja Vercel nie była odczytywana z zalogowanej sesji ani zmieniana.

Root cause: OPTIONS zwracał 404 NOT_FOUND „Requested function was not found”.
Lista funkcji UAT potwierdziła brak invite-employee (były tylko pin-login i
manage-employee-pin). Błąd występował przed Auth, wysyłką i RPC. UI błędnie
sugerowało istniejące konto dla każdego błędu; teraz rozróżnia kody konfliktu
Auth, ograniczeń SMTP i limitów, a błąd transportu nie stwierdza istnienia konta.

Odczyt bazy: Serhii, id=10, active=true, archived=false, role=administrator,
auth_user_id NULL. RPC auth_link_employee istnieje; EXECUTE mają tylko postgres
i service_role. Brak adresu e-mail w zgłoszeniu uniemożliwia potwierdzenie jego
istnienia w auth.users. Żadnego konta nie powiązano ani nie zaproszono podczas audytu.
Serhii jako administrator może zostać zaproszony przez administratora, nie managera.

Wdrożono invite-employee na UAT oraz ustawiono:

```text
INVITATION_APP_URL=https://zagotowki-git-feature-orders-sbla-b.vercel.app
```

W Auth URL Configuration dopisano dokładny redirect
`https://zagotowki-git-feature-orders-sbla-b.vercel.app/?auth=password`.
Zachowano wcześniejszą listę i Site URL feature-auth; funkcja przekazuje nowy
redirect jawnie. Nie zmieniono APP_URL ani PIN_MANAGEMENT_ORIGINS.
Nie dodano wildcardów. Test endpointu po wdrożeniu: dozwolony OPTIONS 204 z
dokładnym Allow-Origin; obcy origin 403; POST bez tokena 401.

UAT nie ma smtp_host. Domyślna poczta Supabase dopuszcza tylko adresy członków
zespołu projektu: https://supabase.com/docs/guides/auth/auth-smtp.
Dla pozostałych odbiorców właściciel musi skonfigurować SMTP:

1. Otwórz https://supabase.com/dashboard/project/meuzkduxttjcuiynsnaa/auth/smtp.
   Sprawdź identyfikator projektu przed zapisem.
2. Włącz Custom SMTP, wpisz sender email/name oraz host, port, username i password
   z konta dostawcy poczty. Zapisz. Nie przesyłaj hasła w rozmowie.
   Nie dodawaj pracownika do zespołu administracyjnego Supabase jako obejścia.
3. Authentication → URL Configuration: sprawdź obecność dokładnego redirectu
   Orders powyżej. Authentication → Email templates → Invite user: link powinien
   korzystać z ConfirmationURL, a nie ze stałego adresu starego środowiska.
4. Użyj aplikacji na stałym adresie Orders i konta administratora UAT.
   Dla Serhii wpisz jego zweryfikowany adres. Network powinien pokazać OPTIONS 204
   i następnie POST; przekaż do diagnostyki tylko status i code/error, bez tokenów.

Ręczne smoke testy (nie wykonano wysyłki/aktywacji przez agenta):

- Nowy kontrolowany e-mail: POST 200, e-mail dociera, UUID Auth odpowiada
  Employees.auth_user_id dokładnie właściwego pracownika.
- Aktywacja: link otwiera Orders, pozwala ustawić hasło i zalogować właściwego
  pracownika z jego rolą. Nie zmieniaj PIN-u w ramach tego testu.
- Istniejące potwierdzone konto Auth: konflikt i jasna akcja administratora;
  brak automatycznego linkowania, resetu hasła lub zmiany dotychczasowych powiązań.
- Ponowienie po sukcesie: UI nie oferuje kolejnego zaproszenia dla powiązanego
  rekordu; RPC odrzuca ponowne powiązanie przed wysyłką. Aplikacja nie ma osobnej
  funkcji ponownej wysyłki zaproszenia. Właściciel konta może użyć odzyskiwania
  hasła. Po częściowym sukcesie wymagany jest audyt, nie kolejne zaproszenie.
- Obcy/nieuprawniony użytkownik nie może zapraszać ani przepiąć konta. Próba
  użycia istniejącego adresu nie może zmienić UUID lub uprawnień jego właściciela.

Lokalnie: testy handlera z mockiem Auth obejmują nową wiadomość, istniejące konto,
odmowę SMTP, limit, częściowy sukces, odmowę uprawnień oraz CORS; SQL testuje
ograniczenia powiązań. To nie jest potwierdzenie dostarczenia e-maila na UAT.
Backend wdrożony; nowe komunikaty UI wymagają push feature/orders i builda
Vercel Preview. Nie scalać ani nie wdrażać tych zmian na Production.

## Kontrakt dla zdjęć

UUID `auth.uid()` oznacza konto, bigint Employees.id oznacza pracownika.
Autor zdjęcia powinien być ustalany z sesji po stronie serwera. Obecne
`Plan_items.employee_id` nadal oznacza kończącego; START nie zapisuje autora.
Moduł zdjęć musi dodać własne pole autora START, jeśli wymaga własności rozpoczętej
pracy. Nie należy nadpisywać employee_id przy START ani dopisywać fikcyjnych autorów
do historii. Prywatny Storage i polityki zdjęć są osobnym PR-em.

## Weryfikacja

### Sprawdzenie CI przed akceptacją PR

Workflow `.github/workflows/auth-review.yml` („Application checks”) uruchamia się
po pushu na `feature/auth` i dla Pull Requestów. W PR otwórz zakładkę **Checks**
i sprawdź zadanie **check** dla najnowszego commita. Wszystkie kroki muszą mieć
status success: instalacja zależności, lint, testy Node, migracje, build oraz
testy przeglądarkowe Playwright. Starszy zielony przebieg nie potwierdza późniejszych zmian.

Jeśli krok jest czerwony, otwórz jego log, popraw przyczynę na gałęzi i poczekaj
na nowy przebieg. Samo istnienie workflow nie ustawia obowiązkowego checka w ochronie
`main`; właściciel repozytorium powinien sprawdzić tę regułę przed scaleniem.
Zielone CI nie zastępuje akceptacji code review ani poniższych prób na staging.
CI używa lokalnego PostgreSQL/PGlite i mockowanego Supabase; nie wdraża bazy,
Edge Function ani frontendu i nie wymaga sekretów produkcyjnych.

### Sprawdzenia lokalne i staging

- `npm ci`, `npm run lint`, `npm test`, `npm run test:migration`, `npm run build`.
- `npx playwright install chromium`, `npm run test:browser`: testy izolowane,
  połączenia Supabase są mockowane; nie wysyłają prawdziwych e-maili.
- Na Windows ze zablokowanym spawn: testy Node można uruchomić przez
  `node --test --test-isolation=none tests/*.test.mjs` (Node 22+), build przez
  `node node_modules/vite/bin/vite.js build --configLoader native`.
- Istniejący `tests/plan-items-ui.mjs` używa teraz mockowanej sesji Auth;
  lokalny Vite musi mieć URL `https://auth-tests.supabase.co` i atrapę publicznego klucza.
- Test SQL uruchamia rzeczywisty silnik PostgreSQL/PGlite na audycie + migracji
  pozycji: RLS, wszystkie role, obcy lokal, spoofing ID, konto nieaktywne/niepołączone,
  cofnięcie uprawnień przy ważnym JWT, blokada starych RPC, wiązanie kont i historia.
- Testy lokalne nie potwierdzają dostarczania SMTP, konfiguracji Auth, Realtime,
  Storage ani zgodności nieznanego aktualnego schematu produkcyjnego.

Na staging sprawdzić również: zaproszenie i jego wygaśnięcie, reset hasła w nowej
przeglądarce, odświeżenie i wylogowanie na wspólnym tablecie, utratę sieci,
dezaktywację/zmianę roli/lokalu podczas otwartej sesji, historię po migracji,
aktualizacje Realtime tylko dla własnego lokalu i działanie importera produktów.

Dokumentacja: [Auth](https://supabase.com/docs/guides/auth/passwords),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[zaproszenia](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
