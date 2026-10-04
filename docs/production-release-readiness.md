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

PITR pozostaje wyłączony; API nie pokazuje gotowych backupów. Snapshot schematu **nie jest backupem danych**. Manualny eksport logiczny jest możliwy przez połączenie PostgreSQL; aktualny dostęp Management API nie jest credentialem pg_dump. Pierwotne przygotowanie nie obejmowało eksportu danych. Aktualny wynik realnego backupu i lokalnego restore opisano poniżej; w tej iteracji użyto istniejącej kopii, bez nowego backupu.

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

**BACKUP GATE PASSED WITH DOCUMENTED POST-RESTORE STEPS.** Istniejący backup odtworzono lokalnie i zweryfikowano po uzupełnieniu wyłącznie grants schematów GraphQL. Nie jest to zgoda na rollout. Po tej bramce zatrzymujemy się: bez merge, push, migracji i deployu Production.


## Zweryfikowany lokalny restore i post-restore grants — 2026-10-04

**Zakres:** istniejąca kopia Production `ssheqxdgsmndiutthxvd`, bez ponownego dumpu. Production odczytano tylko w celu potwierdzenia grants i efektywnych uprawnień funkcji rozszerzeń. Nie zmieniano Production.

Artefakty lokalne (ignorowane przez Git, pliki 0600, katalog 0700):
`backups/production-gate-20261004T161338Z/`.

- `production.dump.age`: pełny custom-format pg_dump, utworzony 2026-10-04 o 16:13 UTC; 525003 bajty; SHA256 `85d6660b36502b369a068f8d41626eec64c392c8510441780a54e3dd422a6316`.
- `roles.sql.age`: role bez haseł; `schema.sql.age`: snapshot schematu.
- `metadata.json`, `post-restore-final-report.json`: wynik i zakres porównania.
- `production-graphql-grants-confirmed.json`: aktualne read-only potwierdzenie grants Production.
- Zaszyfrowane manifesty źródła/restore oraz efektywnych uprawnień rozszerzeń.
- `restore-local.py`, `verify-post-restore.py`, `canonical-query.sql`, `local-only-post-restore-grants.sql`: dokładna lokalna procedura użyta do weryfikacji. Nie są migracją aplikacji.
- Klucz age znajduje się poza repo: `~/.config/zagotowki-backup/backup-age-identity.txt` (0600). Jest niezbędny do restore; przechowywać oddzielnie od kopii. Nie drukować ani commitować klucza. Narzędzia tej próby: `/tmp/zagotowki-backup-tools/age` i `age-keygen`; przy powtórzeniu muszą być dostępne.

### Procedura odtworzenia wyłącznie lokalnego

1. Sprawdzić checksum istniejącego `production.dump.age` powyżej. Nie tworzyć nowej kopii. Użyć nowego kontenera `public.ecr.aws/supabase/postgres:17.6.1.166` z `--network none`, bez opublikowanych portów i bez mountów. Nazwa jest dedykowana tej próbie; jeśli zajęta, STOP i sprawdzić jej pochodzenie. Nie podłączać kontenera do sieci.
2. Uruchomić poniższe polecenia z katalogu repo. Po `pg_isready` kontynuować tylko przy kodzie 0:

```sh
docker run -d --name zagotowki-production-restore-20261004 --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  public.ecr.aws/supabase/postgres:17.6.1.166 postgres -c listen_addresses=
docker exec zagotowki-production-restore-20261004 pg_isready -U supabase_admin
python3 backups/production-gate-20261004T161338Z/restore-local.py
```

`restore-local.py` najpierw sprawdza izolację kontenera. Korzysta z ról dostarczonych przez obraz Supabase i tworzy tylko brakujące nazwy ról z zaszyfrowanego eksportu. Nie odtwarza haseł ról infrastruktury. Odtwarza pustą bazę `postgres` z `template0` **wyłącznie w tym nowym lokalnym kontenerze** (lokalne DROP/CREATE), a następnie strumieniuje odszyfrowany backup do `pg_restore --exit-on-error` jako `supabase_admin`, bez `--no-owner` i bez `--no-acl`. Nie zapisuje odszyfrowanego dumpu na dysku hosta. Każdy błąd = STOP.

