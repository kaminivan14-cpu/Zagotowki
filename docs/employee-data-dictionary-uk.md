# Словник даних: працівники, ролі, структура

Дата: 2026-11-15. Таблиці нижче згенеровано з каталогу, який отримано прокручуванням **усіх міграцій
репозиторію** в чистій PostgreSQL (`scripts/generate-prod-inventory.mjs`), тому типи, обов’язковість,
значення за замовчуванням, обмеження, індекси й тригери точно відповідають SQL (VERIFIED IN CODE).
Фактичний стан конкретної бази показує `supabase/upgrades/prod/prod_employee_inventory.sql` (E1, E2).

Особливості Production (INFERRED, `upgrades/production/*`): тригер `employees_role_alias` там **не
встановлений** (роль `employee` не перетворюється на `crafter`); тіла функцій входу / PIN / списку
працівників можуть відрізнятися (legacy cutover); перевіряє `prod_gap_analysis.sql`.

Бізнес-пояснення — `docs/employee-management-business-logic-uk.md`.

## 1. Таблиці

### `public.Employees` — Працівники

Головна таблиця працівників. Один рядок = одна людина; рядки ніколи не видаляються (архівування). RLS: увімкнено. Створено: `202609220001_base`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `created_at` | timestamp with time zone | так | `now()` | Коли запис створено | `202609220001_base` |
| `name` | text | ні | — | Ім’я (RPC вимагає непорожнє, обрізає пробіли) | `202609220001_base` |
| `role` | text | так | — | Роль у системі — єдине джерело прав (role_permissions) | `202609220001_base` |
| `location_id` | bigint | ні | — | Локація; обов’язкова, крім owner / administrator / director / expert / specialist | `202609220001_base` |
| `active` | boolean | ні | `true` | Активний: може входити й працювати | `202609220001_base` |
| `id` | bigint | так | `identity by default` | Номер працівника, генерується автоматично | `202609220001_base` |
| `auth_user_id` | uuid | ні | — | Зв’язок з акаунтом Supabase Auth (вхід); унікальний | `202609230001_auth` |
| `pin_hash` | text | ні | — | Історичний bcrypt-хеш PIN (legacy); ніколи не повертається клієнту | `202609290001_employee_pin` |
| `archived_at` | timestamp with time zone | ні | — | Дата архівування («Usuń»); архівний завжди неактивний | `202609300001_employee_archive` |
| `department_id` | bigint | ні | — | Відділ (до появи версій структури) | `202610020001_task_access` |
| `production_role` | text | ні | — | Виробнича роль; лише у відділі з кодом production (інакше тригер обнуляє) | `202610060001_tasks_admin_processes` |
| `avatar_path` | text | ні | — | Шлях до фото в приватному bucket employee-avatars | `202610080004_employee_avatars` |
| `position` | text | ні | — | Посада — бізнес-текст до 160 символів; права не дає | `202610260001_employee_positions` |

Обмеження:

