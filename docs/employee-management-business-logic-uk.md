# Керування працівниками: бізнес-логіка

Дата: 2026-11-15. Документ описує, як застосунок **фактично** працює з працівниками. Кожне правило взято з
коду, SQL-міграцій або тестів репозиторію (позначка **VERIFIED IN CODE**). Те, що відомо лише з документації
релізів Production, позначено **INFERRED**; те, що не перевірено, — **NOT VERIFIED**.

Супутні документи: словник даних `docs/employee-data-dictionary-uk.md`, інструкції адміністратора
`docs/employee-provisioning-runbook-uk.md`, Production `docs/production-database-rollout-uk.md`.

---

## 1. Архітектура одним поглядом

```
Supabase Auth (auth.users)          ← вхід: e-mail + пароль або PIN (технічна адреса @pin.<env>.invalid)
        │  auth.uid()
        ▼
public."Employees".auth_user_id     ← один Auth-акаунт ↔ максимум один працівник (UNIQUE)
        │
        ├── role ──► app_private.role_permissions ──► дозволи (capabilities): tasks.access, employees.manage …
        ├── location_id ──► "Locations"            (обмежує manager / виробничі ролі своєю локацією)
        ├── department_id, production_role         (відділ і виробнича роль)
        ├── position                               (посада — бізнес-текст, без прав)
        └── Employee_reporting_lines / версії оргструктури ──► керівник, директор відділу
```

* Клієнт **ніколи** не читає таблиці напряму: RLS увімкнено, політик немає, усе йде через RPC
  `SECURITY DEFINER` з фіксованим `search_path`, які самі перевіряють особу й дозволи (VERIFIED IN CODE).
* Особу користувача сервер визначає лише з JWT: `app_private.actor()` шукає працівника з
  `auth_user_id = auth.uid()` і `active = true`; інакше помилка `Brak aktywnego konta pracownika` (42501).
* Окремої публічної реєстрації **немає**: працівника створює адміністратор (або менеджер для своєї
  локації), а доступ до входу видається окремо — запрошенням e-mail або PIN.

### Два екрани керування працівниками

| Екран | Де | Мова | Хто відкриває | Що вміє |
|---|---|---|---|---|
| «Pracownicy» (`src/auth/EmployeesScreen.jsx`) | модуль Zagotówki (кнопка для owner/administrator/manager) і модуль Orders | польська | owner, administrator, manager | створити, редагувати (Imię, Rola, Lokal, Aktywny), активувати / деактивувати, «Usuń» (архів), «Przywróć», «Nadaj / resetuj PIN», «Запросити» (e-mail) |
| «Робота → Адмін панель → Працівники» (`src/tasks/admin/AdminScreen.jsx`) | модуль «Робота» | українська / польська | дозвіл `tasks.admin`; збереження — ще й `employees.manage` | створити, редагувати (Ім’я, Відділ, Виробнича роль, Посада, Роль у системі, Керівник, Локація, Активний), фото, «Запросити» |

Обидва екрани зберігають основні поля через одну функцію `public.auth_save_employee`, тому правила ролей і
локацій однакові.

## 2. Модель даних працівника (коротко)

Повний опис полів — у словнику даних. Найважливіше:

| Поле | Значення для бізнесу |
|---|---|
| `id` | номер працівника, генерується автоматично |
| `name` | ім’я (обов’язкове в RPC, обрізаються пробіли) |
| `role` | **роль у системі** — єдине поле, що визначає права |
| `location_id` | локація; обов’язкова для всіх ролей, крім owner, administrator, director, expert, specialist |
| `active` | чи може працівник працювати й входити |
| `archived_at` | «видалений» (архівований) працівник; завжди неактивний |
| `auth_user_id` | зв’язок з акаунтом входу (Supabase Auth) |
| `pin_hash` | історичний bcrypt-хеш PIN (legacy); у нових сценаріях PIN зберігається через Edge Function |
| `department_id` | відділ |
| `production_role` | виробнича роль; можлива лише у відділі з кодом `production` |
| `position` | посада (до 160 символів), без впливу на права |
| `avatar_path` | шлях до фото в приватному bucket `employee-avatars` |

