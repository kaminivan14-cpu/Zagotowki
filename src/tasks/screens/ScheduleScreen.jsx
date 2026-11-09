import { useEffect, useState } from "react";
import { read, errorText } from "../client";
import { planningRange, dayLabel, instantLabel, addDays } from "../dateTime";
import ScheduleEventDialog from "../components/ScheduleEventDialog";
import "../workspace.css";
import { scheduleTypes } from "../labels.uk";

export default function ScheduleScreen({ context, run, busy, revision }) {
  const [employee, setEmployee] = useState(context.employee_id),
    [people, setPeople] = useState([]),
    [events, setEvents] = useState([]),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [creating, setCreating] = useState(null),
    [loadedKey, setLoadedKey] = useState(null),
    [capacity, setCapacity] = useState([]);

  const range = planningRange(addDays(context.today, offset), "month"),
    zone = context.settings.company_timezone;

  useEffect(() => {
    let alive = true;
    read("tasks_assignable_people", { p_permission: "tasks.read.scope" })
      .then((p) => {
        if (alive) setPeople(p);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      read(employee === "team" ? "tasks_team_schedule" : "tasks_schedule", {
        ...(employee === "team" ? {} : { p_employee: Number(employee) }),
        p_from: range.from,
        p_to: range.to,
      }),
      employee === "team"
        ? Promise.all(
            people.map(async (p) =>
              (
                await read("tasks_schedule_capacity", {
                  p_employee: p.id,
                  p_from: range.from,
                  p_to: range.to,
                })
              ).map((c) => ({ ...c, employee_id: p.id })),
            ),
          )
        : read("tasks_schedule_capacity", {
            p_employee: Number(employee),
            p_from: range.from,
            p_to: range.to,
          }),
    ])
      .then(([d, c]) => {
        if (alive) {
          setEvents(d);
          setCapacity(c.flat());
          setLoadedKey(
            JSON.stringify([employee, range.from, range.to, revision, people]),
          );
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [employee, range.from, range.to, revision, people]);

  const loaded =
    loadedKey ===
    JSON.stringify([employee, range.from, range.to, revision, people]);

  const canManage =
    employee !== "team" &&
    context.capabilities.includes("tasks.schedule.manage");

  return (
    <section className="tasks-workspace">
      <div className="workspace-heading">
        <h2>Графік</h2>
        <button
          className="primary"
          disabled={!canManage || busy}
          title={
            !canManage
              ? "Оберіть працівника з доступом до керування графіком"
              : undefined
          }
          onClick={() => setCreating(context.today)}
        >
          + Додати подію
        </button>
      </div>

      <div className="workspace-toolbar schedule-toolbar">
        <div className="workspace-toolbar-group">
          <div
            className="segmented-control"
            role="group"
            aria-label="Область графіка"
          >
            <button
              aria-pressed={employee !== "team"}
              onClick={() => setEmployee(context.employee_id)}
            >
              Я
            </button>
            {context.capabilities.includes("tasks.read.scope") && (
              <button
                aria-pressed={employee === "team"}
                onClick={() => setEmployee("team")}
              >
                Команда
              </button>
            )}
          </div>

          {employee !== "team" && (
            <label className="workspace-inline-label schedule-employee-label">
              <span>Співробітник</span>
              <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
              >
                {people.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.id === context.employee_id ? "Я" : p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="workspace-toolbar-group schedule-nav-group">
          <div className="workspace-nav-buttons">
            <button
              aria-label="Попередні тижні"
              title="Попередні тижні"
              onClick={() => setOffset((n) => n - 28)}
            >
              ‹
            </button>
            <button className="schedule-today-btn" onClick={() => setOffset(0)}>
              Сьогодні
            </button>
            <button
              aria-label="Наступні тижні"
              title="Наступні тижні"
              onClick={() => setOffset((n) => n + 28)}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="schedule-meta-range">
        <span>
          {dayLabel(range.from)} — {dayLabel(range.to)}
        </span>
        <span className="schedule-timezone-badge">Часовий пояс: {zone}</span>
      </div>

      <p role="alert">{error}</p>

      {!loaded ? (
        <p role="status" className="schedule-loading">
          Завантаження графіка…
        </p>
      ) : (
        <div className="schedule-calendar">
          {Array.from({ length: 28 }, (_, i) => addDays(range.from, i)).map(
            (day) => {
              const daily = events.filter(
                (e) =>
                  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
                    new Date(e.starts_at),
                  ) <= day &&
                  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
                    new Date(Date.parse(e.ends_at) - 1),
                  ) >= day,
              );
              return (
                <article
                  key={day}
                  className="schedule-day-card"
                  onClick={(e) => {
                    if (canManage && !busy && !e.target.closest("button"))
                      setCreating(day);
                  }}
                >
                  <button
                    className="schedule-day"
                    disabled={!canManage || busy}
                    aria-label={`Додати подію: ${dayLabel(day)}`}
                    onClick={() => setCreating(day)}
                  >
                    {dayLabel(day)}
                  </button>

                  <div className="schedule-events-list">
                    {daily.map((e) => (
                      <div
                        className={`schedule-event event-${e.type}`}
                        key={e.id}
                      >
                        <div className="schedule-event-header">
                          <strong>{scheduleTypes[e.type]}</strong>
                          {canManage && (
                            <button
                              className="schedule-event-delete"
                              disabled={busy}
                              title="Прибрати подію"
                              onClick={() =>
                                run("schedule_delete", {
                                  employee_id: Number(employee),
                                  id: e.id,
                                  version: e.version,
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {e.employee_name && (
                          <p className="schedule-event-emp">
                            {e.employee_name}
                          </p>
                        )}
                        {!["day_off", "vacation"].includes(e.type) && (
                          <p className="schedule-event-time">
                            {instantLabel(e.starts_at, zone)} —{" "}
                            {instantLabel(e.ends_at, zone)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="schedule-day-footer">
                    {employee === "team"
                      ? people
                          .filter(
                            (p) => !daily.some((e) => e.employee_id === p.id),
                          )
                          .map((p) => (
                            <p className="schedule-empty" key={p.id}>
                              {p.name} · Зміна ·{" "}
                              {capacity.find(
                                (c) => c.employee_id === p.id && c.date === day,
                              )?.capacity_minutes ?? "—"}{" "}
                              хв
                            </p>
                          ))
                      : !daily.length && (
                          <p className="schedule-empty">
                            Робоча зміна (стандарт)
                          </p>
                        )}
                    {employee !== "team" && (
                      <small className="schedule-capacity-info">
                        Доступно:{" "}
                        {capacity.find((c) => c.date === day)
                          ?.capacity_minutes ?? "—"}{" "}
                        хв
                      </small>
                    )}
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}

      {creating && (
        <ScheduleEventDialog
          date={creating}
          employee={employee}
          zone={zone}
          run={run}
          busy={busy}
          onClose={() => setCreating(null)}
        />
      )}
    </section>
  );
}
