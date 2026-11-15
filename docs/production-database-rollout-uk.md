# Production: аналіз розбіжностей бази даних і порядок оновлення

Дата: 2026-11-15. Production (`ssheqxdgsmndiutthxvd`, «First Zagotowki») **не змінювався**. Усі
висновки нижче мають позначку джерела:

| Позначка | Значення |
|---|---|
| VERIFIED IN PROD | підтверджено на самому Production: анонімні read-only запити (лише коди помилок, без даних) або результат, який надіслав оператор |
| VERIFIED IN UAT | те саме для UAT `meuzkduxttjcuiynsnaa` |
| VERIFIED IN CODE | перевірено в коді / SQL репозиторію та локальними тестами (PGlite, повний ланцюг міграцій) |
| INFERRED | випливає з документації релізів (`docs/releases/*`, `docs/manager-email-auth.md` тощо), але на базі не перевірено |
| UNKNOWN | без доступу до SQL Editor Production встановити неможливо |

Повний звіт: `docs/production-gap-and-employee-report-uk.md`.

---

## 1. Що вже відомо про Production

| Факт | Статус | Доказ |
|---|---|---|
| У Production **немає** таблиці `supabase_migrations.schema_migrations` | VERIFIED IN PROD | помилка оператора `42P01 relation "supabase_migrations.schema_migrations" does not exist` (2026-11-15) |
| Зміни Production записуються в приватний журнал `app_private.production_module_releases` | INFERRED | `docs/full-uat-prod-release.md`, `docs/releases/shift-functions-release.md`, `upgrades/production/08_invitation_backend.sql` |
| Усі 156 публічних функцій, таблиць і колонок, які створюють міграції репозиторію і які видно анонімному ключу, присутні, **крім** `public.tasks_storage_select(text)` | VERIFIED IN PROD | повне зондування 2026-11-15 (rollout §9, англ.) |
| Міграція `202611140001_attachment_storage_read` **не застосована** | VERIFIED IN PROD | `tasks_storage_select` → PGRST202 |
| Політики читання `tasks_file_select` з точною назвою **немає**; bucket `tasks-private` є, приватний, 20 МіБ, 0 об’єктів | VERIFIED IN PROD | `prod_preflight.sql` P4, 2026-11-15 |
| Чи існує політика читання / завантаження під назвою з суфіксом Dashboard | UNKNOWN | P4 (оновлений) або `prod_policy_inventory.sql` R5 |
| Об’єкти `202611110001_work_hierarchy` (ієрархія, сповіщення, м’яке видалення) присутні | VERIFIED IN PROD | `tasks_notifications_unread`, `Tasks.deleted_at`, `Task_notifications` → 42501 |
| `202611120001`, `202611120002` застосовані | VERIFIED IN PROD | `prod_preflight.sql` P4: маркери в `task_result_command` присутні |
| Довідкові дані: 11 ролей з дозволами; `tasks.access` — administrator, director, expert, manager, owner, specialist; `tasks.admin` — лише administrator; `orders.test.generate` — 0; 7 активних відділів (є `production`); 4 активні локації; 12 категорій; 8 шаблонів процесів; buckets audit-photos, employee-avatars, tasks-private | VERIFIED IN PROD | `prod_reference_data_inventory.sql` D9 |
| Гранти, тригери, індекси, тіла інших функцій | UNKNOWN | `prod_gap_analysis.sql` |
| 9 активних працівників мають `tasks.access` за роллю; 0 файлів у `tasks-private` | VERIFIED IN PROD | P4 |
| Схема OpenAPI для анонімного ключа | VERIFIED IN PROD | «Secret API key required» — інших відомостей без SQL Editor не отримати |

### Відомі релізи Production (INFERRED з документації)

`orders_tasks_v1` (Orders + Tasks + Admin/Processes, одна транзакція), `employee_invitation_v1`
(08), `order_ingest_v1`, `order_location_routing_v1`, `organization_processes_uat_v2`,
`full_uat_audit_20261013`, `full_uat_schedules_20261015`, `orders_delete_v1` (09),
`orders_role_access_v1` (10), `work_module_access_v1` (11), `pr14_positions_tasks_v1`
(`202610260001` + `202610260002`), реліз shift functions (`202610280001`) та реліз
`202611110001` (назва невідома). Точний перелік дає H1 у `prod_migration_history.sql`.