## 3. Посада, роль, виробнича роль, відділ, локація — це різні речі

| Поняття | Де зберігається | Що визначає | Чого **не** визначає |
|---|---|---|---|
| **Посада** (`position`) | `Employees.position`, вільний текст | хто виконує крок процесу «за посадою» (процеси v3, запуск фільтрує людей за посадою) | жодних прав |
| **Роль у системі** (`role`) | `Employees.role` | усі дозволи через `role_permissions`; спосіб входу (e-mail або PIN) | посаду, відділ |
| **Виробнича роль** (`production_role`) | `Employees.production_role` | опис ролі у виробничому відділі; фільтр у списку працівників | права (тригер обнуляє її поза відділом `production`) |
| **Функція зміни** | `Work_shifts.current_shift_function` (`prep`, `sushi`, `cutter`) | що працівник робить **на поточній зміні** в Orders | роль, права поза зміною |
| **Відділ** (`department_id`) | `Employees.department_id` або версія оргструктури | належність до відділу; директор відділу як погоджувач; область доступу «відділ» | права ролі |
| **Локація** (`location_id`) | `Employees.location_id` | межі менеджера й виробничих ролей; маршрутизація Orders; область доступу «локація» | відділ |
| **Керівник** | `Employee_reporting_lines` або версія оргструктури | хто погоджує запити; область «ієрархія» для director / manager | роль керівника не змінюється |
| **Директор відділу** | `organization_structure_directors` | погоджувач для працівників відділу | — |
| **Додаткова область доступу** | `Task_scope_grants` | кому й на кого дозволено читати / планувати / призначати задачі поза власною ієрархією | — |

Права **ніколи** не виводяться з назви посади або виробничої ролі (VERIFIED IN CODE: `has_permission`
читає лише `Employees.role`).

## 4. Ролі в системі

Підписи — з `src/tasks/admin/labels.js` та `src/auth/session.js`.

| Назва | Значення в БД | Що означає | Вхід | Права в репозиторії (`role_permissions`) | На що впливає |
|---|---|---|---|---|---|
| Власник | `owner` | власник компанії | e-mail; запрошення через UI не передбачене | майже все, як administrator (без worktime.access/correct/export/read.all/read.scope) | керування працівниками, адмін-панель Роботи, оргструктура |
| Адміністратор | `administrator` | адміністратор системи | e-mail | усі дозволи, включно з `employees.manage`, `tasks.admin`, `organization.manage`, `orders.*`, `production.*`, `worktime.*` | усе; захищено від видалення останнього активного адміністратора |
| Директор | `director` | керівник напряму | e-mail | усі `tasks.*`, крім `tasks.admin`; `worktime.self`, `audit.access` | бачить і планує задачі підлеглих за ієрархією |
| Менеджер | `manager` | менеджер локації | e-mail | `employees.manage`, `orders.access/dispatch/history.local`, `production.*`, `tasks.*` (без `tasks.admin` і `tasks.interrupt`), `worktime.access/correct/export/read.scope` | керує працівниками **своєї локації** з виробничими ролями; ієрархія задач |
| Фахівець | `expert` | експерт | e-mail | `tasks.access`, `assign`, `create.*`, `plan.*`, `read.scope`, `report.scope` | задачі в межах наданої області |
| Спеціаліст | `specialist` | спеціаліст | e-mail | `tasks.access`, `create.request`, `create.self`, `plan.self` | лише власні задачі |
| Су-шеф | `su-chef` | су-шеф кухні | PIN | `orders.access/cut/dispatch/history.local/issue`, `production.*` | виробництво й замовлення своєї локації |
| Керівник зміни | `shift-manager` | керівник зміни | PIN | як su-chef | — |
| Суші-майстер | `sushi-master` | суші-майстер | PIN | `orders.access/work/history.own`, `production.access/work.today` | — |
| Працівник виробництва | `crafter` | працівник виробництва | PIN | `production.access`, `production.work.today`, `worktime.self`, `audit.access` | — |
| Працівник (legacy) | `employee` | стара назва `crafter` | PIN | як crafter | у репозиторії тригер `employees_role_alias` перетворює її на `crafter`; на Production тригер **заборонений** (06) |

**Хто що контролює**

