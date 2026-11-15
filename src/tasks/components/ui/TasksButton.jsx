// Tasks-owned copy of src/ui/Button.jsx: the Tasks module styles and evolves it independently.
import TasksIcon from "./TasksIcon";
// Shared button: variants primary | secondary | ghost | danger | link, sizes sm | md | lg (64px touch target).
// `icon` renders an TasksIcon before the label; `iconOnly` keeps the label for assistive technology only.
export default function TasksButton({
  variant = "secondary",
  size = "md",
  icon,
  iconOnly = false,
  loading = false,
  children,
  className = "",
  type = "button",
  disabled,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`tk-btn tk-btn-${variant} tk-btn-${size} ${iconOnly ? "tk-btn-icon" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <TasksIcon name="spinner" className="tk-spin" />
      ) : (
        icon && <TasksIcon name={icon} />
      )}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}
