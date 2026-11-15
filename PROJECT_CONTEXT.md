# Zagotówki / ALKI — kontekst projektu

Aktualizacja: 2026-09-24. Stan repo sprawdzony lokalnie; stan UAT to ostatni
potwierdzony checkpoint z tej sesji, nie bieżący monitoring usług.
Nie przechowywać tutaj sekretów, adresu e-mail administratora ani jego Auth UID.

## 1. Projekt

- Zagotówki są pierwszym rozwijanym modułem większego systemu ALKI.
- Frontend: React/Vite. Hosting frontendu: Vercel (według operatora).
- Backend, baza i Auth: Supabase.
- Repozytorium: Zagotowki, `https://github.com/kaminivan14-cpu/Zagotowki`.

## 2. Środowiska

- PROD Supabase: `ssheqxdgsmndiutthxvd`.
- UAT Supabase: `meuzkduxttjcuiynsnaa`.
- Poprzednio podawany ref z literą `v` zamiast `y` był błędny — nie używać go.
- **Nigdy nie wykonywać zapisu na PROD bez jednoznacznego polecenia operatora.**
- **Przed każdą operacją Supabase sprawdzić project-ref i zgodność celu z poleceniem.**

## 3. Git

- Production branch: `main` (według operatora).
- Rozwój Auth i aktualny branch: `feature/auth`.
- Potwierdzony HEAD: `bcff1707eb872ae761a529a8d1544985dc893c7c`.
- Commit: `Add reproducible database bootstrap and UAT seed`.
- Przed utworzeniem tego dokumentu drzewo robocze było czyste.

## 4. UAT — aktualny checkpoint

- Projekt „Zagotowki - UAT” istnieje; ostatni potwierdzony status: `ACTIVE_HEALTHY`.
- Lokalny Supabase CLI jest podlinkowany do `meuzkduxttjcuiynsnaa`.
- Wdrożono standardowym CLI; historia local/remote jest zgodna:
  `202609220001_base.sql`, `202609230001_auth.sql`,
  `202609230002_auth_production.sql`.
- Seed `supabase/seeds/uat.sql` wykonany; odczyt potwierdził:

| Tabela | Rekordy |
|---|---:|
| Products | 123 |
| Recipe_ingredients | 284 |
| Locations | 2 |
| Employees | 9 |
| Plans | 6 |
| Plan_items | 18 |

- RLS włączone na wszystkich sześciu tabelach; RPC Auth i `auth_user_id` istnieją.
- Pierwszy administrator Auth został utworzony i powiązany z testowym
  `Employees.id = 1` (UAT Administrator, aktywny, rola administrator).
- PROD nie został zmieniony podczas wdrażania UAT.
- Daty planów seedu były względne wobec dnia jego wykonania; nie przesuwają się automatycznie.

## 5. Auth

- Role: `employee`, `su-chef`, `manager`, `administrator`.
- Employee: własny lokal, wyłącznie aktywny plan DZISIAJ (Europe/Warsaw);
  START/GOTOWE zgodnie z regułami backendu.
- Su-chef: zarządzanie planami i historia własnego lokalu, bez zarządzania kontami.
- Manager: własny lokal, produkcja i zarządzanie employee/su-chef tego lokalu.
- Administrator: dostęp między lokalami zgodnie z RLS/RPC.
- Logowanie: Supabase Auth, e-mail + hasło; powiązanie przez `Employees.auth_user_id`.
- Operator potwierdził e-mail/hasło i password recovery end-to-end na UAT.
- POC PIN (2026-09-29): manager/su-chef/employee otrzymują tę samą sesję Supabase Auth
  po weryfikacji dokładnie 4 cyfr. Administrator zachowuje e-mail/hasło.
- Implementacja PIN jest lokalna, jeszcze niewdrożona; migracja UAT i realny test
  generateLink → verifyOtp → setSession pozostają do wykonania.
- Konta PIN używają wyłącznie `<UUID>@pin.uat.invalid`; własna domena i sekret domeny nie są potrzebne. Akceptacja adresów przez hostowany Auth: do potwierdzenia na UAT.
- Nie przywracamy starego publicznego login_employee. PIN-only nie jest jeszcze
  gwarantowane na poziomie wszystkich API Auth. Plan uruchomienia: docs/pin-auth-uat.md.

## 6. Bootstrap bazy