* Доступ до модулів: дозволи `*.access` (`tasks.access`, `orders.access`, `production.access`, `audit.access`, `worktime.*`).
* Керування працівниками: `employees.manage` + роль owner / administrator (усі) або manager (своя локація, виробничі ролі).
* Видимість задач: `tasks.read.scope` + ієрархія (director, manager) + `Task_scope_grants`; власні / створені / призначені — завжди.
* Призначення задач: `tasks.assign` + та сама область.
* Погодження: `tasks.approve` (погоджувач — керівник, директор відділу або автор задачі, див. §8).
* Виробництво: `production.*`, `orders.*`.
* Лише описові: посада, виробнича роль, функція зміни.

**Production відрізняється (INFERRED, скрипти `upgrades/production/06, 10, 11`):** дозволи `orders.*`,
`tasks.*`, `processes.*`, `dictionaries.*` діють лише для `administrator` і `manager`; su-chef,
shift-manager, sushi-master, crafter мають `orders.access/work/cut/issue`; owner, director, expert,
specialist мають **лише** `tasks.access` (вхід у модуль «Робота» без інших `tasks.*`). Тобто на Production
спеціаліст не створює власні задачі, а власник не відкриває адмін-панель Роботи — NOT VERIFIED на живій
базі, перевіряє `prod_reference_data_inventory.sql`.

## 5. Статуси й життєвий цикл

| Стан | Як виглядає в БД | Вхід у застосунок | Задачі | Сповіщення | Історія |
|---|---|---|---|---|---|
| Активний | `active = true`, `archived_at IS NULL` | так, якщо є `auth_user_id` | може бути виконавцем / автором | отримує | — |
| Неактивний | `active = false`, `archived_at IS NULL` | ні: `actor()` і `auth_employee_profile` не знаходять активного працівника → «Brak dostępu…» | не пропонується як виконавець; старі задачі лишаються | не отримує | зберігається |
| Архівний («Usuń») | `active = false`, `archived_at` заповнено | ні | як неактивний; редагування заборонене до «Przywróć» | не отримує | зберігається повністю |
| Без акаунта входу | `auth_user_id IS NULL` | ні (немає з чим увійти) | кроки процесу «за посадою» вимагають зв’язаного акаунта (PR14); звичайні задачі — NOT VERIFIED | отримав би, але не може увійти, щоб прочитати | — |
| Auth без працівника | рядок у `auth.users`, ніхто не посилається | вхід у Supabase вдається, застосунок показує «Brak dostępu…» | — | — | — |
| Запрошений | рядок `employee_invitations` = `pending` → після прийняття `linked` | після встановлення пароля | — | — | `employee_invitations` |
| Підтверджений e-mail | у `auth.users` є `email_confirmed_at` і пароль | так | — | — | — |

Стан «доступу e-mail» для адміністратора показує `auth_email_access()` (VERIFIED IN CODE):
`none` («Немає доступу»), `invited` («Запрошено»), `active` («Доступ активний»: e-mail підтверджено,
є пароль, не заблоковано), `pending` («Перевірка запрошення — не надсилайте повторно»).

### Операції життєвого циклу (`auth_employee_lifecycle`, лише owner / administrator)

* **Деактивувати / Активувати** — `auth_save_employee(..., p_active)`: ті самі перевірки, що й редагування.
* **Usuń (архівувати)** — `active = false`, `archived_at = now()`. Нічого не видаляється. Не можна
  архівувати себе й **останнього активного адміністратора з входом**.
* **Przywróć** — знімає `archived_at`, працівник залишається **неактивним**; активувати — окремою дією.
* Менеджер може змінити «Aktywny» у формі для працівників своєї локації з виробничими ролями
  (`auth_save_employee`), але не архівувати й не відновлювати.

Обмеження БД: `employees_archive_inactive` — архівний працівник не може бути активним.

## 6. Створення працівника — повний шлях

### A. Запис працівника (одна транзакція)

**Шлях 1 — «Pracownicy»:** «Dodaj pracownika» → Imię, Rola, Lokal, Aktywny → «Zapisz» →
`auth_save_employee(null, name, role, location_id, active)`.

