import DateTimeInput from "./DateTimeInput";
import { useRef, useState } from "react";
import { errorText } from "../client";
import TasksDialog from "./ui/TasksDialog";
// TODO: Disabled — the legacy editor stylesheet (task-editor / editor-actions) broke the dialog header and footer
// layout; the create dialog is styled by components/task-workspace.css only.
// import "../workspace.css";
import { priorities, categoryName } from "../labels.uk";
import { localToInstant, addDays } from "../dateTime";
import TasksRecurrenceControl from "./ui/TasksRecurrenceControl";
import { noRecurrence } from "../../shared/recurrence";
import { tr } from "../../i18n/runtime";
import { useLocale } from "../../i18n/useLocale";
import TasksButton from "./ui/TasksButton";
import TasksField from "./ui/TasksField";
import TasksIcon from "./ui/TasksIcon";
import TasksSwitch from "./ui/TasksSwitch";
import TasksConfirmationDialog from "./ui/TasksConfirmationDialog";
import TaskSearchSelect from "./TaskSearchSelect";
import { StatusBadge } from "./TaskBadges";
// Create Task dialog (РБ-006): fixed header, one scrollable body (sections on the left, task parameters on
// the right) and a fixed footer. Every previous field, default, validation and side effect is preserved; the
// parent-task field (РБ-008) and real subtasks (РБ-004) were added. Follow-up operations (subtasks,
// checklist, dependencies, comment) run after the task is created and can be retried safely.
function CreateSection({ icon, title, optional = false, hint, children }) {
  return (
    <section className="tk-create-section">
      <header className="tk-create-section-head">
        <h3>
          <TasksIcon name={icon} size={18} />
          <span>{title}</span>
          {optional && <small>({tr("необов’язково")})</small>}
        </h3>
        {hint && <p>{hint}</p>}
      </header>
      {children}
    </section>
  );
}
export default function TaskCreateDialog({
  context,
  people,
  run,
  busy,
  onClose,
  initialPlannedDate,
  initialEmployeeId,
  initialParent,
}) {
  useLocale();
  const [error, setError] = useState(""),
    [target, setTarget] = useState(
      String(initialEmployeeId || context.employee_id),
    ),
    [estimate, setEstimate] = useState("30"),
    [recurrence, setRecurrence] = useState(noRecurrence),
    [interrupt, setInterrupt] = useState(false),
    [parent, setParent] = useState(initialParent || null),
    [parentPicker, setParentPicker] = useState(false),
    [dirty, setDirty] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const form = useRef(null),
    progress = useRef({ task: null, index: 0, operations: [] }),
    [saved, setSaved] = useState(false),
    [subtasks, setSubtasks] = useState([]),
    [checklist, setChecklist] = useState([]),
    [dependencies, setDependencies] = useState([]);
  const canInterrupt = context.capabilities.includes("tasks.interrupt"),
    assignees = people.some((p) => p.id === context.employee_id)
      ? people
      : [{ id: context.employee_id, name: tr("Собі") }, ...people];
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = progress.current;
    if (!p.task) {
      const args = {
        title: f.get("title").trim(),
        description: f.get("description"),
        category_id: f.get("category_id") || null,
        priority: f.get("priority"),
        urgency: interrupt ? "critical_now" : "normal",
        estimated_minutes: Number(estimate),
        assigned_to_employee_id: Number(target),
        deadline_at: localToInstant(
          f.get("deadline"),
          context.settings.company_timezone,
        ),
        deadline_is_hard: false,
        planned_date: initialPlannedDate || null,
        recurrence,
        ...(parent ? { parent_task_id: parent.id } : {}),
      };
      if (!args.title || !args.deadline_at || !args.estimated_minutes) {
        setError(tr("Заповніть обов’язкові поля."));
        return;
      }
      const result = await run("create", args);
      if (!result) return;
      p.task = result;
      p.operations = [
        ...subtasks
          .filter((x) => x.trim())
          .map((title) => ({
            action: "create",
            child: true,
            args: { title: title.trim() },
          })),
        ...checklist
          .filter((x) => x.trim())
          .map((text, i) => ({
            action: "checklist_add",
            args: { text, sort_order: i },
          })),
        ...dependencies.map((t) => ({
          action: "dependency",
          args: { depends_on_task_id: t.id },
        })),
        ...(f.get("comment")?.trim()
          ? [{ action: "comment", args: { text: f.get("comment").trim() } }]
          : []),
      ];
      setSaved(true);
    }
    while (p.index < p.operations.length) {
      const op = p.operations[p.index];
      const result = await run(
        op.action,
        op.child
          ? { ...op.args, parent_task_id: p.task.id }
          : { ...op.args, task_id: p.task.id, version: p.task.version },
      );
      if (!result) return;
      if (!op.child) p.task = result;
      p.index++;
    }
    onClose();
  }
  // Closing a form with typed content asks first; an untouched form closes immediately.
  const requestClose = () => {
    if (busy) return;
    if (dirty && !saved) setConfirmClose(true);
    else onClose();
  };
  const listEditor = (items, setItems, label, placeholder, addLabel) => (
    <div className="tk-create-list">
      {items.length > 0 && (
        <ol className="tk-create-items">
          {items.map((text, i) => (
            <li className="tk-create-item" key={i}>
              <span className="tk-create-item-number" aria-hidden="true">
                {i + 1}.
              </span>
              <label className="sr-only" htmlFor={`${label}-${i}`}>
                {label} {i + 1}
              </label>
              <input
                id={`${label}-${i}`}
                value={text}
                maxLength={300}
                required
                placeholder={placeholder}
                onChange={(e) =>
                  setItems((old) =>
                    old.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
              <TasksButton
                size="sm"
                variant="ghost"
                icon="arrowUp"
                iconOnly
                disabled={i === 0}
                onClick={() =>
                  setItems((old) => {
                    const a = [...old];
                    [a[i - 1], a[i]] = [a[i], a[i - 1]];
                    return a;
                  })
                }
              >
                {`${tr("Перемістити вгору")} ${i + 1}`}
              </TasksButton>
              <TasksButton
                size="sm"
                variant="ghost"
                icon="close"
                iconOnly
                onClick={() => setItems((old) => old.filter((_, j) => j !== i))}
              >
                {`${tr("Видалити")} ${i + 1}`}
              </TasksButton>
            </li>
          ))}
        </ol>
      )}
      <TasksButton
        size="sm"
        variant="link"
        icon="plus"
        className="tk-create-add"
        onClick={() => setItems((old) => [...old, ""])}
      >
        {addLabel}
      </TasksButton>
    </div>
  );
  return (
    <TasksDialog
      hideClose
      plain
      size="wide"
      title={tr("Створити завдання")}
      onClose={requestClose}
      busy={busy}
      onRetry={() => form.current?.requestSubmit()}
      className="tk-create-dialog"
    >
      <form
        ref={form}
        className="tk-create tk-form"
        onInput={() => setDirty(true)}
        onSubmit={(e) => {
          void submit(e).catch((e) => setError(errorText(e)));
        }}
      >
        <header className="tk-create-head">
          <nav className="tk-create-crumbs" aria-label={tr("Шлях")}>
            <span>{tr("Завдання")}</span>
            <TasksIcon name="chevronRight" size={14} />
            <span aria-current="page">{tr("Створити")}</span>
          </nav>
          <h2>{tr("Створити завдання")}</h2>
          <p>
            {tr(
              "Заповніть основну інформацію, за потреби додайте підзавдання, зв’язки та налаштуйте повторення.",
            )}
          </p>
        </header>
        <div className="tk-create-body">
          {error && (
            <p role="alert" className="tk-create-message tk-create-error">
              <TasksIcon name="alert" size={16} />
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="tk-create-message">
              <TasksIcon name="info" size={16} />
              {tr(
                "Завдання створено. Зберігаємо пункти та залежності; у разі помилки повторіть дію.",
              )}
            </p>
          )}
          <fieldset disabled={busy || saved} className="tk-create-grid">
            <legend className="sr-only">{tr("Створити завдання")}</legend>
            <div className="tk-create-main">
              <CreateSection icon="file" title={tr("Основна інформація")}>
                <TasksField label={tr("Назва")} required>
                  <input
                    name="title"
                    required
                    maxLength={300}
                    autoFocus
                    placeholder={tr(
                      "Наприклад: Підготувати меню на наступний тиждень",
                    )}
                  />
                </TasksField>
                <TasksField
                  label={tr("Опис")}
                  hint={tr(
                    "Додайте опис завдання, деталі, очікуваний результат.",
                  )}
                >
                  <textarea name="description" maxLength={20000} rows={5} />
                </TasksField>
              </CreateSection>
              <CreateSection
                icon="subtask"
                title={tr("Підзавдання")}
                optional
                hint={tr(
                  "Кожне підзавдання стане окремим завданням зі стандартними параметрами; редагувати його можна після створення.",
                )}
              >
                {listEditor(
                  subtasks,
                  setSubtasks,
                  tr("Підзавдання"),
                  tr("Назва підзавдання"),
                  tr("Додати підзавдання"),
                )}
              </CreateSection>
              <CreateSection icon="check" title={tr("Чек-лист")} optional>
                {listEditor(
                  checklist,
                  setChecklist,
                  tr("Пункт"),
                  tr("Текст пункту"),
                  tr("Додати пункт"),
                )}
              </CreateSection>
              <CreateSection
                icon="link"
                title={tr("Залежності")}
                optional
                hint={tr(
                  "Оберіть завдання, які мають бути виконані перед цим.",
                )}
              >
                <TaskSearchSelect
                  exclude={dependencies.map((d) => d.id)}
                  onSelect={(t) => setDependencies((old) => [...old, t])}
                />
                {dependencies.length > 0 && (
                  <ul className="tk-create-dependencies">
                    {dependencies.map((t) => (
                      <li key={t.id}>
                        <span className="task-tree-id">#{t.id}</span>
                        <span className="tk-truncate">{t.title}</span>
                        <StatusBadge status={t.status} />
                        <TasksButton
                          size="sm"
                          variant="ghost"
                          icon="close"
                          iconOnly
                          onClick={() =>
                            setDependencies((old) =>
                              old.filter((d) => d.id !== t.id),
                            )
                          }
                        >
                          {`${tr("Видалити")} ${t.title}`}
                        </TasksButton>
                      </li>
                    ))}
                  </ul>
                )}
              </CreateSection>
              <CreateSection icon="comment" title={tr("Коментар")} optional>
                <TasksField
                  label={tr("Коментар")}
                  className="tk-create-comment"
                >
                  <textarea
                    name="comment"
                    maxLength={2000}
                    rows={3}
                    placeholder={tr("Додайте коментар...")}
                  />
                </TasksField>
              </CreateSection>
            </div>
            <aside
              className="tk-create-side"
              aria-labelledby="tk-create-side-title"
            >
              <h3 id="tk-create-side-title" className="tk-create-side-title">
                <TasksIcon name="settings" size={18} />
                {tr("Параметри завдання")}
              </h3>
              <TasksField label={tr("Категорія")}>
                <select name="category_id">
                  <option value="">{tr("Без категорії")}</option>
                  {context.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryName(c.id, context.categories)}
                    </option>
                  ))}
                </select>
              </TasksField>
              <TasksField label={tr("Пріоритет")} required>
                <select name="priority" required defaultValue="medium">
                  {Object.entries(priorities).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </TasksField>
              <TasksField label={tr("Виконавець")} required>
                <select
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {assignees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === context.employee_id ? tr("Собі") : p.name}
                    </option>
                  ))}
                </select>
              </TasksField>
              <div className="tk-create-pair">
                <TasksField
                  label={tr("Дедлайн")}
                  required
                  hint={`${tr("Часовий пояс")}: ${context.settings.company_timezone}`}
                >
                  <DateTimeInput
                    name="deadline"
                    type="datetime-local"
                    required
                    defaultValue={`${addDays(context.today, 7)}T17:00`}
                  />
                </TasksField>
                <TasksField label={tr("Орієнтовний час, хв")} required>
                  <input
                    name="estimated_minutes"
                    required
                    type="number"
                    min="1"
                    max="525600"
                    value={estimate}
                    onChange={(e) => setEstimate(e.target.value)}
                  />
                </TasksField>
              </div>
              {canInterrupt && (
                <div className="tk-create-group">
                  <TasksSwitch
                    checked={interrupt}
                    onChange={setInterrupt}
                    description={tr(
                      "Дозволяє тимчасово зупинити виконання поточних завдань.",
                    )}
                  >
                    {tr("Переривання роботи")}
                  </TasksSwitch>
                  {interrupt && (
                    <label className="tk-check tk-create-confirm">
                      <input type="checkbox" required />
                      {tr("Підтверджую негайне переривання поточної роботи")}
                    </label>
                  )}
                </div>
              )}
              <div className="tk-create-group">
                <span className="tk-create-group-title">
                  <TasksIcon name="repeat" size={16} />
                  {tr("Циклічність")}
                </span>
                <TasksRecurrenceControl
                  label={tr("Повторювати завдання")}
                  value={recurrence}
                  onChange={setRecurrence}
                />
              </div>
              <div className="tk-create-group">
                <span className="tk-create-group-title">
                  <TasksIcon name="subtask" size={16} />
                  {tr("Батьківське завдання")}
                </span>
                {parent ? (
                  <div className="task-parent-value">
                    <span className="task-tree-id">#{parent.id}</span>
                    <span className="tk-truncate">{parent.title}</span>
                    <TasksButton
                      size="sm"
                      variant="ghost"
                      icon="close"
                      iconOnly
                      onClick={() => setParent(null)}
                    >
                      {tr("Очистити батьківське завдання")}
                    </TasksButton>
                  </div>
                ) : parentPicker ? (
                  <TaskSearchSelect
                    autoFocus
                    onSelect={(t) => {
                      setParent(t);
                      setParentPicker(false);
                    }}
                    placeholder={tr("Пошук батьківського завдання...")}
                  />
                ) : (
                  <TasksButton
                    size="sm"
                    variant="link"
                    icon="plus"
                    className="tk-create-add"
                    onClick={() => setParentPicker(true)}
                  >
                    {tr("Обрати батьківське завдання")}
                  </TasksButton>
                )}
              </div>
            </aside>
          </fieldset>
        </div>
        <footer className="tk-create-foot">
          <TasksButton disabled={busy} onClick={requestClose}>
            {tr("Скасувати")}
          </TasksButton>
          <TasksButton
            disabled={busy}
            loading={busy}
            variant="primary"
            type="submit"
          >
            {tr(saved ? "Продовжити збереження" : "Створити")}
          </TasksButton>
        </footer>
      </form>
      {confirmClose && (
        <TasksConfirmationDialog
          title={tr("Закрити без збереження?")}
          text={tr("Введені дані буде втрачено.")}
          confirmLabel={tr("Закрити")}
          cancelLabel={tr("Продовжити редагування")}
          danger
          onConfirm={() => {
            setConfirmClose(false);
            onClose();
          }}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </TasksDialog>
  );
}
