// Tasks-owned copy of src/ui/ActionMenu.jsx: the Tasks module styles and evolves it independently.
import { useCallback, useState } from "react";
import TasksIcon from "./TasksIcon";
import useTasksDismissable from "./useTasksDismissable";
// Row-level "⋯" menu with stable placement. Items: { label, icon, onSelect, danger, disabled }.
// The trigger is a real button (aria-expanded / aria-haspopup="menu") rather than a <summary>.
export default function TasksDropdownMenu({
  label,
  items,
  align = "end",
  icon = "more",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useTasksDismissable(open, close);
  return (
    <div
      ref={ref}
      className={`tk-menu tk-menu-${align} ${className}`.trim()}
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        className="tk-btn tk-btn-ghost tk-btn-sm tk-btn-icon"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <TasksIcon name={icon} />
      </button>
      {open && (
        <div className="tk-menu-items" role="menu" aria-label={label}>
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
                  className={`tk-menu-item ${danger ? "tk-menu-danger" : ""}`.trim()}
                  disabled={off}
                  onClick={(e) => {
                    close();
                    onSelect(e);
                  }}
                >
                  {itemIcon && <TasksIcon name={itemIcon} size={16} />}
                  <span>{text}</span>
                </button>
              ),
            )}
        </div>
      )}
    </div>
  );
}
