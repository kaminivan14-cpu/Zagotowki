import { useState } from "react";
import { tr } from "../../i18n/runtime";
import TasksButton from "./ui/TasksButton";
import TasksIcon from "./ui/TasksIcon";
// Title-only subtask creation (РБ-004). All other fields receive the ordinary server defaults.
// The entered title survives a failed request so the user can retry.
export default function QuickCreateInput({ parentId, run, busy, onCreated, onCancel, autoFocus = true, placeholder }) {
  const [title, setTitle] = useState(""),
    [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const text = title.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const created = await run("create", { title: text, parent_task_id: parentId });
      if (created) {
        setTitle("");
        onCreated?.(created);
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="tk-form task-quick-create" onSubmit={submit}>
      <TasksIcon name="subtask" size={16} className="tk-muted" />
      <input
        value={title}
        maxLength={300}
        required
        autoFocus={autoFocus}
        placeholder={placeholder || tr("Назва підзавдання…")}
        aria-label={tr("Назва підзавдання")}
        disabled={busy || saving}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel?.();
        }}
      />
      <TasksButton type="submit" size="sm" variant="primary" loading={saving} disabled={busy || !title.trim()}>
        {tr("Додати")}
      </TasksButton>
      {onCancel && (
        <TasksButton size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {tr("Скасувати")}
        </TasksButton>
      )}
    </form>
  );
}
