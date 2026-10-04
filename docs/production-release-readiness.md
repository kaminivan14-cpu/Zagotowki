# Production readiness: Orders / Tasks

Zakres: wyłącznie przygotowanie i lokalna weryfikacja. **Nie wykonano merge/push main, migracji ani deployu Production.** Admin panel i Processes mają ręczny UAT PASS użytkownika; pozostają dostępne według istniejących capabilities, bez dodatkowego wyłączania.

## Commity i target

Bazowy feature/orders: `1a2782ab418f01d2bfb01e83e1b2b91f761d0a66`. Poprawki są zapisane w commicie zawierającym ten raport na feature/orders. Main/origin/main i aktualny Production: `8ec74d74ef0c0fa033b18136d942eed21a6e527f`; lokalny main nadal af03694, nie zmieniano go. Origin/main jest przodkiem gałęzi, brak konfliktów treści w tym stanie. Nowego merge ani Production deployed commit nie ma.

Użytkownik potwierdził Vercel: Environment Production, Current, Ready, branch main, SHA 8ec74d7. Domeny:
- https://zagotowki.vercel.app
- https://zagotowki-git-main-sbla-b.vercel.app
- https://zagotowki-f78uriimm-sbla-b.vercel.app

Deployment URL jest identyfikatorem punktu powrotu; brak dpl_ID nie jest już blokadą. Historyczne GitHub production_environment=false nie nadpisuje ręcznego potwierdzenia w Vercel.

Production Supabase: **First Zagotowki**, `ssheqxdgsmndiutthxvd`, `https://ssheqxdgsmndiutthxvd.supabase.co`, eu-west-1. UAT: `meuzkduxttjcuiynsnaa`. Management API używane wyłącznie do odczytów; żadnych nowych credentials, logowania, Keychain ani sesji przeglądarki użytkownika.

## Zamknięte blokady kodu

1. **Employee/crafter:** nowa ścieżka pomija 202610010002 w całości. Nie instaluje triggera konwersji. Dotychczasowe employee i ich credential fields pozostają niezmienione. Administrator może jawnie utworzyć crafter i jawnie zmienić rolę; zapisy nadal idą przez auth_save_employee i jego walidacje.
2. **PIN:** 05_orders_roles zachowuje historyczny hash administratora wyłącznie jako dane. Nie dodaje administratora do pin_verify/pin_confirm ani możliwości resetu PIN. Manager, su-chef i employee zachowują legacy PIN oraz bcrypt. Nie obniżono kosztu ani nie zmieniono Auth/session flow. Email/password administratora nie zależy od PIN.
3. **Production permissions:** 06_release_policy usuwa tylko capabilities nowych modułów dla ról innych niż administrator/manager i orders.test.generate dla wszystkich. has_permission odrzuca takie żądania również przy przypadkowym ponownym nadaniu capability. orders_actor sprawdza dodatkowo orders.access; Tasks korzysta z istniejącego task_actor/scope/RLS. Manager nie otrzymuje tasks.admin/processes.manage ani szerszego scope.
4. **UI:** ModuleShell sprawdza role Production i capability, także przy renderowaniu wybranego modułu. Nie zmienia wejścia Zagotówki. Generator wymaga compile-time środowiska UAT oraz orders.test.generate; sprawdzenie dotyczy menu, renderowania i wysłania/retry create_test.
5. **Admin/Processes:** UAT PASS. Administrator zachowuje panel i Processes. Manager ma tylko posiadane capabilities. Zwykłe role nie mają dostępu do RPC ani tabel.

Nowe pliki upgrade nie są migracjami UAT. Nie edytowano żadnego pliku w supabase/migrations. UAT nie otrzymało zmian konfiguracji/DB.

## Jawny manifest upgrade

`scripts/lib/production-release.mjs` to generator SQL offline — nie łączy się z bazą i niczego nie wdraża. Ma zamkniętą, jawną listę plików; nowe pliki repo nie wchodzą do release automatycznie.

1. `upgrades/production/05_orders_roles.sql` zamiast historycznego 202610010001; wymaga istniejącego production_upgrade v1/cutover i braku role_permissions.
2. `202610010003_orders.sql`.
3. `202610020001`–`202610020012`: shared Tasks, uprawnienia, scope, planning, work queue, reports, hardening i audit.
4. `202610030001_orders_board.sql`: shared Orders/sety/alerty, bez testowych danych.
5. `202610040001_worktime.sql`.
6. `202610050001`–`202610050003`: availability, manual actions, execution.
7. `202610060001_tasks_admin_processes.sql`: zatwierdzony backend panelu/procesów, Departments business dictionary i prywatny Storage.
8. `upgrades/production/06_release_policy.sql`: końcowa polityka Production.
9. Wpis `orders_tasks_v1` w nowym prywatnym `production_module_releases`, z listą plików i ich SHA-256. Bez fikcyjnej historii fresh migrations.

