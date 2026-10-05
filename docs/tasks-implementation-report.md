# Итог локальной реализации Tasks

Дата: 2026-10-02. Ветка: `feature/task-management` (база — `feature/orders`).
Результат подготовлен для локального review. **Push, merge, deploy и remote migrations
не выполнялись.** Никаких изменений UAT/PROD, Auth users или реальных бизнес-данных.

## Коммиты

| Commit | Этап |
|---|---|
| 9748fd4 | Центральная модель, роли/capabilities/scope и совместимость owner |
| d2ed7db | Согласования и checklist |
| df11d25 | График, capacity и planning services |
| 2a6b056 | Work Queue и вложенные критические прерывания |
| fa0c658 | Балансировка, recommendations, recurrence и reports |
| 8be433e | Украинский UI четырёх разделов и общий ModuleShell |
| 533b4e2 | Усиление contracts, история, пагинация, командный календарь и regression tests |

Завершающий commit документации/локальных проверок следует за указанными коммитами;
его hash доступен в `git log feature/orders..HEAD` и итоговом сообщении.

## Реализованные данные и миграции

Добавлено 12 migration files: `202610020001_task_access.sql` через
`202610020012_task_role_invariant.sql`, строго последовательная цепочка.
Полный поимённый список, prerequisites и порядок применения — в tasks-rollout.md.
Исходные миграции Production/Orders/Auth не редактировались.

16 новых public tables:
Departments, Employee_reporting_lines, Task_scope_grants, Tasks, Task_categories,
Task_dependencies, Task_events, Task_checklist_items, Task_approval_requests,
Task_module_settings, Employee_capacity_settings, Schedule_events,
Task_work_sessions, Task_work_contexts, Task_planning_recommendations,
Recurring_task_templates.

Private tables: task_operations, task_critical_ack. Employees получает department_id;
Auth identity по-прежнему определяется auth_user_id, primary key сотрудника сохранён.

Новые роли: owner, director, expert, specialist. Украинские подписи предусмотрены.
Владелец и администратор — разные роли. Производственные роли и alias employee/crafter
сохранены, не получают Tasks автоматически.

Capabilities: tasks.access, tasks.create.self, tasks.create.request, tasks.assign,
tasks.read.scope, tasks.plan.self, tasks.plan.scope, tasks.approve, tasks.report.scope,
tasks.schedule.manage, tasks.admin. Scope отделён от capability; assign-only не даёт
весь read scope сотрудника.

## RPC и сервисы

Public API: tasks_context, tasks_assignable_people, tasks_command, tasks_list,
tasks_details, tasks_events, tasks_approvals, tasks_planning, tasks_schedule,
tasks_team_schedule, tasks_work_state, tasks_next, tasks_recommendations,
tasks_report, tasks_admin_state.

Внутренние SQL services: доступ, task core/events, approvals, availability,
planning, queue/work intervals, balancer/interval packing. Все mutations проходят
transactional tasks_command с operation UUID и закрытым контрактом аргументов.

Все источники создают стандартные Tasks. Нет отдельных таблиц выполняемых заданий
для planning/work/reporting. Recurring templates — только шаблоны, generator создаёт
Tasks с уникальным ключом occurrence; scheduler не установлен. AI не подключён.

## Frontend

Верхний модуль «Робота» встроен в существующий ModuleShell по tasks.access.
Единственный разрешённый модуль открывается автоматически.

- «Робота»: одно текущее задание, checklist, complete/next, перенос, комментарии.
- «Планування»: вертикальная неделя, четыре недельных блока месяца, unplanned,
  approvals и рекомендации, ручной выбор даты.
- «Рапорти»: персональный/разрешённый командный рапорт, actual/planned time,
  переносы, просрочки, события и комментарии.
- «Графік»: календарь себя/выбранного сотрудника/команды, события смен и отсутствий.
- «Налаштування»: categories, departments, reporting, scope и capacity для администратора.
- Общая task creation form, details/history dialog и Critical Now dialog.

UI на украинском, CSS namespace .tasks-app, стилистика старого приложения сохранена.
Tasks загружается отдельным chunk. Work touch targets проверены на 768/1024 px.

## Security и legacy API

RLS включён на всех новых public tables, direct REST table reads/writes запрещены.
Private helper execution закрыт для клиентов. SECURITY DEFINER RPC проверяет
session actor, active/archive, capability и scope; фиксированный search_path.

