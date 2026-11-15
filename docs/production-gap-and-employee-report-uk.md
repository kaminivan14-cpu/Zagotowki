# Підсумковий звіт: розбіжності Production і керування працівниками

Дата: 2026-11-15. Гілка `feature/claude-refactoring`. **Production не змінювався; коміти, staging і push не
виконувались.**

Позначки: VERIFIED IN CODE · VERIFIED IN UAT · VERIFIED IN PROD · PARTIALLY VERIFIED · BLOCKED · INFERRED ·
NOT IMPLEMENTED · UNKNOWN (значення — `docs/production-database-rollout-uk.md`, вступ).

Докладно: `docs/production-database-rollout-uk.md` (Production), `docs/employee-management-business-logic-uk.md`
(бізнес-логіка), `docs/employee-data-dictionary-uk.md` (словник), `docs/employee-provisioning-runbook-uk.md`
(інструкції), `docs/work-module-requirements-matrix.md` (вимоги task.docx / plan.md).

---

## A. Відповідність вимогам проєкту

`task.docx` і `plan.md` описують оновлення модуля «Робота». Матриця вимог (`docs/work-module-requirements-matrix.md`):

| Показник | Кількість |
|---|---|
| Вимог | 175 |
| VERIFIED | 49 |
| PARTIALLY VERIFIED | 115 |
| NOT IMPLEMENTED | 4 (вимірювання продуктивності, observability, відповіді на коментарі D-49, перевірка вмісту файлів) |
| FAILED | 0 |
| BLOCKED | 2 (UAT-чеклист, хост-приймання 20 сценаріїв) |
| NOT TESTED | 5 |

Керування працівниками в цих документах окремих вимог не має; воно описане з коду (розділи H–O).

## B. Покриття модулів репозиторію

| Модуль | Код / локальні тести | UAT | Production |
|---|---|---|---|
| Робота: список задач, ієрархія, робоче місце, вкладення, сповіщення | VERIFIED IN CODE (200 Node-тестів, 242 браузерних) | об’єкти є (VERIFIED IN UAT); автентифіковане приймання — BLOCKED | об’єкти `202611110001` є; `202611140001` немає (VERIFIED IN PROD) |
| Працівники, вхід, запрошення, PIN | VERIFIED IN CODE | `202610070001` **відсутня** — запрошення e-mail не працює (VERIFIED IN UAT) | через `upgrades/production/08` (VERIFIED IN PROD: RPC є) |
| Оргструктура, доступи | VERIFIED IN CODE | є | є |
| Посади (PR14) | VERIFIED IN CODE | **відсутня** `202610260001` | є |
| Orders, ingest, маршрутизація | VERIFIED IN CODE | ingest — лише PROD | є |
| Worktime, функції зміни | VERIFIED IN CODE | **відсутня** `202610280001` | є |
| Audit, процеси, графіки | VERIFIED IN CODE | є | є |
| Звіти / Графік Роботи | приховано (У-006) | — | — |

## C. UAT ↔ Production (анонімне зондування 156 об’єктів, 2026-11-15)

| Міграція | UAT | Production |
|---|---|---|
| 31 міграція (auth … work_hierarchy) | є | є |
| `202610070001_manager_email_auth` | **немає** | є (через 08) |
| `202610100001/2` order ingest | немає (лише PROD) | є |
| `202610260001_employee_positions`, `202610280001_shift_functions` | **немає** | є |
| `202611140001_attachment_storage_read` | є | **немає** |
| Історія CLI | є, не синхронізована | **таблиці немає** (VERIFIED IN PROD) |

## D. Точні відмінності Production

* **VERIFIED IN PROD** (анонімне зондування + `prod_preflight.sql` P4 і `prod_reference_data_inventory.sql` D9 від оператора):
  відсутня `public.tasks_storage_select(text)`; відсутня історія CLI; `202611110001`, `202611120001`, `202611120002`
  застосовані; bucket `tasks-private` є (приватний, 20 МіБ, 0 об’єктів); політики читання з точною назвою
  `tasks_file_select` **немає**; `role_permissions` відповідають 06/10/11 (`tasks.admin` — лише administrator,
  `orders.test.generate` — 0); 7 відділів, 4 локації, 12 категорій, 8 шаблонів процесів, 3 buckets.
* **Наслідок:** якщо політики читання справді немає (а не лише назва з суфіксом), вкладення Роботи на PROD не
  відкриваються взагалі, а вразливості D-47 немає. Точно покаже `prod_policy_inventory.sql` R5.
