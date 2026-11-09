import DateTimeInput from "./DateTimeInput";
import { useRef, useState } from "react";
import { errorText, read } from "../client";
import Dialog from "./Dialog";
import "../workspace.css";
import { priorities, categoryName } from "../labels.uk";
import { localToInstant, addDays } from "../dateTime";
import RecurrenceFields from "../../shared/RecurrenceFields";
import { noRecurrence } from "../../shared/recurrence";
import { tr } from "../../i18n/runtime";
import { useLocale } from "../../i18n/useLocale";

export default function TaskCreateDialog({
  context,
  people,
  run,
  busy,
  onClose,
  initialPlannedDate,
}) {
  useLocale();
  const [error, setError] = useState(""),
    [target, setTarget] = useState(String(context.employee_id)),
    [estimate, setEstimate] = useState("30"),
    [recurrence, setRecurrence] = useState(noRecurrence),
    [interrupt, setInterrupt] = useState(false);

  const form = useRef(null),
    progress = useRef({ task: null, index: 0, operations: [] }),
    [saved, setSaved] = useState(false),
    [checklist, setChecklist] = useState([]),
    [dependencies, setDependencies] = useState([]),
    [candidates, setCandidates] = useState([]),
    [query, setQuery] = useState(""),
    [searching, setSearching] = useState(false);

  const canInterrupt = context.capabilities.includes("tasks.interrupt"),
    assignees = people.some((p) => p.id === context.employee_id)
      ? people
      : [{ id: context.employee_id, name: tr("Собі") }, ...people];

  async function search() {
    setSearching(true);
    try {
      let all = [],
        cursor = 0;
      for (;;) {
        const page = await read("tasks_list", { p_cursor: cursor });
        all.push(...page);
        if (page.length < 100) break;
        cursor = page.at(-1).id;
      }
      setCandidates(all);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSearching(false);
    }
  }

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
      };

      if (!args.title || !args.deadline_at || !args.estimated_minutes) {
        setError(tr("Заповніть обов’язкові поля."));
        return;
      }

      const result = await run("create", args);
      if (!result) return;
      p.task = result;
      p.operations = [
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
      const op = p.operations[p.index],
        result = await run(op.action, {
          ...op.args,
          task_id: p.task.id,
          version: p.task.version,
        });
      if (!result) return;
      p.task = result;
      p.index++;
    }
    onClose();
  }

  return (
    <Dialog
      hideClose
      title={tr("Створити завдання")}
      onClose={onClose}
      busy={busy}
      onRetry={() => form.current?.requestSubmit()}
    >
      <form
        ref={form}
        className="task-editor"
        onSubmit={(e) => {
          void submit(e).catch((e) => setError(errorText(e)));
        }}
      >
        <p role="alert">{error}</p>
        {saved && (
          <p role="status" className="task-saved-status">
            {tr(
              "Завдання створено. Зберігаємо пункти та залежності; у разі помилки повторіть дію.",
            )}
          </p>
        )}

        <fieldset disabled={busy || saved}>
          <label className="task-field-block">
            <span>
              {tr("Назва")} <span className="required-star">*</span>
            </span>
            <input
              name="title"
              required
              maxLength={300}
              autoFocus
              placeholder={tr("Введіть назву завдання...")}
            />
          </label>

          <label className="task-field-block">
            <span>{tr("Опис")}</span>
            <textarea
              name="description"
              maxLength={20000}
              placeholder={tr("Додайте детальний опис або вимоги...")}
            />
          </label>

          <div className="editor-grid">
            <label className="task-field-block">
              <span>{tr("Категорія")}</span>
              <select name="category_id">
                <option value="">{tr("Без категорії")}</option>
                {context.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(c.id, context.categories)}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-field-block">
              <span>{tr("Пріоритет")}</span>
              <select name="priority" required defaultValue="medium">
                {Object.entries(priorities).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-field-block">
              <span>{tr("Орієнтовний час, хв")}</span>
              <input
                name="estimated_minutes"
                required
                type="number"
                min="1"
                max="525600"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </label>

            <label className="task-field-block">
              <span>{tr("Дедлайн")}</span>
              <DateTimeInput
                name="deadline"
                type="datetime-local"
                required
                defaultValue={`${addDays(context.today, 7)}T17:00`}
              />
            </label>

            <label className="task-field-block">
              <span>{tr("Виконавець")}</span>
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
            </label>
          </div>

          <small className="timezone-hint">
            {tr("Часовий пояс")}:{" "}
            <strong>{context.settings.company_timezone}</strong>
          </small>

          {canInterrupt && (
            <label className="task-checkbox-row">
              <input
                type="checkbox"
                checked={interrupt}
                onChange={(e) => setInterrupt(e.target.checked)}
              />
              <span>{tr("Переривання роботи")}</span>
            </label>
          )}

          {interrupt && (
            <label className="task-checkbox-row task-interrupt-confirm">
              <input type="checkbox" required />
              <span>
                {tr("Підтверджую негайне переривання поточної роботи")}
              </span>
            </label>
          )}

          {/* Блок підзавдань (Checklist) */}
          <details className="editor-expandable-section">
            <summary>
              {tr("Підзавдання")} ({checklist.length})
            </summary>
            <div className="expandable-content">
              {checklist.map((text, i) => (
                <div className="editor-row" key={i}>
                  <label className="checklist-input-wrap">
                    <span className="checklist-index">{i + 1}.</span>
                    <input
                      value={text}
                      maxLength={2000}
                      required
                      placeholder={tr("Введіть пункт підзавдання...")}
                      onChange={(e) =>
                        setChecklist((old) =>
                          old.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                  </label>
                  <div className="checklist-actions">
                    <button
                      type="button"
                      disabled={i === 0}
                      aria-label={`${tr("Перемістити вгору")} ${i + 1}`}
                      onClick={() =>
                        setChecklist((old) => {
                          const a = [...old];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          return a;
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-danger-icon"
                      aria-label={`${tr("Видалити")} ${i + 1}`}
                      onClick={() =>
                        setChecklist((old) => old.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="secondary-action-btn"
                onClick={() => setChecklist((old) => [...old, ""])}
              >
                {tr("+ Додати пункт")}
              </button>
            </div>
          </details>

          {/* Блок залежностей (Dependencies) */}
          <details className="editor-expandable-section">
            <summary>
              {tr("Залежності")} ({dependencies.length})
            </summary>
            <div className="expandable-content">
              <div className="dependency-search-bar">
                <input
                  value={query}
                  placeholder={tr("Пошук завдань за назвою...")}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button type="button" disabled={searching} onClick={search}>
                  {searching ? tr("Пошук...") : tr("Знайти завдання")}
                </button>
              </div>

              {candidates.length > 0 && (
                <div className="dependency-candidates-list">
                  {candidates
                    .filter(
                      (t) =>
                        t.title
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()) &&
                        !dependencies.some((d) => d.id === t.id),
                    )
                    .slice(0, 10)
                    .map((t) => (
                      <button
                        className="dependency-result"
                        type="button"
                        key={t.id}
                        onClick={() => setDependencies((old) => [...old, t])}
                      >
                        <span className="task-id-badge">#{t.id}</span> {t.title}
                      </button>
                    ))}
                </div>
              )}

              <div className="selected-dependencies">
                {dependencies.map((t) => (
                  <div className="editor-row" key={t.id}>
                    <span className="selected-dep-title">
                      #{t.id} · {t.title}
                    </span>
                    <button
                      type="button"
                      className="btn-danger-icon"
                      aria-label={`${tr("Видалити")} ${t.title}`}
                      onClick={() =>
                        setDependencies((old) =>
                          old.filter((d) => d.id !== t.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </details>

          <label className="task-field-block">
            <span>{tr("Коментар")}</span>
            <textarea
              name="comment"
              maxLength={2000}
              placeholder={tr("Залишити початковий коментар до завдання...")}
            />
          </label>

          <div className="recurrence-wrapper">
            <RecurrenceFields
              label={tr("Повторювати завдання")}
              value={recurrence}
              onChange={setRecurrence}
            />
          </div>
        </fieldset>

        <div className="editor-actions">
          <button disabled={busy} className="primary" type="submit">
            {tr(saved ? "Продовжити збереження" : "Створити завдання")}
          </button>
          <button disabled={busy} type="button" onClick={onClose}>
            {tr("Скасувати")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