* `Employees_location_id_fkey` (зовнішній ключ): `FOREIGN KEY (location_id) REFERENCES "Locations"(id)`
* `Employees_pkey` (первинний ключ): `PRIMARY KEY (id)`
* `Employees_auth_user_id_fkey` (зовнішній ключ): `FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT`
* `Employees_auth_user_id_key` (унікальність): `UNIQUE (auth_user_id)`
* `employees_auth_location` (перевірка): `CHECK (((role = ANY (ARRAY['owner'::text, 'administrator'::text, 'director'::text, 'expert'::text, 'specialist'::text])) OR (location_id IS NOT NULL)))`
* `employees_auth_role` (перевірка): `CHECK ((role = ANY (ARRAY['owner'::text, 'administrator'::text, 'director'::text, 'expert'::text, 'specialist'::text, 'manager'::text, 'su-chef'::text, 'shift-manager'::text, 'sushi-master'::text, 'crafter'::text, 'employee'::text])))`
* `employees_pin_bcrypt` (перевірка): `CHECK (((pin_hash IS NULL) OR (pin_hash ~ '^\$2[aby]\$10\$[./A-Za-z0-9]{53}$'::text)))`
* `employees_pin_role` (перевірка): `CHECK (((role = 'manager'::text) OR ((pin_hash IS NULL) OR ((role = ANY (ARRAY['employee'::text, 'crafter'::text, 'sushi-master'::text, 'shift-manager'::text, 'su-chef'::text, 'manager'::text])) AND (auth_user_id IS NOT NULL)))))`
* `employees_archive_inactive` (перевірка): `CHECK (((archived_at IS NULL) OR (active IS FALSE)))`
* `Employees_department_id_fkey` (зовнішній ключ): `FOREIGN KEY (department_id) REFERENCES "Departments"(id)`
* `Employees_production_role_check` (перевірка): `CHECK ((production_role = ANY (ARRAY['su-chef'::text, 'shift-manager'::text, 'sushi-master'::text, 'crafter'::text])))`
* `Employees_position_check` (перевірка): `CHECK ((length("position") <= 160))`

Індекси:

* `CREATE UNIQUE INDEX "Employees_pkey" ON public."Employees" USING btree (id)`
* `CREATE UNIQUE INDEX "Employees_auth_user_id_key" ON public."Employees" USING btree (auth_user_id)`
* `CREATE INDEX employees_auth_location_idx ON public."Employees" USING btree (location_id)`
* `CREATE UNIQUE INDEX employee_avatar_path_unique ON public."Employees" USING btree (avatar_path) WHERE (avatar_path IS NOT NULL)`

Тригери:

* `CREATE TRIGGER employees_role_alias BEFORE INSERT OR UPDATE OF role ON public."Employees" FOR EACH ROW EXECUTE FUNCTION app_private.normalize_employee_role()`
* `CREATE TRIGGER employee_production_department BEFORE INSERT OR UPDATE OF department_id, production_role ON public."Employees" FOR EACH ROW EXECUTE FUNCTION app_private.employee_production_department()`
* `CREATE TRIGGER org_department_guard BEFORE UPDATE OF department_id ON public."Employees" FOR EACH ROW EXECUTE FUNCTION app_private.org_legacy_guard()`

### `public.Employee_reporting_lines` — Підпорядкування (legacy)

Хто кому підпорядкований і в який період. Після появи версій структури змінюється лише через версії. RLS: увімкнено. Створено: `202610020001_task_access`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `id` | bigint | так | `identity always` | Номер рядка | `202610020001_task_access` |
| `employee_id` | bigint | так | — | Підлеглий | `202610020001_task_access` |
| `manager_employee_id` | bigint | так | — | Керівник | `202610020001_task_access` |
| `effective_from` | date | так | — | Діє з (включно) | `202610020001_task_access` |
| `effective_to` | date | ні | — | Діє до (не включно); порожньо = безстроково | `202610020001_task_access` |

Обмеження:

