# AUDYT — implementacja MVP, 13.10.2026

Zmiany są lokalne, na gałęzi `codex/audyt-mvp`. Nie wykonano push, wdrożenia ani operacji na zdalnych bazach UAT/PROD. Aplikacja została pobrana do osobnego katalogu `Zagotowki`; pierwotne pliki użytkownika pozostają nietknięte.

## Zakres

- Trzeci moduł w definicji menu, przed Робота; kafelki nadal respektują uprawnienia innych modułów. AUDYT jest dostępny dla wszystkich aktywnych kont istniejącej aplikacji, niezależnie od roli i lokalu.
- Wspólne wzory: podgląd, dodawanie, edycja, zmiana kolejności i wycofanie. Nazwa do 200 znaków, 1–500 pytań, każde do 2000 znaków; puste pola są odrzucane w UI i RPC.
- Rozpoczęcie po potwierdzeniu; niezależna kopia nazwy i uporządkowanych pytań, identyfikator Auth autora, manager i czas rozpoczęcia z serwera.
- Jedna przewijana lista: TAK / NIE / NIE DOTYCZY, ponowne kliknięcie wybranej odpowiedzi ją czyści. Komentarz do 200 znaków i do 10 zdjęć na pytanie.
- Automatyczny zapis po 650 ms bezczynności, rzeczywiste potwierdzenie serwera, ponawianie nieudanej operacji z tym samym UUID. Podczas żądania kontrolki edycji są zablokowane. Błąd zachowuje dane na ekranie, blokuje zakończenie i poprawne wyjście. Nawigacja/odświeżenie ostrzega przed niezapisanymi zmianami.
- Wersja rekordu sprawdzana pod blokadą w bazie. Druga karta nie nadpisze nowszego zapisu; konflikt wymaga otwarcia aktualnej wersji, z potwierdzeniem odrzucenia lokalnych zmian.
- Historia wszystkich lokali z filtrem statusu, sortowaniem według rozpoczęcia, postępem lub Score. Wznowienie pobiera dane z bazy.
- Zakończenie po odpowiedzi na wszystkie pytania, wyborze lokalu i potwierdzonym przesłaniu wszystkich zdjęć. Zakończone audyty są niezmienne; brak ponownego otwierania i usuwania.
- Autor może usunąć własny audyt w trakcie. Wycofane audyty i wzory są ukryte logicznie; zachowanie rekordów umożliwia bezpieczne ponowienia oraz sprzątanie plików.
- Wyświetlanie czasu przez istniejący `instantLabel`, ze strefą `Europe/Warsaw`; oba przesunięcia sezonowe objęte testem.

## Uruchomienie

1. Wymagany Node obsługiwany przez Vite 8 i istniejące środowisko testowe Supabase. Zainstaluj wersje z repozytorium: `npm ci`.
2. Ustaw istniejące `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` dla **UAT**. Nie używaj klucza service-role w przeglądarce. Można skorzystać z `.env.uat.example` i lokalnego `.env.uat`.
3. Po sprawdzeniu identyfikatora projektu i zgodności istniejącego łańcucha migracji zastosuj na zatwierdzonym środowisku testowym nową migrację `supabase/migrations/202610130001_audit.sql`. Wymaga dotychczasowych migracji do `202610110001_process_wizard.sql` włącznie. Nie uruchamiaj na produkcji w ramach tego zadania.
4. Zastosuj osobny plik `supabase/storage/audit-photo-policies.sql` obsługiwanym przez Supabase mechanizmem zarządzania politykami Storage, analogicznie do istniejących polityk avatarów. To obowiązkowy drugi krok; bez niego przesyłanie i odczyt zdjęć nie zadziałają. Nie zmieniaj właściciela tabel systemowych. Bucket `audit-photos` tworzy migracja: prywatny, limit 10 MiB i jawna lista MIME.
5. Uruchom `npm run dev -- --mode uat`. Zaloguj się istniejącym kontem; odśwież sesję/aplikację po migracji, aby pobrać `audit.access`. Nie są potrzebne nowe konta, role, dane startowe ani osobna lista lokali.
6. Kompilacja: `npm run build:uat`. Kontrola lint: `npm run lint`. Testy: `npm test`, `npx playwright test tests/browser/audit.spec.js --workers=1`.

## Dane i bezpieczeństwo

Nowe tabele `audit_templates`, `audits` i `audit_photos` mają RLS i brak bezpośrednich uprawnień klienta. `audit_read` i `audit_command` korzystają z istniejącego `app_private.actor()` oraz sprawdzają aktywność/archiwizację konta. Autor jest porównywany przez `auth.uid()`, nigdy nazwę. Nawet administrator nie może zmieniać cudzego ani zakończonego audytu.

Każda mutacja ma UUID i zapis wyniku w prywatnym `app_private.audit_operations`. Ponowienie po utracie odpowiedzi nie tworzy drugiego audytu ani drugiego załącznika. Wersje rekordów chronią przed nadpisaniem i nie stanowią dostępnego użytkownikowi systemu wersjonowania. Niezmienność treści wynika z niezależnych kopii i braku RPC do zmiany pytań w rozpoczętym audycie.