## 2. UAT і Production — різниця (VERIFIED IN UAT / VERIFIED IN PROD, анонімне зондування 2026-11-15)

UAT **не є еталоном**: еталоном є репозиторій і вимоги, а UAT — середовище для порівняння.

| Міграція | Репозиторій | UAT | Production | Висновок |
|---|---|---|---|---|
| 31 міграція від `202609230001_auth` до `202611110001_work_hierarchy` | є | об’єкти є | об’єкти є | без різниці за видимими об’єктами |
| `202610070001_manager_email_auth` | є | **немає** | є (через `upgrades/production/08`) | на UAT не працює запрошення e-mail (`EmailInvite`) |
| `202610100001_order_ingest`, `202610100002_order_location_routing` | є | немає (лише для PROD) | є | очікувано |
| `202610260001_employee_positions` | є | **немає** | є | на UAT немає поля «Посада» |
| `202610280001_shift_functions` | є | **немає** | є | на UAT немає функцій зміни |
| `202611140001_attachment_storage_read` + політика | є | є | **немає** | на PROD вилучене вкладення доступне автору через Storage |
| Історія CLI | — | є, не синхронізована (D-54) | **таблиці немає** | на PROD — лише журнал релізів |

## 3. Чому Production відрізняється від ланцюга міграцій

Production не будувався з `supabase/migrations`. Він пройшов власний шлях
(`docs/production-release-readiness.md`): legacy PREPARE / PROVISION / CUTOVER
(`upgrades/production/01–03`), потім маніфест `orders_tasks_v1` (05 → міграції
`202610010003…202610060001` → 06) і окремі релізи. Тому:

| Міграція репозиторію | На Production | Статус |
|---|---|---|
| `202609220001_base`, `202609230001_auth`, `202609230002_auth_production`, `202609290001_employee_pin`, `202609300001_employee_archive` | замінені legacy-шляхом 01–03 | **НЕ запускати** |
| `202610010001_roles_modules` | замінена `upgrades/production/05_orders_roles.sql` | **НЕ запускати** |
| `202610010002_crafter` | заборонена (автоматична зміна ролей) | **НЕ запускати** |
| `202610030002_orders_uat_generator` | лише UAT | **НЕ запускати** |
| `202610060002_new_menu_process` | приклад-шаблон процесу, пропущено | **НЕ запускати** |
| `202610070001_manager_email_auth` | замінена `upgrades/production/08_invitation_backend.sql` | **НЕ запускати** |

Очікувані, а не помилкові, відмінності Production (позначені в `prod_gap_analysis.sql`):

* `06_release_policy.sql` видаляє дозволи `orders.*`, `tasks.*`, `processes.*`, `dictionaries.*` для всіх
  ролей, крім `administrator` і `manager`, та `orders.test.generate` для всіх; змінює `has_permission`,
  `auth_capabilities`, `orders_actor`.
* `10_orders_role_access.sql` повертає `orders.access/work/cut/issue` для su-chef, shift-manager,
  sushi-master, crafter.
* `11_work_module_access.sql` дає `tasks.access` ролям owner, director, expert, specialist (лише вхід до
  модуля «Робота»; інші `tasks.*` для них на PROD фільтруються).
* Тригер `employees_role_alias` (перетворення `employee` → `crafter`) на PROD **не повинен** існувати.
* Функції, які визначають або латають скрипти `upgrades/production/*` (наприклад `auth_save_employee`,
  `auth_list_employees`, `auth_employee_profile`, `pin_*`, `orders_command`, `worktime_command`), можуть мати
  інші тіла. Їх ніколи не перезаписують міграцією репозиторію без ручного порівняння.

## 4. Пакет SQL `supabase/upgrades/prod/` (усі файли — ЛИШЕ ЧИТАННЯ)

