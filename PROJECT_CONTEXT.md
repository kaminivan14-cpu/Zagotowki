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
