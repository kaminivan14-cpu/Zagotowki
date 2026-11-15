// Tasks-owned copy of src/ui/StateMessage.jsx: the Tasks module styles and evolves it independently.
import { tr } from "../../../i18n/runtime";
import TasksButton from "./TasksButton";
import TasksIcon from "./TasksIcon";
// Loading / error / empty placeholders with a consistent layout.
export default function TasksStateMessage({
  kind = "empty",
  title,
  text,
  actionLabel,
  onAction,
  compact = false,
  className = "",
}) {
  const role = kind === "error" ? "alert" : kind === "loading" ? "status" : undefined;
  return (
    <div className={`tk-state tk-state-${kind} ${compact ? "tk-state-compact" : ""} ${className}`.trim()} role={role}>
      <span className="tk-state-icon" aria-hidden="true">
        <TasksIcon
          name={kind === "loading" ? "spinner" : kind === "error" ? "alert" : "info"}
          size={compact ? 18 : 24}
          className={kind === "loading" ? "tk-spin" : ""}
        />
      </span>
      <div>
        {title && <h3 className="tk-state-title">{title}</h3>}
        {text && <p>{text}</p>}
        {!title && !text && kind === "loading" && <p>{tr("Завантаження…")}</p>}
        {onAction && (
          <TasksButton size="sm" onClick={onAction}>
            {actionLabel || tr("Повторити")}
          </TasksButton>
        )}
      </div>
    </div>
  );
}