* `Employee_reporting_lines_check` (перевірка): `CHECK ((employee_id <> manager_employee_id))`
* `Employee_reporting_lines_check1` (перевірка): `CHECK (((effective_to IS NULL) OR (effective_to > effective_from)))`
* `Employee_reporting_lines_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `Employee_reporting_lines_manager_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (manager_employee_id) REFERENCES "Employees"(id)`
* `Employee_reporting_lines_pkey` (первинний ключ): `PRIMARY KEY (id)`

Індекси:

* `CREATE UNIQUE INDEX "Employee_reporting_lines_pkey" ON public."Employee_reporting_lines" USING btree (id)`
* `CREATE INDEX reporting_employee ON public."Employee_reporting_lines" USING btree (employee_id, effective_from, effective_to)`
* `CREATE INDEX reporting_manager ON public."Employee_reporting_lines" USING btree (manager_employee_id, effective_from, effective_to)`

Тригери:

* `CREATE TRIGGER reporting_guard BEFORE INSERT OR UPDATE ON public."Employee_reporting_lines" FOR EACH ROW EXECUTE FUNCTION app_private.task_reporting_guard()`
* `CREATE TRIGGER org_reporting_guard BEFORE INSERT OR DELETE OR UPDATE ON public."Employee_reporting_lines" FOR EACH ROW EXECUTE FUNCTION app_private.org_legacy_guard()`

### `public.Departments` — Відділи

Довідник відділів. Код production вмикає виробничі ролі. RLS: увімкнено. Створено: `202610020001_task_access`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `id` | bigint | так | `identity always` | Номер відділу | `202610020001_task_access` |
| `name` | text | так | — | Назва (1–200 символів) | `202610020001_task_access` |
| `active` | boolean | так | `true` | Активний (неактивний не пропонується) | `202610020001_task_access` |
| `code` | text | ні | — | Стабільний код (marketing, finance, it, quality, hr, operations, production) | `202610060001_tasks_admin_processes` |

Обмеження:

* `Departments_name_check` (перевірка): `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200)))`
* `Departments_pkey` (первинний ключ): `PRIMARY KEY (id)`
* `Departments_code_key` (унікальність): `UNIQUE (code)`

Індекси:

* `CREATE UNIQUE INDEX "Departments_pkey" ON public."Departments" USING btree (id)`
* `CREATE UNIQUE INDEX "Departments_code_key" ON public."Departments" USING btree (code)`

### `public.Locations` — Локації

Кухні / приміщення. Межі менеджера, виробничих ролей і маршрутизації Orders. RLS: увімкнено. Створено: `202609220001_base`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `created_at` | timestamp with time zone | так | `now()` | Коли створено | `202609220001_base` |
| `external_id` | text | ні | — | Зовнішній ідентифікатор (інтеграції) | `202609220001_base` |
| `name` | text | ні | — | Назва | `202609220001_base` |
| `city` | text | ні | — | Місто | `202609220001_base` |
| `active` | boolean | ні | `true` | Активна (неактивну не можна призначити) | `202609220001_base` |
| `id` | bigint | так | `identity by default` | Номер локації | `202609220001_base` |

Обмеження:

* `Locations_pkey` (первинний ключ): `PRIMARY KEY (id)`

Індекси:

* `CREATE UNIQUE INDEX "Locations_pkey" ON public."Locations" USING btree (id)`

### `public.organization_structure_versions` — Версії оргструктури

Чернетка → запланована → чинна → архівна (або скасована). Одночасно лише одна чинна й одна запланована. RLS: увімкнено. Створено: `202610080001_organization_structure`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `id` | bigint | так | `identity always` | Номер версії | `202610080001_organization_structure` |
| `name` | text | так | — | Назва версії | `202610080001_organization_structure` |
| `status` | text | так | `'draft'::text` | draft / scheduled / active / archived / cancelled | `202610080001_organization_structure` |
| `revision` | integer | так | `1` | Лічильник змін (захист від одночасного редагування) | `202610080001_organization_structure` |
| `is_baseline` | boolean | так | `false` | Початкова структура, перенесена зі старих даних | `202610080001_organization_structure` |
| `effective_from` | date | ні | — | Набуває чинності з | `202610080001_organization_structure` |
| `effective_to` | date | ні | — | Чинна до | `202610080001_organization_structure` |
| `created_at` | timestamp with time zone | так | `clock_timestamp()` | Створено | `202610080001_organization_structure` |
| `created_by_employee_id` | bigint | ні | — | Хто створив | `202610080001_organization_structure` |
| `scheduled_at` | timestamp with time zone | ні | — | Коли заплановано | `202610080001_organization_structure` |
| `scheduled_by_employee_id` | bigint | ні | — | Хто запланував | `202610080001_organization_structure` |
| `activated_at` | timestamp with time zone | ні | — | Коли стала чинною | `202610080001_organization_structure` |
| `cancelled_at` | timestamp with time zone | ні | — | Коли скасовано | `202610080001_organization_structure` |
| `notes` | text | так | `''::text` | Примітки | `202610080001_organization_structure` |

Обмеження:

* `organization_structure_versions_check` (перевірка): `CHECK (((effective_to IS NULL) OR (effective_to > effective_from)))`
* `organization_structure_versions_check1` (перевірка): `CHECK (((status = ANY (ARRAY['draft'::text, 'cancelled'::text])) OR (effective_from IS NOT NULL)))`
* `organization_structure_versions_created_by_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (created_by_employee_id) REFERENCES "Employees"(id)`
* `organization_structure_versions_name_check` (перевірка): `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200)))`
* `organization_structure_versions_pkey` (первинний ключ): `PRIMARY KEY (id)`
* `organization_structure_versions_scheduled_by_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (scheduled_by_employee_id) REFERENCES "Employees"(id)`
* `organization_structure_versions_status_check` (перевірка): `CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'active'::text, 'archived'::text, 'cancelled'::text])))`

Індекси:

* `CREATE UNIQUE INDEX organization_structure_versions_pkey ON public.organization_structure_versions USING btree (id)`
* `CREATE UNIQUE INDEX organization_one_scheduled ON public.organization_structure_versions USING btree ((true)) WHERE (status = 'scheduled'::text)`
* `CREATE UNIQUE INDEX organization_one_active ON public.organization_structure_versions USING btree ((true)) WHERE (status = 'active'::text)`

### `public.organization_structure_assignments` — Призначення у версії

Відділ і керівник кожного працівника в конкретній версії структури. RLS: увімкнено. Створено: `202610080001_organization_structure`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `structure_version_id` | bigint | так | — | Версія | `202610080001_organization_structure` |
| `employee_id` | bigint | так | — | Працівник | `202610080001_organization_structure` |
| `department_id` | bigint | ні | — | Відділ у цій версії | `202610080001_organization_structure` |
| `manager_employee_id` | bigint | ні | — | Керівник у цій версії | `202610080001_organization_structure` |

Обмеження:

* `organization_structure_assignments_check` (перевірка): `CHECK ((employee_id IS DISTINCT FROM manager_employee_id))`
* `organization_structure_assignments_department_id_fkey` (зовнішній ключ): `FOREIGN KEY (department_id) REFERENCES "Departments"(id)`
* `organization_structure_assignments_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `organization_structure_assignments_manager_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (manager_employee_id) REFERENCES "Employees"(id)`
* `organization_structure_assignments_pkey` (первинний ключ): `PRIMARY KEY (structure_version_id, employee_id)`
* `organization_structure_assignments_structure_version_id_fkey` (зовнішній ключ): `FOREIGN KEY (structure_version_id) REFERENCES organization_structure_versions(id)`