Całość jest **jedną transakcją**. Żaden pośredni stan szerokich uprawnień UAT nie zostaje udostępniony między plikami. Błąd dowolnego kroku wycofuje całość. Ponowne wykonanie odrzucane. Nie stosować tych plików osobno na Production ani wykonywać ogólnego supabase db push.

Pominięcia:

| Migracja / grupa | Decyzja |
|---|---|
| 202609* BASE/Auth/PIN/archive | Już zastąpione rzeczywistym legacy PREPARE/PROVISION/CUTOVER; nie wykonywać fresh baseline ani nie oznaczać fikcyjnie jako applied. |
| 202610010001_roles_modules | Zastąpiona nowym 05_orders_roles zachowującym dane legacy. |
| 202610010002_crafter | Niedozwolona automatyczna konwersja; całkowicie pominięta. |
| 202610030002_orders_uat_generator | UAT-only zmiana testowego importu; pominięta. Shared set import pozostaje w 202610030001. |
| 202610060002_new_menu_process | Przykładowy seed; pominięty. Panel Processes działa z pustą listą, dopóki nie utworzono realnych szablonów. |
| supabase/seeds/orders-uat.sql, scripts/orders-uat-seed, tasks-workspace-uat, tests/fixtures | UAT/test-only; nigdy nie wykonywać na Production. |

## Matrix

| Rola | Orders | Tasks | Zagotówki i stare prawa | Admin / Processes |
|---|---|---|---|---|
| administrator | tak | tak | zachowane | według istniejących capabilities, panel dostępny |
| manager | tak | tak | zachowane, scope bez rozszerzenia | brak automatycznego nadania tasks.admin/processes.manage |
| su-chef, shift-manager, sushi-master, crafter, employee | nie | nie | zachowane | nie |
| director, expert, specialist, owner, inne | nie | nie | bez rozszerzania dostępu przez nowe moduły | nie |

Testy celowo podają nadmierne capabilities do UI i nadają błędne grants w lokalnej bazie: nowe moduły i generator nadal są odrzucane. Bezpośrednie odczyty Orders/Tasks i administrator RPC przez zwykłe role odrzucone.

## Wyniki

- Nowy Production legacy-cutover → cały release: **239 kontroli PASS**, w tym brak konwersji, zachowanie hashy, PIN manager/su-chef/employee, odrzucenie admin/błędnego/nieaktywnego PIN, jawne role save, module RPC denial, Storage, historia upgrade, ochrona przed ponownym uruchomieniem, stare odczyty plans i profile administratora.
- Dotychczasowy Production upgrade: **126 PASS**.
- PIN PostgreSQL/pgcrypto: **70 PASS**, również współbieżne połączenia.
- Node/PIN/Auth/environment: **120 PASS**.
- Playwright legacy/UAT: **149 PASS**, w tym logowanie, menu, Zagotówki i istniejące workflow.
- Dodatkowy headless Production policy: **13 PASS** — wszystkie role, generator nawet z capability, panel administratora/Processes i brak panelu managera.
- Orders PostgreSQL: **189 + 33 PASS**.
- Tasks PostgreSQL: **164 PASS**; Worktime **58 PASS**; Processes **60 PASS**.
- Legacy migration/Production RPC regression: PASS.
- Lint: PASS. Production build: PASS z jawnym Production URL/public anon key; UAT build: PASS. Próba Production build z lokalnym UAT env prawidłowo FAIL. Istniejące ostrzeżenie chunk >500kB pozostaje.

Testy Auth/UI używają syntetycznych kont i mockowanych sesji. Nie deklarujemy wykonania realnego loginu Production. Smoke Production nastąpi dopiero po osobnym zatwierdzeniu rollout, z preferencją odczytów i bez fake orders/tasks/process launch.

PIN performance: osobne TODO, nie blokada. Nie wprowadzono optymalizacji bez trace. Before/after/warm/cold: niezmierzone.

## Nowy read-only preflight

Snapshot: `tmp/production-rollout-preflight-20261004T142709Z/` — identity, schema-catalog-before, migration-history-error, role summary, permissions absence, storage policies, drift-check. Pełny katalog funkcji/tabel/grants/RLS/constraints/indexes/triggerów jest zgodny z poprzednim rzeczywistym snapshotem Production (wszystkie sekcje PASS). Hosted obiektów nie usuwano.

Production ma production_upgrade version=1/phase=cutover, bez standardowej schema_migrations i bez role_permissions. To zaakceptowany baseline nowej ścieżki, nie sygnał do uruchomienia BASE. Snapshot definicji i grants zastępuje snapshot nieistniejącej tabeli permissions; faktyczna historia cutover jest w poprzednim snapshotie `20261004T135551Z/upgrade-state.json`.

## Backup i rollback bez PITR

