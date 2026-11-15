// Tasks-owned copy of src/ui/useDismissable.js: the Tasks module styles and evolves it independently.
import { useEffect, useRef } from "react";
// Closes a floating element (menu, popover, panel) on outside pointer interaction or Escape and returns
// focus to its trigger. The caller owns the open state: pass `open` and a `close` callback; the returned ref
// goes on the wrapper that contains both the trigger (marked with aria-expanded) and the panel.
// Generalised from src/tasks/processes/useDismissDropdown.js so menus, popovers and panels behave alike.
export default function useTasksDismissable(open, close) {
  const ref = useRef(null),
    closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
        if (ref.current && !ref.current.contains(e.target))
          closeRef.current?.();
      },
      escape = (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        closeRef.current?.();
        ref.current?.querySelector("[aria-expanded]")?.focus();
      };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return ref;
}