3. Post-restore wykonać wyłącznie jako `supabase_admin` w tej lokalnej bazie:

```sql
BEGIN;
GRANT USAGE ON SCHEMA graphql, graphql_public
  TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA graphql, graphql_public
  TO postgres WITH GRANT OPTION;
COMMIT;
```

To odtwarza dokładnie potwierdzone grants Production: owner/grantor `supabase_admin`, `USAGE` dla trzech ról aplikacyjnych bez grant option oraz `USAGE WITH GRANT OPTION` dla `postgres`. Istniejące `CREATE/USAGE` właściciela pozostają zachowane. Nie nadawać `CREATE` rolom aplikacyjnym, nie używać `GRANT ALL`, nie zmieniać ownerów rozszerzeń. Tego SQL **nie wykonywać na Production**.

4. Polecenie poniżej wykonuje krok 3 oraz porównanie; nie trzeba osobno uruchamiać SQL. Grants są idempotentne:

```sh
python3 backups/production-gate-20261004T161338Z/verify-post-restore.py
```

Weryfikator ponownie sprawdza izolację kontenera i SHA256 backupu. Porównuje lokalny restore z zachowanym manifestem źródłowym oryginalnej kopii. Tylko efektywne uprawnienia funkcji rozszerzeń sprawdza dodatkowo read-only na Production przez istniejący service libpq, używając `postgres:17`; credentials nie są przekazywane do kontenera restore. Oryginalne zaszyfrowane pliki backupu pozostają niezmienione.

### Canonical comparison i wynik

- **57 tabel / record counts: PASS** — zgodne z zachowanym manifestem źródłowym; jest to porównanie liczebności, nie hash wszystkich wartości wierszy.
- Columns, constraints, indexes, RLS/policies, triggers, default grants: **PASS**.
- Funkcje aplikacyjne `public/app_private`, ich owners i grants: **PASS, bez wyjątków**.
- Grants schematów, w tym `graphql/graphql_public`: **PASS po dwóch instrukcjach GRANT**.
- Auth: **PASS**; 22 ACL tabel i ACL `auth.jwt` różniły się wyłącznie kolejnością wpisów. Przed porównaniem sortowano wpisy, zachowując grantee, grantor, prawa i grant option.
- Migration history: **PASS**, legacy `app_private.production_upgrade` v1/cutover, frontend `8ec74d7`. `supabase_migrations.schema_migrations` nie istnieje w źródle ani restore. `role_permissions` również nie istnieje w tym baseline; nie tworzono ani nie modyfikowano tej tabeli.
- **49 funkcji rozszerzeń**: udokumentowany hosted drift owner/grantor `postgres` → `supabase_admin`. Akceptacja dotyczy wyłącznie funkcji potwierdzonych przez `pg_depend` jako członkowie rozszerzeń. Definicje są identyczne, funkcje nie są SECURITY DEFINER, a efektywne `EXECUTE` i `EXECUTE WITH GRANT OPTION` dla wszystkich ról są zgodne pomiędzy Production i restore. Żadne inne różnice funkcji nie są pomijane.
- Przed/po post-restore sprawdzono brak zmian wszystkich pozostałych zebranych sekcji; zmieniły się wyłącznie ACL dwóch schematów GraphQL. Nie zmieniono danych, public/app_private, RLS ani funkcji aplikacyjnych.

Po weryfikacji usunąć wyłącznie kontener tej próby, aby nie pozostawiać lokalnie odszyfrowanych danych:

```sh
docker rm -f -v zagotowki-production-restore-20261004
```

Ta procedura potwierdza lokalny restore bazy z udokumentowanym wyjątkiem hosted ownership. Nie obejmuje wdrożenia Auth/Edge/Vercel ani bajtów plików Storage. Nie jest instrukcją odtwarzania na Production. **Po PASS zatrzymać się; migracje, merge i deploy nadal nie są autoryzowane.**


## Production rollout preflight — STOP, 2026-10-04

Autoryzowany rollout zatrzymano **przed pierwszym zapisem Production**. Backup gate pozostaje PASS. Świeży schema drift-check względem baseline: PASS (wszystkie sekcje). Source `feature/orders`: `65aa201db80fcf7c29830e7529f4a09fd20a7f14`; świeżo pobrany `origin/main`: `8ec74d74ef0c0fa033b18136d942eed21a6e527f`. 21 kroków jawnego manifestu nadal oczekuje na zastosowanie; żadnego nie zastosowano na Production.

