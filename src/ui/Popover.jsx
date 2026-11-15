import { useCallback, useState } from "react";
import useDismissable from "./useDismissable";
// Anchored popover: `trigger` is the button content; children render inside the floating panel.
// The trigger is a real button (aria-expanded) so assistive tech and tests see it as one.
// Any element inside the panel carrying `data-popover-close` closes the popover when clicked.
export default function Popover({
  trigger,
  triggerClassName = "w-btn w-btn-secondary w-btn-sm",
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
  const ref = useDismissable(open, close);
  return (
    <div
      ref={ref}
      className={`w-popover w-popover-${align}`}
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
          className={`w-popover-panel ${panelClassName}`.trim()}
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
