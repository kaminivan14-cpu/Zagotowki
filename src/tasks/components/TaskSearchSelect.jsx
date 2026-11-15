import { useEffect, useRef, useState } from "react";
import { tr } from "../../i18n/runtime";
import { read, errorText } from "../client";
// TODO: TasksIcon no longer needed here — the search icon comes from TasksSearchInput.
// import TasksIcon from "./ui/TasksIcon";
import TasksSearchInput from "./ui/TasksSearchInput";
import TasksButton from "./ui/TasksButton";
import { StatusBadge } from "./TaskBadges";
// Server-side task search used for the parent field (РБ-008) and dependencies. Excludes the current
// task and its descendants on the server (tasks_parent_candidates); never loads the whole task tree.
export default function TaskSearchSelect({ excludeTaskId = null, exclude = [], onSelect, placeholder, autoFocus = false, disabled = false }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const n = ++generation.current;
    setLoading(true);
    const timer = setTimeout(() => {
      read("tasks_parent_candidates", { p_task: excludeTaskId, p_search: query, p_limit: 20 })
        .then((rows) => {
          if (alive && n === generation.current) {
            setResults(rows.filter((r) => !exclude.includes(r.id)));
            setError("");
          }
        })
        .catch((e) => {
          if (alive && n === generation.current) setError(errorText(e));
        })
        .finally(() => {
          if (alive && n === generation.current) setLoading(false);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, excludeTaskId, exclude.join(",")]);
  return (
    <div className="task-search-select tk-form">
      <TasksSearchInput
        label={tr("Пошук завдань")}
        aria-label={tr("Пошук завдань")}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder || tr("Пошук завдань...")}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="task-search-results" role="listbox" aria-label={tr("Результати пошуку")}>
          {error ? (
            <p className="tk-inline-error">{error}</p>
          ) : loading && !results.length ? (
            <p className="tk-muted">{tr("Завантаження…")}</p>
          ) : !results.length ? (
            <p className="tk-muted">{tr("Завдань не знайдено")}</p>
          ) : (
            results.map((t) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={t.id}
                className="dependency-result task-search-item"
                onClick={() => {
                  onSelect(t);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="task-tree-id">#{t.id}</span>
                <span className="tk-truncate">{t.title}</span>
                <StatusBadge status={t.status} />
                {t.assignee && <small className="tk-muted">{t.assignee}</small>}
              </button>
            ))
          )}
          <TasksButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {tr("Закрити")}
          </TasksButton>
        </div>
      )}
    </div>
  );
}
