import { tr } from "../../i18n/runtime";
import { orgLabels as orgText } from "../organization/labels";
import { withCurrentStructure } from "./currentStructure";
import EmployeePhoto from "../employees/EmployeePhoto";
import AccessScreen from "../access/AccessScreen";
import EmailInvite from "../../auth/EmailInvite";
import { useEffect, useState } from "react";
import { read, errorText } from "../client";
import Dialog from "../components/Dialog";
import { adminTabs, systemRoles, productionRoles, roleName } from "./labels";
import TaskSettingsScreen from "../screens/TaskSettingsScreen";
import OrganizationScreen from "../organization/OrganizationScreen";

export default function AdminScreen(props) {
  const { context, run, busy, revision } = props,
    [structureEmployee, setStructureEmployee] = useState(null),
    [editDirty, setEditDirty] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [tab, setTab] = useState("employees"),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [edit, setEdit] = useState(null),
    [category, setCategory] = useState(null),
    [filters, setFilters] = useState({ department: "", role: "", active: "" });

  useEffect(() => {
    let live = true;
    Promise.all([read("tasks_admin_directory"), read("organization_structure")])
      .then(([d, org]) => {
        if (live) {
          setData(withCurrentStructure(d, org, context.today));
          setError("");
        }
      })
      .catch((e) => {
        if (live) {
          setData(null);
          setError(errorText(e));
        }
      });
    return () => {
      live = false;
    };
  }, [revision, tab, context.today]);

  if (!context.capabilities.includes("tasks.admin")) return null;

  const canEditPhotos =
    context.capabilities.includes("employees.manage") &&
    ["owner", "administrator"].includes(
      data?.employees.find((e) => e.id === context.employee_id)?.role,
    );

  const employee = (id) =>
      data?.employees.find((e) => e.id === id)?.name || "Не призначено",
    manager = (id) =>
      data?.employees.find((e) => e.id === id)?.current_manager_id;

  return (
    <section className="task-admin" style={{ paddingBottom: "48px" }}>
      <div className="org-heading" style={{ marginBottom: "12px" }}>
        <h2>Адмін панель</h2>
        <p>Централізоване керування користувачами, структурою та довідниками</p>
      </div>

      {/* Оновлена навігація адмін-панелі у стилі Jira/Atlassian */}
      <nav className="access-tab-bar" aria-label="Адміністрування">
        <div className="org-nav-tabs" role="tablist">
          {Object.entries(adminTabs).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`access-tab-btn ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {error && (
        <p role="alert" className="task-error-message">
          {error}
        </p>
      )}

      {!data ? (
        <div className="access-loading-state">
          <p role="status">Завантаження адміністративних даних…</p>
        </div>
      ) : (
        <>
          {tab === "employees" && (
            <>
              <div className="admin-toolbar">
                <h3 style={{ margin: 0 }}>Працівники</h3>
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    setEdit({
                      name: "",
                      role: "specialist",
                      active: true,
                      production_role: null,
                    })
                  }
                >
                  + Додати працівника
                </button>
              </div>

              <div
                className="admin-filters edit-subsection-card"
                style={{ padding: "16px", marginBottom: "16px" }}
              >
                <label className="task-field-block" style={{ margin: 0 }}>
                  <span>Відділ</span>
                  <select
                    aria-label="Відділ"
                    value={filters.department}
                    onChange={(e) =>
                      setFilters({ ...filters, department: e.target.value })
                    }
                  >
                    <option value="">Усі відділи</option>
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="task-field-block" style={{ margin: 0 }}>
                  <span>Роль у системі</span>
                  <select
                    aria-label="Роль у системі"
                    value={filters.role}
                    onChange={(e) =>
                      setFilters({ ...filters, role: e.target.value })
                    }
                  >
                    <option value="">Усі ролі</option>
                    {Object.entries({ ...systemRoles, ...productionRoles }).map(
                      ([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="task-field-block" style={{ margin: 0 }}>
                  <span>Статус</span>
                  <select
                    aria-label="Статус"
                    value={filters.active}
                    onChange={(e) =>
                      setFilters({ ...filters, active: e.target.value })
                    }
                  >
                    <option value="">Усі</option>
                    <option value="true">Активні</option>
                    <option value="false">Неактивні</option>
                  </select>
                </label>
              </div>

              <div className="admin-table-wrap task-table">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Ім’я",
                        "Статус",
                        "Відділ",
                        "Виробнича роль",
                        "Роль у системі",
                        "Керівник",
                        "Локація",
                        "Дії",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees
                      .filter(
                        (e) =>
                          (!filters.department ||
                            String(e.department_id) === filters.department) &&
                          (!filters.role || e.role === filters.role) &&
                          (!filters.active ||
                            String(e.active) === filters.active),
                      )
                      .map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>{e.name}</strong>
                          </td>
                          <td>
                            <span
                              className={
                                e.active && !e.archived
                                  ? "org-active"
                                  : "org-inactive"
                              }
                            >
                              {e.archived
                                ? "Архівний"
                                : e.active
                                  ? "Активний"
                                  : "Неактивний"}
                            </span>
                          </td>
                          <td>
                            {data.departments.find(
                              (d) => d.id === e.department_id,
                            )?.name || "Не призначено"}
                          </td>
                          <td>
                            {productionRoles[e.production_role] ||
                              "Не призначено"}
                          </td>
                          <td>{roleName(e.role)}</td>
                          <td>{employee(manager(e.id))}</td>
                          <td>
                            {data.locations.find((l) => l.id === e.location_id)
                              ?.name || "Не призначено"}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                                alignItems: "center",
                              }}
                            >
                              {["owner", "administrator"].includes(
                                data.employees.find(
                                  (person) => person.id === context.employee_id,
                                )?.role,
                              ) && (
                                <EmailInvite employee={e} revision={revision} />
                              )}
                              <button
                                type="button"
                                className="secondary-action-btn"
                                style={{
                                  padding: "6px 12px",
                                  minHeight: "32px",
                                  fontSize: "13px",
                                }}
                                disabled={
                                  e.id === context.employee_id || e.archived
                                }
                                onClick={() => {
                                  setEditDirty(false);
                                  setEdit({ ...e, manager_id: manager(e.id) });
                                }}
                              >
                                Редагувати
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "structure" && (
            <>
              <OrganizationScreen
                context={context}
                initialEmployeeId={structureEmployee}
                onInitialEmployeeOpened={() => setStructureEmployee(null)}
              />
              <details
                className="edit-subsection-card"
                style={{ marginTop: "24px" }}
              >
                <summary style={{ fontWeight: 600, color: "#172b4d" }}>
                  Налаштування роботи та доступів
                </summary>
                <div style={{ marginTop: "16px" }}>
                  <TaskSettingsScreen {...props} />
                </div>
              </details>
            </>
          )}

          {tab === "access" && (
            <AccessScreen directory={data} revision={revision} />
          )}

          {tab === "dictionaries" && (
            <>
              <div className="admin-toolbar">
                <h3 style={{ margin: 0 }}>Категорії завдань</h3>
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    setCategory({ name: "", sort_order: 0, active: true })
                  }
                >
                  + Додати категорію
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "16px",
                }}
              >
                {data.categories.map((c) => (
                  <article
                    className="dictionary-row edit-subsection-card"
                    key={c.id}
                    style={{
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ flex: "1 1 auto", minWidth: "200px" }}>
                      {c.parent_id && (
                        <small style={{ color: "#5e6c84", display: "block" }}>
                          {
                            data.categories.find((p) => p.id === c.parent_id)
                              ?.name
                          }{" "}
                          →{" "}
                        </small>
                      )}
                      <strong style={{ fontSize: "15px" }}>{c.name}</strong>
                      <small
                        style={{
                          color: "#5e6c84",
                          marginTop: "4px",
                          display: "block",
                        }}
                      >
                        {c.active ? "Активна" : "Неактивна"} · Порядок:{" "}
                        {c.sort_order}
                      </small>
                    </div>

                    {/* Кнопки притиснуті до кінця рядка праворуч */}
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexShrink: 0,
                        marginLeft: "auto",
                      }}
                    >
                      <button
                        type="button"
                        className="secondary-action-btn"
                        style={{
                          padding: "6px 12px",
                          minHeight: "32px",
                          fontSize: "13px",
                        }}
                        onClick={() => setCategory(c)}
                      >
                        Редагувати
                      </button>
                      <button
                        type="button"
                        className="secondary-action-btn"
                        style={{
                          padding: "6px 12px",
                          minHeight: "32px",
                          fontSize: "13px",
                        }}
                        disabled={busy}
                        onClick={() =>
                          run("category_save", {
                            id: c.id,
                            name: c.name,
                            parent_id: c.parent_id,
                            sort_order: c.sort_order,
                            active: !c.active,
                          })
                        }
                      >
                        {c.active ? "Деактивувати" : "Відновити"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <p
                style={{
                  color: "#5e6c84",
                  fontSize: "13px",
                  fontStyle: "italic",
                  marginTop: "16px",
                }}
              >
                Неактивні категорії залишаються в історичних завданнях.
              </p>
            </>
          )}

          {edit && (
            <Dialog
              title={edit.id ? "Редагувати працівника" : "Додати працівника"}
              busy={busy || photoBusy}
              onClose={() => setEdit(null)}
            >
              <form
                className="task-editor"
                onChange={() => setEditDirty(true)}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const withPhoto = e.nativeEvent.submitter?.value === "photo";
                  const result = await run("admin_employee_save", {
                    id: edit.id || null,
                    name: edit.name,
                    position: edit.position || null,
                    role: edit.role,
                    active: edit.active,
                    location_id: edit.location_id || null,
                    department_id: edit.id
                      ? (edit.stored_department_id ?? null)
                      : edit.department_id || null,
                    production_role: edit.production_role || null,
                    manager_id: edit.id
                      ? (edit.stored_manager_id ?? null)
                      : edit.manager_id || null,
                  });
                  if (result) {
                    if (withPhoto && result.id)
                      setEdit({ ...edit, id: result.id });
                    else setEdit(null);
                  }
                }}
              >
                {edit.id && canEditPhotos && (
                  <EmployeePhoto
                    employee={edit}
                    actorId={context.employee_id}
                    onBusy={setPhotoBusy}
                    onSaved={(path) => {
                      setEdit((e) =>
                        e?.id === edit.id ? { ...e, avatar_path: path } : e,
                      );
                      setData((d) => ({
                        ...d,
                        employees: d.employees.map((e) =>
                          e.id === edit.id ? { ...e, avatar_path: path } : e,
                        ),
                      }));
                    }}
                  />
                )}
                <label className="task-field-block">
                  <span>Ім’я</span>
                  <input
                    required
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </label>
                <label className="task-field-block">
                  <span>Відділ</span>
                  <select
                    aria-label="Відділ"
                    disabled={!!edit.id}
                    value={edit.department_id || ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        department_id: Number(e.target.value) || null,
                        production_role: null,
                      })
                    }
                  >
                    <option value="">Не призначено</option>
                    {data.departments
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>

                {edit.id && (
                  <div
                    className="edit-subsection-card"
                    style={{ margin: "10px 0" }}
                  >
                    <p style={{ margin: "0 0 8px 0" }}>
                      {orgText.profileStructureNote}
                    </p>
                    {data.can_manage_structure && (
                      <button
                        type="button"
                        className="secondary-action-btn"
                        style={{
                          padding: "6px 12px",
                          minHeight: "32px",
                          fontSize: "13px",
                        }}
                        disabled={busy || photoBusy || editDirty}
                        onClick={() => {
                          setStructureEmployee(edit.id);
                          setEdit(null);
                          setTab("structure");
                        }}
                      >
                        {orgText.move_department}
                      </button>
                    )}
                    {editDirty && (
                      <small
                        style={{
                          display: "block",
                          marginTop: "6px",
                          color: "#de350b",
                        }}
                      >
                        {orgText.saveProfileFirst}
                      </small>
                    )}
                  </div>
                )}

                {data.departments.find(
                  (d) =>
                    d.id ===
                    (edit.id ? edit.stored_department_id : edit.department_id),
                )?.code === "production" && (
                  <label className="task-field-block">
                    <span>Виробнича роль</span>
                    <select
                      aria-label="Виробнича роль"
                      value={edit.production_role || ""}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          production_role: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Не призначено</option>
                      {Object.entries(productionRoles)
                        .filter(([k]) => k !== "employee")
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                <label className="task-field-block">
                  <span>{tr("Посада")}</span>
                  <input
                    maxLength={160}
                    value={edit.position || ""}
                    onChange={(e) =>
                      setEdit({ ...edit, position: e.target.value })
                    }
                  />
                </label>

                <label className="task-field-block">
                  <span>Роль у системі</span>
                  <select
                    aria-label="Роль у системі"
                    value={edit.role}
                    onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                  >
                    {!systemRoles[edit.role] && (
                      <option value={edit.role}>
                        {roleName(edit.role)} — чинна успадкована роль
                      </option>
                    )}
                    {Object.entries(systemRoles).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <small style={{ color: "#5e6c84", fontSize: "12px" }}>
                  Це поле визначає дозволи. Зміна застосовується лише після
                  збереження.
                </small>

                <label className="task-field-block">
                  <span>Керівник</span>
                  <select
                    aria-label="Керівник"
                    disabled={!!edit.id}
                    value={edit.manager_id || ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        manager_id: Number(e.target.value) || null,
                      })
                    }
                  >
                    <option value="">Не призначено</option>
                    {data.employees
                      .filter(
                        (e) => e.active && !e.archived && e.id !== edit.id,
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="task-field-block">
                  <span>Локація / приміщення</span>
                  <select
                    aria-label="Локація / приміщення"
                    value={edit.location_id || ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        location_id: Number(e.target.value) || null,
                      })
                    }
                  >
                    <option value="">Не призначено</option>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  className="task-checkbox-row"
                  style={{ margin: "14px 0" }}
                >
                  <input
                    type="checkbox"
                    checked={edit.active}
                    onChange={(e) =>
                      setEdit({ ...edit, active: e.target.checked })
                    }
                  />
                  <span>Активний працівник</span>
                </label>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                    marginTop: "16px",
                  }}
                >
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || photoBusy}
                  >
                    Зберегти
                  </button>
                  {!edit.id && canEditPhotos && (
                    <button
                      type="submit"
                      value="photo"
                      className="secondary-action-btn"
                      disabled={busy || photoBusy}
                    >
                      Зберегти й додати фото
                    </button>
                  )}
                </div>
              </form>
            </Dialog>
          )}

          {category && (
            <Dialog
              title="Категорія завдань"
              onClose={() => setCategory(null)}
              busy={busy}
            >
              <form
                className="task-editor"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run("category_save", {
                      ...category,
                      parent_id: category.parent_id || null,
                    })
                  )
                    setCategory(null);
                }}
              >
                <label className="task-field-block">
                  <span>Назва</span>
                  <input
                    required
                    value={category.name}
                    onChange={(e) =>
                      setCategory({ ...category, name: e.target.value })
                    }
                  />
                </label>
                <label className="task-field-block">
                  <span>Батьківська категорія</span>
                  <select
                    aria-label="Батьківська категорія"
                    value={category.parent_id || ""}
                    onChange={(e) =>
                      setCategory({
                        ...category,
                        parent_id: Number(e.target.value) || null,
                      })
                    }
                  >
                    <option value="">Без батьківської категорії</option>
                    {data.categories
                      .filter((c) => c.id !== category.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="task-field-block">
                  <span>Порядок</span>
                  <input
                    type="number"
                    value={category.sort_order}
                    onChange={(e) =>
                      setCategory({
                        ...category,
                        sort_order: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "16px",
                  }}
                >
                  <button type="submit" className="primary" disabled={busy}>
                    Зберегти
                  </button>
                </div>
              </form>
            </Dialog>
          )}
        </>
      )}
    </section>
  );
}
