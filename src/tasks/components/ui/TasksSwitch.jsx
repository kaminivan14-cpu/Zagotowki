// Toggle switch built on a native checkbox (keyboard, form and label semantics stay native).
// `description` renders under the label and is linked through aria-describedby.
import { useId } from "react";
export default function TasksSwitch({ checked, onChange, children, description, disabled = false, className = "" }) {
  const id = useId();
  return (
    <div className={`tk-switch-field ${className}`.trim()}>
      <label className="tk-switch">
        <span className="tk-switch-text">{children}</span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-desc` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="tk-switch-track" aria-hidden="true" />
      </label>
      {description && (
        <small id={`${id}-desc`} className="tk-switch-description">
          {description}
        </small>
      )}
    </div>
  );
}
