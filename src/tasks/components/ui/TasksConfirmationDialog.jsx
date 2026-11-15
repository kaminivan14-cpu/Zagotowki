// Tasks-owned copy of src/ui/ConfirmDialog.jsx: the Tasks module styles and evolves it independently.
import { useEffect, useRef } from "react";
import { tr } from "../../../i18n/runtime";
import TasksButton from "./TasksButton";
import TasksIcon from "./TasksIcon";
// Confirmation for destructive or irreversible actions. Native <dialog> keeps focus inside the modal.
export default function TasksConfirmationDialog({
  title,
  text,
  details,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
  // `informational`: one acknowledgement button (e.g. an action that is not allowed), no cancel.
  informational = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="tk-dialog tk-confirm"
      aria-labelledby="tk-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className={`tk-confirm-icon ${danger ? "tk-confirm-danger" : ""}`.trim()} aria-hidden="true">
        <TasksIcon name={danger ? "trash" : "info"} size={22} />
      </div>
      <h2 id="tk-confirm-title">{title}</h2>
      {text && <p>{text}</p>}
      {details}
      {error && (
        <p role="alert" className="tk-inline-error">
          {error}
        </p>
      )}
      <div className="tk-confirm-actions">
        {!informational && (
          <TasksButton onClick={onCancel} disabled={busy}>
            {cancelLabel || tr("Скасувати")}
          </TasksButton>
        )}
        <TasksButton
          variant={danger ? "danger" : "primary"}
          onClick={onConfirm}
          loading={busy}
          autoFocus
        >
          {confirmLabel || tr("Підтвердити")}
        </TasksButton>
      </div>
    </dialog>
  );
}
