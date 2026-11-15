// Small status pill. `tone` selects a colour pair; `dot` shows a leading indicator.
export default function Badge({
  tone = "neutral",
  dot = false,
  children,
  className = "",
  title,
}) {
  return (
    <span className={`w-badge w-badge-${tone} ${className}`.trim()} title={title}>
      {dot && <span className="w-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