Жоден файл пакета не містить запису. Тест `tests/prod-inventory.test.mjs` перевіряє це, а також що
згенеровані блоки актуальні. Очікувані дані («як у репозиторії») генерує
`node scripts/generate-prod-inventory.mjs`: скрипт прокручує всі міграції в чистій локальній PostgreSQL
(PGlite, без мережі) і записує каталог у файли.

| # | Файл | Що показує | Як запускати |
|---|---|---|---|
| 1 | `prod_preflight.sql` | ідентичність бази, сесії/блокування, розмір таблиць, P4 — готовність відомих змін | P1 окремо, далі весь файл |
| 2 | `prod_migration_history.sql` | H1 журнал релізів, H2 стан legacy-upgrade, H3 історія CLI, **H4 — статус кожної міграції за доказами схеми** | весь файл (результат H4) |
| 3 | `prod_gap_analysis.sql` | **усі відмінності** від репозиторію: таблиці, колонки, типи, defaults, обмеження, FK, індекси, тригери, функції (md5 тіла, SECURITY DEFINER, search_path, тип результату), гранти EXECUTE, RLS-політики, гранти таблиць, buckets, політики Storage, `role_permissions`; кожен рядок — з потрібною дією | весь файл |
| 4 | `prod_schema_inventory.sql` | перелік таблиць, колонок, обмежень, індексів, тригерів, view | по розділах |
| 5 | `prod_function_inventory.sql` | усі функції з атрибутами й md5; F3 — ризики (SECURITY DEFINER без search_path, виклик для anon) | весь файл / по розділах |
| 6 | `prod_policy_inventory.sql` | RLS, політики, гранти таблиць, buckets, політики Storage; R6 — ризики | весь файл / по розділах |
| 7 | `prod_employee_inventory.sql` | модель працівників, статуси, зв’язок з Auth (без e-mail), посади, ролі, відділи, локації, підпорядкування, запрошення, PIN (лише кількість), RPC | весь файл (E17) / по розділах |
| 8 | `prod_reference_data_inventory.sql` | матриця ролей і дозволів, відділи, локації, категорії, налаштування, процеси, buckets, журнал | весь файл (D9) |
| 9 | `prod_postflight.sql` | після затвердженої зміни: кожен застосований файл присутній повністю + перевірки Storage і доступів | весь файл, усі рядки OK |
| 10 | `prod_acceptance_checks.sql` | перевірки від імені користувачів (симуляція JWT у транзакції): список задач, ієрархія, сповіщення, вкладення | весь файл |

Файли, які містять **зміни** (міграції), — це лише файли з розділу 5 (група A/C). У пакеті `prod/` їх немає.

## 5. Інвентар файлів для Production

### A. Обов’язкові SQL-міграції

| Порядок | Файл | Призначення | Потрібен на PROD | Залежність | Ризик | Спосіб |
|---|---|---|---|---|---|---|
| 1 | `supabase/migrations/202611120001_work_finalize.sql` | серверна перевірка типу й розміру вкладення; без сповіщення при незмінному виконавці | **ні — вже застосовано** (VERIFIED IN PROD) | `202611110001` | — | — |
| 2 | `supabase/migrations/202611120002_attachment_name_type.sql` | розширення імені файлу має відповідати типу | **ні — вже застосовано** (VERIFIED IN PROD) | 1 | — | — |
| 3 | `supabase/migrations/202611140001_attachment_storage_read.sql` | функція `tasks_storage_select` — правило читання Storage = правило застосунку | **так** (VERIFIED IN PROD: відсутня) | `202611110001` (`task_file_read`) | низький: нова функція, власна транзакція, guard | SQL Editor |

### B. Додаткові upgrade-скрипти

Немає нових. Скрипти `supabase/upgrades/production/01–11` **уже виконані** (INFERRED) і повторно
**не запускаються**. `upgrades/uat/*` — лише для UAT (файли пре-/пост-флайту можна запускати на PROD
як читання, але для PROD призначений пакет `upgrades/prod/`).

### C. Скрипти політик Storage

Вибір скрипта залежить від того, що покаже P4 (рядки 7) / `prod_policy_inventory.sql` R5:

