# Tasks: локальная проверка и будущий rollout

Дата: 2026-10-02. Реализация локальная. **Ни UAT, ни PROD не изменены.**
Ветка `feature/task-management`; merge/push/deploy в рамках этой работы запрещены.

## Порядок новых миграций

Применять строго после существующих миграций по `202610010003_orders.sql`:

1. `202610020001_task_access.sql` — роли, capabilities, scope, legacy protection.
2. `202610020002_task_core.sql` — Tasks, categories, dependencies, events, operations.
3. `202610020003_task_approvals.sql` — approvals/checklist/details.
4. `202610020004_task_planning.sql` — availability, capacity, schedule, planning.
5. `202610020005_task_work.sql` — queue, work intervals, critical interrupt stack.
6. `202610020006_task_balance_reports.sql` — balancer, recommendations, recurring, reports.
7. `202610020007_task_hardening.sql` — locks/contracts, interval packing, creation planning.
8. `202610020008_task_audit.sql` — historical report snapshots, admin projections.
9. `202610020009_task_pagination.sql` — planning/events pages, exact report totals.
10. `202610020010_task_contracts.sql` — absolute timestamps, reporting maintenance.
11. `202610020011_task_team_calendar.sql` — календарь разрешённой команды.
12. `202610020012_task_role_invariant.sql` — сохранение обязательной роли профиля.

Каждый файл транзакционный. Не применять отдельные файлы последней части без всей
цепочки. Старые файлы не менялись. Пустую БД поднимать полным existing bootstrap;
на уже существующем PROD не запускать base.sql повторно. Существующий production
upgrade path сначала сверить с docs/production-auth-upgrade.md.

## Локальные команды

Нужны Node/npm, Docker и локальный PostgreSQL 17 image. Тестовый контейнер не должен
быть подключён к UAT/PROD и не требует Supabase credentials. Пример изолированного
запуска, если контейнера ещё нет:

```sh
docker run -d --name zagotowki-tasks-test --network none \
  -e POSTGRES_PASSWORD=local-test-only \
  public.ecr.aws/supabase/postgres:17.6.1.166 postgres -c listen_addresses=''
npm test
npm run test:tasks:db
TEST_PG_CONTAINER=zagotowki-tasks-test TEST_TASKS_UPGRADE=1 node tests/orders-database.mjs
TEST_PG_CONTAINER=zagotowki-tasks-test node tests/pin-database.mjs
TEST_PG_CONTAINER=zagotowki-tasks-test node tests/production-upgrade.mjs
npm run test:migration
npm run test:browser
npm run lint
npm run build
```

Tasks/Orders DB tests создают уникальную временную базу и удаляют только её в finally.
Данные синтетические. Значение TASKS_TEST_CONTAINER позволяет выбрать другой локальный
контейнер; TEST_PG_CONTAINER — совместимая настройка старых DB regression scripts.
Никаких реальных account invitations или HTTP-запросов Supabase в тестах нет.

Playwright запускает свой Vite на 127.0.0.1:5173, запрещает неожиданные внешние запросы
и использует изолированный browser context. Залогированные браузеры пользователя
не используются. Снимки desktop/tablet находятся в test-results/ после прогона.

## ENV

Новых production ENV для Tasks нет. Используется прежний frontend configuration:

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY, либо совместимый VITE_SUPABASE_PUBLISHABLE_KEY

Не помещать service-role key в frontend. Существующие настройки PIN proxy,
invite-employee и password recovery остаются прежними. Новых Edge Functions,
OpenAI keys, cron secrets или Realtime publication для Tasks не требуется.

Параметры задачи находятся в Task_module_settings: timezone, default capacity,
planning horizon, load_balancer_enabled. В миграции timezone=Europe/Warsaw,
capacity=360, horizon=60, balancer=false. До появления Tasks выбрать фактический
часовой пояс компании. Его позднее изменение требует отдельной миграции дат.

## Что нужно подготовить перед UAT

Категории и системные настройки создаются миграциями. Реальные сотрудники,
подчинённость, scope, графики и бизнес-задачи миграциями не создаются.
Ни одному текущему сотруднику не присваивается новая роль автоматически.

