import { cloneElement, isValidElement, useId } from "react";
// Form field wrapper: label, required mark, hint and inline error, consistently laid out.
// A single element child is associated with the label automatically (id / aria-describedby).
export default function Field({
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
    <div className={`w-field ${inline ? "w-field-inline" : ""} ${error ? "w-field-error" : ""} ${className}`.trim()}>
      {label && (
        <div className="w-field-head">
          <label className="w-field-label" htmlFor={isValidElement(children) || htmlFor ? (htmlFor || children.props?.id || id) : undefined}>
            {label}
          </label>
          {required && (
            <span className="w-required" aria-hidden="true">
              *
            </span>
          )}
        </div>
      )}
      <div className="w-field-control">{control}</div>
      {hint && (
        <small id={hintId} className="w-field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="w-field-message" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