Індекси:

* `CREATE UNIQUE INDEX organization_structure_assignments_pkey ON public.organization_structure_assignments USING btree (structure_version_id, employee_id)`

### `public.organization_structure_directors` — Директори відділів

Директор кожного відділу у версії (погоджувач для відділу). RLS: увімкнено. Створено: `202610080001_organization_structure`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `structure_version_id` | bigint | так | — | Версія | `202610080001_organization_structure` |
| `department_id` | bigint | так | — | Відділ | `202610080001_organization_structure` |
| `employee_id` | bigint | так | — | Директор | `202610080001_organization_structure` |

Обмеження:

* `organization_structure_directors_department_id_fkey` (зовнішній ключ): `FOREIGN KEY (department_id) REFERENCES "Departments"(id)`
* `organization_structure_directors_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `organization_structure_directors_pkey` (первинний ключ): `PRIMARY KEY (structure_version_id, department_id)`
* `organization_structure_directors_structure_version_id_fkey` (зовнішній ключ): `FOREIGN KEY (structure_version_id) REFERENCES organization_structure_versions(id)`

Індекси:

* `CREATE UNIQUE INDEX organization_structure_directors_pkey ON public.organization_structure_directors USING btree (structure_version_id, department_id)`

### `public.Employee_capacity_settings` — Місткість працівника

Скільки хвилин на день працівник може приділяти задачам (планування). RLS: увімкнено. Створено: `202610020004_task_planning`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `id` | bigint | так | `identity always` | Номер | `202610020004_task_planning` |
| `employee_id` | bigint | так | — | Працівник | `202610020004_task_planning` |
| `effective_from` | date | так | — | Діє з | `202610020004_task_planning` |
| `effective_to` | date | ні | — | Діє до | `202610020004_task_planning` |
| `daily_task_capacity_minutes` | integer | так | — | Хвилин на день (1–1440) | `202610020004_task_planning` |

Обмеження:

* `Employee_capacity_settings_check` (перевірка): `CHECK (((effective_to IS NULL) OR (effective_to > effective_from)))`
* `Employee_capacity_settings_daily_task_capacity_minutes_check` (перевірка): `CHECK (((daily_task_capacity_minutes >= 1) AND (daily_task_capacity_minutes <= 1440)))`
* `Employee_capacity_settings_employee_id_effective_from_key` (унікальність): `UNIQUE (employee_id, effective_from)`
* `Employee_capacity_settings_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `Employee_capacity_settings_pkey` (первинний ключ): `PRIMARY KEY (id)`

