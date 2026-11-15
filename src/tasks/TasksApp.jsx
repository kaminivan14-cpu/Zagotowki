import TextSettings from "../preferences/TextSettings";
import { tr, getLocale } from "../i18n/runtime";
import { useLocale } from "../i18n/useLocale";
import { useCallback, useEffect, useRef, useState } from "react";
import { read, mutate, errorText, operationKey } from "./client";
import { useWorktime } from "../worktime/context";
import { TaskFeedback } from "./feedback";
import TaskListScreen from "./screens/TaskListScreen";
import WorkScreen from "./screens/WorkScreen";
import PlanningScreen from "./screens/PlanningScreen";
// TODO: Temporarily disabled (РБ-002 / У-006): Reports and Schedule are hidden from navigation and
// their screens are not reachable. The files, RPCs and tables are preserved for a separate review.
// import ReportsScreen from "./screens/ReportsScreen";
// import ScheduleScreen from "./screens/ScheduleScreen";
import AdminScreen from "./admin/AdminScreen";
import ProcessesScreen from "./screens/ProcessesScreen";
import { ResultInbox } from "./admin/TaskResult";
import "./admin/admin.css";
import TaskCreateDialog from "./components/TaskCreateDialog";
import TaskDetailsDialog from "./components/TaskDetailsDialog";
import CriticalTaskDialog from "./components/CriticalTaskDialog";
import WorkHeader from "./shell/WorkHeader";
import WorkSidebar from "./shell/WorkSidebar";
import { resolveScreen } from "./shell/navigation";
import { taskIdFromSearch, writeTaskLink } from "./taskLink";
import TasksButton from "./components/ui/TasksButton";
import TasksStateMessage from "./components/ui/TasksStateMessage";
import "./tasks.css";
// TODO: The shared primitives stylesheet is no longer loaded by Tasks; the Tasks UI library owns its styles.
// import "../ui/ui.css";
import "./components/ui/tasks-ui.css";
import "./shell/shell.css";
export default function TasksApp({ employee, onSignOut, onModules }) {
  useLocale();
  const [context, setContext] = useState(null),
    [people, setPeople] = useState([]),
    [state, setState] = useState(null),
    [unread, setUnread] = useState(0),
    // The database lacks the Work-module functions (migrations 202611110001+ not applied): shown as a notice.
    [backendOutdated, setBackendOutdated] = useState(false),
    // The unread counter could not be refreshed (not "zero notifications"): the bell says so (D-52).
    [unreadStale, setUnreadStale] = useState(false),
    [screen, setScreen] = useState("work"),
    [creating, setCreating] = useState(false),
    // A `?task=<id>` link opens that task directly; tasks_details still enforces read access.
    [detail, setDetail] = useState(() => {
      const id =
        typeof window === "undefined"
          ? null
          : taskIdFromSearch(window.location.search);
      return id ? { id, title: `#${id}`, deepLink: true } : null;
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [textSettings, setTextSettings] = useState(false);
  const worktime = useWorktime();
  const pending = useRef(false),
    alive = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    const mounted = alive,
      requests = generation;
    mounted.current = true;
    document.body.classList.add("work-module-active");
    return () => {
      mounted.current = false;
      requests.current++;
      document.body.classList.remove("work-module-active");
    };
  }, []);
  useEffect(() => {
    writeTaskLink(detail?.id ?? null);
  }, [detail?.id]);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      const [c, p, w, n] = await Promise.all([
        read("tasks_context"),
        read("tasks_assignable_people"),
        read("tasks_execution_state"),
        read("tasks_notifications_unread").catch((e) => {
          if (e?.code === "PGRST202") {
            setBackendOutdated(true);
            return 0;
          }
          // Any other failure keeps the last known count instead of silently showing zero.
          return null;
        }),
      ]);
      if (alive.current && generation.current === id) {
        setContext(c);
        setPeople(p);
        setState(w);
        setUnreadStale(n === null);
        if (n !== null) setUnread(Number(n) || 0);
      }
    } catch (e) {
      if (alive.current && generation.current === id) {
        setError(errorText(e));
        if (e.code === "42501") {
          setContext(null);
          setState(null);
        }
      }
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  const run = async (action, args) => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutate(employee.id, action, args);
      if (alive.current) {
        await refresh();
        setRevision((n) => n + 1);
      }
      return result ?? true;
    } catch (e) {
      if (alive.current) setError(errorText(e));
      return null;
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const retry = () => {
    try {
      const op = JSON.parse(sessionStorage.getItem(operationKey(employee.id)));
      if (op) void run(op.action, op.args);
      else void refresh();
    } catch {
      setError(
        tr("Не вдалося прочитати попередню дію. Зверніться до адміністратора."),
      );
    }
  };
  if (!context)
    return (
      <div className="app tasks-app work-shell work-loading" lang={getLocale()}>
        <div className="work-loading-card">
          {error ? (
            <TasksStateMessage kind="error" compact text={error} />
          ) : (
            <TasksStateMessage
              kind="loading"
              compact
              text={tr("Завантаження модуля…")}
            />
          )}
          <div className="tk-row">
            <TasksButton onClick={refresh}>{tr("Повторити")}</TasksButton>
            <TasksButton variant="ghost" onClick={onSignOut}>
              {tr("Вийти")}
            </TasksButton>
          </div>
        </div>
      </div>
    );
  const capabilities = context.capabilities || [];
  const current = resolveScreen(screen, capabilities);
  const canCreate =
    capabilities.includes("tasks.create.self") ||
    capabilities.includes("tasks.assign");
  const props = { context, run, busy, onDetails: setDetail, revision, people };
  // Back to modules never depends on browser history and drops the task link so the next visit starts clean.
  const toModules = onModules
    ? () => {
        writeTaskLink(null);
        onModules();
      }
    : undefined;
  const critical =
    worktime?.current &&
    state?.critical.find((t) => !t.acknowledged && t.ready);
  return (
    <TaskFeedback.Provider value={{ error, retry, busy }}>
      <div
        className="app tasks-app work-shell"
        lang={getLocale()}
        onInvalidCapture={(e) => {
          if (!e.target.validity.customError)
            e.target.setCustomValidity(
              tr(
                "Перевірте значення цього поля. Заповніть обов’язкові дані у вказаному форматі.",
              ),
            );
        }}
        onInputCapture={(e) => {
          if (e.target.setCustomValidity) e.target.setCustomValidity("");
        }}
      >
        <WorkHeader
          employee={employee}
          capabilities={capabilities}
          screen={current}
          unread={unread}
          unreadStale={unreadStale}
          run={run}
          onNavigate={setScreen}
          onSettings={() => setTextSettings(true)}
          onModules={toModules}
          onSignOut={onSignOut}
          onOpenTask={setDetail}
          onCreate={() => setCreating(true)}
          canCreate={canCreate}
        />
        <WorkSidebar
          screen={current}
          capabilities={capabilities}
          onNavigate={setScreen}
          onCreate={() => setCreating(true)}
          canCreate={canCreate}
        />
        {/* TODO: Temporarily disabled (РБ-001/РБ-003): the previous horizontal header and tab bar were
            replaced by WorkHeader + WorkSidebar. The old markup is kept in git history and in
            docs/work-module-audit.md §2 for reference; no functionality was removed. */}
        <main
          className={`work-main ${
            current === "tasks"
              ? "task-list-main"
              : current === "processes"
                ? "processes-main"
                : current === "planning"
                  ? "planning-main"
                  : current === "work"
                    ? "work-main-narrow"
                    : ""
          }`}
        >
          <div className="work-notices">
            {backendOutdated && (
              <p role="alert" className="work-backend-outdated">
                {tr(
                  "Сервер ще не оновлено до цієї версії модуля «Робота»: ієрархія підзавдань, сповіщення та нові дії працюють обмежено.",
                )}{" "}
                {capabilities.includes("tasks.admin") &&
                  tr(
                    "Застосуйте міграції 202611110001, 202611120001, 202611120002 і 202611140001 (docs/work-module-rollout.md).",
                  )}
              </p>
            )}
            <ResultInbox run={run} busy={busy} revision={revision} />
            <p role="alert">
              {error}
              {error && (
                <TasksButton size="sm" disabled={busy} onClick={retry}>
                  {tr("Повторити дію")}
                </TasksButton>
              )}
            </p>
          </div>
          {current === "tasks" ? (
            <TaskListScreen
              {...props}
              onCreate={(initial) => setCreating(initial || true)}
            />
          ) : current === "work" ? (
            <WorkScreen {...props} state={state} refresh={refresh} />
          ) : current === "planning" ? (
            <PlanningScreen
              {...props}
              onCreate={(date, id) =>
                setCreating({ planned_date: date, employee_id: id })
              }
            />
          ) : current === "processes" ? (
            <ProcessesScreen {...props} locations={state?.locations || []} />
          ) : (
            /* TODO: Temporarily disabled (У-006):
               ) : current === "reports" ? (<ReportsScreen {...props} />
               ) : current === "schedule" ? (<ScheduleScreen {...props} /> */
            <AdminScreen {...props} />
          )}
        </main>
        {textSettings && (
          <TextSettings
            employee={employee}
            onClose={() => setTextSettings(false)}
          />
        )}
        {creating && (
          <TaskCreateDialog
            initialPlannedDate={creating.planned_date}
            initialEmployeeId={creating.employee_id}
            initialParent={creating.parent}
            context={context}
            people={people}
            run={run}
            busy={busy}
            onClose={() => setCreating(false)}
          />
        )}
        {detail && (
          <TaskDetailsDialog
            key={detail.id}
            {...props}
            task={detail}
            onClose={() => setDetail(null)}
          />
        )}
        {critical && (
          <CriticalTaskDialog
            key={critical.id}
            task={critical}
            run={run}
            busy={busy}
          />
        )}
      </div>
    </TaskFeedback.Provider>
  );
}
