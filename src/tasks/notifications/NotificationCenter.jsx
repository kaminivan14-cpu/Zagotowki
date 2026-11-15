import { useCallback, useEffect, useRef, useState } from "react";
import { tr } from "../../i18n/runtime";
import { useLocale } from "../../i18n/useLocale";
import { read, errorText } from "../client";
import TasksIcon from "../components/ui/TasksIcon";
import TasksButton from "../components/ui/TasksButton";
import TasksTabs from "../components/ui/TasksTabs";
import TasksStateMessage from "../components/ui/TasksStateMessage";
import useTasksDismissable from "../components/ui/useTasksDismissable";
import PersonAvatar from "../employees/PersonAvatar";
import { notificationText } from "./notificationText";
import "./notifications.css";
const relative = (iso, locale) => {
  const diff = Math.round((Date.now() - Date.parse(iso)) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === "pl" ? "pl" : "uk", {
    numeric: "auto",
  });
  if (Math.abs(diff) < 60) return rtf.format(-diff, "minute");
  if (Math.abs(diff) < 1440) return rtf.format(-Math.round(diff / 60), "hour");
  return rtf.format(-Math.round(diff / 1440), "day");
};
// Bell + panel (РБ-013): All / Unread / Read, mark one or all read, open the related task.
// Read state changes go through tasks_command, so they are idempotent and scoped to the actor.
// `run` is the module-wide idempotent command runner from TasksApp.
export default function NotificationCenter({
  unread = 0,
  stale = false,
  onOpenTask,
  run,
}) {
  const locale = useLocale();
  const [filter, setFilter] = useState("all"),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useTasksDismissable(open, close);
  const generation = useRef(0);
  const load = useCallback(
    async (nextFilter = filter, before = null) => {
      const n = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const page = await read("tasks_notifications", {
          p_filter: nextFilter,
          p_before: before,
          p_limit: 30,
        });
        if (n !== generation.current) return;
        setData((old) =>
          before && old
            ? { ...page, items: [...old.items, ...page.items] }
            : page,
        );
      } catch (e) {
        if (n === generation.current) setError(errorText(e));
      } finally {
        if (n === generation.current) setLoading(false);
      }
    },
    [filter],
  );
  useEffect(() => {
    if (open) void load(filter);
  }, [open, filter, load]);
  useEffect(() => {
    // New unread items while the panel is open: refresh the list quietly.
    if (open && data && unread !== data.unread) void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);
  async function command(action, args) {
    setBusy(true);
    setError("");
    try {
      const ok = await run(action, args);
      if (ok) await load(filter);
      return ok;
    } finally {
      setBusy(false);
    }
  }
  const items = data?.items || [],
    count = unread > 99 ? "99+" : unread;
  return (
    <div
      ref={ref}
      className="tk-popover tk-popover-end work-notifications"
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        className="tk-btn tk-btn-ghost tk-btn-sm tk-btn-icon work-bell"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          stale
            ? tr("Сповіщення: не вдалося оновити кількість")
            : unread
              ? tr("Сповіщення: {count} непрочитаних", { count: unread })
              : tr("Сповіщення")
        }
        title={
          stale ? tr("Не вдалося оновити кількість сповіщень") : tr("Сповіщення")
        }
        data-stale={stale ? "" : undefined}
      >
        <TasksIcon name="bell" size={20} />
        {unread > 0 && (
          <span className="work-bell-count" aria-hidden="true">
            {count}
          </span>
        )}
        {stale && <span className="work-bell-stale" aria-hidden="true" />}
      </button>
      {open && (
        <div
          className="tk-popover-panel work-notifications-panel"
          role="region"
          aria-label={tr("Сповіщення")}
        >
          <div className="work-notifications-head">
            <h2>{tr("Сповіщення")}</h2>
            <TasksButton
              size="sm"
              variant="link"
              icon="check"
              disabled={busy || !unread}
              onClick={() =>
                command("notifications_read_all", {
                  before_id: data?.latest_id ?? null,
                })
              }
            >
              {tr("Позначити всі як прочитані")}
            </TasksButton>
          </div>
          <TasksTabs
            variant="pills"
            label={tr("Фільтр сповіщень")}
            value={filter}
            onChange={setFilter}
            items={[
              { id: "all", label: tr("Всі") },
              { id: "unread", label: tr("Непрочитані"), count: unread },
              { id: "read", label: tr("Прочитані") },
            ]}
          />
          <div className="work-notifications-list">
            {error ? (
              <TasksStateMessage
                kind="error"
                compact
                text={error}
                onAction={() => load(filter)}
              />
            ) : loading && !data ? (
              <TasksStateMessage kind="loading" compact />
            ) : !items.length ? (
              <TasksStateMessage
                kind="empty"
                compact
                text={
                  filter === "unread"
                    ? tr("Непрочитаних сповіщень немає.")
                    : tr("Сповіщень поки немає.")
                }
              />
            ) : (
              <ul>
                {items.map((n) => {
                  const text = notificationText(n);
                  return (
                    <li key={n.id} className={n.read_at ? "" : "is-unread"}>
                      <button
                        type="button"
                        className="work-notification"
                        disabled={!n.task}
                        onClick={async () => {
                          if (
                            !n.read_at &&
                            !(await command("notification_read", { id: n.id }))
                          )
                            return;
                          if (n.task) {
                            close();
                            onOpenTask({ id: n.task.id, title: n.task.title });
                          }
                        }}
                      >
                        <PersonAvatar
                          person={n.actor || { name: "?" }}
                          size={32}
                        />
                        <span className="work-notification-body">
                          <span>
                            <strong>{text.actor}</strong> {text.action}
                          </span>
                          <span className="work-notification-task">
                            {text.title}
                          </span>
                          {text.detail && <small>{text.detail}</small>}
                          <time dateTime={n.created_at}>
                            {relative(n.created_at, locale)}
                          </time>
                        </span>
                        {!n.read_at && (
                          <span
                            className="work-notification-dot"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                      {!n.read_at && (
                        <button
                          type="button"
                          className="tk-btn tk-btn-ghost tk-btn-sm tk-btn-icon"
                          aria-label={tr("Позначити прочитаним")}
                          title={tr("Позначити прочитаним")}
                          disabled={busy}
                          onClick={() =>
                            command("notification_read", { id: n.id })
                          }
                        >
                          <TasksIcon name="check" size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {data && items.length >= 30 && (
              <TasksButton
                size="sm"
                variant="ghost"
                loading={loading}
                onClick={() => load(filter, items.at(-1).id)}
              >
                {tr("Показати раніші")}
              </TasksButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