Próba dokładnego release SQL na izolowanej, odtworzonej kopii jako rzeczywista rola wykonawcza `postgres` zakończyła się błędem:

```text
202610060001_tasks_admin_processes.sql:266
CREATE POLICY tasks_file_insert ON storage.objects ...
ERROR: must be owner of table objects
```

Cała lokalna transakcja została wycofana (potwierdzono brak role_permissions i production_module_releases). Kontener z odszyfrowanymi danymi usunięto. Nie zmieniano migracji, ownerów ani grants w celu obejścia blokady.

Read-only sprawdzenie Production potwierdza: storage.objects należy do supabase_storage_admin; postgres nie ma dostępu do uprawnień właściciela (`pg_has_role(...,'USAGE') = false`). Kanał migracyjny Management API również wykonuje SQL jako postgres, co potwierdzono zapytaniem SELECT w jawnej transakcji BEGIN READ ONLY. Kanał API read_only=true używa supabase_read_only_user. Nie ma potwierdzonej ścieżki wykonania tej polityki z dostępnymi credentials. Testy syntetyczne nie obejmowały tego ograniczenia właściciela hosted Storage.

Przed wznowieniem potrzebna jest wspierana przez Supabase procedura wykonania dwóch polityk Storage (linie 266 i 268) z właściwymi uprawnieniami i ponowna próba całego manifestu na hosted-equivalent baseline. Nie pomijać polityk, nie wyłączać RLS, nie podnosić uprawnień postgres ani nie zmieniać właściciela storage.objects w ciemno. Nie tworzyć częściowo wdrożonego release.

Dowody: `tmp/production-rollout-preflight-20261004T162646Z/` — drift-check, release manifest/SQL, rehearsal.stderr, probe roli API i rollout-result.json. Backend/Production smoke nowego release: niewykonany, bo migracja zatrzymana przed zapisem. Merge/push/deploy: niewykonane. Production rollback nie jest potrzebny. **Status: STOP.**

## Rozdzielenie faz DB / Storage — 2026-10-04

Rollout pozostaje wstrzymany. Zgodnie z jawną zgodą rozdzielono historyczny plik `202610060001_tasks_admin_processes.sql`: wyjęto dawne linie 266–268 (polityki `tasks_file_insert` i `tasks_file_select` oraz komentarz między nimi). Nie zmieniono warunków polityk. Nowy plik: `supabase/storage/tasks-private-policies.sql`, poza katalogiem automatycznych migracji i poza manifestem `productionReleaseSql()`. Na UAT, gdzie stary plik został już wykonany, **nie wykonywać go ponownie i nie naprawiać historii migracji**. Nowy SHA pliku w przyszłym Production journal będzie dotyczył wydzielonej fazy A.

### Faza A — aplikacyjny DB upgrade

Ta sama jawna lista 21 kroków, atomowo jako `postgres`. Tworzy funkcje/RPC, tabele i prywatny bucket `tasks-private`; nie tworzy polityk `storage.objects`. Bez zmiany ownera, grantów roli postgres ani wyłączania RLS. Rehearsal na rzeczywistym backupie Production jako postgres: **PASS**. Prywatny bucket istnieje, polityk tasks_file_* brak, zakazanych capabilities brak, owner storage.objects nadal supabase_storage_admin. Production drift-check po wydzieleniu: PASS, `tmp/production-rollout-preflight-20261004T163220Z/`.

### Faza B — ręczne Storage policies, przed frontendem

Bez polityk upload i signed URL załączników są blokowane przez RLS. To bezpieczna odmowa dostępu, ale niepełna funkcjonalność Processes/Tasks; nie wdrażać nowego frontendu przed zakończeniem B. Stary frontend może pozostać aktywny między A i B. Nie uruchamiać procesów wymagających załączników w tym czasie.

Wymagane polityki bucketu `tasks-private`:

