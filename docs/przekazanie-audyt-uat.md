# AUDYT — przekazanie do wdrożenia na UAT

Stan na 21.10.2026. Prośba: wdrożyć moduł AUDYT z prywatnym magazynem zdjęć R2 i poprawkami komentarzy oraz podglądu zdjęć na UAT. Nie wdrażać na produkcję.

## Wersja kodu i zakres

Repozytorium: `kaminivan14-cpu/Zagotowki`. Lokalna gałąź: `codex/audyt-r2`.

| Commit | Zakres |
|---|---|
| `bc4977d` | Moduł AUDYT: wzory formularzy, audyty, zapisywanie postępu, historia i wyniki |
| `9b78d75` | Prywatne R2, kompresja zdjęć do 1920 px i konwersja HEIC/HEIF do JPEG |
| `94a4d44` | Zapis komentarzy bez utraty fokusu oraz pełny podgląd zdjęć |

Kod przygotowano i przetestowano lokalnie. W ramach tych prac nie wykonano push ani wdrożenia. Przed rozpoczęciem trzeba udostępnić koledze gałąź/kod i potwierdzić obecność commita `94a4d44`; nie zakładać, że jest już na GitHubie.

**Jeżeli R2 i wcześniejsza wersja AUDYT są już poprawnie wdrożone**, ostatni commit wymaga tylko przebudowania i wdrożenia frontendu. Nie dodaje migracji, sekretów ani zmian Edge Function. Jeśli AUDYT/R2 nie były wdrażane, wykonać poniższą pełną procedurę. Obecny stan zdalnego UAT nie był weryfikowany.

## Zachowanie po poprawkach

- Komentarz zapisuje się automatycznie w tle. Krótka przerwa w pisaniu nie blokuje pola i nie odbiera kursora. Jeśli użytkownik dopisze tekst w trakcie zapisu, odpowiedź serwera nie nadpisuje tego tekstu; kolejne żądanie zapisuje nowszą treść z właściwą wersją audytu.
- Miniatura pokazuje cały kadr. Kliknięcie otwiera duży podgląd dopasowany do ekranu. Usunięto konflikt CSS, który ograniczał również powiększone zdjęcie do 80 × 80 px.
- Zdjęcia są kompresowane przed wysłaniem: JPEG, maks. 1920 px na dłuższym boku, bez zachowywania oryginału. Obsługiwane wejście: JPG, PNG, WebP, HEIC/HEIF do 10 MiB. Wynik do 4 MiB.
- Supabase nadal obsługuje konta, bazę i uprawnienia. Pliki trafiają bezpośrednio do prywatnego R2 przez krótkotrwałe podpisane adresy. Edge Function sprawdza plik przed zatwierdzeniem w bazie.

## Pełne wdrożenie — wymagane dostępy

Potrzebny jest dostęp do kodu, Supabase UAT, hostingu frontendu UAT i konfiguracji bucketa Cloudflare R2. Sam dostęp do Supabase nie wystarczy do ustawienia CORS w R2. Właściciel ma utworzony bucket `zagotowki-audyt-uat` w jurysdykcji EU i klucze R2; przekazać je bezpiecznym kanałem albo poprosić właściciela o samodzielne wpisanie sekretów.

Według konfiguracji repo projekt Supabase UAT to **`meuzkduxttjcuiynsnaa`**. Przed jakimkolwiek wdrożeniem porównać ten identyfikator z panelem i środowiskiem docelowym. Ostatnia informacja od właściciela: nie było jeszcze frontendu UAT — trzeba potwierdzić, czy jest już dostępny.

## 1. Baza

Sprawdzić historię migracji i wykonać backup UAT. Zastosować brakujące migracje w kolejności repozytorium, w tym:

1. `supabase/migrations/202610130001_audit.sql`
2. `supabase/migrations/202610140001_audit_r2.sql`

Migracja R2 wymaga pustej tabeli `audit_photos`. Jeśli są tam rekordy, migracja celowo się zatrzyma: nie usuwać ich w celu obejścia zabezpieczenia. Wtedy potrzebny jest osobny plan migracji istniejących załączników.

**Nie stosować `supabase/storage/audit-photo-policies.sql`** — dotyczy poprzedniej wersji przechowującej zdjęcia w Supabase Storage. Dokument `docs/audit-mvp.md` opisuje tę starszą wersję; bieżąca instrukcja zdjęć to `docs/audit-r2.md`.

## 2. Sekrety funkcji w Supabase UAT

| Nazwa | Wartość |
|---|---|
| `R2_BUCKET` | `zagotowki-audyt-uat` |
| `R2_ENDPOINT` | Dokładny S3 API endpoint z ustawień bucketa EU, bez nazwy bucketa, np. `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | Access Key ID tokena S3 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key tego samego tokena |
| `AUDIT_PHOTOS_PROJECT_REF` | Zweryfikowany ref Supabase UAT |
| `AUDIT_PHOTOS_ORIGINS` | Dokładny origin frontendu UAT, np. `https://<HOST_UAT>`, bez końcowego ukośnika. Kilka adresów oddzielonych przecinkiem |

