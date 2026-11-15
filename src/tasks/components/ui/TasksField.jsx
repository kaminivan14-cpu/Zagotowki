// Tasks-owned copy of src/ui/Field.jsx: the Tasks module styles and evolves it independently.
import { cloneElement, isValidElement, useId } from "react";
// Form field wrapper: label, required mark, hint and inline error, consistently laid out.
// A single element child is associated with the label automatically (id / aria-describedby).
export default function TasksField({
  label,
  required = false,
  hint,
  error,
  children,
  className = "",
  inline = false,
  htmlFor,
}) {
  const generated = useId();
  const id = htmlFor || `${generated}-control`,
    hintId = hint ? `${generated}-hint` : undefined,
    errorId = error ? `${generated}-error` : undefined;
  const described = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control =
    typeof children === "function"
      ? children({ id, hintId, errorId })
      : isValidElement(children) && !htmlFor
        ? cloneElement(children, { id: children.props.id || id, "aria-describedby": children.props["aria-describedby"] || described })
        : children;
  return (
    <div className={`tk-field ${inline ? "tk-field-inline" : ""} ${error ? "tk-field-error" : ""} ${className}`.trim()}>
      {label && (
        <div className="tk-field-head">
          <label className="tk-field-label" htmlFor={isValidElement(children) || htmlFor ? (htmlFor || children.props?.id || id) : undefined}>
            {label}
          </label>
          {required && (
            <span className="tk-required" aria-hidden="true">
              *
            </span>
          )}
        </div>
      )}
      <div className="tk-field-control">{control}</div>
      {hint && (
        <small id={hintId} className="tk-field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="tk-field-message" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