Індекси:

* `CREATE UNIQUE INDEX "Employee_capacity_settings_pkey" ON public."Employee_capacity_settings" USING btree (id)`
* `CREATE UNIQUE INDEX "Employee_capacity_settings_employee_id_effective_from_key" ON public."Employee_capacity_settings" USING btree (employee_id, effective_from)`

### `public.Task_scope_grants` — Додаткові області доступу

Надання права (assign, read.scope, plan.scope, approve, report.scope, schedule.manage) на працівника, ієрархію, відділ або локацію. RLS: увімкнено. Створено: `202610020001_task_access`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `id` | bigint | так | `identity always` | Номер | `202610020001_task_access` |
| `grantee_employee_id` | bigint | так | — | Кому надано | `202610020001_task_access` |
| `permission` | text | так | — | Яке право | `202610020001_task_access` |
| `scope_type` | text | так | — | employee / hierarchy / department / location | `202610020001_task_access` |
| `employee_id` | bigint | ні | — | Ціль для employee / hierarchy | `202610020001_task_access` |
| `department_id` | bigint | ні | — | Ціль для department | `202610020001_task_access` |
| `location_id` | bigint | ні | — | Ціль для location | `202610020001_task_access` |

Обмеження:

* `Task_scope_grants_check` (перевірка): `CHECK ((((scope_type = ANY (ARRAY['employee'::text, 'hierarchy'::text])) AND (employee_id IS NOT NULL) AND (department_id IS NULL) AND (location_id IS NULL)) OR ((scope_type = 'department'::text) AND (department_id IS NOT NULL) AND (employee_id IS NULL) AND (location_id IS NULL)) OR ((scope_type = 'location'::text) AND (location_id IS NOT NULL) AND (employee_id IS NULL) AND (department_id IS NULL))))`
* `Task_scope_grants_department_id_fkey` (зовнішній ключ): `FOREIGN KEY (department_id) REFERENCES "Departments"(id)`
* `Task_scope_grants_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `Task_scope_grants_grantee_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (grantee_employee_id) REFERENCES "Employees"(id)`
* `Task_scope_grants_location_id_fkey` (зовнішній ключ): `FOREIGN KEY (location_id) REFERENCES "Locations"(id)`
* `Task_scope_grants_permission_check` (перевірка): `CHECK ((permission = ANY (ARRAY['tasks.assign'::text, 'tasks.read.scope'::text, 'tasks.plan.scope'::text, 'tasks.approve'::text, 'tasks.report.scope'::text, 'tasks.schedule.manage'::text])))`
* `Task_scope_grants_pkey` (первинний ключ): `PRIMARY KEY (id)`
* `Task_scope_grants_scope_type_check` (перевірка): `CHECK ((scope_type = ANY (ARRAY['employee'::text, 'department'::text, 'hierarchy'::text, 'location'::text])))`

Індекси:

* `CREATE UNIQUE INDEX "Task_scope_grants_pkey" ON public."Task_scope_grants" USING btree (id)`
* `CREATE INDEX task_grantee ON public."Task_scope_grants" USING btree (grantee_employee_id, permission)`

### `app_private.role_permissions` — Ролі → дозволи

Матриця «роль у системі → дозвіл». Недоступна клієнту напряму. RLS: вимкнено (схема app_private не доступна API). Створено: `202610010001_roles_modules`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `role` | text | так | — | Роль (значення Employees.role) | `202610010001_roles_modules` |
| `permission` | text | так | — | Дозвіл (capability) | `202610010001_roles_modules` |

Обмеження:

* `role_permissions_pkey` (первинний ключ): `PRIMARY KEY (role, permission)`

Індекси:

* `CREATE UNIQUE INDEX role_permissions_pkey ON app_private.role_permissions USING btree (role, permission)`

### `app_private.employee_invitations` — Запрошення e-mail

Резервування й результат запрошень; один pending на працівника. RLS: увімкнено. Створено: `202610070001_manager_email_auth`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `operation_id` | uuid | так | — | UUID операції | `202610070001_manager_email_auth` |
| `employee_id` | bigint | так | — | Кого запрошено | `202610070001_manager_email_auth` |
| `actor_employee_id` | bigint | так | — | Хто запросив | `202610070001_manager_email_auth` |
| `email` | text | так | — | Адреса (нижній регістр; не показується в UI списку) | `202610070001_manager_email_auth` |
| `auth_user_id` | uuid | ні | — | Створений Auth-акаунт | `202610070001_manager_email_auth` |
| `status` | text | так | — | pending / linked / failed | `202610070001_manager_email_auth` |
| `result` | text | ні | — | Код результату (OK, AUTH_ACCOUNT_EXISTS, …) | `202610070001_manager_email_auth` |
| `finished_at` | timestamp with time zone | ні | — | Завершення | `202610070001_manager_email_auth` |
| `created_at` | timestamp with time zone | так | `clock_timestamp()` | Початок | `202610070001_manager_email_auth` |

Обмеження:

* `employee_invitations_actor_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (actor_employee_id) REFERENCES "Employees"(id)`
* `employee_invitations_auth_user_id_fkey` (зовнішній ключ): `FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT`
* `employee_invitations_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `employee_invitations_pkey` (первинний ключ): `PRIMARY KEY (operation_id)`
* `employee_invitations_status_check` (перевірка): `CHECK ((status = ANY (ARRAY['pending'::text, 'linked'::text, 'failed'::text])))`

