// Tasks-owned copy of src/ui/Badge.jsx: the Tasks module styles and evolves it independently.
// Small status pill. `tone` selects a colour pair; `dot` shows a leading indicator.
export default function TasksBadge({
  tone = "neutral",
  dot = false,
  children,
  className = "",
  title,
}) {
  return (
    <span className={`tk-badge tk-badge-${tone} ${className}`.trim()} title={title}>
      {dot && <span className="tk-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