**Шлях 2 — «Робота → Адмін панель → Працівники»:** «Додати працівника» → Ім’я, Відділ, (Виробнича роль, якщо
відділ «Виробничий»), Посада, Роль у системі, Керівник, Локація / приміщення, Активний працівник →
«Зберегти» (або «Зберегти й додати фото») → `tasks_command('admin_employee_save', …)` →
`app_private.tasks_employee_save`:

1. перевірка `tasks.admin` і `employees.manage`;
2. відділ має бути активним; виробнича роль приймається лише для відділу з кодом `production`;
3. керівник — активний неархівний працівник, не сам працівник;
4. виклик `auth_save_employee` (ролі, локація, захист останнього адміністратора);
5. запис посади (зайві пробіли зведені до одного), відділу, виробничої ролі;
6. рядок підпорядкування з сьогоднішньої дати (попередній закривається);
7. журнал адміністрування `Task_admin_events` (до / після).

Усе — **одна транзакція**: помилка на будь-якому кроці скасовує все. Команда ідемпотентна (UUID операції).

Перевірки `auth_save_employee` (VERIFIED IN CODE):

| Правило | Помилка |
|---|---|
| викликає owner, administrator або manager; не редагує себе | `Brak uprawnień do edycji tego konta` |
| роль з дозволеного списку, ім’я не порожнє, `active` задано | `Nieprawidłowe dane` |
| локація обов’язкова для ролей, крім owner/administrator/director/expert/specialist | `Wybierz lokal` |
| локація існує й активна | `Nieaktywny lub nieistniejący lokal` |
| архівного спершу відновити | `Najpierw przywróć pracownika` |
| manager: лише ролі employee, crafter, sushi-master, shift-manager, su-chef у **своїй** локації | `Manager zarządza tylko employee i su-chef w swoim lokalu` |
| не можна позбавити ролі / деактивувати останнього активного адміністратора з входом | `Nie można usunąć ostatniego aktywnego administratora` |

Значення за замовчуванням: `id` — автоматично; `created_at = now()`; `active` — з форми (true за
замовчуванням); у «Pracownicy» нова роль за замовчуванням `crafter` і локація адміністратора, в адмін-панелі —
`specialist`.

**Знайдений дефект (VERIFIED IN CODE, відтворено локально 2026-11-15):** коли в системі вже є версія
оргструктури (чинна, запланована або архівна), створення працівника в адмін-панелі з заповненим
«Відділ» або «Керівник» завершується помилкою «Змінюйте відділ і підпорядкування у версії структури»
(`ORG_USE_VERSION`) і працівник **не створюється**. Обхід: створити без відділу й керівника, потім
призначити їх у «Структура» (версія структури або «Змінити відділ»). Виправлення — продуктове рішення
(приховати поля або писати у версію структури); у цій роботі не змінювалось.

### B. Акаунт Supabase Auth

**Не створюється автоматично** разом із працівником. Він з’являється:

* для e-mail-ролей (administrator, manager, director, expert, specialist) — під час запрошення (C);
* для PIN-ролей (su-chef, shift-manager, sushi-master, crafter, employee) — коли owner / administrator
  натискає «Nadaj / resetuj PIN» (Edge Function `manage-employee-pin`, технічна адреса
  `<uuid>@pin.<середовище>.invalid`, дані в `app_private.pin_accounts`).

### C. Запрошення e-mail (кілька незалежних операцій)

Кнопка «Запросити» видна owner / administrator для активних e-mail-ролей без входу. Edge Function
`invite-employee` (`supabase/functions/_shared/invite-handler.js`):

1. перевіряє origin (точний `INVITATION_APP_URL` / `APP_URL`, лише `https://…/`) і JWT викликача;
2. `auth_invite_command('begin')` — резервує запрошення (один `pending` на працівника); якщо Auth-акаунт з
   цим e-mail уже існує — `AUTH_ACCOUNT_EXISTS` (акаунти **ніколи** не зв’язуються за e-mail автоматично);
3. `auth.admin.inviteUserByEmail(email, redirectTo = APP_URL/?auth=password)` — Supabase надсилає лист;
4. `auth_invite_command('complete')` — записує `Employees.auth_user_id` і статус `linked`.