Подготовить отдельные синтетические UAT-аккаунты:

- owner, administrator, director, manager, expert;
- минимум два specialist из разных областей;
- существующий crafter и inactive employee для negative checks.

Новые роли создаёт текущий administrator через управление сотрудниками; связать их
с отдельными Auth users через существующий разрешённый процесс приглашений. Не
использовать реальные PROD-профили и не назначать owner случайному существующему ID.
Отправка приглашений — отдельное действие оператора, локальные тесты писем не шлют.

Через task settings заполнить departments, employee.department_id, reporting lines
и grants. Назначить manager → specialist. Для expert отдельно выдать tasks.assign
на второго сотрудника без tasks.read.scope и проверить независимость этих прав.
Director ограничить выбранным department или hierarchy, не всем location.

Добавить плановые work events на ближайшие недели, meeting, day_off, vacation.
Если график пуст, очередь ничего не начнёт — это ожидаемое закрытое поведение.
Capacity выбрать отдельно от длины смены. Создать задачи с разными приоритетами,
неизвестной оценкой, dependencies, hard deadline и несколькими critical scenarios.
Recurring scheduler оставить выключенным; для проверки явно вызвать команды
recurring_save/recurring_generate с новым operation UUID на каждый новый intent.

## Точный порядок UAT — только после отдельной команды

1. Зафиксировать проверенный HEAD и получить разрешение на UAT. Сейчас этот шаг
   не выполнялся. Сверить целевой project-ref с актуальным поручением, не выводить секреты.
2. Снять backup целевой UAT БД и её grants/function definitions. Проверить восстановление.
3. Прочитать удалённую migration history и текущую schema: Employees constraints,
   auth_* functions, role_permissions, orders_* и production wrappers. Репозиторный
   chain является prerequisite, а не доказательством состояния сервера.
4. Сравнить определение каждой legacy-функции, изменяемой новой migration, с проверенной
   базой. При drift остановить применение до review; не исправлять remote SQL вручную.
5. Подготовить frontend build из той же ветки с UAT URL/key. Не направлять preview в PROD.
6. Запланировать короткое окно без mutations: schema grants/role predicates изменяются.
   Пока весь chain не применён, новых task-пользователей не подключать.
7. Для уже проверенной и явно привязанной UAT-среды посмотреть `supabase migration list
   --linked`, затем `supabase db push --linked --dry-run`. Сверить, что план содержит
   только согласованные pending migrations. Если есть старые непроверенные миграции,
   их не применять автоматически.
8. После review dry run выполнить согласованное применение всех двенадцати новых миграций
   (`supabase db push --linked`). Не использовать `db reset` на удалённой среде.
9. Развернуть совместимый frontend в UAT/Preview. Edge Functions не требуют task-specific
   обновлений, но существующее окружение Auth/PIN должно быть работоспособно.
10. Проверить post-migration constraints, RLS=true на всех новых public tables, отсутствие
    table grants для anon/authenticated, private helper EXECUTE revoked, public tasks RPC
    EXECUTE только authenticated. Проверить новую роль owner и legacy permissions.
11. Создать UAT fixtures по разделу выше и выполнить ручные сценарии ниже.
12. Собрать console/network/DB logs и screenshots, проверить correlation IDs; оформить
    результаты. Не включать load_balancer_enabled до проверки рекомендаций на fixtures.
13. Включить balancer только на UAT, проверить разрешённые и запрещённые переносы.
    Вернуть выбранную оператором настройку после теста.
14. Отдельно принять UAT. PROD остаётся отдельным решением; успешный UAT его не разрешает.

## Manual checks после UAT deploy

- Реальный email/password login owner/director/expert/specialist; reload, logout,
  истёкшая сессия, inactive/archive. Существующий PIN работает без изменения hashes.
- Director открывает только Tasks; прямые вызовы production/orders API запрещены.
- Owner/admin имеют прежние Production/Orders/history/employee management права.
- Manager видит свою hierarchy; другой отдел не появляется без grant.
- Expert с assign-only видит созданную им задачу, но не чужую историю адресата.
- Создать задачу, обновить, назначить, добавить checklist/dependency/comment, отменить.
- Повторить create UUID, оборвать ответ и повторить; дубля нет. Изменённый payload
  с тем же UUID отклонён. Старая version не перезаписывает изменения.