- Repo zawiera odtwarzalny łańcuch: BASE → AUTH 001 → AUTH 002 → osobny seed UAT.
- Migracje: `supabase/migrations/`; seed: `supabase/seeds/uat.sql`.
- Test `tests/bootstrap.test.mjs` przechodzi lokalnie (ostatnio `npm test`: 17/17).
- BASE jest dla pustego schematu aplikacji; seed wymaga pustych tabel i jest jednokrotny.
- Nie używać historycznych SQL z `docs/` jako migracji produkcyjnych bez analizy.
- Instrukcja szczegółowa: `docs/auth-rollout.md`.

## 7. Jednostki

- Potwierdzone w `src/recipeScaling.js`: `g`, `ml`, `szt.`; alias `szt` → `szt.`.
- `kg` → `g` jest obsługiwane dla ilości planu w obecnym kodzie skalowania.
- `l` występuje na liście jednostek UI, ale normalizator nie obsługuje `l`.
  Konwersja `l` → `ml`: do zrobienia / do potwierdzenia, nie uznawać jej za działającą.
- Nie zgadywać jednostek ani konwertować g ↔ ml. Seed zachowuje jednostki katalogu z backupu.

## 8. Production photos

- Istnieje osobny branch `feature/production-photos` oraz lokalny ref `origin/feature/production-photos`.
- Oba lokalnie wskazują `c3129eb855821a38b64e428a7861a61416e9eeea`:
  `Add optional production photos foundation`. Bez odświeżania zdalnych refów w tym etapie.
- Branch zawiera fundament zdjęć: komponenty, helper, migrację, test i kontrakt Auth.
  Nie oznacza to ukończonego ani wdrożonego modułu; stan zdalnego wdrożenia: do potwierdzenia.
- Nie integrować teraz. Zdjęcia integrować po stabilizacji Auth.

## 9. Roadmapa ALKI

Docelowy zakres obejmuje co najmniej: Zagotówki / produkcję, magazynowanie,
zakupy / zaopatrzenie, HR, spisania / straty, raportowanie / analitykę,
Telegram bot / system powiadomień, etykiety / drukowanie oraz audyt i przebudowę UI/UX.
Szczegóły przyszłych modułów pozostają do zaprojektowania / potwierdzenia.

## 10. Zasady pracy

- DEV/feature → UAT → PROD; większe zmiany najpierw testować na UAT.
- Migracje bazy wersjonować w repo; ręczne zmiany PROD dokumentować jako migracje.
- Przed zmianami produkcyjnymi wykonać backup.
- Nie commitować sekretów ani backupów danych.
- Operacje muszą pozwalać na ponowienie albo mieć jasno opisany recovery.
- Po większym etapie aktualizować `PROJECT_CONTEXT.md` i datę checkpointu.

# 11. NEXT STEP

**Aktualnie: przegląd lokalnego POC 4-cyfrowego PIN Auth.**

Po zatwierdzeniu: konfiguracja wyłącznie UAT/Preview, migracja
`202609290001_employee_pin.sql`, wdrożenie funkcji i proxy, provisioning fikcyjnych
pracowników oraz realny test sesji i izolacji lokali. Szczegóły i bramki bezpieczeństwa:
`docs/pin-auth-uat.md`. Bez rollout Production przed osobną decyzją.

## 12. Checkpoint Orders/PIN — 2026-10-01 (nadrzędny wobec starszych checkpointów)

- Branch `feature/orders`, baza `066f924`; poprawki Orders/Pracownicy/PIN przygotowane lokalnie.
- Potwierdzona blokada PIN UAT: CORS dopuszczał tylko Preview `feature/auth`, żądanie z podanego Preview Orders otrzymało 403 przed Auth/RPC.
- Przed ograniczeniem przez operatora pracy do lokalnej ustawiono na UAT `APP_ENV=uat` i `PIN_MANAGEMENT_ORIGINS` z dokładnym istniejącym originem Orders. Funkcji/frontendów nie wdrożono, push nie wykonano. Sam zapis konfiguracji nie usuwa blokady w starej funkcji.
- Production nietknięty. Brak migracji SQL i zapisów kont/PIN/danych biznesowych.
- Od instrukcji operatora: zakaz przeglądarki/Computer Use, zalogowanych sesji Maca i dalszych operacji Vercel/Supabase; wdrożenie i hosted testy wykonuje operator.
- Instrukcja, wyniki i checklisty: `docs/orders-pin-uat-fix.md`.