Кроки 2, 3, 4 — **окремі транзакції**. Якщо лист надіслано, а крок 4 не вдався, функція відповідає «Zaproszenie
wysłano, ale konto wymaga ręcznego powiązania. Nie ponawiaj zaproszenia.» — потрібне ручне втручання
(runbook §7). Auth-користувачі ніколи не видаляються як «компенсація».

Підтвердження: працівник відкриває лист → посилання веде на `https://zagotowki.vercel.app/?auth=password`
(Production) → `AuthGate` у режимі пароля → працівник задає пароль → входить.

Типові збої запрошення:

| Симптом | Причина |
|---|---|
| «Zaproszenia nie są skonfigurowane.» (503) | `INVITATION_APP_URL` / `APP_URL` у секретах функції порожній або не `https://домен/` |
| «Niedozwolone źródło.» (403) | застосунок відкрито з іншого origin (наприклад, старий Preview-деплой Vercel) |
| посилання з листа веде не туди / помилка редиректу | у Supabase Auth → URL Configuration немає `https://zagotowki.vercel.app/?auth=password` або Site URL вказує на застарілий деплой |
| `INVITE_EMAIL_NOT_AUTHORIZED` | вбудований SMTP Supabase надсилає лише членам команди — потрібен власний SMTP |
| `INVITE_RATE_LIMIT` | ліміт листів Supabase |
| `AUTH_ACCOUNT_EXISTS` | e-mail уже має акаунт: адміністратор бази перевіряє особу вручну |
| «Перевірка запрошення — не надсилайте повторно» | `pending` залишився після збою; перевірити `employee_invitations` |

### D. Зв’язок Auth ↔ працівник

`Employees.auth_user_id` записують лише: `auth_invite_command('complete')` (e-mail), PIN-провізія
(`manage-employee-pin`), legacy-провізія Production (`upgrades/production/02`). У UI немає кнопки
«розв’язати» — це ручна, перевірена операція (runbook §8).

### E. Права

Визначаються лише полем `role` (§4). Окремої «видачі прав» людині немає, крім областей
`Task_scope_grants` («Налаштування роботи та доступів» → «Доступ до співробітника або підлеглих»).

### F. Оргструктура

Відділ і керівник — при створенні в адмін-панелі (з обмеженням вище) або пізніше у «Структура» (§8).

### G. Виробничі обов’язки

Виробнича роль (лише у відділі «Виробничий»); функція зміни обирається працівником під час зміни в Orders /
Worktime; доступ до виробництва дає роль у системі.

## 7. Автентифікація й зв’язок з працівником

```
вхід (e-mail / PIN) → JWT з sub = auth.users.id
  → auth_employee_profile(): Employees WHERE auth_user_id = auth.uid() AND active
  → validEmployee() у браузері: той самий auth_user_id, active = true, archived_at порожній,
    роль зі списку, локація для ролей, що її вимагають
  → ModuleShell (модулі за auth_capabilities())
```

Повідомлення **«Brak dostępu. Konto musi być połączone z aktywnym pracownikiem. Skontaktuj się z managerem.»**
показується, коли після входу RPC профілю повертає помилку або не повертає валідного працівника:

| Причина | Як розпізнати (`prod_employee_inventory.sql`) |
|---|---|
| Auth-акаунт не пов’язаний з жодним працівником | E6 |
| працівник неактивний | E3 / E5 (`active = false`) |
| працівник архівований | E5 (`archived = true`) |
| роль невідома фронтенду | E9 |
| роль вимагає локацію, а її немає | E7 «location required…» |
| зв’язаний Auth-користувач видалений | E7 «linked Auth user does not exist» |

Інші стани: неправильний пароль / PIN — помилка ще на екрані входу; непідтверджений e-mail — вхід неможливий
до прийняття запрошення; «Nie udało się sprawdzić dostępu» — мережева помилка (кнопка «Sprawdź ponownie»);
сесія перевіряється кожні 60 с і при поверненні у вікно — деактивований працівник втрачає доступ без
перезавантаження.

Дублювання зв’язку неможливе: `UNIQUE (auth_user_id)` і FK на `auth.users` з `ON DELETE RESTRICT`
(Auth-користувача з працівником видалити не можна).

## 8. Оргструктура й підпорядкування

