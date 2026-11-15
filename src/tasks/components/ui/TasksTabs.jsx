// Tasks-owned copy of src/ui/Tabs.jsx: the Tasks module styles and evolves it independently.
// Underline or pill tabs with optional counters. items: [{ id, label, count, disabled, title }].
export default function TasksTabs({
  items,
  value,
  onChange,
  label,
  variant = "underline",
  className = "",
}) {
  return (
    <nav className={`tk-tabs tk-tabs-${variant} ${className}`.trim()} aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          disabled={item.disabled}
          title={item.title}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count != null && <span className="tk-tab-count">{item.count}</span>}
        </button>
      ))}
    </nav>
  );
}
