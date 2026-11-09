import DateTimeInput from "../components/DateTimeInput";
import { dateLabel } from "../dateTime";
import { useEffect, useState } from "react";
import { read, errorText } from "../client";

export default function TaskSettingsScreen({
  context,
  people,
  run,
  busy,
  revision,
}) {
  const [admin, setAdmin] = useState(null),
    [error, setError] = useState(""),
    [scopeType, setScopeType] = useState("employee");

  useEffect(() => {
    let alive = true;
    read("tasks_admin_state")
      .then((d) => {
        if (alive) setAdmin(d);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [revision]);

  const personName = (id) => people.find((p) => p.id === id)?.name || `№ ${id}`;

  const submit = (action) => (e) => {
    e.preventDefault();
    run(
      action,
      Object.fromEntries(
        [...new FormData(e.currentTarget)].map(([k, v]) => [
          k,
          v === "" ? null : v,
        ]),
      ),
    );
  };

  const person = (name) => (
    <select name={name} required>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <section
      className="org-screen tasks-admin-screen"
      style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "48px" }}
    >
      <div className="org-heading">
        <h2>Налаштування роботи</h2>
        <p>
          Керування параметрами компанії, структурою, місткістю та доступами
        </p>
      </div>

      <p role="alert" className="task-error-message">
        {error}
      </p>

      {/* 1. Загальні налаштування */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Загальні параметри
        </h3>
        <form className="task-editor" onSubmit={submit("settings_save")}>
          <label className="task-field-block">
            <span>Часовий пояс</span>
            <input
              name="company_timezone"
              defaultValue={context.settings.company_timezone}
              required
            />
          </label>
          <div className="editor-grid">
            <label className="task-field-block">
              <span>Типова денна місткість, хв</span>
              <input
                name="default_daily_task_capacity_minutes"
                type="number"
                min="1"
                max="1440"
                defaultValue={
                  context.settings.default_daily_task_capacity_minutes
                }
                required
              />
            </label>
            <label className="task-field-block">
              <span>Горизонт планування, днів</span>
              <input
                name="planning_horizon_days"
                type="number"
                min="7"
                max="366"
                defaultValue={context.settings.planning_horizon_days}
                required
              />
            </label>
          </div>
          <label className="task-field-block">
            <span>Автоматичний перенос</span>
            <select
              name="load_balancer_enabled"
              defaultValue={String(context.settings.load_balancer_enabled)}
            >
              <option value="false">Вимкнено — лише рекомендації</option>
              <option value="true">Увімкнено</option>
            </select>
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button type="submit" disabled={busy} className="primary">
              Зберегти налаштування
            </button>
          </div>
        </form>
      </div>

      {/* 2. Відділ */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Створення відділу
        </h3>
        <form className="task-editor" onSubmit={submit("department_save")}>
          <label className="task-field-block">
            <span>Назва відділу</span>
            <input name="name" required placeholder="Введіть назву..." />
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="secondary-action-btn"
            >
              Додати відділ
            </button>
          </div>
        </form>
      </div>

      {/* 3. Відділ співробітника */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Відділ співробітника
        </h3>
        <form className="task-editor" onSubmit={submit("employee_department")}>
          <div className="editor-grid">
            <label className="task-field-block">
              <span>Співробітник</span>
              {person("employee_id")}
            </label>
            <label className="task-field-block">
              <span>Відділ</span>
              <select name="department_id">
                {context.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="secondary-action-btn"
            >
              Призначити відділ
            </button>
          </div>
        </form>
      </div>

      {/* 4. Підпорядкування */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Підпорядкування
        </h3>
        <form className="task-editor" onSubmit={submit("reporting_save")}>
          <div className="editor-grid">
            <label className="task-field-block">
              <span>Співробітник</span>
              {person("employee_id")}
            </label>
            <label className="task-field-block">
              <span>Керівник</span>
              {person("manager_employee_id")}
            </label>
          </div>
          <label className="task-field-block">
            <span>Діє з</span>
            <DateTimeInput
              aria-label="Діє з"
              name="effective_from"
              type="date"
              required
              defaultValue={context.today}
            />
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="secondary-action-btn"
            >
              Призначити керівника
            </button>
          </div>
        </form>
      </div>

      {/* 5. Доступ до співробітника або підлеглих */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Надання доступу
        </h3>
        <form className="task-editor" onSubmit={submit("scope_grant")}>
          <div className="editor-grid">
            <label className="task-field-block">
              <span>Кому надати</span>
              {person("grantee_employee_id")}
            </label>
            <label className="task-field-block">
              <span>Область</span>
              <select
                name="scope_type"
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value)}
              >
                <option value="employee">Співробітник</option>
                <option value="hierarchy">Співробітник та його підлеглі</option>
                <option value="department">Відділ</option>
                <option value="location">Локал</option>
              </select>
            </label>
          </div>

          {scopeType === "department" ? (
            <label className="task-field-block">
              <span>Відділ</span>
              <select name="department_id" required>
                {context.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : scopeType === "location" ? (
            <label className="task-field-block">
              <span>Номер локалу</span>
              <input name="location_id" type="number" min="1" required />
            </label>
          ) : (
            <label className="task-field-block">
              <span>Ціль</span>
              {person("target_employee_id")}
            </label>
          )}

          <label className="task-field-block">
            <span>Дія</span>
            <select name="permission">
              {[
                ["tasks.assign", "Призначення"],
                ["tasks.read.scope", "Перегляд"],
                ["tasks.plan.scope", "Планування"],
                ["tasks.approve", "Погодження"],
                ["tasks.report.scope", "Рапорти"],
                ["tasks.schedule.manage", "Графік"],
              ].map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="secondary-action-btn"
            >
              Надати доступ
            </button>
          </div>
        </form>
      </div>

      {/* 6. Особиста місткість */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Особиста місткість
        </h3>
        <form className="task-editor" onSubmit={submit("capacity_save")}>
          <div className="editor-grid">
            <label className="task-field-block">
              <span>Співробітник</span>
              {person("employee_id")}
            </label>
            <label className="task-field-block">
              <span>Діє з</span>
              <DateTimeInput
                aria-label="Діє з"
                name="effective_from"
                type="date"
                required
                defaultValue={context.today}
              />
            </label>
          </div>
          <label className="task-field-block">
            <span>Хвилин на день</span>
            <input
              name="daily_task_capacity_minutes"
              type="number"
              min="1"
              max="1440"
              required
            />
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="secondary-action-btn"
            >
              Зберегти місткість
            </button>
          </div>
        </form>
      </div>

      {/* 7. Категорія */}
      <div className="edit-subsection-card">
        <h3 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
          Категорія завдань
        </h3>
        <form className="task-editor" onSubmit={submit("category_save")}>
          <label className="task-field-block">
            <span>Назва категорії</span>
            <input name="name" required placeholder="Введіть назву..." />
          </label>
          <label className="task-field-block">
            <span>Батьківська категорія</span>
            <select name="parent_id">
              <option value="">Без батьківської категорії</option>
              {context.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="secondary-action-btn"
            >
              Додати категорію
            </button>
          </div>
        </form>
      </div>

      {/* Надані дозволи */}
      <h3 style={{ marginTop: "24px" }}>Надані дозволи</h3>
      {admin?.scope_grants.map((g) => (
        <div
          key={g.id}
          className="edit-subsection-card"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>{personName(g.grantee_employee_id)}</strong> →{" "}
            {g.department_id
              ? context.departments.find((d) => d.id === g.department_id)?.name
              : g.location_id
                ? `Локал № ${g.location_id}`
                : personName(g.employee_id)}{" "}
            ·{" "}
            {
              {
                "tasks.assign": "Призначення",
                "tasks.read.scope": "Перегляд",
                "tasks.plan.scope": "Планування",
                "tasks.approve": "Погодження",
                "tasks.report.scope": "Рапорти",
                "tasks.schedule.manage": "Графік",
              }[g.permission]
            }
          </p>
          <button
            type="button"
            disabled={busy}
            className="danger-action-btn"
            style={{ padding: "6px 12px", minHeight: "32px", fontSize: "13px" }}
            onClick={() => run("scope_revoke", { id: g.id })}
          >
            Відкликати доступ
          </button>
        </div>
      ))}

      {/* Підпорядкування */}
      <h3 style={{ marginTop: "24px" }}>Чинні лінії підпорядкування</h3>
      {admin?.reporting_lines.map((r) => (
        <div key={r.id} className="edit-subsection-card">
          <p style={{ marginTop: 0 }}>
            <strong>{personName(r.employee_id)}</strong> →{" "}
            <strong>{personName(r.manager_employee_id)}</strong> ·{" "}
            {dateLabel(r.effective_from)} —{" "}
            {r.effective_to ? dateLabel(r.effective_to) : "без кінцевої дати"}
          </p>
          {!r.effective_to && (
            <form
              className="task-editor"
              onSubmit={(e) => {
                e.preventDefault();
                run("reporting_end", {
                  id: r.id,
                  effective_to: new FormData(e.currentTarget).get("date"),
                });
              }}
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "#ffffff",
              }}
            >
              <label className="task-field-block">
                <span>Припинити з</span>
                <DateTimeInput
                  aria-label="Припинити з"
                  name="date"
                  type="date"
                  required
                />
              </label>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <button
                  type="submit"
                  disabled={busy}
                  className="danger-action-btn"
                  style={{
                    padding: "6px 12px",
                    minHeight: "32px",
                    fontSize: "13px",
                  }}
                >
                  Припинити підпорядкування
                </button>
              </div>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