`public."Employee_reporting_lines"`: `employee_id` — **підлеглий**, `manager_employee_id` — **керівник**,
`effective_from` / `effective_to` — період дії (історія зберігається).

* Один чинний керівник на дату: `org_assignments` бере найновіший чинний рядок.
* Цикли заборонені: `CHECK (employee_id <> manager_employee_id)` і тригер `task_reporting_guard`
  (`REPORTING_CYCLE`) з урахуванням періодів.
* Після появи **версій оргструктури** (`organization_structure_versions`: чернетка → запланована → чинна →
  архівна) відділ і керівник беруться з версії, а прямі зміни `department_id` / підпорядкування блокує тригер
  `org_legacy_guard` (`ORG_USE_VERSION`). Майбутні зміни планують новою версією («Створити майбутню
  структуру» → «Редагувати зв’язки» → «Запланувати»); термінову зміну відділу робить «Змінити відділ».
* Хто змінює: версії — `organization.manage` (owner, administrator); legacy-зв’язки («Налаштування роботи та
  доступів» → «Підпорядкування») — адміністрування Роботи.

```
Директор відділу «Виробничий» (organization_structure_directors)
        │
   Менеджер локації А            ← manager_employee_id
     ├── Су-шеф                  ← employee_id
     └── Працівник виробництва   ← employee_id
```

Вплив:

| На що | Як |
|---|---|
| Видимість задач | director і manager бачать / планують / призначають задачі всіх підлеглих по ієрархії (`task_scope` → `task_descendant`), якщо мають відповідний `tasks.*` |
| Погодження | погоджувач запиту працівника — його керівник, директор відділу або автор задачі з дозволом `tasks.approve` (`task_approver`) |
| Сповіщення | керівник **не** отримує сповіщень лише через підпорядкування; лише як погоджувач, автор, виконавець, коментатор |
| Доступ до модулів | не впливає (лише роль) |

Не плутати з `Tasks.parent_task_id` — це ієрархія **задач**, а не людей.

## 9. Матриця прав (джерело — RPC і `role_permissions` репозиторію)

ALLOWED — дозволено; DENIED — заборонено; CONDITIONAL — з умовою; NOT IMPLEMENTED — функції немає;
NOT VERIFIED — на Production не перевірено. Production (INFERRED) відрізняється для owner / director /
expert / specialist (див. §4): у них на PROD діє лише `tasks.access`.

| Дія | owner | administrator | manager | director | expert | specialist | su-chef / shift-manager / sushi-master / crafter / employee |
|---|---|---|---|---|---|---|---|
| Переглянути працівників («Pracownicy») | ALLOWED (усі, включно з архівом) | ALLOWED | CONDITIONAL: своя локація, без архіву | DENIED | DENIED | DENIED | DENIED |
| Переглянути працівників (адмін-панель Роботи) | ALLOWED (`tasks.admin`) | ALLOWED | DENIED (немає `tasks.admin`) | DENIED | DENIED | DENIED | DENIED |
| Створити / редагувати | ALLOWED | ALLOWED | CONDITIONAL: ролі employee, crafter, sushi-master, shift-manager, su-chef своєї локації; лише «Pracownicy» | DENIED | DENIED | DENIED | DENIED |
| Активувати / деактивувати | ALLOWED | ALLOWED | CONDITIONAL: через «Aktywny» у формі, межі як вище | DENIED | DENIED | DENIED | DENIED |
| Архівувати / відновити | ALLOWED (не себе, не останнього адміністратора) | ALLOWED | DENIED | DENIED | DENIED | DENIED | DENIED |
| Посада | ALLOWED (адмін-панель) | ALLOWED | DENIED | DENIED | DENIED | DENIED | DENIED |
| Роль у системі | ALLOWED (будь-яка) | ALLOWED | CONDITIONAL: лише виробничі ролі | DENIED | DENIED | DENIED | DENIED |
| Виробнича роль | ALLOWED (адмін-панель, відділ «Виробничий») | ALLOWED | DENIED | DENIED | DENIED | DENIED | DENIED |
| Зв’язати Auth (запрошення e-mail) | ALLOWED | ALLOWED | DENIED | DENIED | DENIED | DENIED | DENIED |
| Видати / скинути PIN | ALLOWED | ALLOWED | DENIED | DENIED | DENIED | DENIED | DENIED |
| Розв’язати Auth | NOT IMPLEMENTED (лише ручний SQL адміністратора бази) | NOT IMPLEMENTED | — | — | — | — | — |
| Керувати підпорядкуванням / версіями структури | ALLOWED (`organization.manage`) | ALLOWED | DENIED | DENIED | DENIED | DENIED | DENIED |
| Бачити підлеглих і їхні задачі | ALLOWED (`tasks.admin` = усі) | ALLOWED | CONDITIONAL: ієрархія | CONDITIONAL: ієрархія | CONDITIONAL: надані області | DENIED | DENIED |
| Призначати задачі | ALLOWED | ALLOWED | CONDITIONAL: ієрархія / області | CONDITIONAL | CONDITIONAL: області | DENIED (лише собі) | DENIED (немає модуля) |
| Бачити задачі | ALLOWED (усі) | ALLOWED | CONDITIONAL: свої + область | CONDITIONAL | CONDITIONAL | CONDITIONAL: власні / призначені / створені | DENIED |
| Погоджувати | ALLOWED | ALLOWED | CONDITIONAL: як погоджувач | CONDITIONAL | DENIED | DENIED | DENIED |
| Сповіщення | лише власні — для кожного з `tasks.access` | | | | | | DENIED (немає модуля) |
| Виробничі обов’язки (заготовки, замовлення) | ALLOWED | ALLOWED | ALLOWED (своя локація) | DENIED | DENIED | DENIED | ALLOWED за роллю (`production.*`, `orders.*`) |