* **INFERRED:** тригер `employees_role_alias` відсутній навмисно (06).
* **UNKNOWN:** політика завантаження, гранти, тригери, індекси, тіла інших функцій — `prod_gap_analysis.sql`.

## E. SQL-файли для Production

| Файл | Тип | Потрібен |
|---|---|---|
| `supabase/upgrades/prod/prod_*.sql` (10 файлів) | ЛИШЕ ЧИТАННЯ | так — для аналізу й перевірки |
| `supabase/migrations/202611120001_work_finalize.sql`, `202611120002_attachment_name_type.sql` | — | ні, вже застосовано (VERIFIED IN PROD) |
| `supabase/migrations/202611140001_attachment_storage_read.sql` | зміна | **так** |
| скрипт політик `tasks-private` | зміна | **так**; який саме — за станом R5 (`tasks-private-policies.sql`, якщо політик немає; `…-202611140001.sql`, якщо є старі з точними назвами) |
| запис у журнал релізів | зміна (1 рядок) | так, після успіху |
| міграції `202609*`, `202610010001/2`, `202610030002`, `202610060002`, `202610070001` | — | **НЕ запускати** |
| `seeds/uat.sql`, `seeds/orders-uat.sql`, UAT-скрипти, фікстури тестів | — | **НЕ запускати** |

## F. Порядок і залежності

`202611110001`, `202611120001`, `202611120002` (є) → `202611140001` → скрипт політик за R5
→ журнал → `prod_postflight.sql` → `prod_gap_analysis.sql` → `prod_acceptance_checks.sql`. Кожен файл має
drift-guard і зупиняється без змін при невідповідності. Фронтенд від цих змін не залежить; деплой фронтенду —
окреме рішення.

## G. Відсутні функції, таблиці, індекси, тригери, політики

| Об’єкт | Статус |
|---|---|
| функція `public.tasks_storage_select(text)` | відсутня — VERIFIED IN PROD |
| політика `storage.objects.tasks_file_select` | з точною назвою відсутня — VERIFIED IN PROD; назва з суфіксом — UNKNOWN |
| таблиці / колонки, видимі анонімному ключу | усі є — VERIFIED IN PROD |
| індекси, тригери, обмеження, приватні функції, гранти, bucket | UNKNOWN → `prod_gap_analysis.sql` |

## H. Архітектура даних працівника

`auth.users` ↔ `Employees.auth_user_id` (UNIQUE, FK RESTRICT) → `role` → `app_private.role_permissions`;
`location_id` → `Locations`; `department_id` / `production_role`; `position`; підпорядкування через
`Employee_reporting_lines` або версії `organization_structure_*`. Доступ лише через RPC `SECURITY DEFINER`.
13 колонок `Employees`, 12 обмежень, 4 індекси, 3 тригери — VERIFIED IN CODE (словник даних).

## I. Посади, ролі, виробничі ролі

Права дає **лише** `role` (11 значень). Посада — текст для процесів; виробнича роль — опис у відділі
«Виробничий»; функція зміни — стан зміни в Orders. Production звужує дозволи (06/10/11) — INFERRED.

## J. Статуси й життєвий цикл

Активний / неактивний / архівний; з входом / без; запрошений (`pending` → `linked`). Архівування нічого не
видаляє, архівний завжди неактивний, відновлення повертає неактивним. Захист останнього активного
адміністратора. VERIFIED IN CODE.

## K. Створення працівника

Запис працівника — одна транзакція (`auth_save_employee` або `tasks_command('admin_employee_save')` з аудитом).
Auth-акаунт **не** створюється автоматично: e-mail — запрошенням (`invite-employee`, 3 окремі кроки), PIN —
`manage-employee-pin`. Публічної реєстрації немає. VERIFIED IN CODE.

**Дефект (VERIFIED IN CODE, відтворено локально):** за наявності версії оргструктури створення в адмін-панелі з
«Відділ» або «Керівник» завершується `ORG_USE_VERSION`, працівник не створюється. Обхід — у runbook §1. Рішення
щодо виправлення — продуктове.

## L. Автентифікація й зв’язок

`auth.uid()` → `Employees.auth_user_id` → `actor()` / `auth_employee_profile()`; браузер додатково перевіряє
активність, архів, роль і локацію. «Brak dostępu. Konto musi być połączone z aktywnym pracownikiem…» =
немає валідного активного працівника для акаунта (6 причин — бізнес-логіка §7). Розв’язування акаунта в UI
NOT IMPLEMENTED (лише ручний перевірений SQL).

## M. Оргструктура

