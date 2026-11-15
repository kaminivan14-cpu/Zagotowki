import { tr } from "../i18n/runtime.js";
// Readable one-line summary of the recurrence rule exactly as stored by the existing engine (РБ-005).
const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const units = {
  daily: ["день", "дні", "днів"],
  weekly: ["тиждень", "тижні", "тижнів"],
  monthly: ["місяць", "місяці", "місяців"],
  yearly: ["рік", "роки", "років"],
};
const simple = { daily: "Щодня", weekly: "Щотижня", monthly: "Щомісяця", yearly: "Щороку" };
export function plural(n, forms) {
  const rule = new Intl.PluralRules("uk-UA").select(n);
  return forms[rule === "one" ? 0 : rule === "few" ? 1 : 2];
}
export function recurrenceSummary(r) {
  if (!r || !r.frequency || r.frequency === "none") return tr("Не повторювати");
  const interval = Number(r.interval) || 1;
  let text =
    interval > 1
      ? tr("Кожні {n} {unit}", { n: interval, unit: tr(plural(interval, units[r.frequency] || units.daily)) })
      : tr(simple[r.frequency] || r.frequency);
  if (r.frequency === "weekly" && r.days_of_week?.length)
    text += ` (${[...r.days_of_week].sort((a, b) => a - b).map((d) => tr(dayNames[d - 1])).join(", ")})`;
  if (r.frequency === "monthly" && r.day_of_month) text += ` · ${tr("{n}-го числа", { n: r.day_of_month })}`;
  if (r.end_type === "until" && r.until) text += ` · ${tr("до {date}", { date: r.until.split("-").reverse().join(".") })}`;
  if (r.end_type === "count" && r.count) text += ` · ${tr("{n} раз(ів)", { n: r.count })}`;
  return text;
}
export const isRecurring = (r) => Boolean(r && r.frequency && r.frequency !== "none");
