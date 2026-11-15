import { tr } from "../../../i18n/runtime";
import TasksButton from "./TasksButton";
// Visible "Back to modules" action. It calls the application's module switcher directly,
// so it works the same after a deep link or a reload (no reliance on browser history).
export default function TasksBackButton({ onBack, label, className = "" }) {
  if (!onBack) return null;
  return (
    <TasksButton variant="ghost" size="sm" icon="chevronLeft" className={`tk-back ${className}`.trim()} onClick={onBack}>
      <span className="tk-back-label">{label || tr("До модулів")}</span>
    </TasksButton>
  );
}
