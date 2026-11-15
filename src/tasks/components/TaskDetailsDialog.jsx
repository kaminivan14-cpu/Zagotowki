import TaskResult from "../admin/TaskResult";
import TaskActions from "./TaskActions";
import DateTimeInput from "./DateTimeInput";
import { useEffect, useState } from "react";
import TasksDialog from "./ui/TasksDialog";
import { read, errorText } from "../client";
import { duration, priorities, categoryName } from "../labels.uk";
import { instantLabel, localToInstant } from "../dateTime";
import { tr } from "../../i18n/runtime";
import { useLocale } from "../../i18n/useLocale";
import TasksButton from "./ui/TasksButton";
import TasksIcon from "./ui/TasksIcon";
import TasksDropdownMenu from "./ui/TasksDropdownMenu";
import TasksConfirmationDialog from "./ui/TasksConfirmationDialog";
import TasksStateMessage from "./ui/TasksStateMessage";
import PersonAvatar from "../employees/PersonAvatar";
import TasksRecurrenceControl from "./ui/TasksRecurrenceControl";
import { StatusBadge, PriorityBadge, CategoryBadge } from "./TaskBadges";
import DescriptionEditor from "./DescriptionEditor";
import SubtasksSection from "./SubtasksSection";
import TaskAttachments from "./TaskAttachments";
import CommentsSection from "./CommentsSection";
import ActivityTimeline from "./ActivityTimeline";
import TaskSearchSelect from "./TaskSearchSelect";
import "./task-workspace.css";
// One workspace for viewing and editing a task (РБ-012): header with breadcrumb/title/status/actions,
// main column (description, subtasks, checklist, attachments, result, comments, activity) and a
// properties column. Every previous action (start/done, plan, pause, assign, checklist, dependency,
// cancel, comment, history paging) is still available here; saves stay explicit.
function Section({ icon, title, count, children, id }) {
  return (
    <section className="task-section" aria-labelledby={id}>
      <h3 id={id} className="task-section-title">
        <TasksIcon name={icon} size={17} className="tk-muted" />
        {title}
        {count != null && <span className="tk-tab-count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}
function Property({ label, children, icon }) {
  return (
    <div className="task-prop">
      <dt>
        {icon && <TasksIcon name={icon} size={14} />}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
export default function TaskDetailsDialog({
  task,
  context,
  run,
  busy,
  onClose,
  revision,
  people,
  onDetails,
}) {
  useLocale();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [titleEdit, setTitleEdit] = useState(null),
    [confirm, setConfirm] = useState(null),
    [parentPicker, setParentPicker] = useState(false),
    [dependencyPicker, setDependencyPicker] = useState(false),
    // Unplanned tasks open with the plan form ready (the planning screen relies on this); planned tasks collapse it.
    [planning, setPlanning] = useState(!task.deepLink && !task.planned_date),
    [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    read("tasks_details", { p_task: task.id })
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [task.id, revision]);
  // Older mocks/consumers may return only task/checklist/events; default the rest so the workspace renders.
  const d = data && {
    ancestors: [],
    children: [],
    children_hidden: 0,
    incomplete_children: 0,
    attachments: [],
    dependencies: [],
    permissions: {},
    checklist: [],
    events: [],
    progress: null,
    parent: null,
    ...data,
  };
  const t = d?.task,
    zone = context.settings.company_timezone,
    perms = d?.permissions || {},
    categories = context.category_history || context.categories || [],
    final =
      t && (["completed", "cancelled"].includes(t.status) || t.deleted_at),
    editable = Boolean(perms.edit) && !final;
  const update = (fields) =>
    run("update", { task_id: t.id, version: t.version, ...fields });
  const open = (child) => onDetails?.({ id: child.id, title: child.title });
  const deadlineForm = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      void update({ deadline_at: localToInstant(f.get("deadline"), zone) });
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <TasksDialog
      plain
      size="wide"
      title={t?.title || task.title}
      onClose={onClose}
      busy={busy}
      className="task-workspace-dialog"
    >
      {error && (
        <p role="alert" className="tk-inline-error">
          {error}
        </p>
      )}
      {!t ? (
        !error && <TasksStateMessage kind="loading" />
      ) : (
        <div className="task-workspace">
          <header className="task-workspace-head">
            <nav
              className="task-crumbs"
              aria-label={tr("Батьківські завдання")}
            >
              {d.ancestors.map((a) => (
                <span key={a.id}>
                  <TasksButton
                    type="button"
                    className="task-crumb"
                    onClick={() => open(a)}
                  >
                    {a.title}
                  </TasksButton>
                  <TasksIcon name="chevronRight" size={14} />
                </span>
              ))}
              <span className="task-tree-id">#{t.id}</span>
            </nav>
            <div className="task-workspace-titlebar">
              {titleEdit !== null ? (
                <form
                  className="tk-form task-title-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      titleEdit.trim() &&
                      (await update({ title: titleEdit.trim() }))
                    )
                      setTitleEdit(null);
                  }}
                >
                  <input
                    aria-label={tr("Назва")}
                    value={titleEdit}
                    maxLength={300}
                    required
                    autoFocus
                    onChange={(e) => setTitleEdit(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setTitleEdit(null)}
                  />
                  <TasksButton
                    size="sm"
                    variant="primary"
                    type="submit"
                    disabled={busy}
                  >
                    {tr("Зберегти")}
                  </TasksButton>
                  <TasksButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setTitleEdit(null)}
                  >
                    {tr("Скасувати")}
                  </TasksButton>
                </form>
              ) : (
                <h2 className="task-workspace-title">
                  {t.title}
                  {editable && (
                    <TasksButton
                      size="sm"
                      variant="ghost"
                      icon="edit"
                      iconOnly
                      onClick={() => setTitleEdit(t.title)}
                      disabled={busy}
                    >
                      {tr("Редагувати назву")}
                    </TasksButton>
                  )}
                </h2>
              )}
              <div className="task-workspace-actions">
                <TasksDropdownMenu
                  label={tr("Дії із завданням")}
                  items={[
                    perms.edit &&
                    !final &&
                    !["in_progress", "paused"].includes(t.status)
                      ? {
                          label: tr("Скасувати завдання"),
                          icon: "close",
                          onSelect: () => setConfirm("cancel"),
                        }
                      : null,
                    perms.delete &&
                    !t.deleted_at &&
                    !["in_progress", "paused", "pending_approval"].includes(
                      t.status,
                    )
                      ? {
                          label: tr("Видалити завдання"),
                          icon: "trash",
                          danger: true,
                          onSelect: () => setConfirm("delete"),
                        }
                      : null,
                    {
                      label: tr("Закрити"),
                      icon: "chevronLeft",
                      onSelect: onClose,
                    },
                  ]}
                />
              </div>
            </div>
            <div className="task-workspace-badges">
              <StatusBadge
                status={t.status}
                overdue={
                  t.deadline_at && Date.parse(t.deadline_at) < now && !final
                }
                deleted={Boolean(t.deleted_at)}
              />
              <PriorityBadge priority={t.priority} />
              <CategoryBadge
                category={
                  t.category_id
                    ? {
                        id: t.category_id,
                        name: categoryName(t.category_id, categories),
                      }
                    : null
                }
              />
              {t.urgency !== "normal" && (
                <span className="tk-badge tk-badge-red">{tr("Терміново")}</span>
              )}
              {d.incomplete_children > 0 && !final && (
                <span
                  className="tk-badge tk-badge-amber"
                  title={tr(
                    "Завершення батьківського завдання заблоковано, доки є незавершені підзавдання.",
                  )}
                >
                  <TasksIcon name="alert" size={13} />
                  {tr("Незавершених підзавдань: {n}", {
                    n: d.incomplete_children,
                  })}
                </span>
              )}
            </div>
            {t.deleted_at && (
              <p className="tk-inline-error">
                {tr("Завдання видалено. Дані доступні лише для перегляду.")}
              </p>
            )}
            <TaskActions
              task={t}
              context={context}
              run={run}
              busy={busy}
              onCompleted={onClose}
              blockedChildren={d.incomplete_children}
            />
          </header>
          <div className="task-workspace-body">
            <div className="task-workspace-main">
              <Section
                icon="file"
                title={tr("Опис")}
                id="task-section-description"
              >
                <DescriptionEditor
                  value={t.description}
                  canEdit={editable}
                  busy={busy}
                  onSave={(description) => update({ description })}
                />
              </Section>
              <Section
                icon="subtask"
                title={tr("Підзавдання")}
                id="task-section-subtasks"
                count={
                  d.progress ? `${d.progress.done}/${d.progress.total}` : null
                }
              >
                <SubtasksSection
                  task={t}
                  items={d.children}
                  hidden={d.children_hidden}
                  progress={d.progress}
                  canCreate={
                    !t.deleted_at &&
                    (context.capabilities.includes("tasks.create.self") ||
                      context.capabilities.includes("tasks.assign"))
                  }
                  run={run}
                  busy={busy}
                  onOpen={open}
                  zone={zone}
                />
              </Section>
              {(d.checklist.length > 0 || editable) && (
                <Section
                  icon="check"
                  title={tr("Чек-лист")}
                  id="task-section-checklist"
                  count={
                    d.checklist.length
                      ? `${d.checklist.filter((c) => c.completed).length}/${d.checklist.length}`
                      : null
                  }
                >
                  <ul className="task-checklist">
                    {d.checklist.map((c) => (
                      <li key={c.id}>
                        <label className="tk-check">
                          <input
                            type="checkbox"
                            checked={c.completed}
                            disabled={busy || Boolean(t.deleted_at)}
                            onChange={(e) =>
                              run("checklist_toggle", {
                                task_id: t.id,
                                version: t.version,
                                item_id: c.id,
                                completed: e.target.checked,
                              })
                            }
                          />
                          <span className={c.completed ? "is-done" : ""}>
                            {c.text}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <form
                      className="tk-form task-inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        run("checklist_add", {
                          task_id: t.id,
                          version: t.version,
                          text: new FormData(f).get("text"),
                        }).then((ok) => ok && f.reset());
                      }}
                    >
                      <input
                        name="text"
                        required
                        maxLength={2000}
                        aria-label={tr("Новий пункт переліку")}
                        placeholder={tr("Новий пункт переліку")}
                      />
                      <TasksButton type="submit" size="sm" disabled={busy}>
                        {tr("Додати пункт")}
                      </TasksButton>
                    </form>
                  )}
                </Section>
              )}
              <Section
                icon="paperclip"
                title={tr("Вкладення")}
                id="task-section-attachments"
                count={d.attachments.length || null}
              >
                <TaskAttachments
                  task={t}
                  attachments={d.attachments}
                  canAttach={Boolean(perms.attach)}
                  run={run}
                  busy={busy}
                  zone={zone}
                />
              </Section>
              {t.source_type === "process" && (
                <Section
                  icon="flag"
                  title={tr("Результат процесу")}
                  id="task-section-result"
                >
                  <TaskResult
                    task={t}
                    run={run}
                    busy={busy}
                    revision={revision}
                  />
                </Section>
              )}
              <Section
                icon="comment"
                title={tr("Коментарі")}
                id="task-section-comments"
                count={
                  d.events.filter((e) => e.event_type === "COMMENT_ADDED")
                    .length || null
                }
              >
                <CommentsSection
                  task={t}
                  events={d.events}
                  run={run}
                  busy={busy}
                  zone={zone}
                />
              </Section>
              <Section
                icon="history"
                title={tr("Активність")}
                id="task-section-activity"
              >
                <ActivityTimeline
                  events={d.events}
                  zone={zone}
                  people={people}
                  categories={categories}
                  busy={busy}
                  hasMore={d.events.length >= 100}
                  onMore={async () => {
                    try {
                      const more = await read("tasks_events", {
                        p_task: t.id,
                        p_before: Math.min(...d.events.map((e) => e.id)),
                      });
                      setData((old) => ({
                        ...old,
                        events: [...more.events, ...old.events],
                      }));
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                />
              </Section>
            </div>
            <aside className="task-workspace-props">
              <dl className="task-props">
                <Property label={tr("Статус")} icon="flag">
                  <StatusBadge
                    status={t.status}
                    deleted={Boolean(t.deleted_at)}
                  />
                  {t.status === "in_progress" && perms.work && (
                    <TasksButton
                      size="sm"
                      variant="ghost"
                      icon="clock"
                      disabled={busy}
                      onClick={() =>
                        run("pause", { task_id: t.id, version: t.version })
                      }
                    >
                      {tr("Призупинити для перенесення")}
                    </TasksButton>
                  )}
                </Property>
                <Property label={tr("Пріоритет")} icon="arrowUp">
                  {editable ? (
                    <select
                      aria-label={tr("Пріоритет")}
                      value={t.priority}
                      disabled={busy}
                      onChange={(e) => update({ priority: e.target.value })}
                    >
                      {Object.entries(priorities).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <PriorityBadge priority={t.priority} />
                  )}
                </Property>
                <Property label={tr("Виконавець")} icon="user">
                  {perms.assign &&
                  !final &&
                  !["in_progress", "paused", "pending_approval"].includes(
                    t.status,
                  ) ? (
                    <select
                      aria-label={tr("Новий виконавець")}
                      value={t.assigned_to_employee_id}
                      disabled={busy}
                      onChange={(e) =>
                        run("assign", {
                          task_id: t.id,
                          version: t.version,
                          assigned_to_employee_id: Number(e.target.value),
                        })
                      }
                    >
                      {!people.some(
                        (p) => p.id === t.assigned_to_employee_id,
                      ) &&
                        d.assignee && (
                          <option value={t.assigned_to_employee_id}>
                            {d.assignee.name}
                          </option>
                        )}
                      {people.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="tk-person">
                      <PersonAvatar
                        person={d.assignee || { name: "?" }}
                        size={24}
                      />
                      <span>{d.assignee?.name || tr("Не призначено")}</span>
                    </span>
                  )}
                </Property>
                <Property label={tr("Автор")} icon="user">
                  <span className="tk-person">
                    <PersonAvatar
                      person={d.creator || { name: "?" }}
                      size={24}
                    />
                    <span>{d.creator?.name || "—"}</span>
                  </span>
                </Property>
                <Property label={tr("Дедлайн")} icon="calendar">
                  {editable ? (
                    <form
                      className="tk-form task-inline-form"
                      onSubmit={deadlineForm}
                    >
                      <DateTimeInput
                        key={t.deadline_at}
                        aria-label={tr("Дедлайн")}
                        name="deadline"
                        type="datetime-local"
                        required
                        defaultValue={
                          t.deadline_at ? toLocalInput(t.deadline_at, zone) : ""
                        }
                      />
                      <TasksButton type="submit" size="sm" disabled={busy}>
                        {tr("Зберегти")}
                      </TasksButton>
                    </form>
                  ) : (
                    <span>{instantLabel(t.deadline_at, zone)}</span>
                  )}
                </Property>
                <Property label={tr("Орієнтовний час")} icon="clock">
                  {editable ? (
                    <form
                      className="tk-form task-inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = new FormData(e.currentTarget).get("minutes");
                        void update({
                          estimated_minutes: v ? Number(v) : null,
                        });
                      }}
                    >
                      <input
                        name="minutes"
                        type="number"
                        min="1"
                        max="525600"
                        aria-label={tr("Орієнтовний час, хв")}
                        defaultValue={t.estimated_minutes || ""}
                        key={t.estimated_minutes}
                      />
                      <TasksButton type="submit" size="sm" disabled={busy}>
                        {tr("Зберегти")}
                      </TasksButton>
                    </form>
                  ) : (
                    duration(t.estimated_minutes)
                  )}
                  <small className="tk-muted">
                    {tr("Фактично")}: {duration(t.actual_minutes)}
                  </small>
                </Property>
                <Property label={tr("Категорія")} icon="category">
                  {editable ? (
                    <select
                      aria-label={tr("Категорія")}
                      value={t.category_id || ""}
                      disabled={busy}
                      onChange={(e) =>
                        update({
                          category_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">{tr("Без категорії")}</option>
                      {context.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {categoryName(c.id, context.categories)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    categoryName(t.category_id, categories)
                  )}
                </Property>
                <Property label={tr("Батьківське завдання")} icon="subtask">
                  {d.parent ? (
                    <span className="task-parent-value">
                      <TasksButton
                        type="button"
                        className="task-crumb"
                        onClick={() => open(d.parent)}
                      >
                        <span className="task-tree-id">#{d.parent.id}</span>{" "}
                        {d.parent.title}
                      </TasksButton>
                      {editable && (
                        <TasksButton
                          size="sm"
                          variant="ghost"
                          icon="close"
                          iconOnly
                          disabled={busy}
                          onClick={() =>
                            run("set_parent", {
                              task_id: t.id,
                              version: t.version,
                              parent_task_id: null,
                            })
                          }
                        >
                          {tr("Очистити батьківське завдання")}
                        </TasksButton>
                      )}
                    </span>
                  ) : t.parent_task_id ? (
                    <span className="tk-muted">
                      {tr("Батьківське завдання недоступне")}
                    </span>
                  ) : (
                    <span className="tk-muted">{tr("Кореневе завдання")}</span>
                  )}
                  {editable &&
                    (parentPicker ? (
                      <TaskSearchSelect
                        excludeTaskId={t.id}
                        autoFocus
                        placeholder={tr("Пошук батьківського завдання...")}
                        onSelect={async (p) => {
                          if (
                            await run("set_parent", {
                              task_id: t.id,
                              version: t.version,
                              parent_task_id: p.id,
                            })
                          )
                            setParentPicker(false);
                        }}
                      />
                    ) : (
                      <TasksButton
                        size="sm"
                        variant="link"
                        icon="edit"
                        disabled={busy}
                        onClick={() => setParentPicker(true)}
                      >
                        {d.parent
                          ? tr("Змінити батьківське завдання")
                          : tr("Обрати батьківське завдання")}
                      </TasksButton>
                    ))}
                </Property>
                <Property label={tr("Циклічність")} icon="repeat">
                  <TasksRecurrenceControl
                    readOnly
                    value={t.source_metadata?.recurrence}
                  />
                </Property>
                <Property label={tr("Залежності")} icon="link">
                  {d.dependencies.length ? (
                    <ul className="task-dependency-list">
                      {d.dependencies.map((d) => (
                        <li key={d.id}>
                          <TasksButton
                            type="button"
                            className="task-crumb"
                            onClick={() => open(d)}
                          >
                            <span className="task-tree-id">#{d.id}</span>{" "}
                            {d.title}
                          </TasksButton>
                          <StatusBadge status={d.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="tk-muted">{tr("Немає")}</span>
                  )}
                  {editable &&
                    !["in_progress", "paused"].includes(t.status) &&
                    (dependencyPicker ? (
                      <TaskSearchSelect
                        excludeTaskId={t.id}
                        exclude={d.dependencies.map((d) => d.id)}
                        autoFocus
                        onSelect={async (d) => {
                          if (
                            await run("dependency", {
                              task_id: t.id,
                              version: t.version,
                              depends_on_task_id: d.id,
                            })
                          )
                            setDependencyPicker(false);
                        }}
                      />
                    ) : (
                      <TasksButton
                        size="sm"
                        variant="link"
                        icon="plus"
                        disabled={busy}
                        onClick={() => setDependencyPicker(true)}
                      >
                        {tr("Додати залежність")}
                      </TasksButton>
                    ))}
                </Property>
                {![
                  "completed",
                  "cancelled",
                  "in_progress",
                  "pending_approval",
                ].includes(t.status) &&
                  !t.deleted_at && (
                    <Property label={tr("Планування")} icon="planning">
                      <span>
                        {t.planned_date
                          ? t.planned_date.split("-").reverse().join(".")
                          : tr("Не заплановано")}
                        {t.planned_start_at &&
                          ` · ${instantLabel(t.planned_start_at, zone)}`}
                      </span>
                      {planning ? (
                        <form
                          className="tk-form task-plan-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            try {
                              const start = localToInstant(
                                f.get("start"),
                                zone,
                              );
                              run("plan", {
                                task_id: t.id,
                                version: t.version,
                                planned_date: f.get("date"),
                                planned_start_at: start,
                                reason: f.get("reason"),
                              }).then((ok) => ok && setPlanning(false));
                            } catch (err) {
                              setError(errorText(err));
                            }
                          }}
                        >
                          <label className="tk-field">
                            <span className="tk-field-label">{tr("Дата")}</span>
                            <DateTimeInput
                              aria-label={tr("Дата")}
                              name="date"
                              type="date"
                              min={context.today}
                              defaultValue={t.planned_date || context.today}
                              required
                            />
                          </label>
                          <label className="tk-field">
                            <span className="tk-field-label">
                              {tr("Фіксований початок")}
                            </span>
                            <DateTimeInput
                              aria-label={tr("Фіксований початок")}
                              name="start"
                              type="datetime-local"
                            />
                          </label>
                          <label className="tk-field">
                            <span className="tk-field-label">
                              {tr("Причина")}
                            </span>
                            <input
                              name="reason"
                              required
                              defaultValue={tr("Планування роботи")}
                            />
                          </label>
                          <small className="tk-muted">
                            {tr("Часовий пояс")}: {zone}
                          </small>
                          <div className="tk-row">
                            <TasksButton
                              type="submit"
                              size="sm"
                              variant="primary"
                              disabled={busy}
                            >
                              {tr("Зберегти дату")}
                            </TasksButton>
                            <TasksButton
                              size="sm"
                              variant="ghost"
                              onClick={() => setPlanning(false)}
                            >
                              {tr("Скасувати")}
                            </TasksButton>
                          </div>
                        </form>
                      ) : (
                        <TasksButton
                          size="sm"
                          variant="link"
                          icon="calendar"
                          disabled={busy}
                          onClick={() => setPlanning(true)}
                        >
                          {t.planned_date ? tr("Перенести") : tr("Запланувати")}
                        </TasksButton>
                      )}
                    </Property>
                  )}
                <Property label={tr("Створено")} icon="clock">
                  {instantLabel(t.created_at, zone)}
                  {t.completed_at && (
                    <small className="tk-muted">
                      {tr("Виконано")}: {instantLabel(t.completed_at, zone)}
                    </small>
                  )}
                </Property>
              </dl>
            </aside>
          </div>
        </div>
      )}
      {confirm === "cancel" && t && (
        <TasksConfirmationDialog
          title={tr("Скасувати завдання?")}
          text={tr("«{name}» буде скасовано зі збереженням історії.", {
            name: t.title,
          })}
          confirmLabel={tr("Скасувати завдання")}
          cancelLabel={tr("Назад")}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (await run("cancel", { task_id: t.id, version: t.version })) {
              setConfirm(null);
              onClose();
            }
          }}
        />
      )}
      {confirm === "delete" && t && (
        <TasksConfirmationDialog
          danger
          title={tr("Видалити завдання?")}
          text={tr(
            "«{name}» буде видалено зі списків. Історію активності буде збережено.",
            { name: t.title },
          )}
          details={
            d.progress?.total ? (
              <p className="tk-inline-error">
                {tr(
                  "У завдання є підзавдання ({count}). Спочатку перенесіть або видаліть їх — ієрархія не видаляється цілком.",
                  { count: d.progress.total },
                )}
              </p>
            ) : null
          }
          confirmLabel={tr("Видалити")}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (await run("delete", { task_id: t.id, version: t.version })) {
              setConfirm(null);
              onClose();
            }
          }}
        />
      )}
    </TasksDialog>
  );
}
function toLocalInput(iso, zone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