- Проверить границы недели ПН–ЧТ/ПТ–НД; месяц содержит ровно четыре недели.
- Добавить meeting/vacation/day_off, проверить capacity и очередь; неизвестная оценка
  видна, автоматический запуск требует оценки.
- Две вкладки «Розпочати роботу»: одно in_progress и одна открытая session.
- Complete → next; pause не считается временем; reload восстанавливает current.
- critical_now → pause → complete → return; две вложенные critical задачи; отказ
  требует причину, task остаётся видимой, modal не зацикливается.
- critical_today не открывает modal; перегруз вызывает балансировку/рекомендации.
- Low priority переносится первой; fixed/dependency/hard-deadline/approval ограничения
  не обходятся. TASK_AUTO_RESCHEDULED содержит old/new/cause/reason.
- Reschedule request не меняет дату до решения; manager approve/reject работают.
- Рапорт показывает выполненное, переносы, комментарии и реальные интервалы времени;
  выбор другого сотрудника ограничен report scope.
- DST spring gap/fall overlap не интерпретируются по зоне браузера.
- Устройство 768/1024 px: кнопки рабочего режима 64px, нет горизонтального overflow.
- Production, Orders, cutting/issue, history, employee archive и invitations проходят
  прежние ручные сценарии на синтетических данных.

## Rollback и recovery

Рекомендуется roll forward. Старые таблицы и credentials не удаляются.
При проблеме сначала остановить task-мutations, сохранить журналы/backup, отключить
load_balancer_enabled. Закрытие модуля делать отзывом tasks.access через отдельную
проверенную SQL-операцию; одного скрытия кнопки недостаточно.

Frontend rollback допустим только с учётом того, что старый frontend не знает новых
ролей: новые пользователи потеряют вход. Existing users сохраняют capabilities.
Не восстанавливать старые небезопасные production guards ради frontend rollback.

Не удалять Tasks/events/operations для отката релиза. Если одна migration откатилась,
сверить migration history и причину, подготовить исправление и повторить только
неприменённую часть. Для полного DB restore требуется окно обслуживания и отдельное
подтверждение: восстановление backup откатит и последующие бизнес-записи.

## PROD checklist — будущий отдельный этап

- Отдельное разрешение на PROD и проверенный UAT sign-off.
- Сверка реального production upgrade path и remote migration history.
- Backup, подтверждённое восстановление и maintenance window.
- Review изменений legacy permissions, last-admin/owner safeguards, PIN compatibility.
- Тот же проверенный migration chain и frontend artifact, без тестовых users/tasks.
- Role/scope provisioning по утверждённому списку; не копировать UAT fixtures в PROD.
- Балансировщик сначала в режиме рекомендаций; включение отдельным контролируемым шагом.
- Smoke-check старых модулей, мониторинг серверных logs, latency и lock waits.
- Никаких AI keys/cron/realtime services без отдельного решения.

## Ограничения и последующие улучшения

- Hosted Auth/remote RLS/реальные данные ещё не проверены; это UAT gate, а не локальная
  гарантия размещённой среды.
- Polling 15 секунд; нет push при закрытом приложении.
- Планирование и org mutations используют conservative graph lock; для большой нагрузки
  потребуется нагрузочный тест и возможное разделение locks по dependency components.
- Balancer не переносит dependency-linked задачи автоматически и не оптимизирует
  произвольное сложное расписание. Неразрешённый перегруз остаётся видимым.
- Recurrence — серверные templates/generator без автоматического cron и UI конструктора.
- Рапорт: до 200 строк деталей/500 событий; итоги не обрезаются, период можно сузить.
  Большой экспорт и пагинация событий рапорта — TODO.
- Перед переводом существующего PIN-сотрудника в новую email/password роль нужен
  отдельный проверенный credential migration flow; PIN constraint не обходится.
- AI, attachments, внешний import endpoint, HR-calendar sync — отдельные будущие возможности.
