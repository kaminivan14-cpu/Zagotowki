import { useEffect, useRef } from "react";
import { tr } from "../i18n/runtime";
import Button from "./Button";
import Icon from "./Icon";
// Confirmation for destructive or irreversible actions. Native <dialog> keeps focus inside the modal.
export default function ConfirmDialog({
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
      className="w-dialog w-confirm"
      aria-labelledby="w-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className={`w-confirm-icon ${danger ? "w-confirm-danger" : ""}`.trim()} aria-hidden="true">
        <Icon name={danger ? "trash" : "info"} size={22} />
      </div>
      <h2 id="w-confirm-title">{title}</h2>
      {text && <p>{text}</p>}
      {details}
      {error && (
        <p role="alert" className="w-inline-error">
          {error}
        </p>
      )}
      <div className="w-confirm-actions">
        <Button onClick={onCancel} disabled={busy}>
          {cancelLabel || tr("Скасувати")}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={onConfirm}
          loading={busy}
          autoFocus
        >
          {confirmLabel || tr("Підтвердити")}
        </Button>
      </div>
    </dialog>
  );
}
