# Audyt — integracja UAT, 2026-10-14

## Discovery

- `origin/main`: `68d4d0ee14b654586c9d9446e61b7b87ae060e18`.
- Paweł `origin/codex/audyt-mvp`: `bc4977d5d2c7d715bd43aafee56f16e18a94d443`.
- Merge-base jest identyczny z main: 1 commit ahead, 0 behind. Brak konfliktów i cofania nowszych zmian.
- Branch integracyjna `feature/audyt-integration` utworzona z tego origin/main; przeniesiono jedyny commit Audytu przez cherry-pick.
- Nowe pliki Pawła: `docs/audit-mvp.md`, `src/audit/{AuditApp.jsx,AuditForm.jsx,Dialog.jsx,Photo.jsx,audit.css,client.js,model.js,useOperation.js}`, `supabase/migrations/202610130001_audit.sql`, `supabase/storage/audit-photo-policies.sql`, `tests/{audit-database.test.mjs,audit.test.mjs,helpers/audit-db.mjs,browser/audit.spec.js}`.
- Wspólne zmiany: dopisanie kontekstu w `PROJECT_CONTEXT.md`, kafel/lazy screen w `src/orders/ModuleShell.jsx`, warunek widoczności w `src/orders/environment.js`. Nie zmieniono logiki Orders, Processes, Organization, Access, Avatars, Tasks, Worktime ani Auth.

## Model i permissions

Audyt używa istniejących Employees/Auth, Locations i `app_private.role_permissions`. Nie ma drugiego modelu pracowników/lokali/ról ani nowego silnika Tasks. MVP nie tworzy zadań naprawczych, więc nie ma integracji tworzącej central Tasks.

Nowe tabele domenowe: `public.audit_templates`, `public.audits`, `public.audit_photos`, prywatny rejestr idempotencji `app_private.audit_operations`. Wykonany audyt zawiera niezależny snapshot pytań. Autor jest identyfikowany istniejącym UUID Auth, nazwa autora/lokalu jest snapshotem prezentacyjnym.

Model Pawła zachowany: wszystkie aktywne, niearchiwalne konta z `audit.access` mogą czytać historię wszystkich lokali i zarządzać wspólnymi wzorami. Tylko autor może zmieniać/zakończyć/usunąć swój aktywny audyt. Administrator nie ma obejścia tej reguły. Gotowy audyt jest immutable. To jawny cross-location scope tego MVP, nie scope Orders/Tasks; ich reguły pozostają bez zmian.

Poprawka integracyjna: `app_private.audit_actor()` sprawdza również `app_private.has_permission('audit.access')`; odebranie capability blokuje wszystkie RPC i Storage predicate. RLS na trzech publicznych tabelach; brak bezpośrednich grants klienta. Publiczne RPC: `audit_read`, `audit_command`, `audit_photo_access`, EXECUTE tylko authenticated. Prywatne helpers: `audit_actor`, `audit_detail`.

Migracja jest powtarzalna (CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, bucket ON CONFLICT DO NOTHING). Test ponowienia po zakończeniu audytu potwierdza zachowanie danych. Przed aplikacją sprawdzono brak kolizji obiektów i zgodność zależności Auth/capabilities; IF NOT EXISTS nie zastępuje drift-checku.

## UAT

Wyłącznie `meuzkduxttjcuiynsnaa`, Zagotowki - UAT. Zastosowano `202610130001_audit.sql` po lokalnym upgrade i transakcyjnym rehearsal/rollback UAT. Historia poprzednio kończyła się na `202610110001`; nowy wpis `202610130001`, nazwa `audit`.

Snapshoty historii, funkcji, schema/constraints/indexes/RLS/grants i postflight: lokalne `tmp/audit-integration/`. Istniejące funkcje oraz istniejące table grants/RLS/policies pozostały identyczne. Nie odczytywano ani nie zmieniano Production.

Storage: prywatny `audit-photos`, 10 MiB, JPG/PNG/WebP/HEIC/HEIF. Osobny krok Dashboard zgodnie z `supabase/storage/audit-photo-policies.sql`: SELECT read, INSERT, DELETE oraz SELECT cleanup tombstones; wszystkie authenticated, bez UPDATE/anon. Nie zmieniać ownera storage.objects. Brak tych policies blokuje live photo smoke i gotowość UAT.

## Walidacja

- Node Audyt: 4/4, w tym pełny lifecycle DB/PGlite i odebranie capability.
- `node tests/audit-postgres.mjs`: PASS, rzeczywisty lokalny PostgreSQL, aktualny main + Audyt; concurrent start deduplication, concurrent edit conflict, completion, idempotent upgrade i zachowanie rekordów.
- Playwright Audyt: 5/5; formularz, autosave/resume, konflikty, upload retry/cleanup, mobile/keyboard.
- Krótki Playwright regression: 6/6; email login, Orders workflow, Organization mutation, Admin permission, Processes edit, Tasks create/plan/work/complete/report.
- Lint i build:uat PASS. Istniejące ostrzeżenie bundle >500 kB.
- Browser tests są izolowane: rzeczywista lokalna baza dla Audytu, transport Auth/Storage symulowany. Nie zastępują live Preview smoke ani realnego uploadu pliku.

## Dalszy release gate

Push wyłącznie integration branch, Vercel Preview z UAT Supabase, sprawdzenie SHA/environment/Ready, następnie live smoke po utworzeniu Storage policies. Bez PR do main i bez Production deploy. Zapisane historyczne PASS w docs/audit-mvp.md dotyczą poprzedniego uruchomienia Pawła, a nie live UAT.
