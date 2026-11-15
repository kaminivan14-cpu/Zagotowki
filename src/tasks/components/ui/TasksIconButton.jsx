import TasksButton from "./TasksButton";
// Square icon-only button; `label` stays available to assistive technology and as the tooltip.
export default function TasksIconButton({ icon, label, variant = "ghost", size = "sm", ...rest }) {
  return (
    <TasksButton variant={variant} size={size} icon={icon} iconOnly title={label} {...rest}>
      {label}
    </TasksButton>
  );
}
