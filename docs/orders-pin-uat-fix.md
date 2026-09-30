# Orders / Pracownicy / PIN — poprawki UAT, 2026-10-01

## Stan przekazania

Kod przygotowany lokalnie na `feature/orders`, baza wyjściowa `066f924`.
Po instrukcji operatora o pracy wyłącznie lokalnej nie wykonano kolejnych operacji
w Vercel/Supabase ani działań przeglądarkowych. Nie wykonano push ani deploymentu.
Production pozostaje nietknięty.

Przed tą instrukcją wykonano odczyty wyłącznie UAT i zapisano dwie wartości konfiguracji
Edge UAT: `APP_ENV=uat` oraz
`PIN_MANAGEMENT_ORIGINS=https://zagotowki-eylp1zta5-sbla-b.vercel.app`.
Nie zmieniono `APP_URL`, sekretu HMAC, kluczy, pracowników, PIN-ów ani schematu.
Istniejąca funkcja v2 nie czyta nowej listy originów. Sam zapis konfiguracji **nie naprawia
jeszcze działającego UAT** — konieczne jest wdrożenie funkcji poniżej.

## Potwierdzona przyczyna PIN

Preflight OPTIONS z originem
`https://zagotowki-eylp1zta5-sbla-b.vercel.app` do funkcji
`https://meuzkduxttjcuiynsnaa.supabase.co/functions/v1/manage-employee-pin`
zwrócił HTTP **403**, `{"error":"Brak dostępu."}` i nagłówek
`Access-Control-Allow-Origin: https://zagotowki-git-feature-auth-sbla-b.vercel.app`.

Pobrany kod wdrożonej funkcji v2 dopuszczał tylko origin `APP_URL` starego brancha Auth.
Blokada następowała przed weryfikacją sesji administratora i przed `pin_prepare`.
Frontend zamieniał taki błąd transportu na ogólny komunikat sugerujący uprawnienia/PIN.

Odczyt UAT potwierdził:

- Istnienie `pin_prepare`, `pin_finish`, `pin_verify`, `pin_confirm` oraz prywatnego `pin_admin`.
- EXECUTE publicznych RPC PIN wyłącznie dla właściciela i `service_role`; brak grantów dla anon/authenticated.
- `pin_admin` ma rozszerzone role Orders, w tym crafter, sushi-master i shift-manager, oraz wymaga aktywnego administratora i aktywnego pracownika.
- Administrator UAT jest aktywny i powiązany z istniejącym użytkownikiem Auth.
- Trzy istniejące konta PIN mają zgodne powiązania Employee/private account/Auth i adres techniczny; jedno z tych kont jest nieaktywne.
- Są też aktywne konta bez Auth, które mogą służyć do ręcznego testu nadania pierwszego PIN-u, po wyborze przez operatora.

Nie wykonano operacji na zalogowanym administratorze ani pełnego testu zapisów.
Nie wyklucza to innych błędów dla konkretnego konta po usunięciu blokady CORS.
RLS, granty i zabezpieczenia SQL nie wymagają zmiany dla potwierdzonej przyczyny.

Różnica względem kodu repo po cutoverze: wdrożone UAT v2 jest starszym wariantem
z URL UAT wpisanym w kodzie, bez sprawdzania `APP_ENV`. Obecny kod repo wiąże
`APP_ENV`, projekt i origin. Dlatego przed deploymentem trzeba mieć `APP_ENV=uat`.
Nie odczytywano ani nie porównywano aktualnego wdrożenia Production.

## Implementacja

