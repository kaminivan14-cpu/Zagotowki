import { tr } from "../i18n/runtime.js";
import { priorities, statuses, urgencies } from "./labels.uk.js";
import { instantLabel } from "./dateTime.js";
// Field-level changes derived from the immutable before/after snapshots stored with every event.
// Nothing here writes history; it only renders what the server recorded (РБ-013).
const tracked = {
  title: { label: "Назва" },
  description: { label: "Опис", summary: true },
  status: { label: "Статус", format: (v) => statuses[v] || v },
  priority: { label: "Пріоритет", format: (v) => priorities[v] || v },
  urgency: { label: "Терміновість", format: (v) => urgencies[v] || v },
  assigned_to_employee_id: { label: "Виконавець", person: true },
  deadline_at: { label: "Дедлайн", time: true },
  deadline_is_hard: { label: "Жорсткий дедлайн", format: (v) => (v ? tr("так") : tr("ні")) },
  planned_date: { label: "Запланована дата", format: (v) => (v ? v.split("-").reverse().join(".") : "—") },
  planned_start_at: { label: "Фіксований початок", time: true },
  estimated_minutes: { label: "Орієнтовний час, хв" },
  category_id: { label: "Категорія", category: true },
  parent_task_id: { label: "Батьківське завдання", format: (v) => (v ? `#${v}` : tr("корінь")) },
};
export function eventChanges(event, { zone, people = [], categories = [] } = {}) {
  const before = event.metadata?.before,
    after = event.metadata?.after;
  if (!before || !after) return [];
  const name = (id) => people.find((p) => String(p.id) === String(id))?.name || (id ? `#${id}` : "—");
  const category = (id) => categories.find((c) => String(c.id) === String(id))?.name || (id ? `#${id}` : tr("Без категорії"));
  const changes = [];
  for (const [key, spec] of Object.entries(tracked)) {
    const a = before[key],
      b = after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    if (key === "status" && ["TASK_COMPLETED", "TASK_STARTED", "TASK_PAUSED", "TASK_RESUMED", "TASK_CANCELLED", "TASK_PLANNED"].includes(event.event_type))
      continue;
    const fmt = (v) =>
      spec.summary
        ? v
          ? tr("{n} симв.", { n: String(v).length })
          : tr("порожньо")
        : spec.person
          ? name(v)
          : spec.category
            ? category(v)
            : spec.time
              ? instantLabel(v, zone)
              : spec.format
                ? spec.format(v)
                : v == null || v === ""
                  ? "—"
                  : String(v);
    changes.push({ key, label: tr(spec.label), from: fmt(a), to: fmt(b) });
  }
  return changes;
}
export function groupByDay(events, zone) {
  const groups = [];
  for (const e of events) {
    const day = new Intl.DateTimeFormat("uk-UA", { timeZone: zone, day: "2-digit", month: "long", year: "numeric" }).format(new Date(e.created_at));
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return groups;
}