Klucze S3 mają uprawnienia odczytu/zapisu obiektów ograniczone do tego bucketa. Nie umieszczać ich w repozytorium ani zmiennych `VITE_*`. `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` funkcja odczytuje ze środowiska Supabase.

## 3. Bucket i CORS

Bucket ma pozostać prywatny, bez publicznego `r2.dev` i publicznej domeny. Nie włączać reguły automatycznie usuwającej wszystkie zdjęcia po określonym czasie.

W ustawieniach CORS bucketa wstawić prawdziwy origin frontendu UAT zamiast placeholdera:

```json
[
  {
    "AllowedOrigins": ["https://<HOST_UAT>"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

Adres musi odpowiadać `AUDIT_PHOTOS_ORIGINS`. Dla testów lokalnych można dodać `http://localhost:5173` i `http://127.0.0.1:5173` w obu miejscach. Nie potrzeba osobnego Cloudflare Workera ani własnej domeny dla R2.

## 4. Edge Function i frontend

Z katalogu repozytorium, po potwierdzeniu celu:

```sh
supabase functions deploy audit-photos --project-ref <UAT_REF>
```

Zachować konfigurację funkcji z `supabase/config.toml`: `verify_jwt = false`. Funkcja sama weryfikuje sesję przez Supabase Auth `/user`, a funkcja SQL ponownie sprawdza aktywność konta, autora i stan audytu. Nie usuwać tych kontroli.

Frontend musi wskazywać Supabase UAT przez `VITE_SUPABASE_URL` i publiczny `VITE_SUPABASE_ANON_KEY` lub `VITE_SUPABASE_PUBLISHABLE_KEY`. Przykład jest w `.env.uat.example`.

```sh
npm ci
npm run build:uat
```

Wdrożyć wynik `dist` zgodnie z konfiguracją hostingu UAT. Jeżeli nie ma jeszcze hostingu, aplikację można sprawdzić lokalnie przez `npm run dev -- --mode uat`. Nowy adres hostingu dopisać do obu list dozwolonych originów.

## 5. Odbiór na UAT

- Rozpocząć audyt, uzupełnić odpowiedzi, zapisać, zamknąć i wznowić — dane mają pozostać.
- W komentarzu wpisać kilka znaków, odczekać kilka sekund i pisać dalej bez klikania pola. Powtórzyć przy spowolnionej sieci, dopisując tekst podczas zapisu. Po ponownym otwarciu audytu musi być cała treść.
- Dodać JPG i prawdziwe HEIC z telefonu. Sprawdzić orientację, wynikowy format JPEG, rozmiar i dłuższy bok do 1920 px w R2.
- Otworzyć poziome i pionowe zdjęcie na telefonie i komputerze: cały kadr, duży podgląd, poprawne zamknięcie.
- Przerwać sieć w trakcie wysyłki, ponowić. Nie powinien powstać drugi załącznik. Przy niepotwierdzonym zapisie po ponownym otwarciu sprawdzić przycisk „Sprawdź zapis zdjęcia”.
- Sprawdzić odczyt na drugim koncie; inny użytkownik może oglądać audyt, ale nie może go edytować. Równoczesne zapisy autora na dwóch urządzeniach mają zgłaszać konflikt zamiast nadpisywać dane.
- Zakończyć kompletny audyt: dalsza edycja i usuwanie są niedostępne.
- Usunąć zdjęcie lub własny audyt w trakcie i sprawdzić usunięcie obiektu z R2.
- Potwierdzić, że bez sesji nie można uzyskać nowego podpisanego adresu zdjęcia. Sam wydany adres jest ważny do 5 minut.

## Weryfikacja wykonana przed przekazaniem

Wersja R2 przeszła 155 testów Node/PGlite. Po ostatnich poprawkach: 8/8 testów Playwright AUDYT, lint i kompilacja UAT poprawne. Testy przeglądarki wykorzystują rzeczywiste lokalne RPC i kod obsługi Edge, ale symulują transport Auth/R2. Nie wykonano testu na prawdziwym zdalnym UAT ani bucketcie — jest częścią odbioru wdrożenia, szczególnie dla podpisów S3, CORS i Content-Length.

Znane ograniczenia: ostrzeżenie builda o wielkości pakietów; dekoder HEIC ładuje się osobno przy pierwszej konwersji. Sprzątanie wycofanych zdjęć jest ponawiane przy wejściu autora do modułu; nie ma harmonogramu. Jeśli autor nie wróci lub konto zostanie wyłączone, zaległe obiekty oznaczone w bazie `deleted` mogą wymagać sprzątnięcia administracyjnego.

Po wdrożeniu proszę przekazać właścicielowi: adres UAT, wdrożony commit, potwierdzenie migracji i funkcji oraz wyniki powyższych testów — bez wartości sekretów.