- Lista dokładnych originów HTTPS `PIN_MANAGEMENT_ORIGINS`, rozdzielonych przecinkami, działa tylko dla UAT. Brak wildcardów i dopasowań sufiksu domeny. `APP_URL` zachowuje dotychczasowe znaczenie.
- Edge zarządzania PIN nadal weryfikuje bearer przez Auth i uprawnienia przez SQL.
- Proxy `/api/pin-login` na Preview używa tej samej jawnej listy, zachowując HMAC i zaufany nagłówek IP platformy. To zabezpiecza przed analogiczną blokadą nowego adresu w proxy; jego rzeczywistej konfiguracji Vercel nie udało się odczytać ze względu na Deployment Protection.
- Dodatkowe originy nie zmieniają zachowania Production ani wejścia do Edge logowania: login nadal wymaga podpisanego proxy.
- Logi błędów zawierają request ID, etap, kod SQL/SDK; bez PIN-u, tokenów, treści wyjątków i danych użytkownika.
- Frontend rozpoznaje zajęty PIN, nieaktywne konto, brak uprawnień i konflikt tożsamości; nie pokazuje surowych błędów SDK. Zachowuje UUID przy niepewności sieciowej. Po jednoznacznym odrzuceniu pozwala rozpocząć nową operację. Blokuje double-click.
- Nie zmieniono tworzenia kont, bcrypt, sesji ani resetowania PIN w SQL. Reset nadal nie wywołuje wylogowania.

## UX/UI i audyt kodu

- Pracownicy: PIN inline w wybranej karcie, imię/rola/lokal, pole hasłowe, hierarchia akcji, wyróżnione statusy, czytelne disabled/focus, blokada równoległych akcji podczas zapisu PIN.
- Orders: powrót do wyboru modułów, bezpośredni przycisk Pracownicy według capability `employees.manage`, oddzielny panel „Moja zmiana” i informacja, że podgląd nie wymaga rozpoczęcia zmiany.
- Wyraźny numer zamówienia i polski status, mniejsze odstępy, spójne karty i przyciski.
- Tablet 600–1199 px: poziomy scroll pozycji wewnątrz zamówienia; desktop: siatka; telefon: jedna kolumna.
- „Weź całe pozostałe” jako główna akcja, kompaktowe pole częściowego przejęcia, „Pozostało: X”, „Oddaj zadanie”. Kontrakty operacji i ilości bez zmian.
- Stawki: wejście `12,50`/`12.50`, wyświetlanie `12,50 zł`; konwersja tekstu na całkowite grosze bez mnożenia zmiennoprzecinkowych kwot. Nie zmieniono bazy ani historycznych snapshotów stawek.
- Dodatkowo: „Moje zadania” nie pokazuje pustych zamówień/pozycji; kontekst numeru zamówienia i zmiany w historii; błędy historii są widoczne; spóźnione odpowiedzi historii po zmianie lokalu nie wracają na ekran; po błędzie odczytu czyszczone są nieaktualne dane; zapis pracownika i zaproszenie mają blokadę podwójnego kliknięcia.

Audyt objął kod wspólnych ekranów live board/lista/moje, zmiany, historia, katalog,
Pracownicy i PIN. Pełny audyt wizualny czterech rozdzielczości nie został zakończony
po zakazie używania przeglądarki. Wymaga ręcznego przejścia checklisty.

## Wyniki testów

- `npm test`: **72/72 PASS** (lokalne jednostkowe, SDK z atrapą transportu, PGlite Auth/RLS/lifecycle).
- `npm run test:migration`: **PASS**, lokalna baza testowa.
- `npm run lint`, `npm run build`, `git diff --check`: **PASS**. Build ostrzega o bundle JS >500 kB; nie blokuje budowania.
- Przed zakazem przeglądarki: **32/32 Playwright PASS**, z fikcyjnym backendem, dla ówczesnej wersji zmian. To nie jest wynik końcowej wersji ani test live UAT.
- Później przygotowano 9 dodatkowych testów Playwright (4 viewporty Orders, 4 viewporty Pracownicy/PIN, retry i double-click PIN). Nie uruchamiano ich ani nie powtarzano przeglądarkowych testów po zakazie. Sprawdzono składnię plików.
- Nie uruchomiono dodatkowych runnerów Docker: lokalne kontenery nie były uruchomione. Nie zmieniono SQL.
- Hosted Auth/PIN/Orders i końcowe testy wizualne: **DO WYKONANIA przez operatora**.

