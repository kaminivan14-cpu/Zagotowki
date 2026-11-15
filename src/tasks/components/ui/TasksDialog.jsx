import { useContext, useEffect, useRef } from "react";
import { tr } from "../../../i18n/runtime";
import { TaskFeedback } from "../../feedback";
import TasksModalClose from "./TasksModalClose";
import TasksButton from "./TasksButton";
// Shared modal for the Tasks module. `size="wide"` opens the workspace-sized layout (РБ-006/РБ-012);
// `plain` lets the caller render its own header/footer while keeping the shared error/retry strip.
// The language is switched from the Tasks header only; dialogs do not repeat the switcher.
export default function TasksDialog({
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
      className={`tasks-dialog tk-dialog-with-close ${size === "wide" ? "tasks-dialog-wide" : ""} ${plain ? "tasks-dialog-plain" : ""} ${className}`.trim()}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {/* TODO: Disabled because the redesigned Tasks interface keeps the LanguageSwitcher in the header only.
      <div className="tasks-dialog-language">
        <LanguageSwitcher compact />
      </div> */}
      <TasksModalClose onClose={onClose} disabled={busy} />
      <div className={`tasks-app ${plain ? "work-shell-dialog" : ""}`.trim()}>
        {!plain && <h2>{title}</h2>}
        <p role="alert" className={plain ? "tasks-dialog-alert" : undefined}>
          {feedback.error}
        </p>
        {feedback.error && (
          <TasksButton
            disabled={feedback.busy}
            type="button"
            className={
              plain
                ? "tk-btn tk-btn-secondary tk-btn-sm tasks-dialog-retry"
                : undefined
            }
            onClick={onRetry || feedback.retry}
          >
            {tr("Повторити дію")}
          </TasksButton>
        )}
        {children}
        {!hideClose && !plain && (
          <footer className="tk-dialog-foot">
            <TasksButton type="button" disabled={busy} onClick={onClose}>
              {tr("Закрити")}
            </TasksButton>
          </footer>
        )}
      </div>
    </dialog>
  );
}
