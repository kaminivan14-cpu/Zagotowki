// Tasks-owned copy of src/ui/ProgressBar.jsx: the Tasks module styles and evolves it independently.
import { tr } from "../../../i18n/runtime";
// Direct-child progress (У-005): with no children the component renders a dash and no bar.
export default function TasksProgressBar({ progress, label, compact = false }) {
  if (!progress || !progress.total) return <span className="tk-progress-none">—</span>;
  const percent = Math.round(progress.percent ?? (100 * progress.done) / progress.total);
  return (
    <span className={`tk-progress ${compact ? "tk-progress-compact" : ""}`.trim()}>
      <progress
        max={progress.total}
        value={progress.done}
        className={progress.done === progress.total ? "complete" : ""}
        aria-label={label || tr("Прогрес")}
      />
      <span className="tk-progress-text">
        {progress.done}/{progress.total}
        {!compact && <small> · {percent}%</small>}
      </span>
    </span>
  );
}