| Operacja | Rola | Warunek |
|---|---|---|
| INSERT | authenticated | bucket_id='tasks-private', pierwszy folder = auth.uid(), capability tasks.access |
| SELECT | authenticated | bucket_id='tasks-private', capability tasks.access oraz własny folder LUB tasks_storage_read(name) |
| UPDATE | brak polityki | aplikacja używa upload(upsert:false), bez nadpisywania |
| DELETE | brak polityki | „Прибрати” usuwa referencję w formularzu, nie obiekt Storage |
| anon / service_role | brak nowych polityk | brak dostępu anonimowego; żadnego klienta service_role w przeglądarce |

Dokładny SQL (do ręcznego kroku Storage, **nie do kanału migracyjnego postgres**):

```sql
CREATE POLICY tasks_file_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tasks-private'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND app_private.has_permission('tasks.access')
);
CREATE POLICY tasks_file_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'tasks-private'
  AND app_private.has_permission('tasks.access')
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.tasks_storage_read(name)
  )
);
```

`tasks_storage_read` zachowuje istniejącą autoryzację task/process i uprawnienia do pliku; nie zamieniać jej na true. `has_permission` sprawdza aktywnego, niearchiwalnego pracownika i końcową politykę Production. Nie dodawać szerszych polityk. Limit 20971520 bajtów i MIME allowlist pozostają w definicji prywatnego bucketu.

### Checklista Dashboard (dopiero po osobnej zgodzie na wznowienie)

1. Otwórz projekt **First Zagotowki**, potwierdź ref `ssheqxdgsmndiutthxvd` w adresie. Po zakończeniu fazy A wejdź **Storage → Policies → OBJECTS → Add Policies / New policy**. Oficjalna dokumentacja: https://supabase.com/docs/guides/storage/quickstart#add-security-rules . Nazwy przycisków mogą zależeć od wersji Dashboard.
2. Sprawdź bucket `tasks-private`: private, 20 MiB, istniejący MIME allowlist. Nie twórz publicznego bucketu. Przejrzyj wszystkie istniejące polityki OBJECTS, również ALL i dla PUBLIC: permissive policies łączą się OR i żadna nie może rozszerzać dostępu do tego bucketu.
3. Wybierz własną definicję polityki. Nazwa **tasks_file_insert**, operacja **INSERT**, target role **authenticated**. Wklej wyłącznie wyrażenie z `WITH CHECK` powyżej do pola definicji. W podglądzie SQL potwierdź dokładny bucket, ścieżkę, capability i rolę; zapisz.
4. Analogicznie **tasks_file_select**, operacja **SELECT**, target role **authenticated**, wyrażenie z `USING`. Sprawdź nawiasy i alternatywę własny folder / tasks_storage_read. Nie zaznaczaj UPDATE ani DELETE i nie akceptuj automatycznie wygenerowanych dodatkowych polityk.
5. Jeśli nazwa już istnieje, porównaj definicję — nie nadpisuj w ciemno. Jeśli panel zwraca ownership/permission denied: **STOP, zgłoszenie do Supabase Support** z ref, nazwami polityk i błędem. Nie wykonywać SET ROLE do supabase_storage_admin, ALTER OWNER, GRANT roli właściciela ani obejścia przez service key.
6. Odczytem zweryfikuj definicje:

```sql
SELECT policyname, cmd, roles, permissive, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;
```

7. Sprawdź uprawnione dodanie/odczyt pliku oraz odrzucenie cudzej ścieżki, innego bucketu, nieaktywnego użytkownika i użytkownika bez tasks.access. Nie twórz fikcyjnych danych biznesowych Production bez potrzeby; test zapisu uzgodnić jako kontrolowany plik testowy z operatorem. Dopiero po B PASS przejść do merge/deploy frontendu i smoke.

Dashboard jest oficjalnie wspieranym interfejsem polityk, ale jego skuteczności na tym projekcie **nie potwierdzono**, ponieważ nie używano sesji operatora i Production pozostaje bez zmian. Dodatkowa lokalna próba jako istniejący storage owner `supabase_storage_admin` została odrzucona na `permission denied for schema auth`; nie rozszerzano jego grants. To nie jest alternatywna instrukcja wykonania. Próbę wycofano. Faza B musi zostać potwierdzona przez wspierany Dashboard / Support, nie przez zmianę ownera.

### Service role i testy

