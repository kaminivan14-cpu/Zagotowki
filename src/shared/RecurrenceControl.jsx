import { useState } from "react";
import { tr } from "../i18n/runtime";
import { useLocale } from "../i18n/useLocale";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import RecurrenceFields from "./RecurrenceFields";
import { noRecurrence } from "./recurrence";
import { recurrenceSummary, isRecurring } from "./recurrenceSummary";
// Compact recurrence control (РБ-005, Google-Calendar style): a one-line summary plus a quick
// frequency select; "Налаштувати повторення" opens a small panel that reuses the full existing
// RecurrenceFields, so every currently supported option remains available and the stored format is unchanged.
export default function RecurrenceControl({ value, onChange, disabled = false, readOnly = false, label }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const r = { ...noRecurrence(), ...value };
  if (readOnly)
    return (
      <span className="recurrence-summary">
        <Icon name="repeat" size={15} />
        {recurrenceSummary(r)}
      </span>
    );
  const quick = [
    ["none", "Не повторювати"],
    ["daily", "Щодня"],
    ["weekly", "Щотижня"],
    ["monthly", "Щомісяця"],
    ["yearly", "Щороку"],
  ];
  const custom = r.interval > 1 || r.days_of_week?.length > 0 || r.day_of_month != null || r.end_type !== "never";
  return (
    <div className="recurrence-control">
      <div className="recurrence-control-row">
        <label className="recurrence-control-select">
          <span className="sr-only">{label || tr("Повторювати завдання")}</span>
          <Icon name="repeat" size={16} className="w-muted" />
          <select
            aria-label={label || tr("Повторювати завдання")}
            disabled={disabled}
            value={custom && r.frequency !== "none" ? "custom" : r.frequency}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") {
                setOpen(true);
                return;
              }
              onChange({ ...noRecurrence(), frequency: v });
            }}
          >
            {quick.map(([v, l]) => (
              <option key={v} value={v}>
                {tr(l)}
              </option>
            ))}
            {custom && r.frequency !== "none" && <option value="custom">{tr("Власний інтервал…")}</option>}
          </select>
        </label>
        <Button size="sm" variant="link" icon="settings" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>
          {tr("Налаштувати повторення")}
        </Button>
      </div>
      {isRecurring(r) && <p className="recurrence-control-summary">{recurrenceSummary(r)}</p>}
      {open && (
        <div className="recurrence-control-panel" role="group" aria-label={tr("Налаштування повторення")}>
          <RecurrenceFields label={label || tr("Повторювати завдання")} value={r} onChange={onChange} disabled={disabled} />
          <div className="w-row">
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              {tr("Готово")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(noRecurrence());
                setOpen(false);
              }}
            >
              {tr("Не повторювати")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