Статус матриці: VERIFIED IN CODE (RPC + `role_permissions` репозиторію, тести `tests/*database*.mjs`);
для Production — NOT VERIFIED до запуску `prod_reference_data_inventory.sql`.

## 10. Типові помилки

| Повідомлення | Значення | Що робити |
|---|---|---|
| Brak dostępu. Konto musi być połączone z aktywnym pracownikiem… | §7 | runbook §9 |
| Wybierz lokal | роль потребує локації | обрати локацію |
| Manager zarządza tylko employee i su-chef w swoim lokalu | менеджер вийшов за свої межі | звернутися до адміністратора |
| Nie można usunąć ostatniego aktywnego administratora | захист від втрати адміністрування | спершу активувати іншого адміністратора з входом |
| Najpierw przywróć pracownika | редагування архівного | «Przywróć» |
| Змінюйте відділ і підпорядкування у версії структури | є версії структури | «Структура» |
| Підпорядкування не може утворювати цикл | `REPORTING_CYCLE` | інший керівник |
| Оберіть активного керівника / активний відділ | `INVALID_MANAGER` / `INVALID_DEPARTMENT` | — |
| Немає дозволу на цю дію | `TASKS_DENIED` | роль не має дозволу |
| Ten PIN jest już zajęty. Wybierz inny. | PIN неунікальний | інший PIN |
| Помилки запрошення | §6 C | — |

## 11. Приклади

1. **Новий кухар у локації «А».** Менеджер локації: «Pracownicy» → «Dodaj pracownika» → Imię, Rola «crafter»
   (Lokal заблоковано на «А») → Zapisz. Адміністратор: «Nadaj / resetuj PIN». Працівник входить PIN-ом і
   бачить лише Zagotówki своєї локації.
2. **Новий менеджер офісу.** Адміністратор: «Робота → Адмін панель → Працівники → Додати працівника» → Ім’я,
   Посада «Менеджер з закупівель», Роль у системі «Менеджер», Локація → Зберегти (відділ і керівника — після,
   у «Структура», якщо версії структури вже є) → «Запросити» → e-mail. Працівник відкриває лист, задає пароль.
3. **Звільнення.** Адміністратор: «Pracownicy» → «Usuń» → підтвердити. Працівник втрачає вхід за ≤ 60 с, його
   задачі, коментарі й історія зберігаються, нових сповіщень він не отримує.
4. **Повернення.** «Archiwalni» → «Przywróć» (стає неактивним) → «Aktywuj». Вхід — тим самим акаунтом.