| Стан політик `tasks-private` на PROD | Файл після кроку 3 | Наслідок зараз |
|---|---|---|
| немає ні читання, ні завантаження | `supabase/storage/tasks-private-policies.sql` (створює обидві) | вкладення Роботи на PROD **не працюють**: завантаження й відкриття відмовляються; вразливості D-47 немає |
| є лише завантаження `tasks_file_insert` | **не** запускати жоден файл як є (створення `tasks_file_insert` впаде й відкотить транзакцію); потрібен окремий перевірений скрипт лише з `CREATE POLICY tasks_file_select …` з файлу вище | файли можна завантажити, але не відкрити |
| є обидві під точними назвами, старе правило | `supabase/storage/tasks-private-policies-202611140001.sql` | вразливість D-47 відкрита |
| є під назвами з суфіксом Dashboard | жоден скрипт без адаптації (вони шукають точні назви); окреме рішення | залежить від правила |

Станом на P4 2026-11-15 політики з точною назвою `tasks_file_select` немає (VERIFIED IN PROD), тож
`tasks-private-policies-202611140001.sql` зупинився б з «STOP: policy tasks_file_select not found».
`audit-photo-policies.sql`, `employee-avatar-policies.sql` — лише якщо `prod_gap_analysis.sql` покаже їх відсутність.

### D. Довідкові дані

Нових обов’язкових даних немає. `supabase/seeds/production/order-location-routing.sql` уже
застосовано (INFERRED). **НЕ розгортати**: `supabase/seeds/uat.sql`, `supabase/seeds/orders-uat.sql`,
`scripts/orders-uat-seed.mjs`, `scripts/tasks-workspace-uat.mjs`, `tests/fixtures/*` — тестові дані UAT.
Відділи, локації, посади, підпорядкування, категорії мають бізнес-власника (керівництво компанії) і
вводяться через застосунок (`docs/employee-provisioning-runbook-uk.md`), а не копіюються з UAT.

### E. Frontend, що залежить від змін БД

* Нічого з фронтенду не викликає `tasks_storage_select` напряму — функцію використовує політика Storage.
  Тому міграцію 3 і скрипт 4 можна застосувати **до** будь-якого деплою фронтенду.
* `src/tasks/attachments/*` і `TaskWorkspace` працюють з будь-яким станом 1–2 (сервер лише суворіше
  перевіряє файл).
* Поточна гілка фронтенду (`feature/claude-refactoring`) покладається на `202611110001` (є на PROD).
  Деплой фронтенду — окреме рішення (PR → перевірки → merge → Vercel Production), не частина цього плану.

### F. Edge Functions

Змін немає. `invite-employee`, `manage-employee-pin`, `pin-login`, `order-ingest`, `sync-products`
не змінювались і **не** розгортаються в межах цього оновлення.

### G. Середовище та Auth

* Локальний `.env` зараз вказує на **Production** (змінено 2026-11-15). Будь-який локальний запуск
  застосунку працює з реальними даними Production. Для тестів поверніть UAT.
* Auth Site URL / redirect `https://zagotowki.vercel.app/?auth=password` — без змін (`docs/manager-email-auth.md`).

### H. Документація та інструкції

Цей документ; `docs/work-module-rollout.md` §9–§11; `docs/work-module-uat-sql-editor.md` (той самий
спосіб виконання файлів у SQL Editor); `docs/production-release-readiness.md` (резервна копія).

## 6. Порядок і залежності

```
202611110001_work_hierarchy (вже є на PROD)
   ├── 202611120001_work_finalize ── 202611120002_attachment_name_type      (вже на PROD)
   └── 202611140001_attachment_storage_read ── скрипт політик за таблицею 5 C
```

* `202611140001` перевіряє наявність `app_private.task_file_read` (з `202611110001`) і відсутність самої себе.
* Скрипт політики перевіряє наявність функції з кроку 3, наявність політики та її **точний** жовтневий
  вираз; інакше зупиняється.
* `202611120001` / `202611120002` мають drift-guard на очікуване тіло `task_result_command` /
  `task_notify`; на PROD ці функції не латаються скриптами `upgrades/production` (не входять до списку
  `prod_specific`), тому guard очікувано пройде, якщо зміни ще не застосовані.