## 13. Tasks checkpoint — 2026-10-02

- Branch `feature/task-management`, from local `feature/orders`; local work only.
- User authorized implementing all task phases locally, separate commits; no push,
  merge, remote migrations, UAT or PROD deploy. This authorization supersedes the
  earlier analysis-only stop for the new task module.
- Added central Tasks model, organization scope, task capabilities, append-only
  history, approvals, schedule/capacity/planning, transactional queue, nested
  critical interruptions, balancing/recommendations, reports and recurring foundation.
- New roles: owner (distinct from administrator), director, expert, specialist.
  Owner has explicit legacy admin compatibility; task-only roles cannot call production
  or Orders endpoints. Production PIN credentials and Auth identities remain unchanged.
- New UI in `src/tasks`, Ukrainian, lazy-loaded through generalized ModuleShell.
  Current month = current week + 3 weeks; weekly Mon–Thu current / Fri–Sun next.
- New migration chain `202610020001` through `202610020012`; earlier migrations untouched.
- RLS enabled with no direct client grants on new tables; public RPCs explicitly check
  identity, capabilities and scope. Private functions have no client EXECUTE.
- Graph/employee locks and task versions protect queue, critical, planning and balance.
  Periodic generator is explicit/manual, no scheduler. No AI API/UI.
- Local checks: unit suite 88 pass; full Playwright suite 51 pass, latest Tasks subset
  8 pass; Tasks PostgreSQL 111 checks; Orders after Tasks migrations 154 checks;
  PIN PostgreSQL 70; production upgrade PostgreSQL 126; existing migration/UI checks pass.
- Build passes (main bundle size advisory remains), lint clean. Hosted Auth and actual
  remote schemas remain unverified and require a separately authorized UAT phase.
- Runbooks: `docs/tasks-architecture.md`, `docs/tasks-rollout.md`,
  `docs/tasks-implementation-report.md`. Before any remote operation verify the target
  project-ref again; do not treat old recorded environment checkpoints as current state.

## 14. AUDYT MVP — checkpoint 2026-10-13

- Osobny lokalny checkout, gałąź `codex/audyt-mvp`; bez push, zdalnych migracji i wdrożeń.
- Pełny moduł AUDYT: wspólne wzory, snapshoty pytań, autosave, historia, Score, prywatne zdjęcia i ochrona autora/wersji/ukończonych danych.
- Nowa migracja `202610130001_audit.sql` oraz obowiązkowy osobny krok `supabase/storage/audit-photo-policies.sql`. Istniejące konta i lokale, bez nowych ról.
- Testy: 153 jednostkowe/bazy, 5 Playwright AUDYT, 74 regresyjne przeglądarkowe — pozytywne. Kompilacja UAT i lint pozytywne; bez hosted Auth/Storage i fizycznego aparatu.
- Instrukcja uruchomienia, szczegóły bezpieczeństwa, limity zdjęć i zakres pozostałej akceptacji UAT: `docs/audit-mvp.md`.


## 15. Orders Delete — checkpoint 2026-10-21

- Production `ssheqxdgsmndiutthxvd`: additive `upgrades/production/09_orders_delete.sql` committed after encrypted backup, full isolated restore and catalog/count verification (65 tables).
- Soft delete RPCs `order_delete` / `orders_delete_bulk`, capability `orders.delete` restricted to administrator/manager plus location enforcement; audit/history retained. Pending callbacks cancelled, outstanding leases reject deletion. Archived work does not strand Orders/Worktime shifts.
- Release `orders_delete_v1`; Production synthetic smoke PASS, fixture writes rolled back, customer Orders/callback data unchanged.
- Frontend ready on `codex/orders-delete-production` in isolated local checkout. Push/PR awaiting explicit operator approval required by automatic approval review; no new frontend deployment yet.
- Runbook and verification: `docs/orders-delete-production.md`.

## 16. Orders operational role access — 2026-10-26

