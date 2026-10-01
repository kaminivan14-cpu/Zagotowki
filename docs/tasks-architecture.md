# Модуль «Робота»: локальная архитектура V1

Дата: 2026-10-02. Ветка: `feature/task-management`. Только локальная реализация;
состояние размещённых UAT/PROD не проверялось, удалённые операции не выполнялись.

## Границы

Это третий модуль существующего React/Vite-приложения, рядом с Production и Orders.
Auth остаётся Supabase Auth, профиль — `Employees.auth_user_id`. Новых способов
логина и AI-интеграции нет. ModuleShell выбирает модуль по capabilities; единственный
доступный модуль открывается сразу. Tasks загружается отдельным lazy chunk.
Все тексты нового UI — украинские, CSS ограничен `.tasks-app`.

`Tasks` — единственная сущность задания. Планирование, очередь, работа, периодические
шаблоны и рапорты используют одни и те же IDs. `Plans`/`Plan_items` остаются
производственными объектами. `Work_shifts` остаётся фактическими сменами Orders;
новый плановый график не записывает и не переопределяет их.

## Данные

Все новые идентификаторы таблиц следуют существующему quoted-name convention,
поля — snake_case, employee FK — bigint, абсолютное время — timestamptz.

| Таблица | Назначение |
|---|---|
| Departments | Отделы; Employees.department_id — членство |
| Employee_reporting_lines | Подчинённость на полуоткрытых интервалах дат, без временно пересекающихся циклов |
| Task_scope_grants | Отдельные grants на действие и employee / hierarchy / department / location |
| Tasks | Текущая проекция задания, исполнитель, источник, план, deadline, оценка, версия |
| Task_categories | Редактируемое дерево категорий, без циклов |
| Task_dependencies | Уникальные зависимости без self-link и циклов |
| Task_events | Append-only события, actor, версия задачи, operation UUID, before/after и дополнительные данные |
| Task_checklist_items | Необязательный перечень выполнения |
| Task_approval_requests | Запрос создания или переноса с отдельным решением |
| Task_module_settings | Часовой пояс, default capacity, горизонт, включение автопереноса |
| Employee_capacity_settings | Полезная дневная capacity по датам |
| Schedule_events | Плановые work/day_off/vacation/meeting/absence |
| Task_work_sessions | Реальные интервалы работы, закрываемые при pause/complete |
| Task_work_contexts | Текущая работа и стек возврата после прерываний |
| Task_planning_recommendations | Предложения move/add_unplanned, не копии заданий |
| Recurring_task_templates | Шаблоны повторения с ограниченным горизонтом генерации |
| app_private.task_operations | Результаты idempotent-команд |
| app_private.task_critical_ack | Причина отказа от critical и время повторного напоминания |

Teams не вводились: достаточны отдел и реальная иерархия. Location не означает
команду. Шаблон не является выполняемым заданием, generator создаёт обычные Tasks.

## Роли и полномочия

Новые системные роли: owner / Власник, director / Директор, expert / Фахівець,
specialist / Спеціаліст. Administrator и производственные роли сохранены.
Owner получает явную копию существующих administrator capabilities и совместимые
legacy admin predicates. Auth identity не подменяется. Новым task-only ролям
разрешён NULL location. PIN allowlist для этих ролей не расширялся.

Все шесть task-ролей получают tasks.access, tasks.create.self,
tasks.create.request, tasks.plan.self. Owner/administrator/director/manager/expert
получают tasks.assign, tasks.read.scope, tasks.plan.scope, tasks.report.scope.
Owner/administrator/director/manager — tasks.approve и tasks.schedule.manage.
Только owner/administrator — tasks.admin.

Scope — отдельная проверка. Owner/administrator имеют global task scope. Руководитель
получает свой действующий reporting subtree. Дополнительные области задаются
Task_scope_grants. Само право tasks.assign не открывает остальные задачи адресата.
Создатель сохраняет доступ к конкретной созданной задаче; это не grant на всю историю
исполнителя. Исполнитель может читать свою задачу и планировать себя.

Список допустимых адресатов включает только активных связанных с Auth сотрудников,
имеющих tasks.access. Производственные роли не получают task-доступ автоматически.
Настройка scope не может выдать capability, которой нет у роли.

## Состояния и события

Persisted: draft, pending_approval, unplanned, planned, in_progress, paused,
completed, cancelled, blocked. Ready вычисляется. Перенос и ожидание решения не
затирают состояние выполнения. Отмена сохраняет историю; удаления Tasks в UI нет.

Каждая успешная state-changing команда увеличивает Tasks.version и сохраняет
Task_events с этой версией. Один operation UUID может иметь несколько событий
разных задач или последовательных версий — например, create+plan или interrupt.
Уникальная пара task_id/task_version предотвращает двусмысленную историю.
Комментарий — COMMENT_ADDED; его редактирование не реализовано.
Before/after snapshots имеют schema_version=1. UPDATE/DELETE журнала запрещены
и клиентскими grants, и trigger. История UI догружается страницами по 100 событий.