## Ręczne wdrożenie — tylko UAT

1. W repo sprawdź branch i stan:

   ```sh
   cd /Users/ivankaminskyi/zagotowki
   git branch --show-current
   git status --short
   git log -1 --oneline
   cat supabase/.temp/project-ref
   ```

   Wymagany branch: `feature/orders`; project-ref: `meuzkduxttjcuiynsnaa`.
   Nie wykonuj merge do `main`, `vercel --prod`, `db push` ani żadnej migracji.

2. W Vercel, projekt Zagotowki, znajdź **stały branch Preview URL dla feature/orders**
   w szczegółach wdrożenia. Skopiuj origin HTTPS bez końcowego `/`, ścieżki i `#`.
   Losowy deployment URL podany wcześniej wskazuje na stary, niezmienny deployment
   i nie zacznie automatycznie pokazywać nowego frontendu. Nie wyłączaj Deployment Protection.

3. Przygotuj lokalny plik konfiguracji tylko UAT. Wstaw potwierdzony branch origin
   zamiast `WKLEJ_ORIGIN_PREVIEW_FEATURE_ORDERS` (nie uruchamiaj z placeholderem):

   ```sh
   mkdir -p tmp/orders-pin-deploy.local
   cat > tmp/orders-pin-deploy.local/uat.env <<'ENV'
   APP_ENV=uat
   PIN_MANAGEMENT_ORIGINS=https://zagotowki-eylp1zta5-sbla-b.vercel.app,WKLEJ_ORIGIN_PREVIEW_FEATURE_ORDERS
   ENV
   npx supabase secrets set --env-file tmp/orders-pin-deploy.local/uat.env --project-ref meuzkduxttjcuiynsnaa
   npx supabase functions deploy manage-employee-pin --project-ref meuzkduxttjcuiynsnaa
   npx supabase functions list --project-ref meuzkduxttjcuiynsnaa
   ```

   Deploy dotyczy **tylko `manage-employee-pin`**, wraz z importowanymi plikami shared.
   Nie trzeba wdrażać `pin-login` ani innych funkcji. Nie zmieniaj sekretu HMAC ani kluczy.
   `APP_URL` istniejącej funkcji UAT pozostaje dotychczasowy. Bieżący kod wymaga poprawnego
   HTTPS root URL i `APP_ENV=uat`; błędna konfiguracja kończy się odmową.

4. W Vercel → Settings → Environment Variables ustaw `PIN_MANAGEMENT_ORIGINS`
   na tę samą listę co w pliku. Zakres **Preview + branch feature/orders**, bez Production.
   Sprawdź, że `VITE_SUPABASE_URL=https://meuzkduxttjcuiynsnaa.supabase.co`, publiczny klucz
   jest z UAT, `APP_URL` jest poprawnym dotychczasowym adresem HTTPS UAT, a istniejący
   `PIN_PROXY_SECRET` jest zgodny z UAT Edge. Nie zmieniaj wartości sekretów ani nie wklejaj ich do czatu.

5. Po ustawieniu zmiennych opublikuj branch i poczekaj na Preview:

   ```sh
   git push origin feature/orders
   ```

   W Vercel sprawdź, że deployment dotyczy nowego SHA i ma Environment **Preview**.
   Jeśli push nie wyzwala deploymentu, utwórz Preview z `feature/orders` w panelu projektu.
   Testuj przez stały branch origin z kroku 2. Nie testuj nowego kodu przez stary losowy URL.
   Jeśli używasz nowego losowego URL, jawnie dopisz jego origin do listy zarówno w UAT Edge,
   jak i Preview Vercel; zmiana zmiennych Vercel wymaga nowego deploymentu.
   Stały branch URL unika tego cyklu.