- Production `ssheqxdgsmndiutthxvd`: `orders_role_access_v1` applied. Operator explicitly expanded initial access-only scope to claiming, status progression and issue.
- su-chef, shift-manager, sushi-master and crafter receive only `orders.access`, `orders.work`, `orders.cut`, `orders.issue`. Delete stays administrator/manager only; other grants and location scope unchanged.
- Six-role transactional Production smoke PASS; workflow/API/delete/callback/Worktime functions and RLS unchanged. Three explicitly requested persistent test orders: 695–697 in SB_Wroclaw, NEW, no integration SBID/callback. Admin/manager dispatches them using the existing action.
- Minimal frontend module-gate change on `codex/orders-role-access`; PR/checks/operator merge approval required before Production frontend rollout.
- Details: `docs/orders-role-access-production.md`.


## 17. Work module update — checkpoint 2026-11-12

- Branch `feature/claude-refactoring`, local only: no push, no remote migration, no UAT/PROD operation.
- Migration `202611110001_work_hierarchy.sql` (additive): soft delete, attachment removal metadata,
  `Task_notifications`, direct-child completion guard, `set_parent`/`delete`/`attachment_remove`/notification
  commands, `update` with `deadline_at`, hierarchy-aware `tasks_list(jsonb)`, richer `tasks_details`,
  `tasks_parent_candidates`, `tasks_notifications(_unread)`.
- Frontend: compact header + sidebar shell (`src/tasks/shell`), shared UI primitives (`src/ui`), ClickUp-style
  nested task list, wide create form, task workspace with subtasks/attachments/activity, notification centre.
  Reports/Schedule hidden (code kept, see `docs/work-module-decisions.md` У-006).
- Docs: `docs/work-module-audit.md`, `docs/work-module-requirements-matrix.md`, `docs/work-module-decisions.md`,
  `docs/work-module-rollout.md`.
- Checks (2026-11-12, local): `npm run lint` clean; `npm test` 184/184 (PGlite migration chain + unit);
  `vite build --mode uat` OK; `npx playwright test` 228 passed, 6 skipped (Reports/Schedule, TODO У-006),
  1 failed = `tasks-admin.spec.js` «diagram target drag … 375», which fails identically on `HEAD` (D-17).
  Docker-based suites and hosted UAT acceptance were NOT run.
- Popover/menu/bell triggers are real `<button aria-expanded>` elements (D-18); the plan form opens by default
  for unplanned tasks (D-19). Browser specs no longer write screenshots for the shell suite.
- 2026-11-12 isolation pass: Tasks has its own UI library in `src/tasks/components/ui/` (`Tasks*` components,
  `tasks-ui.css`, `tk-` classes, `--tk-*` tokens). Global `src/ui` and `src/i18n` LanguageSwitcher are unchanged and
  not imported by Tasks; a unit test guards this. Language switching lives in the Tasks header only (D-20). Header
  has a visible «Модулі» button (D-22); `?task=<id>` deep links open a task (D-23). Checks: lint clean, 186/186 unit,
  build OK, browser 229 passed / 6 skipped / 1 pre-existing failure (D-17).

- 2026-11-12 finalisation: migration `202611120001_work_finalize.sql` (legacy .doc/.xls allowed, server-side
  attachment type/size checks, no notification for an unchanged assignee). Agreed policies: deletion D-26,
  reassignment notifications D-27. Legacy Tasks screens now use the Tasks UI library (D-29). New tests:
  `tests/work-finalize.test.mjs`, deep-link / module-navigation / disabled-sections / attachment / visual-audit
  browser tests in `tasks-shell.spec.js`. Checks: lint 0, Node 189/189 (+4/4 finalize), build OK, browser 236
  passed / 6 skipped / 1 pre-existing failure (D-31, fails identically on `adf7936`).
  UAT migration NOT run: no Supabase CLI, access token or UAT DB credentials here; backup unconfirmable
  (`docs/work-module-rollout.md` §6). Repo `.env` points at the PROD ref — do not use it for UAT checks.
- 2026-11-12 final local verification: full Tasks redesign (D-33 … D-41). Approved: default list view «Всі завдання»
  (no `view` default), DOC/DOCX/XLS/XLSX with 20 MiB limit plus server-side name/type check (migration
  `202611120002`), bulk delete (single-task delete per row, parents excluded, result message). Checks: lint 0, Node 190/190,
  build OK, browser 237 passed / 6 skipped / 1 pre-existing failure (D-31). UAT migration and hosted acceptance NOT run
  (blocked; rollout §6, §8). The configured Supabase project (PROD ref) holds test data per the operator.

