// Tasks-owned copy of src/ui/Popover.jsx: the Tasks module styles and evolves it independently.
import { useCallback, useState } from "react";
import useTasksDismissable from "./useTasksDismissable";
// Anchored popover: `trigger` is the button content; children render inside the floating panel.
// The trigger is a real button (aria-expanded) so assistive tech and tests see it as one.
// Any element inside the panel carrying `data-popover-close` closes the popover when clicked.
export default function TasksPopover({
  trigger,
  triggerClassName = "tk-btn tk-btn-secondary tk-btn-sm",
  label,
  align = "start",
  width,
  children,
  onClose,
  panelClassName = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);
  const ref = useTasksDismissable(open, close);
  return (
    <div
      ref={ref}
      className={`tk-popover tk-popover-${align}`}
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`tk-popover-panel ${panelClassName}`.trim()}
          style={width ? { width } : undefined}
          onClick={(e) => {
            if (e.target.closest("[data-popover-close]")) close();
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