Індекси:

* `CREATE UNIQUE INDEX employee_invitations_pkey ON app_private.employee_invitations USING btree (operation_id)`
* `CREATE UNIQUE INDEX employee_invitation_pending ON app_private.employee_invitations USING btree (employee_id) WHERE (status = 'pending'::text)`

### `app_private.pin_accounts` — PIN-акаунти

Технічні Auth-акаунти для входу PIN-ом. RLS: увімкнено. Створено: `202609290001_employee_pin`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `employee_id` | bigint | так | — | Працівник | `202609290001_employee_pin` |
| `provisioning_id` | uuid | так | `gen_random_uuid()` | UUID провізії | `202609290001_employee_pin` |
| `email` | text | так | — | Технічна адреса <uuid>@pin.<середовище>.invalid | `202609290001_employee_pin` |
| `auth_user_id` | uuid | ні | — | Auth-акаунт | `202609290001_employee_pin` |

Обмеження:

* `pin_accounts_auth_user_id_fkey` (зовнішній ключ): `FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT`
* `pin_accounts_auth_user_id_key` (унікальність): `UNIQUE (auth_user_id)`
* `pin_accounts_email_internal` (перевірка): `CHECK ((email ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}@pin\.uat\.invalid$'::text))`
* `pin_accounts_email_key` (унікальність): `UNIQUE (email)`
* `pin_accounts_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id) ON DELETE RESTRICT`
* `pin_accounts_pkey` (первинний ключ): `PRIMARY KEY (employee_id)`
* `pin_accounts_provisioning_id_key` (унікальність): `UNIQUE (provisioning_id)`

