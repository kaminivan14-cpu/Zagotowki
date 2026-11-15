import { tr } from "../../i18n/runtime";
import { events as eventLabels, eventReason } from "../labels.uk";
import { instantLabel } from "../dateTime";
import PersonAvatar from "../employees/PersonAvatar";
import TasksButton from "./ui/TasksButton";
import { eventChanges, groupByDay } from "../activity";
// Chronological, immutable activity (РБ-013): actor, action, time and old → new values where recorded.
export default function ActivityTimeline({ events, zone, people, categories, onMore, busy, hasMore }) {
  const groups = groupByDay([...events].sort((a, b) => b.id - a.id), zone);
  if (!events.length) return <p className="tk-muted">{tr("Подій поки немає.")}</p>;
  return (
    <div className="task-activity">
      {groups.map((g) => (
        <section key={g.day} className="task-activity-day">
          <h4>{g.day}</h4>
          <ol className="task-timeline">
            {g.items.map((e) => {
              const changes = eventChanges(e, { zone, people, categories });
              return (
                <li key={e.id} className={`task-activity-item kind-${e.event_type.toLowerCase()}`}>
                  <PersonAvatar person={e.actor || { name: "?" }} size={28} />
                  <div className="task-activity-body">
                    <p>
                      <strong>{e.actor?.name || tr("Система")}</strong> · {eventLabels[e.event_type] || tr("Зміна завдання")}
                      {e.metadata?.reason && !e.metadata?.text && <span className="tk-muted"> · {eventReason(e.metadata.reason)}</span>}
                      {e.metadata?.file?.name && <span className="tk-muted"> · {e.metadata.file.name}</span>}
                      <time dateTime={e.created_at}>{instantLabel(e.created_at, zone)}</time>
                    </p>
                    {e.metadata?.text && <blockquote className="task-activity-comment">{e.metadata.text}</blockquote>}
                    {changes.length > 0 && (
                      <dl className="task-activity-changes">
                        {changes.map((c) => (
                          <div key={c.key}>
                            <dt>{c.label}</dt>
                            <dd>
                              <s>{c.from}</s> → <b>{c.to}</b>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {hasMore && (
        <TasksButton size="sm" variant="ghost" icon="history" disabled={busy} onClick={onMore}>
          {tr("Раніші події")}
        </TasksButton>
      )}
    </div>
  );
}
