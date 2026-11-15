import { Fragment, useState } from "react";
import { tr } from "../../i18n/runtime";
import TasksIcon from "./ui/TasksIcon";
import TasksDropdownMenu from "./ui/TasksDropdownMenu";
import TasksProgressBar from "./ui/TasksProgressBar";
import PersonAvatar from "../employees/PersonAvatar";
import { StatusBadge, PriorityBadge, CategoryBadge } from "./TaskBadges";
import QuickCreateInput from "./QuickCreateInput";
import { visibleRows, toggleExpanded, childCount } from "../taskTree";
function deadlineLabel(value, zone) {
  return value
    ? new Intl.DateTimeFormat("uk-UA", { timeZone: zone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))
    : "—";
}
// ClickUp-style nested table (РБ-007). Rows keep a stable height; children sit directly under their
// parent; context ancestors (match=false) are visually muted.
export default function TaskTreeTable({
  rows,
  expanded,
  onExpandedChange,
  zone,
  onOpen,
  onDelete,
  onQuickCreate,
  run,
  busy,
  selected,
  onSelectedChange,
  compact = false,
  canCreate,
}) {
  const [quick, setQuick] = useState(null);
  const shown = visibleRows(rows, expanded);
  // Context ancestors (match=false) are shown for orientation only: they are never selected or bulk targets (plan §4.8).
  const selectable = shown.filter((t) => t.match !== false);
  const allSelected = selectable.length > 0 && selectable.every((t) => selected.includes(t.id));
  const toggleSelect = (id) =>
    onSelectedChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className={`tk-table-wrap task-tree-wrap ${compact ? "compact" : ""}`.trim()} role="region" aria-label={tr("Список завдань")} tabIndex={0}>
      <table className="tk-table task-tree" role="treegrid" aria-label={tr("Список завдань")}>
        {/* One column grid for headings and cells (widths in task-list.css). */}
        <colgroup>
          <col className="col-select" />
          <col className="col-title" />
          <col className="col-status" />
          <col className="col-priority" />
          <col className="col-assignee" />
          <col className="col-progress" />
          <col className="col-deadline" />
          <col className="col-category" />
          <col className="col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th className="task-tree-select">
              <input
                type="checkbox"
                aria-label={tr("Вибрати сторінку")}
                checked={allSelected}
                onChange={(e) => onSelectedChange(e.target.checked ? selectable.map((t) => t.id) : [])}
              />
            </th>
            <th className="task-tree-title-col">{tr("Назва")}</th>
            <th>{tr("Статус")}</th>
            <th>{tr("Пріоритет")}</th>
            <th>{tr("Виконавець")}</th>
            <th>{tr("Прогрес")}</th>
            <th>{tr("Дедлайн")}</th>
            <th>{tr("Категорія")}</th>
            <th className="task-tree-actions">
              <span className="sr-only">{tr("Дії")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const kids = childCount(rows, t.id),
              hiddenKids = t.progress?.total || 0,
              open = expanded.has(t.id),
              expandable = kids > 0;
            return (
              <Fragment key={t.id}>
                <tr
                  className={`task-tree-row depth-${Math.min(t.depth, 6)} ${t.match ? "" : "is-context"} ${t.status === "completed" ? "is-completed" : ""} ${selected.includes(t.id) ? "is-selected" : ""}`.trim()}
                  aria-selected={selected.includes(t.id)}
                  role="row"
                  aria-level={t.depth + 1}
                  aria-expanded={expandable ? open : undefined}
                >
                  <td className="task-tree-select">
                    <input
                      type="checkbox"
                      aria-label={tr("Вибрати: {name}", { name: t.title })}
                      checked={selected.includes(t.id)}
                      disabled={t.match === false}
                      onChange={() => toggleSelect(t.id)}
                    />
                  </td>
                  <td className="task-tree-title-col">
                    <div className="task-tree-title" style={{ "--depth": t.depth }}>
                      {t.depth > 0 && <span className="task-tree-guide" aria-hidden="true" />}
                      {expandable ? (
                        <button
                          type="button"
                          className="task-tree-toggle"
                          aria-label={(open ? tr("Згорнути: {name}") : tr("Розгорнути: {name}")).replace("{name}", t.title)}
                          aria-expanded={open}
                          onClick={() => onExpandedChange(toggleExpanded(expanded, t.id))}
                        >
                          <TasksIcon name={open ? "chevronDown" : "chevronRight"} size={16} />
                        </button>
                      ) : (
                        <span className="task-tree-toggle task-tree-toggle-empty" aria-hidden="true">
                          {hiddenKids > 0 && <TasksIcon name="subtask" size={14} />}
                        </span>
                      )}
                      <button type="button" className="task-tree-open" onClick={() => onOpen(t)} title={t.title}>
                        <span className="task-tree-id">#{t.id}</span>
                        <span className="task-tree-name">{t.title}</span>
                      </button>
                      {!t.match && <span className="task-tree-context">{tr("контекст")}</span>}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={t.status} overdue={t.overdue} />
                  </td>
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td>
                    {t.assignee ? (
                      <span className="tk-person" title={t.assignee.name}>
                        <PersonAvatar person={t.assignee} size={26} />
                        <span className="tk-truncate">{t.assignee.name}</span>
                      </span>
                    ) : (
                      <span className="tk-muted">{tr("Не призначено")}</span>
                    )}
                  </td>
                  <td>
                    <TasksProgressBar progress={t.progress} compact label={tr("Прогрес: {name}", { name: t.title })} />
                  </td>
                  <td className={t.overdue ? "task-tree-overdue" : ""}>
                    <span className="task-tree-date">
                      <TasksIcon name="calendar" size={14} />
                      {deadlineLabel(t.deadline_at, zone)}
                    </span>
                  </td>
                  <td>
                    <CategoryBadge category={t.category} />
                  </td>
                  <td className="task-tree-actions">
                    <TasksDropdownMenu
                      label={tr("Дії: {name}", { name: t.title })}
                      items={[
                        { label: tr("Відкрити завдання"), icon: "open", onSelect: () => onOpen(t) },
                        canCreate && t.status !== "completed" && t.status !== "cancelled"
                          ? { label: tr("Додати підзавдання"), icon: "subtask", onSelect: () => { onExpandedChange(new Set([...expanded, t.id])); setQuick(t.id); } }
                          : null,
                        { label: tr("Видалити завдання"), icon: "trash", danger: true, onSelect: () => onDelete(t) },
                      ]}
                    />
                  </td>
                </tr>
                {quick === t.id && (
                  <tr className={`task-tree-row task-tree-quick depth-${Math.min(t.depth + 1, 6)}`}>
                    <td />
                    <td colSpan={8}>
                      <div className="task-tree-title" style={{ "--depth": t.depth + 1 }}>
                        <QuickCreateInput
                          parentId={t.id}
                          run={run}
                          busy={busy}
                          onCancel={() => setQuick(null)}
                          onCreated={(created) => {
                            setQuick(null);
                            onQuickCreate?.(created, t);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