## Server API

Все public tasks RPC доступны authenticated, внутри проверяются active employee,
архивирование, tasks.access, action capability и scope. Новые таблицы имеют RLS,
клиентских table grants нет: чтение также идёт через узкие RPC. Service functions
имеют fixed search_path=pg_catalog; private helpers не вызываются клиентом.

| RPC | Параметры / результат |
|---|---|
| tasks_context | employee, capabilities, today, settings, categories, departments, manager |
| tasks_assignable_people | p_permission; минимальные id/name разрешённых сотрудников |
| tasks_command | p_action, p_args, p_operation UUID; транзакционная команда |
| tasks_list | p_employee, p_cursor; до 100 задач |
| tasks_details | p_task; task, checklist, последние события |
| tasks_events | p_task, p_before; предыдущая страница событий |
| tasks_approvals | доступные pending requests |
| tasks_planning | p_employee, p_from, p_to, p_cursor; дневные итоги и общая страница задач |
| tasks_schedule | p_employee, p_from, p_to; события графика |
| tasks_team_schedule | p_from, p_to; календарь разрешённой команды |
| tasks_work_state | current, critical, started, нагрузка |
| tasks_next | p_operation; обёртка над tasks_command('next') |
| tasks_recommendations | p_employee; pending proposals |
| tasks_report | p_employee, p_from, p_to; исторические снимки, время, события, точные итоги |
| tasks_admin_state | административная проекция scope, иерархии, capacity, шаблонов |

Команды: create, request_creation, update, assign, cancel, comment, dependency,
checklist_add, checklist_toggle, plan, resolve_approval, resolve_reschedule,
next, complete, pause, end_of_day, critical_start, critical_decline,
balance, recommendation_resolve, schedule_save, schedule_delete,
department_save, employee_department, scope_grant, scope_revoke, reporting_save,
reporting_end, capacity_save, category_save, settings_save, recurring_save,
recurring_generate. Перечень аргументов закрытый; привилегированные поля источника,
actor и approver клиент не определяет. Неизвестные действия/аргументы отклоняются.

Внутренние сервисы разделены на task_scope/task_actor, task_core/task_event,
task_approval_command, task_windows/task_capacity, task_planning_command,
task_ready/task_next/task_work_command, task_load_balancer/task_day_fits.
React не вычисляет порядок очереди или решения о переносе.

## Планирование и время

ПН–ЧТ: текущая неделя. ПТ–НД: следующая. Месяц — текущая неделя и три следующих,
ровно четыре блока. План недели вертикальный; перенос через дату, без drag/drop.

Default capacity = 360 минут в БД, ограничена фактическими доступными интервалами.
Приоритет настроек сотрудника — последняя effective_from, действующая на дату.
Рабочие интервалы объединяются, отсутствия/встречи вычитаются через tstzmultirange.
Нет смены — нет availability. Unknown estimate явно отображается и не допускается
к автоматической очереди/распределению. Сумма известных оценок не означает, что
неоценённые задачи занимают ноль времени: UI отдельно показывает их количество.

planned_date — бизнес-дата компании. Абсолютное время принимается только с offset/Z.
Локальное время формы преобразуется в company_timezone, независимо от браузера.
Неоднозначное/несуществующее время DST отклоняется. Изменение timezone при наличии
Tasks требует отдельной миграции планов; обычная настройка его не переинтерпретирует.

## Очередь и Critical Now

Допуск: корректное состояние/дата/not_before, все зависимости completed, известная
остаточная длительность помещается в текущее свободное окно. Сортировка:
critical_now → critical_today → fixed start → hard deadline → priority → planned
order/date → estimate → id. Срочность не обходит зависимости и график.

next атомарно возвращает уже выполняемое задание либо начинает одно новое. Частичные
unique indexes защищают единственное in_progress и единственный открытый интервал.
Complete закрывает interval и выбирает следующую задачу в той же транзакции.

critical_start ставит текущую задачу на pause, закрывает её интервал, складывает ID
в стек и начинает критическую. После complete стек разворачивается до первой ещё
доступной задачи. Вложенные прерывания поддержаны. Отказ требует причину; событие
сохраняется, задача остаётся видимой, повторный modal отложен на 15 минут.
critical_today modal не показывает. Critical-создание резервирует текущую дату;
critical_today вызывает балансировку в доступной области.

UI опрашивает рабочее состояние раз в 15 секунд и при focus. Realtime и push вне
открытого приложения отсутствуют. Во время отсутствия сети нельзя подтверждать
выполнение локально: сервер остаётся источником истины.

## Балансировка

Включение хранится в Task_module_settings; default false означает рекомендации.
После проверки на тестовых данных администратор может включить автоперенос.

Кандидаты: normal/planned без фиксированного времени и с оценкой. Сначала low,
затем medium/high/critical; учитываются reschedule_count и длительность. После
пяти переносов — только рекомендация. can_auto_reschedule=false или approval=true
не обходятся. Чужие назначения по умолчанию требуют согласования.