Załącznik jest najpierw rezerwowany w bazie pod blokadą audytu (liczą się także rezerwacje), następnie przesyłany pod unikalną ścieżką, a na końcu zatwierdzany po sprawdzeniu metadanych obiektu. Rezerwacja blokuje zakończenie także po odświeżeniu. Ponowienie wymaga tego samego pliku albo usunięcia rezerwacji i dodania nowego. Storage nie zezwala na nadpisanie obiektu. Polityki blokują cudze zapisy, anonimowy odczyt oraz usuwanie plików zakończonego audytu. Blokady audytu serializują mutacje Storage i zakończenie.

Usunięcie oznacza zdjęcie jako wycofane, a potem wywołuje Storage API `remove`; kod nie usuwa wierszy `storage.objects` bezpośrednio. Nieudane sprzątanie pozostawia trwały wpis i można je ponowić, także przy kolejnym wejściu autora do modułu. Jeśli autor nigdy nie wróci lub konto zostanie wyłączone, pozostałe wycofane pliki wymagają sprzątnięcia operacyjnego przez administratora Storage. Przed fizycznym usunięciem należy sprawdzić `audit_photos.state = 'deleted'`; gotowych i oczekujących zdjęć nie traktować jako osieroconych. Brak nowego harmonogramu/Edge Function.

## Zdjęcia

Przyjęto 10 MiB na plik (UI: „10 MB”), maksymalnie 10 na pytanie. JPG, PNG, WebP oraz HEIC/HEIF; plik jest zachowywany w oryginalnej jakości, bez automatycznej kompresji. Walidacja sygnatury w kliencie rozwija istniejący wzorzec avatarów; backend sprawdza rozmiar, MIME, liczbę, rezerwację, tożsamość autora i stan audytu. Limit rozmiaru/MIME jest dodatkowo ustawiony w bucketcie.

Dostępne są aparat, galeria, miniatury, modalny podgląd, ponowienie i usuwanie. Prywatne adresy podpisane mają ważność 5 minut i są odświeżane co 4 minuty. HEIC/HEIF może nie wyświetlać się w danej przeglądarce: UI udostępnia wtedy oryginał; nie ma serwerowej konwersji formatu. Podpisany URL pozostaje ważny do wygaśnięcia lub usunięcia obiektu, zgodnie z działaniem Supabase Storage.

## Weryfikacja i ograniczenia

- `npm test` (uruchomione bezpośrednio przez Node): **153/153** testów zakończonych powodzeniem.
- Nowe testy bazy uruchamiają cały łańcuch migracji w PGlite i rzeczywiste funkcje/RLS: anonimowy dostęp, autor/cudzy autor, snapshot, usunięcie wzoru, walidacja, blokady ukończenia, ponawianie, konflikt wersji, 10 zdjęć, metadane Storage, usuwanie załączników i niezmienność zakończonych danych.
- PGlite zastępuje platformowe Auth/Storage oraz nieobsługiwane `pgcrypto` atrapami; funkcje kryptograficzne PIN nie są przedmiotem tego testu. Równoczesne transakcje niezależnych sesji PostgreSQL wymagają jeszcze weryfikacji na UAT; lokalnie sprawdzono żądania ze starymi wersjami i powtarzanymi UUID.
- Playwright AUDYT: **5/5**. Korzysta z prawdziwych RPC uruchamianych w tej lokalnej bazie; transport Auth/Storage jest symulowany. Testuje zapis/wznowienie, Score, zmianę kolejności wzoru, modal i fokus, wycofanie wzoru, brak duplikatu po utracie odpowiedzi, błąd zapisu, konflikt oraz błąd/próby przesyłania i sprzątanie zdjęć.
- Testy regresji logowania, Orders, produkcji i Tasks: **74/74**. Dodatkowo otwarto dołączony prototyp w przeglądarce i przechodzono jego główne widoki (1/1).
- Kompilacja UAT z lokalnym kluczem zastępczym zakończyła się powodzeniem; nie nawiązuje połączenia ani niczego nie wdraża. Pozostaje istniejące ostrzeżenie o głównym pakiecie powyżej 500 kB. Lint bez błędów.
- Obejrzano screenshoty rzeczywistego formularza w 390 px. Dodatkowa kontrola obejmuje 320 px i powiększony tekst. Screenshoty z uruchomienia Playwright znajdują się w ignorowanym `test-results/`.
- Nie wykonywano testów z prawdziwym zdalnym Supabase Auth/Storage, fizycznym aparatem telefonu ani rzeczywistymi sesjami dwóch urządzeń. Przed wydaniem potrzebna jest akceptacja na UAT: logowanie, przesłanie realnych JPG/HEIC, ponowne otwarcie na drugim urządzeniu i równoczesny zapis/ukończenie.
- Nie dodano eksportu, importu, zadań naprawczych, nowych ról, geolokalizacji, pełnego offline ani edycji zakończonych audytów.