Frontend `src/supabase.js` używa wyłącznie publicznego anon/publishable key i sesji użytkownika; `src/tasks/admin/Files.jsx` uploaduje z JWT użytkownika (`upsert:false`) i pobiera krótkotrwałe signed URLs. Build guard odrzuca secret key i JWT z rolą inną niż anon. `SUPABASE_SERVICE_ROLE_KEY` występuje w funkcjach backendowych Supabase (PIN/invite/sync-products), nie w src ani Storage UI. Dla załączników nie dodano żadnego obejścia RLS ani backendowego uploadu service_role. Jest to audyt kodu, nie odczyt aktualnych sekretów Vercel.

Kolejność: **A migrations → B Dashboard policies + weryfikacja → frontend deploy → smoke**. Status: **READY dla przygotowanej fazy A; STOP dla deployu Production do B PASS**. Żadnej fazy nie wykonano na Production w tej iteracji.

Wyniki po rozdzieleniu: Production release PostgreSQL **239 PASS**; Processes PostgreSQL **66 PASS** (w tym faza A deny, oddzielne polityki, własny upload, odrzucenie cudzego folderu/innego bucketu/nieaktywnego konta); targeted Node **11 PASS**; lint **PASS**; git diff --check **PASS**. Testy syntetyczne polityk nie zastępują manualnego B PASS na hosted Supabase.


## Faza A wykonana na Production — 2026-10-04, 16:40:49 UTC

**PHASE A PASSED — wyłącznie DB. Faza B i frontend nadal zablokowane.** Target `ssheqxdgsmndiutthxvd` potwierdzono ponownie; aktualny backup gate PASS i świeży preflight drift PASS. Wykonano każdy krok poniżej osobno z katalogowym checkpointem po każdym, w jednej transakcji. COMMIT dopiero po końcowej polityce Production i backend smoke, aby nie upublicznić pośrednich szerokich capabilities UAT. Nie zastosowano ogólnego db push ani Storage policies.

Zastosowana kolejność (dokładne SHA256 plików w journal):
1. `upgrades/production/05_orders_roles.sql`
2. `migrations/202610010003_orders.sql`
3. `migrations/202610020001_task_access.sql`
4. `migrations/202610020002_task_core.sql`
5. `migrations/202610020003_task_approvals.sql`
6. `migrations/202610020004_task_planning.sql`
7. `migrations/202610020005_task_work.sql`
8. `migrations/202610020006_task_balance_reports.sql`
9. `migrations/202610020007_task_hardening.sql`
10. `migrations/202610020008_task_audit.sql`
11. `migrations/202610020009_task_pagination.sql`
12. `migrations/202610020010_task_contracts.sql`
13. `migrations/202610020011_task_team_calendar.sql`
14. `migrations/202610020012_task_role_invariant.sql`
15. `migrations/202610030001_orders_board.sql`
16. `migrations/202610040001_worktime.sql`
17. `migrations/202610050001_task_availability_reports.sql`
18. `migrations/202610050002_task_manual_actions.sql`
19. `migrations/202610050003_task_execution.sql`
20. `migrations/202610060001_tasks_admin_processes.sql`
21. `upgrades/production/06_release_policy.sql`

Migration head: prywatny journal `app_private.production_module_releases`, release `orders_tasks_v1`, 21 wpisów manifestu; ostatni krok `upgrades/production/06_release_policy.sql`. Najnowsza standardowa migracja w manifeście: `202610060001_tasks_admin_processes.sql` po wydzieleniu Storage. Zachowano legacy `production_upgrade` v1/cutover i frontend_release 8ec74d7; nie dopisywano fikcyjnego baseline do nieistniejącego `supabase_migrations.schema_migrations`.