6. Sprawdź CORS bez sesji (podmień origin na adres z kroku 2):

   ```sh
   curl -i -X OPTIONS \
     -H 'Origin: WKLEJ_ORIGIN_PREVIEW_FEATURE_ORDERS' \
     -H 'Access-Control-Request-Method: POST' \
     -H 'Access-Control-Request-Headers: authorization,apikey,content-type,x-client-info' \
     'https://meuzkduxttjcuiynsnaa.supabase.co/functions/v1/manage-employee-pin'
   ```

   Oczekiwane: **204**, `Access-Control-Allow-Origin` dokładnie jak Origin żądania.
   Dla `Origin: https://untrusted.example.invalid` oczekiwane **403**.
   POST z dozwolonym originem, pustym JSON i bez bearer ma zwrócić **401**, nigdy sukces.

   ```sh
   curl -i -X POST \
     -H 'Origin: WKLEJ_ORIGIN_PREVIEW_FEATURE_ORDERS' \
     -H 'Content-Type: application/json' \
     --data '{}' \
     'https://meuzkduxttjcuiynsnaa.supabase.co/functions/v1/manage-employee-pin'
   ```

## Checklista ręcznych testów operatora

Wszystkie czynności wyłącznie na UAT, na wybranych fikcyjnych kontach i zamówieniach testowych.
Nie zapisuj PIN-ów, tokenów ani haseł w raporcie.

### Auth / PIN

- [ ] Zaloguj administratora UAT; Orders → Pracownicy działa, Powrót wraca do Orders.
- [ ] Otwórz PIN pracownika nisko na liście: formularz jest w jego karcie; imię, rola i lokal są poprawne.
- [ ] Nadaj pierwszy unikalny 4-cyfrowy PIN aktywnemu fikcyjnemu kontu bez logowania. Oczekiwany sukces, konto połączone, bez duplikatu Auth.
- [ ] W osobnym profilu/incognito zaloguj się tym PIN-em i odśwież stronę. Sprawdź rolę, lokal i dostępne moduły.
- [ ] Pozostaw tę sesję zalogowaną. Jako admin zmień PIN w pierwszym profilu. Istniejąca sesja pracownika nadal działa; w trzecim czystym profilu stary PIN nie działa, nowy działa.
- [ ] Nieaktywny pracownik: przycisk PIN wyłączony z wyjaśnieniem, login odrzucony. Pracownik dezaktywowany po otwarciu formularza również nie może otrzymać PIN-u (drugi profil administratora do dezaktywacji).
- [ ] Powtórz nadanie i login dla sushi-master, shift-manager, su-chef, manager i crafter; Crafter ma tylko Zagotówki. Nie zmieniaj ról realnych kont.
- [ ] Zajęty PIN daje czytelny komunikat; inny PIN da się zapisać w tym samym formularzu.
- [ ] Double-click zapisu nie wykonuje dwóch operacji. Po niepewnym błędzie sieci ponów z tym samym PIN-em bez zamykania formularza.
- [ ] Brak uprawnień/konflikt istniejącego konta nie powoduje automatycznego odłączenia ani osłabienia zabezpieczeń.
- [ ] W logach Edge sprawdź `pin-auth` i `pin-auth-backend`: requestId, etap, kod; brak PIN-ów i tokenów.
- [ ] Dotychczasowe logowanie administratora i recovery nadal działają na UAT.

### Orders

