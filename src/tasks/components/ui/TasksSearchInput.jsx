import TasksIcon from "./TasksIcon";
// Search field with a leading icon: one implementation for the task list toolbar and the task pickers.
// `label` is the accessible name when it differs from the placeholder; other props go to the <input>.
export default function TasksSearchInput({ value, onChange, placeholder, label, className = "", ...rest }) {
  return (
    <label className={`tk-search ${className}`.trim()}>
      <span className="sr-only">{label || placeholder}</span>
      <TasksIcon name="search" size={16} className="tk-search-icon" />
      <input type="search" value={value} placeholder={placeholder} onChange={onChange} {...rest} />
    </label>
  );
}