Індекси:

* `CREATE UNIQUE INDEX pin_accounts_pkey ON app_private.pin_accounts USING btree (employee_id)`
* `CREATE UNIQUE INDEX pin_accounts_provisioning_id_key ON app_private.pin_accounts USING btree (provisioning_id)`
* `CREATE UNIQUE INDEX pin_accounts_email_key ON app_private.pin_accounts USING btree (email)`
* `CREATE UNIQUE INDEX pin_accounts_auth_user_id_key ON app_private.pin_accounts USING btree (auth_user_id)`

### `app_private.employee_auth_events` — Журнал змін зв’язку Auth

Хто, коли й чому змінив Employees.auth_user_id. RLS: увімкнено. Створено: `202610070001_manager_email_auth`.

| Поле | Тип | Обов’язкове | За замовчуванням | Опис | Додано міграцією |
|---|---|---|---|---|---|
| `id` | bigint | так | `identity always` | Номер | `202610070001_manager_email_auth` |
| `employee_id` | bigint | так | — | Працівник | `202610070001_manager_email_auth` |
| `old_auth_user_id` | uuid | ні | — | Було | `202610070001_manager_email_auth` |
| `new_auth_user_id` | uuid | ні | — | Стало | `202610070001_manager_email_auth` |
| `actor` | text | так | — | Хто (система / оператор) | `202610070001_manager_email_auth` |
| `reason` | text | так | — | Причина | `202610070001_manager_email_auth` |
| `created_at` | timestamp with time zone | так | `clock_timestamp()` | Коли | `202610070001_manager_email_auth` |

Обмеження:

* `employee_auth_events_employee_id_fkey` (зовнішній ключ): `FOREIGN KEY (employee_id) REFERENCES "Employees"(id)`
* `employee_auth_events_new_auth_user_id_fkey` (зовнішній ключ): `FOREIGN KEY (new_auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT`
* `employee_auth_events_old_auth_user_id_fkey` (зовнішній ключ): `FOREIGN KEY (old_auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT`
* `employee_auth_events_pkey` (первинний ключ): `PRIMARY KEY (id)`

Індекси:

* `CREATE UNIQUE INDEX employee_auth_events_pkey ON app_private.employee_auth_events USING btree (id)`

## 2. Довідкові значення

### Ролі в системі (`Employees.role`, обмеження `employees_auth_role`)

| Значення | Українська назва | Вхід | Локація обов’язкова |
|---|---|---|---|
| `owner` | Власник | e-mail | ні |
| `administrator` | Адміністратор | e-mail | ні |
| `director` | Директор | e-mail | ні |
| `manager` | Менеджер | e-mail | так |
| `expert` | Фахівець | e-mail | ні |
| `specialist` | Спеціаліст | e-mail | ні |
| `su-chef` | Су-шеф | PIN | так |
| `shift-manager` | Керівник зміни | PIN | так |
| `sushi-master` | Суші-майстер | PIN | так |
| `crafter` | Працівник виробництва | PIN | так |
| `employee` | Працівник (legacy) | PIN | так |