Поиск ближайшего будущего дня проверяет capacity, непрерывные окна и hard deadline.
Консервативный V1 не переносит автоматически задачи, участвующие в dependencies.
Destination packing проверяет и уже находящиеся там гибкие задачи; эвристика может
отказаться от сложного допустимого размещения, но не обязана искать оптимальное.
Неизвестные оценки в целевом дне блокируют автоматическое заполнение.

Все выбранные переносы и события TASK_AUTO_RESCHEDULED атомарны. Metadata включает
old_date/new_date/reason/caused_by_task_id. Если решения нет, перегруз остаётся
видимой. Подтверждение рекомендации повторно проверяет версию и план; при нужном
согласовании создаётся request, а не молчаливый перенос.
Недогрузка создаёт только предложения add_unplanned.

## Повторы, конкуренция и логирование

UUID операции сохраняется в sessionStorage до подтверждённого ответа. Повтор с теми
же action/args возвращает сохранённый результат; другой payload даёт conflict.
При сетевой неопределённости новый intent не заменяет старый. PostgreSQL-отказ
подтверждает rollback; такой intent можно исправить и отправить заново.

Порядок locks: operation → graph → actor share → employee → task/request rows.
Операции работы используют shared graph lock и персональные locks, поэтому разные
сотрудники могут работать параллельно. Изменения планов/графа/настроек используют
exclusive graph lock: сознательная консервативная граница V1 для зависимостей.
Это потенциальная точка масштабирования; длительные bulk-команды ограничивать.

Critical и complete блокируют employee; UNIQUE indexes — дополнительная защита.
Обновления требуют актуальную version. План и график синхронизированы с движком.
Циклы parent/dependency/reporting запрещены сервером.

task_operations и snapshots не содержат Auth secrets. Ошибки public command идут
через PostgreSQL RAISE LOG с correlation_id, employee_id, task_id, operation_id,
service, error_code, metadata, timestamp. Логирование не зависит от rollback записи
в прикладную таблицу. Содержимое description и комментариев в error log не выводится.

## Рапорты

Task_events и Task_work_sessions формируют выполненное, переносы, комментарии и
реальное время. Паузы не учитываются; интервалы обрезаются границами периода.
Исторические snapshots не открывают предыдущему исполнителю поздние изменения
нового исполнителя. Доступ к командному рапорту проверяется отдельно по report scope.

Диапазон ограничен 63 календарными датами. Итоги точные; подробный результат ограничен
200 задачами и 500 событиями. При превышении числа задач UI просит сузить период.
Экспорт больших рапортов и отдельная пагинация отчётных событий — последующее улучшение.

## Периодические задачи и AI

recurring_save/recurring_generate доступны tasks.admin. Generator создаёт обычные
unplanned Tasks в ограниченном горизонте; occurrence_date хранится в metadata.
Повтор защищён UNIQUE(source_namespace,source_external_id), шаблон блокируется.
Автоматический scheduler не установлен и не включён. UI конструктора recurrence
не входит в V1; запуск осуществляется явной серверной командой администратора.

AI SDK, API, UI и физические proposal tables отсутствуют. Будущий proposal approval
должен вызывать тот же task creation boundary с отдельным доверенным adapter.
Источник ai_future предусмотрен, но клиент не может выдать свою задачу за AI/API.

## Legacy hardening

- assert_requester теперь требует production.access: закрыты create/update/complete/
  reopen/delete production plan, add/update/delete/start/complete item, employee names.
- Products/Recipe_ingredients SELECT policies требуют production.access.
- Locations SELECT требует production/orders capability и старый location scope.
- Owner явно поддержан в auth_save/list/link/lifecycle, production predicates,
  can_read_location/can_read_plan, orders_actor и Orders shift history/summary, pin_admin.
- Passwords, PIN hashes, Auth IDs и прежние миграции не изменялись.
- Новые email/password роли не могут быть присвоены PIN-профилю без отдельного
  управляемого перехода учётных данных: старый pin-role CHECK продолжает защищать его.

## Проверки и пределы

См. tasks-rollout.md для команд, результатов, UAT fixtures и последовательности.
PostgreSQL tests исполняют всю цепочку migrations, используют реальные роли/RLS,
SECURITY DEFINER, pgcrypto и отдельные конкурентные подключения.
Playwright использует реальный frontend/Supabase SDK и перехваченные HTTP-ответы,
а не hosted Auth. Проверка настоящего hosted логина остаётся ручным шагом UAT.

Не реализованы: AI, внешний import endpoint, attachments upload, drag/drop, push,
автоматический cron, синхронизация с внешним HR-календарём. Work_shifts и Schedule_events
имеют разные бизнес-значения и не синхронизируются автоматически. Менеджер смотрит
доступных сотрудников через фильтр либо общий календарь «Команда».