PITR pozostaje wyłączony; API nie pokazuje gotowych backupów. Snapshot schematu **nie jest backupem danych**. Manualny eksport logiczny jest możliwy przez połączenie PostgreSQL; aktualny dostęp Management API nie jest credentialem pg_dump. Nie resetowano hasła bazy i nie wykonywano eksportu realnych danych podczas przygotowania.

Procedura przed autoryzowanym rollout:

1. Supabase → **First Zagotowki → Connect → Session pooler (5432)**, ewentualnie Direct jeśli dostępny IPv6. Użyć istniejącego hasła operatora, nie resetować go i nie przesyłać w rozmowie.
2. Skonfigurować lokalny libpq service `zagotowki-prod-backup` w chronionym pliku (0600), z host/user/port/database z panelu, sslmode=require; hasło w dedykowanym PGPASSFILE 0600. Zweryfikować host/ref przed uruchomieniem. Żadnego URI z hasłem w argumentach procesu/logach.
3. Na zaufanym komputerze z pg_dump zgodnym z wersją serwera oraz age, ustawić publiczny odbiorca szyfrowania `AGE_RECIPIENT` i bezpieczny katalog `BACKUP_DIR`. Wykonać:

```sh
set -e
set -o pipefail
umask 077
pg_dump --dbname='service=zagotowki-prod-backup' --format=custom --no-password \
  | age --recipient "$AGE_RECIPIENT" --output "$BACKUP_DIR/production.dump.age"
pg_dumpall --dbname='service=zagotowki-prod-backup' --roles-only --no-role-passwords --no-password \
  | age --recipient "$AGE_RECIPIENT" --output "$BACKUP_DIR/roles.sql.age"
shasum -a 256 "$BACKUP_DIR/production.dump.age" "$BACKUP_DIR/roles.sql.age"
```

4. Każdy brak uprawnień pg_dump/pg_dumpall = STOP; nie pomijać danych Auth/PIN, schematów ani błędów. Archiwum zawiera wrażliwe dane wyłącznie zaszyfrowane. Dostęp do klucza prywatnego ograniczony do operatora. `pg_dumpall --no-role-passwords` nie kopiuje haseł ról infrastruktury; poświadczenia odtworzeniowe trzeba mieć w osobnym bezpiecznym magazynie.
5. Zweryfikować deszyfrowanie i katalog `pg_restore --list`, następnie wykonać próbę odtworzenia do **odizolowanej, nowej instancji testowej**, nigdy do Production. Hosted role/extension ownership wymagają sprawdzonej procedury odtworzenia. Test odtworzenia ma potwierdzić public/app_private, Auth users/identities, role grants/RLS, sekwencje i kompletność rekordów. Zablokować ruch wychodzący oraz wysyłkę maili/webhooków.
6. Zarchiwizować osobno konfigurację Auth/Edge/Vercel i obiekty plikowe Storage, jeśli istnieją. Sam dump DB nie zawiera bajtów plików Storage ani konfiguracji usług. Zapisać wynik restore rehearsal i czas backupu przed ostatecznym GO.

Oficjalne odniesienie dla manualnego backup/restore i różnic hosted: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore . Supabase udostępnia też wariant CLI z osobnymi roles/schema/data; jego pliki należy tworzyć wyłącznie w chronionym, szyfrowanym miejscu.

Rollback:
- Błąd przed COMMIT: transakcja upgrade zostaje wycofana, stary frontend nadal działa.
- Po COMMIT, przed deploy: pozostawić kompatybilne obiekty; nie usuwać tabel ani credential fields.
- Po deploy przy regresji Auth/starych modułów/permissions: zatrzymać ruch do wadliwego wydania, w Vercel wybrać potwierdzony deployment `zagotowki-f78uriimm-sbla-b.vercel.app` / SHA 8ec74d7 i przywrócić Production alias (Instant Rollback/Promote zgodnie z dostępną akcją). Sprawdzić email/password, produkcyjne PIN role i Zagotówki.
- Bez automatycznego destructive DB rollback. Dalszy rollback DB/restore wymaga analizy zmian biznesowych od backupu; brak PITR oznacza ryzyko utraty tych zmian przy pełnym restore. Preferować kompatybilny frontend rollback oraz kontrolowaną korektę addytywną.

## Decyzja

Blokady kodu/permissions/compatibility: zamknięte. Admin panel i Processes: UAT PASS. Vercel target: potwierdzony przez użytkownika. Benchmark PIN: TODO nieblokujące.

**READY FOR PRODUCTION ROLLOUT — readiness kodu i planu, bez zgody na wykonanie w tej iteracji.** Zgodnie z zakresem przygotowano procedurę backupu; realnego eksportu i restore rehearsal jeszcze nie wykonano. Muszą być pierwszą bramką wykonawczą przed przyszłym zapisem. Jeśli operator nie może uzyskać poprawnego backupu i potwierdzić odtworzenia, rollout ma zatrzymać się przed migracją. Plan backupu nie oznacza, że kopia już istnieje. Po tym raporcie zatrzymujemy się: bez merge, push, migracji i deployu Production.