Дозволи кожної ролі — `prod_reference_data_inventory.sql` D1; у репозиторії — таблиця в
`docs/employee-management-business-logic-uk.md` §4.

### Виробничі ролі (`Employees.production_role`)

`su-chef` (Су-шеф), `shift-manager` (Керівник зміни), `sushi-master` (Суші-майстер), `crafter` (Працівник
виробництва). Лише для відділу з кодом `production` — тригер `employee_production_department` обнуляє поле в
іншому відділі.

### Відділи, створені міграцією `202610060001_tasks_admin_processes`

| Код | Назва |
|---|---|
| `marketing` | Маркетинг |
| `finance` | Фінанси |
| `it` | ІТ |
| `quality` | Якість |
| `hr` | HR |
| `operations` | Операційний |
| `production` | Виробничий |

Локацій міграції не створюють: це бізнес-дані Production.

### Інші коди

| Поле | Значення |
|---|---|
| `organization_structure_versions.status` | `draft` Чернетка, `scheduled` Запланована, `active` Чинна, `archived` Архівна, `cancelled` Скасована |
| `employee_invitations.status` | `pending`, `linked`, `failed` |
| `Task_scope_grants.scope_type` | `employee`, `hierarchy`, `department`, `location` |
| `Task_scope_grants.permission` | `tasks.assign`, `tasks.read.scope`, `tasks.plan.scope`, `tasks.approve`, `tasks.report.scope`, `tasks.schedule.manage` |
| `Work_shifts.current_shift_function` | `prep`, `sushi`, `cutter` (функція на зміні, не роль) |
| стан доступу e-mail (`auth_email_access`) | `none`, `invited`, `active`, `pending` |

## 3. Пов’язані функції

| Функція | Хто викликає | Призначення |
|---|---|---|
| `public.auth_employee_profile()` | кожен після входу | профіль активного працівника для `auth.uid()` |
| `public.auth_capabilities()` | кожен після входу | список дозволів (модулі) |
| `public.auth_list_employees()` | owner, administrator, manager | список для «Pracownicy» (manager — своя локація, без архіву) |
| `public.auth_save_employee(id, name, role, location_id, active)` | owner, administrator, manager | створення / редагування (правила — бізнес-логіка §6) |
| `public.auth_employee_lifecycle(id, action)` | owner, administrator | `activate`, `deactivate`, `archive`, `restore` |
| `public.auth_email_access()` | owner, administrator | стан доступу e-mail |
| `public.auth_invite_command(...)` | лише Edge Function (service_role) | резерв / завершення / збій запрошення |
| `public.auth_link_employee(...)` | лише службовий шлях | legacy-зв’язування; вручну не використовувати |
| `public.tasks_admin_directory()` | `tasks.admin` | дані адмін-панелі Роботи |
| `public.tasks_command('admin_employee_save', …)` → `app_private.tasks_employee_save` | `tasks.admin` + `employees.manage` | збереження з посадою, відділом, виробничою роллю, керівником, аудитом |
| `public.organization_structure()`, `organization_command(...)`, `organization_move_department(...)` | `organization.manage` | версії оргструктури |
| `public.employee_avatar_set(...)` | owner / administrator з `employees.manage` | фото |
| `public.pin_*` | Edge Functions `pin-login`, `manage-employee-pin` | вхід і видача PIN |
| `app_private.actor()`, `task_actor()` | усі RPC | визначення особи з JWT |
| `app_private.has_permission()`, `role_has_permission()` | усі RPC | перевірка дозволу (на PROD — з фільтром 06/10/11) |
| `app_private.org_assignments(date)`, `org_manager`, `org_director`, `org_version` | задачі, погодження | відділ / керівник / директор на дату |
| `app_private.task_scope`, `task_descendant`, `task_approver` | задачі | область доступу, ієрархія, погоджувач |
| тригери `normalize_employee_role`, `employee_production_department`, `org_legacy_guard`, `task_reporting_guard` | БД | див. «Тригери» вище |
