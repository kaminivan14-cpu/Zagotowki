// TODO: used only by the commented-out previous implementation below.
// import ModalClose from "../../ui/ModalClose";
// TODO: used only by the commented-out previous implementation below.
// import { tr } from "../../i18n/runtime";
// TODO: used only by the commented-out previous implementation below.
// import { useContext, useEffect, useRef } from "react";
// TODO: used only by the commented-out previous implementation below.
// import { TaskFeedback } from "../feedback";
// Legacy entry point kept (file-preservation policy); see the note above `Dialog` below.
// import LanguageSwitcher from "../../i18n";
// Shared modal for the Work module. `size="wide"` opens the workspace-sized layout (РБ-006/РБ-012);
// `plain` lets the caller render its own header/footer while keeping the shared error/retry strip.
import TasksDialog from "./ui/TasksDialog";
// Kept for the two consumers outside src/tasks that import it (src/preferences/TextSettings.jsx and
// src/auth/EmailInvite.jsx, both opened from the Tasks module): it now renders the redesigned TasksDialog so those
// dialogs match every other Tasks dialog. Same props as before.
export default function Dialog(props) {
  return <TasksDialog {...props} />;
}
/* TODO: Previous implementation, superseded by TasksDialog (kept for reference, not executed).
export default function Dialog({
  title,
  children,
  onClose,
  busy = false,
  onRetry,
  hideClose = false,
  size = "default",
  plain = false,
  className = "",
}) {
  const feedback = useContext(TaskFeedback);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`tasks-dialog modal-with-close ${size === "wide" ? "tasks-dialog-wide" : ""} ${plain ? "tasks-dialog-plain" : ""} ${className}`.trim()}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {/* TODO: Disabled because the redesigned Tasks interface keeps the LanguageSwitcher in the header only.
      <div className="tasks-dialog-language">
        <LanguageSwitcher compact />
      </div> * /}
      <ModalClose onClose={onClose} disabled={busy} />
      <div className={`tasks-app ${plain ? "work-shell-dialog" : ""}`.trim()}>
        {!plain && <h2>{title}</h2>}
        <p role="alert" className={plain ? "tasks-dialog-alert" : undefined}>
          {feedback.error}
        </p>
        {feedback.error && (
          <button
            disabled={feedback.busy}
            type="button"
            className={plain ? "w-btn w-btn-secondary w-btn-sm tasks-dialog-retry" : undefined}
            onClick={onRetry || feedback.retry}
          >
            {tr("Повторити дію")}
          </button>
        )}
        {children}
        {!hideClose && !plain && (
          <button type="button" disabled={busy} onClick={onClose}>
            {tr("Закрити")}
          </button>
        )}
      </div>
    </dialog>
  );
}
*/
