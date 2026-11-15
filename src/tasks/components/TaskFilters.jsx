import { tr } from "../../i18n/runtime";
import TasksButton from "./ui/TasksButton";
import TasksField from "./ui/TasksField";
import TasksIcon from "./ui/TasksIcon";
import { statuses, priorities } from "../labels.uk";
import { activeFilters } from "../taskFilters";
// Filter panel + active-filter chips (РБ-009 / У-007). `query` keys mirror tasks_list(p_query).
export function FilterChips({
  query,
  onClear,
  onClearAll,
  assignees,
  categories,
}) {
  const chips = activeFilters(query, { assignees, categories });
  if (!chips.length) return null;
  return (
    <div className="task-filter-chips" aria-label={tr("Активні фільтри")}>
      {chips.map((c) => (
        <span key={c.key} className="tk-chip">
          {c.label}
          <TasksButton
            type="button"
            aria-label={tr("Прибрати фільтр: {name}", { name: c.label })}
            onClick={() => onClear(c.key)}
          >
            <TasksIcon name="close" size={12} />
          </TasksButton>
        </span>
      ))}
      <TasksButton size="sm" variant="link" onClick={onClearAll}>
        {tr("Скинути фільтри")}
      </TasksButton>
    </div>
  );
}
export default function TaskFilters({
  query,
  set,
  assignees,
  categories,
  onReset,
}) {
  const selects = [
    ["status", "Статус", Object.entries(statuses)],
    ["priority", "Пріоритет", Object.entries(priorities)],
    ["assignee", "Виконавець", assignees.map((p) => [p.id, p.name])],
    ["category", "Категорія", categories.map((c) => [c.id, c.name])],
  ];
  return (
    <div className="task-list-filters tk-form">
      {selects.map(([key, label, options]) => (
        <TasksField key={key} label={tr(label)}>
          <select
            aria-label={tr(label)}
            value={query[key]}
            onChange={(e) => set(key, e.target.value)}
          >
            <option value="">{tr("Всі")}</option>
            {options.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </TasksField>
      ))}
      <TasksField label={tr("Дедлайн від")}>
        <input
          type="date"
          aria-label={tr("Дедлайн від")}
          value={query.deadline_from}
          onChange={(e) => set("deadline_from", e.target.value)}
        />
      </TasksField>
      <TasksField label={tr("Дедлайн до")}>
        <input
          type="date"
          aria-label={tr("Дедлайн до")}
          value={query.deadline_to}
          onChange={(e) => set("deadline_to", e.target.value)}
        />
      </TasksField>
      <div className="task-list-filters-actions">
        <TasksButton onClick={onReset}>{tr("Скинути фільтри")}</TasksButton>
      </div>
    </div>
  );
}
