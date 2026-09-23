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
| employee | Własny lokal, aktywne plany dziś–dziś+7; START/koniec tylko dziś |
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
Obie migracje muszą być wdrożone razem. Stare migracje z `docs/` muszą poprzedzać
Auth: ich późniejsze uruchomienie może odtworzyć niechronione RPC/publiczne granty.
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
   generowanie ID, nullowalny pin_hash oraz brak kolizji nazw nowych funkcji/kolumn.
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

5. Wdrożyć Edge Function `invite-employee`; ustawić jej sekret `APP_URL` na dokładny
   adres aplikacji. SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY to zmienne serwerowe.
   `verify_jwt=false` w konfiguracji gateway jest celowe: sam handler weryfikuje
   token w Auth, również przy nowych kluczach podpisujących. Nie usuwać `getUser`.
6. Frontend dostaje wyłącznie VITE_SUPABASE_URL i VITE_SUPABASE_PUBLISHABLE_KEY.
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

## Kontrakt dla zdjęć

UUID `auth.uid()` oznacza konto, bigint Employees.id oznacza pracownika.
Autor zdjęcia powinien być ustalany z sesji po stronie serwera. Obecne
`Plan_items.employee_id` nadal oznacza kończącego; START nie zapisuje autora.
Moduł zdjęć musi dodać własne pole autora START, jeśli wymaga własności rozpoczętej
pracy. Nie należy nadpisywać employee_id przy START ani dopisywać fikcyjnych autorów
do historii. Prywatny Storage i polityki zdjęć są osobnym PR-em.

## Weryfikacja

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
