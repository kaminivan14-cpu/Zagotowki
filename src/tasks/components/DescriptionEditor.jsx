import { useState } from "react";
import { tr } from "../../i18n/runtime";
import TasksButton from "./ui/TasksButton";
// Inline description editing with explicit save (РБ-014). Text is preserved on failure; the server
// records the change in the activity history with before/after snapshots.
export default function DescriptionEditor({ value, canEdit, busy, onSave }) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value || ""),
    [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  }
  if (editing)
    return (
      <div className="task-description-editor tk-form">
        <textarea
          aria-label={tr("Опис")}
          value={draft}
          maxLength={20000}
          rows={8}
          autoFocus
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
          }}
        />
        <div className="tk-row">
          <TasksButton size="sm" variant="primary" icon="save" loading={saving} disabled={busy || draft === (value || "")} onClick={save}>
            {tr("Зберегти опис")}
          </TasksButton>
          <TasksButton size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
            {tr("Скасувати")}
          </TasksButton>
          <small className="tk-muted">{draft.length}/20000</small>
        </div>
      </div>
    );
  return (
    <div className="task-description-view">
      {value ? (
        <p className="task-description">{value}</p>
      ) : (
        <p className="task-description tk-muted">{tr("Опис не додано")}</p>
      )}
      {canEdit && (
        <TasksButton size="sm" variant="ghost" icon="edit" onClick={() => { setDraft(value || ""); setEditing(true); }} disabled={busy} className="task-description-edit">
          {value ? tr("Редагувати опис") : tr("Додати опис")}
        </TasksButton>
      )}
    </div>
  );
}