* Старі міграції без зв’язку з цим оновленням не застосовуються. Якщо `prod_migration_history.sql` H4
  покаже інший `NOT APPLIED` / `PARTIALLY APPLIED` (не позначений «PROD: do not run»), його розглядають
  **окремо**, з власним планом — не «заодно».

## 7. Безпека кожного кроку

| Крок | Змінює дані | Backfill | Блокування | Тривалість | Транзакція | Повторний запуск | Відкат |
|---|---|---|---|---|---|---|---|
| 1 `202611120001` | ні (лише тіла 2 функцій) | ні | коротке на функції | секунди | один запуск SQL Editor = одна транзакція | зупиниться з `SCHEMA_DRIFT` без змін | попередні тіла функцій (зберегти `pg_get_functiondef` до кроку) або forward-fix; повне відновлення БД не потрібне |
| 2 `202611120002` | ні | ні | коротке | секунди | так | `SCHEMA_DRIFT` без змін | те саме |
| 3 `202611140001` | ні (нова функція + гранти) | ні | немає на таблицях | секунди | `BEGIN … COMMIT` у файлі | `SCHEMA_DRIFT tasks_storage_select` без змін | `DROP FUNCTION public.tasks_storage_select(text)` **лише після** відкату кроку 4 |
| 4 політика | ні (лише вираз політики) | ні | коротке на `storage.objects` | секунди | `BEGIN … COMMIT` | зупиниться (вираз уже інший) | вираз USING «до» записаний у заголовку файлу |
| Журнал | так: 1 рядок у `production_module_releases` | ні | ні | миттєво | окремий запуск | первинний ключ не дасть повтору | рядок журналу не видаляють |

Привілеї: роль `postgres` у Dashboard → SQL Editor проєкту **First Zagotowki**. Анонімний ключ
не використовується. Відкат через відновлення повної копії бази — **лише** для катастрофи: він знищить
нові замовлення й задачі після копії (`docs/production-release-readiness.md`).

## 8. Інструкція для оператора (SQL Editor)

1. **Ціль.** Dashboard → проєкт **First Zagotowki**, ref `ssheqxdgsmndiutthxvd`. Запустіть
   `prod_preflight.sql` P1 («Run selected»): `has_release_journal = true`, `has_cli_history = false`,
   кількість працівників/замовлень відповідає Production.
2. **Резервна копія.** Свіжа зашифрована копія за `docs/production-release-readiness.md` (pg_dump + age,
   перевірене відновлення). Без неї — STOP.
3. **Пре-флайт.** Увесь `prod_preflight.sql` → P4. Збережіть результат.
4. **Історія.** Увесь `prod_migration_history.sql` → H4; окремо H1. Надішліть розробнику.
5. **Розбіжності.** Увесь `prod_gap_analysis.sql`. Рядки з дією «Apply …» або «Review» — предмет
   рішення; «EXPECTED ON PROD» і «Keep» — норма.
6. **Інвентар** (за потреби): `prod_employee_inventory.sql`, `prod_reference_data_inventory.sql`,
   `prod_policy_inventory.sql`, `prod_function_inventory.sql`.
7. **Затвердження.** Розробник отримує результати 3–6 і окремо **письмово** затверджує перелік файлів
   розділу 5. Без затвердження — нічого не виконувати.
8. **Збереження «до».** Перед кожним кроком, що латає функцію:
   `SELECT pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure);`
   і `SELECT pg_get_functiondef('app_private.task_notify(bigint,"Tasks",bigint,text,jsonb)'::regprocedure);`
   — зберегти текст у захищеному місці.
9. **Застосування.** Кожен затверджений файл — у **новій** порожній вкладці, увесь файл, «Run». Помилка
   `SCHEMA_DRIFT` або `STOP` = зупинитися, нічого не «виправляти» вручну.
