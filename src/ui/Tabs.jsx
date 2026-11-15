// Underline or pill tabs with optional counters. items: [{ id, label, count, disabled, title }].
export default function Tabs({
  items,
  value,
  onChange,
  label,
  variant = "underline",
  className = "",
}) {
  return (
    <nav className={`w-tabs w-tabs-${variant} ${className}`.trim()} aria-label={label}>
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
          {item.count != null && <span className="w-tab-count">{item.count}</span>}
        </button>
      ))}
    </nav>
  );
}
