# Zdjęcia AUDYT w Cloudflare R2

Stan: przygotowane lokalnie na `codex/audyt-r2`. Bez wdrożenia, bez dostępu do kluczy i bez testu rzeczywistego bucketa. Użytkownik potwierdził, że AUDYT nie został jeszcze wdrożony, nie ma frontendu UAT i akceptuje kompresję do 1920 px. Ta instrukcja zastępuje opis zdjęć i wdrożenia Storage w `audit-mvp.md`.

## Co przygotować teraz

W Supabase **UAT**, Edge Functions → Secrets, dodaj poniższe wartości. Kluczy nie wklejaj do rozmowy ani zmiennych `VITE_*`.

| Sekret | Wartość |
|---|---|
| `R2_BUCKET` | `zagotowki-audyt-uat` |
| `R2_ENDPOINT` | Dokładny S3 API endpoint skopiowany z ustawień bucketa; dla EU: `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` (bez nazwy bucketa) |
| `R2_ACCESS_KEY_ID` | Access Key ID z utworzonego tokena R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key z tego samego tokena |
| `AUDIT_PHOTOS_PROJECT_REF` | Ref projektu **UAT**; według kontekstu repo `meuzkduxttjcuiynsnaa`, przed wdrożeniem sprawdź w panelu |
| `AUDIT_PHOTOS_ORIGINS` | Na początek `http://localhost:5173,http://127.0.0.1:5173`; później dopisz dokładny adres HTTPS frontendu UAT, oddzielony przecinkiem, bez końcowego `/` |

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` dostarcza środowisko Edge Functions. Nie kopiuj service-role do frontendu. Potrzebne są klucze **S3**, nie sam ogólny token Bearer Cloudflare. Token ma prawo odczytu/zapisu obiektów ograniczone do tego jednego bucketa.

Bucket pozostaje prywatny: wyłączone publiczne `r2.dev` i publiczna domena. Nie ustawiaj automatycznego usuwania wszystkich obiektów regułą lifecycle — usunęłoby zdjęcia zakończonych audytów.

W R2 → bucket → Settings → CORS Policy wklej:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

Gdy powstanie frontend UAT, dopisz jego dokładny origin zarówno tutaj, jak i do `AUDIT_PHOTOS_ORIGINS`. Nie potrzeba własnej domeny R2 ani osobnego Cloudflare Workera.

## Wdrożenie po przygotowaniu UAT

1. Sprawdź docelowy project-ref, stan migracji i wykonaj standardowy backup. Nie uruchamiaj na PROD.
2. Zastosuj cały brakujący łańcuch migracji, w tym `202610130001_audit.sql`, następnie `202610140001_audit_r2.sql`. Druga migracja celowo odmawia działania, jeśli istnieje choć jeden rekord `audit_photos`: nie przenosi już istniejących zdjęć. Według deklaracji użytkownika zdjęć AUDYT jeszcze nie ma.
3. **Nie stosuj** `supabase/storage/audit-photo-policies.sql`. Historyczna pierwsza migracja tworzy pusty bucket Supabase; nowy kod go nie używa, a funkcja dostępu do niego jest wyłączona.
4. Uzupełnij powyższe sekrety i CORS. Wdróż `supabase functions deploy audit-photos --project-ref <UAT_REF>`. Konfiguracja `verify_jwt = false` jest celowa: funkcja sama weryfikuje token przez Auth `/user`; brak poprawnej sesji jest odrzucany. SQL ponownie sprawdza aktywne konto i uprawnienia.
5. Lokalny frontend: ustaw publiczne dane Supabase UAT w `.env.uat`, `npm ci`, `npm run dev -- --mode uat`. Frontend na Vercel będzie osobnym krokiem, gdy dostępny będzie jego adres.
6. Przed udostępnieniem sprawdź prawdziwe przesłanie JPG i HEIC, podgląd po ponownym logowaniu, dwa urządzenia, błąd sieci, ponowienie i usunięcie. Sprawdź w R2 rozmiar i liczbę obiektów. Weryfikacja prawdziwego S3 podpisu, CORS i automatycznego nagłówka Content-Length wymaga tego testu.

## Przepływ

Telefon → konwersja JPEG (jakość 0,82), maks. 1920 px dłuższy bok → rezerwacja metadanych w Supabase → podpisany PUT bezpośrednio do prywatnego R2 → Edge Function sprawdza plik → zatwierdzenie w bazie. Baza i logowanie nadal są w Supabase; tylko zdjęcia trafiają do R2. Istniejące inne moduły i ich magazyny plików pozostają bez zmian.

Źródło: JPG, PNG, WebP, HEIC/HEIF do 10 MiB. Wynik: JPEG do 4 MiB, bez skalowania w górę; przezroczystość spłaszczana na białym tle. Przetwarzamy pliki kolejno, HEIC przez oddzielnie ładowany dekoder. Canvas nie przenosi metadanych EXIF/GPS; zdjęcie zachowuje orientację. Oryginałów nie przechowujemy. Rzeczywiste oszczędności zależą od zdjęcia, nie obiecujemy stałego rozmiaru.

SQL przechowuje identyfikator, ścieżkę, SHA-256, rozmiar, wymiary i stan. Przeglądarka nie może zatwierdzić pliku samym RPC `photo_ready`. Edge sprawdza metadane HEAD, pobiera bajty z R2, weryfikuje SHA-256 i wymiary nagłówka JPEG. To kontrola spójności załącznika, nie pełny skaner bezpieczeństwa ani dekoder serwerowy.

Podpisane linki wygasają po 5 minutach. PUT wiąże typ, długość i `If-None-Match: *`, więc istniejącego obiektu nie można nadpisać nawet ponownym użyciem linku. GET jest prywatny i odświeżany co 4 minuty. Wydany link do odczytu może działać do wygaśnięcia po wyłączeniu konta; usunięcie obiektu przerywa odczyt.

Ponawianie korzysta z tego samego identyfikatora i przygotowanego pliku. Po odświeżeniu przy oczekującym zdjęciu można użyć „Sprawdź zapis zdjęcia”, aby zatwierdzić zakończoną wysyłkę bez ponownego wyboru pliku. Przy ponownym przetworzeniu na innej przeglądarce wynik może mieć inny SHA-256: wtedy usuń oczekujące zdjęcie i dodaj ponownie.

Usunięcie audytu/zdjęcia zapisuje trwały stan `deleted`; sprzątanie R2 można ponawiać. Odbywa się też przy wejściu autora do modułu. Pozostawione wpisy umożliwiają usunięcie spóźnionych uploadów ze starych linków. Bez powrotu autora lub po dezaktywacji konta takie pliki wymagają sprzątnięcia administracyjnego (tylko obiekty z `state = 'deleted'`). Nie wdrożono harmonogramu; przy większej skali warto dodać okresowe sprzątanie.

## Weryfikacja lokalna

Wynik: **155/155** testów Node, **7/7** testów Playwright AUDYT, lint bez błędów i poprawna kompilacja UAT. Build zgłasza ostrzeżenie rozmiaru głównego pakietu oraz osobnego dekodera HEIC.

- Testy Node/PGlite: migracje, prawa do RPC, cudze i nieaktywne konta, konflikt wersji, niezgodne bajty, finalizacja, bezpieczne ponowienie, zakończony audyt, sprzątanie.
- Adapter podpisywania: faktyczny aws4fetch, podpisane nagłówki, limit czasu, kontrola ścieżki i metadanych.
- Playwright: formularz z prawdziwymi RPC w PGlite i kodem Edge Handler; transport Auth/R2 jest atrapą. Testuje kompresję, retry, podgląd i usuwanie. Oddzielny test sprawdza HEIC i orientację EXIF.
- PGlite nie zastępuje testów równoległych transakcji PostgreSQL. Deno deployment, prawdziwy Cloudflare i fizyczny telefon wymagają testu UAT.
- Dekoder HEIC zwiększa oddzielny pakiet o ok. 751 kB gzip, pobierany przy pierwszej konwersji HEIC. Informacje o licencji i źródle: `/third-party/heic-to/NOTICE.txt`.

Dokumentacja usług: https://developers.cloudflare.com/r2/api/s3/presigned-urls/ oraz https://developers.cloudflare.com/r2/api/s3/api/.
