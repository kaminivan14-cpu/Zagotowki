import Icon from "./Icon";
// Shared button: variants primary | secondary | ghost | danger | link, sizes sm | md.
// `icon` renders an Icon before the label; `iconOnly` keeps the label for assistive technology only.
export default function Button({
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
      className={`w-btn w-btn-${variant} w-btn-${size} ${iconOnly ? "w-btn-icon" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="spinner" className="w-spin" />
      ) : (
        icon && <Icon name={icon} />
      )}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}