10. **Журнал релізу** (ЗАПИС, окремий запуск, після успішних кроків; залиште в масиві лише виконані файли):

    ```sql
    INSERT INTO app_private.production_module_releases(release, manifest) VALUES ('work_attachments_v1',
      jsonb_build_object('scope', 'Work attachments: Storage read rule for task files (D-47)',
        'files', jsonb_build_array(
          jsonb_build_object('file', 'migrations/202611140001_attachment_storage_read.sql', 'sha256', '0e47a50e111d43d35dc5f770c6ede8bebf912196fd49dfb523f520d401103b4b'),
          jsonb_build_object('file', 'storage/<файл політик за таблицею 5 C>', 'sha256', '<shasum -a 256 цього файлу>'))));
    ```

    Хеш `202611140001` — для файлу в репозиторії на 2026-11-15. Для файлу політик підставте назву й SHA-256 того скрипта, який фактично виконано (`tasks-private-policies.sql`: `4c9ed9cf8f9c34a0a6f31813fae8ee44cf6b31b2a56d8580631b0a539d4a5031`; `tasks-private-policies-202611140001.sql`: `5a7dcde86a4a6704058c674f4e21586d9d0d60581de729aecebfea4e2ba9a81a`). Рядок без підстановки не виконувати.
11. **Пост-флайт.** Увесь `prod_postflight.sql` (за потреби відредагуйте список `targets`): кожен рядок OK.
    Потім знову `prod_gap_analysis.sql`: лишаються тільки «expected on PROD» і «keep».
12. **Приймання.** `prod_acceptance_checks.sql`; ручна перевірка зі справжніми файлами —
    `docs/work-module-uat-acceptance-guide.md` §3 (на PROD — лише за окремим рішенням і з тестовим файлом,
    який потім вилучається через застосунок).

**Ніколи на Production:** `supabase db push`, `supabase migration repair` (таблиці історії немає — CLI
вважатиме всі міграції новими), запуск файлів із розділу 3 «НЕ запускати», копіювання даних UAT.

## 9. Синхронізація історії міграцій

Production не має історії CLI і не повинен її отримати «заднім числом»: вигаданий запис про `202609220001_base`
та інші замінені міграції був би хибним. Джерело правди — журнал `app_private.production_module_releases`
плюс докази схеми (`prod_migration_history.sql` H4). Кожне нове оновлення записується одним рядком журналу
(крок 10) з назвами файлів і SHA-256.

## 10. Перевірка RLS і Storage після оновлення

* `prod_postflight.sql` рядки 2–7: функція лише для `authenticated`; політика `tasks_file_select` з
  `tasks_storage_select(name)`; `tasks_file_insert` без змін; bucket приватний; немає політик для `anon`;
  `Task_notifications` недоступна напряму.
* `prod_policy_inventory.sql` R6 — порожній або лише відомі пункти (прямий `SELECT` для `authenticated` на
  `Locations`, `Plans`, `Plan_items`, `Products`, `Recipe_ingredients` — так у репозиторії).

## 11. Критерії приймання Production

1. `prod_postflight.sql`: усі рядки OK.
2. `prod_gap_analysis.sql`: немає рядків «MISSING IN DATABASE» / «OUTDATED» / «Review» для затверджених файлів.
3. Журнал має новий рядок з SHA-256.
4. Автор вилученого вкладення отримує відмову через Storage API (`docs/work-module-uat-acceptance-guide.md` §3, крок 8).
5. Застосунок: список задач, робоче місце задачі, вкладення, сповіщення працюють для адміністратора й
   звичайного працівника (без помилок у консолі).

## 12. Невідомі й блокери

| Невідоме | Як закрити |
|---|---|
| Чи застосовані `202611120001` / `202611120002` | `prod_migration_history.sql` H4 |
| Тіла функцій, що латали скрипти PROD | `prod_gap_analysis.sql`, рядки `function` з позначкою `upgrades/production` |
| Bucket і політики Storage | `prod_policy_inventory.sql` R4–R6 |
| Структура організації, працівники без входу | `prod_employee_inventory.sql` E4, E13, E17 |
| Свіжа резервна копія | оператор, крок 2 |

Статус: **не готово до Production-оновлення без результатів пакета `upgrades/prod/`**. Підтверджено потрібна
зміна — `202611140001` + політики Storage за таблицею 5 C (точний стан політик ще треба побачити в R5).