`employee_id` — підлеглий, `manager_employee_id` — керівник, періоди дії; цикли блокуються; один чинний
керівник на дату; після версій структури зміни лише через «Структура». Впливає на видимість задач (director,
manager), погодження (`task_approver`), не впливає на модулі й сповіщення. VERIFIED IN CODE.

## N. Матриця прав

`docs/employee-management-business-logic-uk.md` §9: 18 дій × 7 груп ролей з ALLOWED / DENIED / CONDITIONAL /
NOT IMPLEMENTED. VERIFIED IN CODE; для Production — NOT VERIFIED до `prod_reference_data_inventory.sql`.

## O. Інструкції адміністратора

`docs/employee-provisioning-runbook-uk.md`: 14 операцій з правами, шляхом в UI, результатом, перевірочним SQL
(перевірено локально), помилками й безпекою.

## P. Сповіщення

Отримувачі — лише активні неархівні працівники; автор дії ніколи не отримує; підпорядкування саме по собі
сповіщень не дає (лише погоджувач, автор, виконавець, коментатор, батьківська задача). Працівник без входу не
може їх прочитати. Доставка — опитування кожні 15 с. VERIFIED IN CODE (`tests/work-notifications.test.mjs`).

## Q. Безпека й RLS

* Усі таблиці `public` — RLS увімкнено, політик немає (доступ через RPC); прямий `SELECT` для `authenticated`
  лише на `Locations`, `Plans`, `Plan_items`, `Products`, `Recipe_ingredients` (legacy Zagotówki) — VERIFIED IN CODE.
* 8 таблиць `app_private` без RLS — схема не доступна API (VERIFIED IN CODE).
* Немає функцій `SECURITY DEFINER` без фіксованого `search_path` і функцій, доступних `anon`, у стані
  репозиторію (F3 = 0 рядків локально).
* **Production:** політики читання `tasks_file_select` немає (за точною назвою) → або вкладення не відкриваються зовсім (тоді D-47 не діє), або політика має назву з суфіксом і старе правило (тоді D-47 відкрита). Розрізняє R5.
* Локальний `.env` вказує на Production — ризик випадкових дій з реальними даними.
* Інцидент процесу: під час зондування в лог інструменту потрапили публічні anon-ключі UAT і PROD (не в чат;
  ці ключі за призначенням публічні у фронтенді). Секретні ключі не використовувались.

## R. Тести

| Перевірка | Результат |
|---|---|
| lint | exit 0 |
| `npm test` | 200 / 200 (нові: `tests/prod-inventory.test.mjs`, 3 тести — read-only пакета, актуальність згенерованих даних, класифікація повного / Production-подібного / застарілого / зміненого стану) |
| build | OK |
| SQL інструкцій runbook | виконано локально без помилок |
| Пакет `upgrades/prod/` | усі 10 файлів виконано локально на PGlite |
| Браузерні тести | не перезапускались (фронтенд не змінювався); останній прогін 242 / 6 skipped / 1 відомий збій D-31 |
| На Production | лише анонімні зондування; SQL Editor — **BLOCKED** (немає доступу) |

Потрібно віддалено: `prod_preflight`, `prod_migration_history`, `prod_gap_analysis`, інвентарі → (затверджені
зміни) → `prod_postflight`, `prod_acceptance_checks`; ручна перевірка вкладень з реальним файлом.

## S. Блокери й невідомі

1. Немає доступу до SQL Editor Production → стан `202611120001/2`, Storage, грантів, даних — UNKNOWN.
2. Немає свіжої резервної копії Production (оператор).
3. Продуктове рішення щодо дефекту `ORG_USE_VERSION` у формі створення.
4. Рішення D-33 / D-46 (вид за замовчуванням) і D-49 (відповіді на коментарі) — з попереднього звіту.
5. UAT відстає від Production у трьох міграціях — UAT не годиться як повний еталон, доки їх не застосовано.

## T. Готовність до Production

**NOT READY FOR PRODUCTION — схема Production проінспектована лише частково (P4, D9).** Підтверджена потрібна
зміна — `202611140001` + політики Storage `tasks-private` за станом R5; виконання вимагає повного
`prod_gap_analysis.sql`, резервної копії та окремого затвердження.

## Підтвердження

* Жодних змін на Production не виконано (лише анонімні read-only запити, що повертали коди помилок).
* Жодних комітів, staging, push чи деструктивних операцій з репозиторієм.
* Дані UAT і Production збережено; нічого не записувалось у жодну базу.
* Нові файли: `supabase/upgrades/prod/*.sql` (10), `scripts/generate-prod-inventory.mjs`,
  `tests/prod-inventory.test.mjs`, 5 документів `docs/*-uk.md`.
