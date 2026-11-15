import { useEffect, useRef, useState } from "react";
import { tr } from "../../i18n/runtime";
import { read, errorText } from "../client";
import TasksButton from "../components/ui/TasksButton";
import TasksTabs from "../components/ui/TasksTabs";
import TasksIcon from "../components/ui/TasksIcon";
import TasksSearchInput from "../components/ui/TasksSearchInput";
import TasksPopover from "../components/ui/TasksPopover";
import TasksPagination from "../components/ui/TasksPagination";
import TasksStateMessage from "../components/ui/TasksStateMessage";
import TasksConfirmationDialog from "../components/ui/TasksConfirmationDialog";
import TaskTreeTable from "../components/TaskTreeTable";
import TaskFilters, { FilterChips } from "../components/TaskFilters";
import {
  filterKeys,
  legacyListQuery,
  isLegacyListResponse,
} from "../taskFilters";
import {
  initialExpanded,
  parentIds,
  childCount,
  normalizeTreeRows,
} from "../taskTree";
import "./task-list.css";
// Server default page size of tasks_list (top-level tasks per page); used when a response omits page_size.
const DEFAULT_PAGE_SIZE = 10;
// view, page_size and dir are part of the tasks_list contract since migration 202611110001; a server without it
// rejects them, so the list then retries without them (legacy mode, see the load effect).
const initial = {
  page: 1,
  page_size: 10,
  search: "",
  // Default view «Мої завдання»: working-tree change of 2026-11-14, which supersedes D-33 (see D-46).
  view: "my",
  tab: "active",
  status: "",
  priority: "",
  assignee: "",
  category: "",
  deadline_from: "",
  deadline_to: "",
  sort: "deadline",
  dir: "",
};
// View, tab, sort and row density survive a page refresh within the browser session (filters, search and page
// start fresh). Storage can be unavailable (private mode): every access is guarded.
const prefsKey = (employeeId) => `tasks-list-prefs:${employeeId}`;
function readPrefs(employeeId) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(prefsKey(employeeId)) || "{}",
    );
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}
function writePrefs(employeeId, prefs) {
  try {
    sessionStorage.setItem(prefsKey(employeeId), JSON.stringify(prefs));
  } catch {
    /* storage unavailable: preferences are simply not kept */
  }
}
const tabIds = ["active", "completed", "overdue", "all"];
const views = [
  ["my", "Мої завдання", "Завдання, де ви виконавець."],
  ["team", "Завдання команди", "Завдання ваших безпосередніх підлеглих."],
  [
    "relevant",
    "Релевантні мені",
    "Ви виконавець, автор, учасник або відповідальний за процес.",
  ],
  ["all", "Всі завдання", "Усі завдання, доступні вам за правами."],
];
const sorts = [
  ["deadline", "Дедлайн"],
  ["priority", "Пріоритет"],
  ["created", "Дата створення"],
  ["updated", "Останнє оновлення"],
  ["status", "Статус"],
  ["title", "Назва"],
];
export default function TaskListScreen({
  context,
  revision,
  onDetails,
  onCreate,
  run,
  busy,
}) {
  const [query, setQuery] = useState(() => {
      // Only values the list itself can produce are restored (anything else would fail with INVALID_QUERY).
      const saved = readPrefs(context.employee_id),
        next = { ...initial },
        allowed = {
          view: views.map((v) => v[0]),
          tab: tabIds,
          sort: sorts.map((v) => v[0]),
          dir: ["asc", "desc"],
        };
      for (const [k, values] of Object.entries(allowed))
        if (values.includes(saved[k])) next[k] = saved[k];
      return next;
    }),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [filters, setFilters] = useState(false),
    [compact, setCompact] = useState(
      () => readPrefs(context.employee_id).compact === true,
    ),
    [expanded, setExpanded] = useState(() => new Set()),
    [selected, setSelected] = useState([]),
    [deleting, setDeleting] = useState(null),
    [deleteError, setDeleteError] = useState(""),
    [bulkDeleting, setBulkDeleting] = useState(false),
    [bulkError, setBulkError] = useState(""),
    [bulkRunning, setBulkRunning] = useState(false),
    [bulkResult, setBulkResult] = useState(null),
    // Legacy tasks_list (no migration 202611110001): the ref steers requests, the state renders the notice.
    legacyRef = useRef(false),
    [legacyList, setLegacyList] = useState(false);
  const filtered = Boolean(query.search) || filterKeys.some((k) => query[k]);
  useEffect(() => {
    writePrefs(context.employee_id, {
      view: query.view,
      tab: query.tab,
      sort: query.sort,
      dir: query.dir,
      compact,
    });
  }, [
    context.employee_id,
    query.view,
    query.tab,
    query.sort,
    query.dir,
    compact,
  ]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        const send = (q) => read("tasks_list", { p_query: q });
        return send(legacyRef.current ? legacyListQuery(query) : query)
          .catch(async (e) => {
            // A server without migration 202611110001 rejects view / page_size / dir with INVALID_QUERY. Retry
            // once without them; only a legacy response (no per-view counters) switches the list to legacy mode,
            // so an invalid query on the current server still surfaces as an error.
            if (legacyRef.current || e?.message !== "INVALID_QUERY") throw e;
            const legacy = await send(legacyListQuery(query));
            if (!isLegacyListResponse(legacy)) throw e;
            legacyRef.current = true;
            if (alive) setLegacyList(true);
            return legacy;
          })
          .then((raw) => {
            if (!alive) return;
            // Tree fields are added for legacy payloads; the current backend already sends them.
            const result = { ...raw, items: normalizeTreeRows(raw?.items) };
            const pages = Math.max(
              1,
              Math.ceil(
                (result.total || 0) /
                  (result.page_size || query.page_size || DEFAULT_PAGE_SIZE),
              ),
            );
            if (query.page > pages) {
              setQuery((q) => ({ ...q, page: pages }));
              return;
            }
            setData(result);
            setSelected([]);
            setExpanded((old) => {
              const auto = initialExpanded(result.items, filtered);
              // keep the user's manual expansion for rows still present
              for (const id of old)
                if (result.items.some((r) => r.id === id)) auto.add(id);
              return auto;
            });
            setLoading(false);
          })
          .catch((e) => {
            if (alive) {
              setError(errorText(e));
              setLoading(false);
            }
          });
      },
      query.search ? 200 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, revision, retry, filtered]);
  const set = (key, value) =>
    setQuery((q) => ({ ...q, [key]: value, page: 1 }));
  const zone = context.settings.company_timezone,
    items = data?.items || [],
    pages = Math.max(
      1,
      Math.ceil(
        (data?.total || 0) /
          (data?.page_size || query.page_size || DEFAULT_PAGE_SIZE),
      ),
    ),
    categories = context.category_history || context.categories || [],
    counts = data?.counts || {},
    viewCounts = data?.views || {},
    // Without an explicit `view` the server returns every accessible task (tasks_list default 'all'),
    // so the title and selector describe that view instead of claiming «Мої завдання».
    // A legacy server ignores the view: it always returns every accessible task.
    activeView = legacyList ? "all" : query.view || "all",
    currentView = views.find((v) => v[0] === activeView) || views[3],
    canCreate =
      context.capabilities.includes("tasks.create.self") ||
      context.capabilities.includes("tasks.assign");
  const parents = parentIds(items);
  async function confirmDelete() {
    setDeleteError("");
    const ok = await run("delete", {
      task_id: deleting.id,
      version: deleting.version,
    });
    if (ok) setDeleting(null);
    else
      setDeleteError(
        tr(
          "Не вдалося видалити завдання. Перевірте повідомлення вгорі сторінки.",
        ),
      );
  }
  // Bulk actions use the same single-task commands; parents with subtasks are never part of a bulk delete.
  const selectedRows = items.filter((t) => selected.includes(t.id)),
    hasChildren = (t) =>
      (t.progress?.total || 0) > 0 || childCount(items, t.id) > 0,
    bulkBlocked = selectedRows.filter(hasChildren),
    bulkDeletable = selectedRows.filter((t) => !hasChildren(t)),
    // A legacy server ignores `dir` and applies the per-field default direction.
    descending =
      (!legacyList && query.dir === "desc") ||
      ((legacyList || !query.dir) &&
        ["priority", "created", "updated"].includes(query.sort));
  // Sequential single-task deletes (the server enforces permissions and the subtask rule for each one). The run
  // flag keeps the confirm button disabled for the whole loop, so a double click cannot send duplicates.
  async function confirmBulkDelete() {
    if (bulkRunning) return;
    setBulkRunning(true);
    setBulkError("");
    const failed = [];
    let deleted = 0;
    try {
      for (const t of bulkDeletable) {
        const ok = await run("delete", { task_id: t.id, version: t.version });
        if (ok) deleted++;
        else failed.push(t);
      }
    } finally {
      setBulkRunning(false);
    }
    setBulkResult({
      deleted,
      failed: failed.map((t) => t.title),
      skipped: bulkBlocked.map((t) => t.title),
    });
    setBulkDeleting(false);
    // The list reloads after each delete (selection is reset); failed and skipped rows are named in the result message.
    setSelected([]);
  }

  return (
    <section
      className={`task-list-screen tk-list-screen ${compact ? "compact" : ""}`.trim()}
    >
      <header className="tk-page-head">
        <div className="tk-page-title">
          <TasksPopover
            align="start"
            label={tr("Режим перегляду")}
            triggerClassName="task-list-view-trigger"
            trigger={
              <>
                <h2>{tr(currentView[1])}</h2>
                <TasksIcon name="chevronDown" size={18} />
              </>
            }
            panelClassName="task-list-view-panel"
          >
            <ul
              className="task-list-view-options"
              role="listbox"
              aria-label={tr("Режим перегляду")}
            >
              {views
                .filter(
                  ([id]) =>
                    id !== "team" ||
                    data?.team_available !== false ||
                    query.view === "team",
                )
                .map(([id, label, hint]) => (
                  <li key={id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeView === id}
                      aria-disabled={legacyList && id !== "all"}
                      disabled={legacyList && id !== "all"}
                      data-popover-close
                      onClick={() => set("view", id)}
                    >
                      <span>
                        <strong>{tr(label)}</strong>
                        <small>{tr(hint)}</small>
                      </span>
                      <span className="tk-tab-count">
                        {viewCounts[id] ?? "—"}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </TasksPopover>
          <p className="tk-page-description">{tr(currentView[2])}</p>
        </div>
        <div className="tk-page-actions">
          <TasksButton
            icon="filter"
            aria-expanded={filters}
            aria-pressed={filters}
            onClick={() => setFilters(!filters)}
          >
            {tr("Фільтри")}
          </TasksButton>
          <TasksPopover
            align="end"
            label={tr("Вид")}
            trigger={
              <>
                <TasksIcon name="menu" size={16} />
                {tr("Вид")}
                <TasksIcon name="chevronDown" size={14} />
              </>
            }
          >
            <label className="tk-check">
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => setCompact(e.target.checked)}
              />
              {tr("Компактні рядки")}
            </label>
            <div className="tk-divider" />
            <div className="tk-stack">
              <TasksButton
                size="sm"
                icon="expand"
                disabled={!parents.length}
                onClick={() => setExpanded(new Set(parents))}
              >
                {tr("Розгорнути всі підзавдання")}
              </TasksButton>
              <TasksButton
                size="sm"
                icon="collapse"
                disabled={!expanded.size}
                onClick={() => setExpanded(new Set())}
              >
                {tr("Згорнути всі підзавдання")}
              </TasksButton>
            </div>
          </TasksPopover>
          <TasksButton
            variant="primary"
            icon="plus"
            disabled={!canCreate}
            onClick={() => onCreate()}
          >
            {tr("Створити завдання")}
          </TasksButton>
        </div>
      </header>
      <div className="tk-list-card">
        <div className="tk-list-toolbar">
          <TasksTabs
            label={tr("Статус завдань")}
            value={query.tab}
            onChange={(v) => set("tab", v)}
            className="tk-list-tabs"
            items={[
              {
                id: "active",
                label: tr("Активні"),
                count: counts.active ?? "—",
              },
              {
                id: "completed",
                label: tr("Завершені"),
                count: counts.completed ?? "—",
              },
              {
                id: "overdue",
                label: tr("Прострочені"),
                count: counts.overdue ?? "—",
              },
              { id: "all", label: tr("Всі"), count: counts.all ?? "—" },
            ]}
          />
          <div className="tk-list-controls tk-form">
            <TasksSearchInput
              className="tk-list-search"
              placeholder={tr("Пошук завдань...")}
              value={query.search}
              onChange={(e) => set("search", e.target.value)}
            />
            <div className="tk-sort">
              <label className="tk-sort-field">
                <TasksIcon name="sort" size={16} />
                <span className="sr-only">{tr("Сортування")}</span>
                <select
                  aria-label={tr("Сортування")}
                  value={query.sort}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      sort: e.target.value,
                      dir: "",
                      page: 1,
                    }))
                  }
                >
                  {sorts.map(([value, label]) => (
                    // The legacy tasks_list has no title sort (it would silently fall back to id order).
                    <option
                      key={value}
                      value={value}
                      disabled={legacyList && value === "title"}
                    >
                      {tr(label)}
                    </option>
                  ))}
                </select>
              </label>
              <TasksButton
                className="tk-sort-direction"
                icon={descending ? "arrowDown" : "arrowUp"}
                iconOnly
                disabled={legacyList}
                title={descending ? tr("За спаданням") : tr("За зростанням")}
                onClick={() =>
                  setQuery((q) => {
                    const current =
                      q.dir ||
                      (["priority", "created", "updated"].includes(q.sort)
                        ? "desc"
                        : "asc");
                    return {
                      ...q,
                      dir: current === "asc" ? "desc" : "asc",
                      page: 1,
                    };
                  })
                }
              >
                {tr("Напрямок сортування")}
              </TasksButton>
            </div>
          </div>
        </div>
        {filters && (
          <TaskFilters
            query={query}
            set={set}
            assignees={data?.assignees || []}
            categories={categories}
            onReset={() =>
              setQuery((q) => ({
                ...initial,
                view: q.view,
                tab: q.tab,
                sort: q.sort,
                dir: q.dir,
              }))
            }
          />
        )}
        <FilterChips
          query={query}
          assignees={data?.assignees || []}
          categories={categories}
          onClear={(key) => set(key, "")}
          onClearAll={() =>
            setQuery((q) => ({
              ...initial,
              view: q.view,
              tab: q.tab,
              sort: q.sort,
              dir: q.dir,
            }))
          }
        />
        {legacyList && (
          <p className="tk-list-legacy" role="status">
            {tr(
              "Сервер ще не підтримує режими перегляду та напрямок сортування: показано всі доступні завдання.",
            )}
          </p>
        )}
        {selected.length > 0 && (
          <div
            className="tk-bulkbar"
            role="region"
            aria-label={tr("Дії з вибраними завданнями")}
          >
            <strong>{tr("Вибрано: {n}", { n: selected.length })}</strong>
            <TasksButton
              size="sm"
              variant="ghost"
              icon="close"
              onClick={() => setSelected([])}
            >
              {tr("Зняти вибір")}
            </TasksButton>
            <TasksButton
              size="sm"
              variant="danger"
              icon="trash"
              disabled={busy}
              onClick={() => {
                setBulkError("");
                setBulkResult(null);
                setBulkDeleting(true);
              }}
            >
              {tr("Видалити вибрані")}
            </TasksButton>
          </div>
        )}
        {bulkResult && (
          <div
            className={`tk-bulk-result ${bulkResult.failed.length ? "has-failures" : ""}`.trim()}
            role="status"
          >
            <div>
              <strong>
                {tr("Видалено завдань: {n}", { n: bulkResult.deleted })}
              </strong>
              {bulkResult.failed.length > 0 && (
                <p>
                  {tr("Не вдалося видалити: {names}", {
                    names: bulkResult.failed.join(", "),
                  })}
                </p>
              )}
              {bulkResult.skipped.length > 0 && (
                <p>
                  {tr("Пропущено (мають підзавдання): {names}", {
                    names: bulkResult.skipped.join(", "),
                  })}
                </p>
              )}
            </div>
            <TasksButton
              size="sm"
              variant="ghost"
              icon="close"
              iconOnly
              onClick={() => setBulkResult(null)}
            >
              {tr("Закрити повідомлення")}
            </TasksButton>
          </div>
        )}
        {error ? (
          <TasksStateMessage
            kind="error"
            title={tr("Не вдалося завантажити завдання")}
            text={error}
            onAction={() => setRetry((n) => n + 1)}
          />
        ) : loading && !data ? (
          <TasksStateMessage kind="loading" />
        ) : !items.length ? (
          <TasksStateMessage
            kind="empty"
            className="task-list-empty"
            title={tr("Завдань не знайдено")}
            text={
              filtered
                ? tr("Спробуйте змінити або скинути фільтри.")
                : tr("У цьому режимі поки немає активних завдань.")
            }
            actionLabel={
              filtered
                ? tr("Скинути фільтри")
                : canCreate
                  ? tr("Створити завдання")
                  : undefined
            }
            onAction={
              filtered
                ? () =>
                    setQuery((q) => ({ ...initial, view: q.view, tab: q.tab }))
                : canCreate
                  ? () => onCreate()
                  : undefined
            }
          />
        ) : (
          <div
            className={loading ? "task-list-refreshing" : ""}
            aria-busy={loading || undefined}
          >
            <TaskTreeTable
              rows={items}
              expanded={expanded}
              onExpandedChange={setExpanded}
              zone={zone}
              onOpen={onDetails}
              onDelete={(t) => {
                setDeleteError("");
                setDeleting(t);
              }}
              run={run}
              busy={busy}
              selected={selected}
              onSelectedChange={setSelected}
              compact={compact}
              canCreate={canCreate}
            />
            <TasksPagination
              page={query.page}
              pages={pages}
              onChange={(n) => setQuery((q) => ({ ...q, page: n }))}
              label={tr("Сторінки завдань")}
              summary={tr("Показано {from}–{to} з {total} завдань", {
                from: Math.min(
                  (query.page - 1) * (data.page_size || 10) + 1,
                  data.total,
                ),
                to: Math.min(query.page * (data.page_size || 10), data.total),
                total: data.total,
              })}
            />
          </div>
        )}
      </div>
      {deleting && hasChildren(deleting) && (
        <TasksConfirmationDialog
          title={tr("Завдання не можна видалити")}
          text={tr(
            "У «{name}» є підзавдання. Спочатку перенесіть їх до іншого батьківського завдання або видаліть — ієрархія не видаляється цілком.",
            { name: deleting.title },
          )}
          confirmLabel={tr("Зрозуміло")}
          informational
          onConfirm={() => setDeleting(null)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {deleting && !hasChildren(deleting) && (
        <TasksConfirmationDialog
          danger
          title={tr("Видалити завдання?")}
          text={tr(
            "«{name}» буде видалено зі списків. Історію активності буде збережено.",
            { name: deleting.title },
          )}
          confirmLabel={tr("Видалити")}
          busy={busy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {bulkDeleting && (
        <TasksConfirmationDialog
          danger={bulkDeletable.length > 0}
          title={tr("Видалити вибрані завдання?")}
          text={
            bulkDeletable.length
              ? tr(
                  "Буде видалено завдань: {n}. Історію активності буде збережено.",
                  { n: bulkDeletable.length },
                )
              : tr("Серед вибраних немає завдань, які можна видалити.")
          }
          details={
            bulkBlocked.length > 0 ? (
              <div className="tk-bulk-blocked">
                <p>{tr("Не будуть видалені, бо мають підзавдання:")}</p>
                <ul>
                  {bulkBlocked.map((t) => (
                    <li key={t.id}>
                      #{t.id} {t.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          }
          confirmLabel={bulkDeletable.length ? tr("Видалити") : tr("Зрозуміло")}
          informational={!bulkDeletable.length}
          busy={busy || bulkRunning}
          error={bulkError}
          onConfirm={
            bulkDeletable.length
              ? confirmBulkDelete
              : () => setBulkDeleting(false)
          }
          onCancel={() => setBulkDeleting(false)}
        />
      )}
    </section>
  );
}