- [ ] Administrator: Orders → Wybór modułów → Orders; Pracownicy → Powrót.
- [ ] Manager monitoruje zamówienia bez rozpoczynania zmiany; brak nieprzysługujących akcji i finansów.
- [ ] Generator UAT tworzy zamówienie z kilkoma produktami; „Nowe” → przekazanie na kuchnię.
- [ ] Sushi Master rozpoczyna zmianę, bierze część (np. 6 z 10); drugi bierze całe pozostałe 4. Suma nigdy nie przekracza 10.
- [ ] „Oddaj zadanie” oddaje ilość do puli; po ponownym przejęciu „Gotowe” przekazuje ją do krojenia.
- [ ] „Moje zadania” pokazuje tylko własne niezakończone zadania, bez pustych zamówień.
- [ ] Chef/Shift Manager: rozpoczęcie zmiany → krojenie → zakończenie krojenia → wydanie.
- [ ] Live board usuwa wydane pozycje; Wszystkie i historia nadal pokazują stan oraz właściwy numer zamówienia.
- [ ] Refresh zachowuje zmianę i stan operacji; podwójne kliknięcie nie dubluje ilości/rozliczenia.
- [ ] Zakończenie zmiany z niedokończoną pracą jest blokowane; zakończenie po wykonaniu pracy działa.
- [ ] Historia zmiany i podsumowanie dotyczą właściwej zmiany; po zmianie lokalu nie wracają stare wyniki.
- [ ] Stawka `12,50` zapisuje 1250 groszy i wraca jako `12,50 zł`; `0,29` zapisuje 29. `1,001`, kwota ujemna i >1 000 000 zł są odrzucane.
- [ ] Praca przejęta przed zmianą stawki zachowuje poprzednie rozliczenie; nie modyfikuj historycznych wpisów.
- [ ] Rola z lokalu A nie widzi danych lokalu B.

### UI — każdy ekran

Przejdź Orders/Live board, Wszystkie, Nowe, Moje zadania, zmiany/historię,
katalog/stawki oraz Pracownicy/PIN w 1024×768, 768×1024, desktop 1440×900 i mobile 390×844.

- [ ] Tablet: pozycje jednego zamówienia przewijają się poziomo; strona wyłącznie pionowo.
- [ ] Telefon: brak uciętych pól, tekstów, dialogów i poziomego scrolla całej strony.
- [ ] Desktop: karty wykorzystują szerokość, numer i status są od razu widoczne.
- [ ] Systemowy jasny i ciemny motyw: tekst i pola zachowują kontrast.
- [ ] Focus klawiatury widoczny; cele dotykowe min. 44 px, akcje oddzielone odstępem.
- [ ] Disabled odróżnione od aktywnych; brak nieczytelnych szarych akcji.
- [ ] Powrót, główna akcja i kontekst pracownika/zamówienia są jednoznaczne.

Opcjonalnie operator może uruchomić pełny przygotowany zestaw lokalny:

```sh
npm test
npm run test:migration
npm run lint
npm run build
npm run test:browser
```

Ostatnie polecenie uruchamia lokalną przeglądarkę z fikcyjnym transportem; nie było
wykonywane po zakazie operatora.

## Migracje i rollback

Migracji SQL **brak**. Nie uruchamiaj `db push`. Nie zmienia się schemat, dane historyczne,
RLS, granty ani model groszy.

W razie problemu zatrzymaj testy UAT, zachowaj request ID i kod etapu. Frontend można
przywrócić do poprzedniego Preview w Vercel. Usunięcie dodatkowych originów z konfiguracji
przywraca restrykcję do `APP_URL` (oraz pierwotny problem dostępu Orders); nie usuwaj kont,
PIN-ów, tabel ani historii. Nie przenoś tej procedury na Production.

## Lista plików

- `api/pin-login.js`
- `src/auth/EmployeesScreen.jsx`
- `src/auth/ManageEmployeePin.jsx`
- `src/auth/auth.css`
- `src/orders/ModuleShell.jsx`
- `src/orders/OrdersApp.jsx`
- `src/orders/client.js`
- `src/orders/orders.css`
- `supabase/functions/_shared/pin-handlers.js`
- `supabase/functions/_shared/pin-protocol.js`
- `tests/browser/employees.spec.js`
- `tests/browser/orders.spec.js`
- `tests/orders.test.mjs`
- `tests/pin-auth.test.mjs`
- `tests/pin-proxy.test.mjs`
- `docs/orders-pin-uat-fix.md`
- `PROJECT_CONTEXT.md`

Hash commita dostarczają `git log -1 --format=%H` i odpowiedź końcowa; nie wpisujemy
samoodnoszącego się hasha w treść tego samego commita.