Weryfikacja:
- 21/21 katalogowych checkpointów Production zgodnych z lokalnym upgrade jako postgres: tabele/schema, functions/RPC, RLS/policies, grants/default ACL, constraints/indexes, triggers i stan historii.
- Przed COMMIT porównano odciski wszystkich dotychczasowych pól Employees (z wyłączeniem nowych department_id/production_role), Auth id/email/password/app metadata, Plans i Plan_items: bez zmian. Żadnych hashy PIN ani haseł nie wypisano.
- Ponowne niezależne połączenie read-only po COMMIT: pełny katalog zgodny z lokalnym wynikiem, journal manifest zgodny z wykonywanymi plikami.
- Auth backend: auth_employee_profile dla aktywnych powiązanych użytkowników PASS, obecność hasła administratora i zachowanie credentiali PASS. **Rzeczywistego email/password sign-in nie wykonywano.**
- PIN backend: pin_confirm dla aktywnych employee/manager/su-chef PASS, administrator nieuprawniony do PIN, public/authenticated bez EXECUTE pin_verify, backend service_role uprawniony. Credentiale niezmienione. **Logowania prawdziwym PIN-em nie wykonywano.**
- Zagotówki: odczyt Plans/Plan_items w kontekście aktywnych ról PASS. Zapisy/edycja/usuwanie prawdziwych planów nie były wykonywane na Production; pokrycie lokalną regresją.
- Orders/Tasks: odczyt katalogu, zmian, board dla przypisanego lokalu, tasks_context/work_state dla administrator/manager PASS. Dla aktywnych employee/su-chef capability i RPC denial PASS.
- Worktime: worktime_current dla aktywnych użytkowników i worktime_context dla administrator/manager PASS; żadnej zmiany czasu pracy.
- Admin/Processes: RPC administratora według capability PASS, bez tworzenia/uruchamiania procesów. Baza nowych modułów nie została zasilona fikcyjnymi zadaniami/zamówieniami.
- UAT generator: capability usunięta, Production policy blokuje; brak testowego seedu.
- Storage: prywatny tasks-private utworzony przez fazę A; owner storage.objects nadal supabase_storage_admin; cały zestaw dotychczasowych Storage policies identyczny przed/po, tasks_file_* nadal nie istnieją. Systemowych owners/grants nie zmieniano.
- Lokalne wcześniejsze regresje bieżącego splitu: Production 239 PASS, Processes 66 PASS, Node 11 PASS, lint PASS; dodatkowo powtórzony pełny upgrade realnego backupu + taki sam backend smoke PASS.

Dowody: `tmp/production-rollout-preflight-20261004T163710Z/` — drift-check, phase-a-manifest, local/production-checkpoints, production-result, post-commit-catalog, post-commit-smoke i post-commit-checks. Skrypty wykonania i smoke zachowano tam do audytu. Pierwsza próba lokalnego smoke wykazała wyłącznie błąd harness (pozostawione row_security=off); po poprawce skryptu lokalne i Production smoke PASS. Migracji aplikacji nie modyfikowano podczas wykonania fazy A.

Nie wykonano merge, push ani Vercel deploy. Frontend nadal poprzedni. Rzeczywiste logowanie i UI smoke pozostają do ręcznej kontroli operatora; nie wykorzystano sesji użytkownika ani jego credentiali. Kontynuacja dopiero po zgodzie na fazę B. Rollback nie jest wymagany.

## Faza B — potwierdzona read-only, 2026-10-04

**PHASE B PASSED.** Operator utworzył polityki ręcznie. Production storage.objects ma dokładnie dwie PERMISSIVE policies dla authenticated: `tasks_file_insert 1iuorb8_0` (INSERT) i `tasks_file_select 1iuorb8_0` (SELECT). Sufiks pochodzi z Dashboard; warunki bucket/path/auth/capability odpowiadają supabase/storage/tasks-private-policies.sql. pg_depend potwierdza odwołanie SELECT do public.tasks_storage_read(text), mimo skróconej prezentacji nazwy w pg_get_expr. Brak UPDATE/DELETE/ALL i brak nowych policies anon/service_role. Bucket nadal prywatny, 20 MiB.

Read-only smoke dla istniejących aktywnych kont: tasks.access wyłącznie administrator/manager; employee/su-chef odmowa. tasks_storage_read odrzuca brakujący plik i nieuprawnione role; orders.test.generate niedostępne. Task_files ma 0 rekordów — pozytywny odczyt prawdziwego załącznika Production nie został wykonany; wcześniejszy synthetic Storage/process smoke 66 PASS. Nie utworzono danych testowych. Dowody: tmp/production-phase-b/inspection.json i result.json.

Frontend rollout autoryzowany przez użytkownika po tym PASS. Merge/push/deploy wymagają osobnego potwierdzenia wyniku; niniejszy wpis nie stwierdza wykonania deployu.