Усилен assert_requester, который защищает существующие production plan/item RPC:
create/update/complete/reopen/delete plan, add/update/delete/start/complete item,
а также auth_employee_names. Теперь нужен production.access.
Products/Recipe_ingredients policies требуют production.access; Locations —
production/orders capability и прежний location scope.

Owner явно поддержан в admin predicates auth_save_employee/auth_list_employees/
auth_link_employee/auth_employee_lifecycle, production operations,
can_read_location/can_read_plan, orders_actor, orders_shift_summary/history, pin_admin.
Ни одна credential hash/Auth identity не переписывается task migrations.
Последняя migration сохраняет обязательность role в Employees.

Idempotency проверяет UUID + actor + action + args. Concurrency защищена graph/employee
locks, optimistic version и partial unique indexes. Task_events append-only.
Ошибки логируются PostgreSQL RAISE LOG, без зависимости от откатившейся записи.

## Фактические проверки

| Проверка | Результат |
|---|---|
| npm test | 88 passed |
| Полный Playwright | 51 passed |
| Последний Tasks UI прогон после полировки | 8 passed |
| Tasks на PostgreSQL 17 | 111 checks passed |
| Orders с новыми task migrations | 154 checks passed; реальная гонка 1 success / 1 conflict |
| PIN PostgreSQL/pgcrypto | 70 checks passed |
| Production upgrade PostgreSQL | 126 checks passed |
| test:migration | PASS |
| Legacy plan-items UI | PASS, 375/768/1440 px |
| npm run lint | PASS, без предупреждений |
| npm run build | PASS |
| git diff --check | PASS |

PostgreSQL tests использовали реальный локальный PostgreSQL и отдельные подключения.
PGlite остаётся в прежних быстрых unit/bootstrap tests. Browser tests используют
изолированные fixtures, а не реальную размещённую Supabase Auth.

Найдены и исправлены во время работы: проверка location для новых ролей, сохранение
null-result idempotency, SQL quoting в contracts migration, устаревший mock
legacy UI-теста, контраст выбранной кнопки при hover и чрезмерная длина месячного вида.
Это не остающиеся ошибки; после исправлений выполнены соответствующие проверки.

## Ограничения и TODO

- Реальное размещённое окружение и hosted email/PIN login требуют UAT-проверки.
- Обновление critical notification через polling до 15 секунд; нет push вне приложения.
- Autobalancer по умолчанию выключен: рекомендации доступны, включение контролируемое.
- Автоматически не переносятся задачи с dependency links; сложное уплотнение графика
  консервативно. Это осознанный V1 tradeoff, а не AI-планировщик.
- Некоторые изменения планов/оргструктуры сериализуются graph lock; до масштабного
  использования провести нагрузочный тест на ожидаемом объёме сотрудников.
- Recurrence generator/server templates готовы, cron и UI-конструктор не включены.
- Рапорт возвращает точные итоги, но до 200 строк деталей и 500 событий; большой экспорт
  и отдельная пагинация отчётных событий — дальнейшее улучшение.
- Внешний import endpoint, attachments upload, HR calendar sync и AI — будущие этапы.
- Main bundle имеет advisory Vite >500 kB (535.88 kB raw); Tasks выделен в отдельный
  lazy chunk около 42 kB raw. Это предупреждение, сборка успешна.
- Перевод существующего PIN-профиля в task-only роль требует отдельного согласованного
  credential transition; текущий CHECK не обходится ради смены роли.

## UAT: подготовка, ENV и ручная приёмка

Новых ENV для Tasks нет. Используются существующие VITE_SUPABASE_URL и public key.
Service-role key никогда не передаётся frontend. Настройки capacity/timezone/horizon/
balancer находятся в БД, не в frontend и не в новых ENV.

Миграции содержат seed категорий и defaults. Перед UAT создать отдельные тестовые
аккаунты всех новых ролей, отделы, reporting lines, scope и плановые смены. Не
назначать реальные PROD users и не переносить UAT seed в PROD.

Полный пошаговый порядок UAT, список миграций, backup/rollback strategy, проверка
remote drift, ENV, fixtures и manual checks находятся в **tasks-rollout.md**.
Архитектура, таблицы, role matrix, алгоритмы и публичные функции — в
**tasks-architecture.md**. Эти документы предназначены для review до отдельной
команды на UAT. На этом локальная работа останавливается.
