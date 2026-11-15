import { useCallback, useState } from "react";
import Icon from "./Icon";
import useDismissable from "./useDismissable";
// Row-level "⋯" menu with stable placement. Items: { label, icon, onSelect, danger, disabled }.
// The trigger is a real button (aria-expanded / aria-haspopup="menu") rather than a <summary>.
export default function ActionMenu({
  label,
  items,
  align = "end",
  icon = "more",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissable(open, close);
  return (
    <div
      ref={ref}
      className={`w-menu w-menu-${align} ${className}`.trim()}
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        className="w-btn w-btn-ghost w-btn-sm w-btn-icon"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div className="w-menu-items" role="menu" aria-label={label}>
          {items
            .filter(Boolean)
            .map(
              ({
                label: text,
                icon: itemIcon,
                onSelect,
                danger,
                disabled: off,
              }) => (
                <button
                  key={text}
                  type="button"
                  role="menuitem"
                  className={`w-menu-item ${danger ? "w-menu-danger" : ""}`.trim()}
                  disabled={off}
                  onClick={(e) => {
                    close();
                    onSelect(e);
                  }}
                >
                  {itemIcon && <Icon name={itemIcon} size={16} />}
                  <span>{text}</span>
                </button>
              ),
            )}
        </div>
      )}
    </div>
  );
}
