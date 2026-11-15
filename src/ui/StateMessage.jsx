import { tr } from "../i18n/runtime";
import Button from "./Button";
import Icon from "./Icon";
// Loading / error / empty placeholders with a consistent layout.
export default function StateMessage({
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
    <div className={`w-state w-state-${kind} ${compact ? "w-state-compact" : ""} ${className}`.trim()} role={role}>
      <span className="w-state-icon" aria-hidden="true">
        <Icon
          name={kind === "loading" ? "spinner" : kind === "error" ? "alert" : "info"}
          size={compact ? 18 : 24}
          className={kind === "loading" ? "w-spin" : ""}
        />
      </span>
      <div>
        {title && <h3 className="w-state-title">{title}</h3>}
        {text && <p>{text}</p>}
        {!title && !text && kind === "loading" && <p>{tr("Завантаження…")}</p>}
        {onAction && (
          <Button size="sm" onClick={onAction}>
            {actionLabel || tr("Повторити")}
          </Button>
        )}
      </div>
    </div>
  );
}
