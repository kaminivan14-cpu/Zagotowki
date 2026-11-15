import { tr } from "../i18n/runtime";
// Direct-child progress (У-005): with no children the component renders a dash and no bar.
export default function ProgressBar({ progress, label, compact = false }) {
  if (!progress || !progress.total) return <span className="w-progress-none">—</span>;
  const percent = Math.round(progress.percent ?? (100 * progress.done) / progress.total);
  return (
    <span className={`w-progress ${compact ? "w-progress-compact" : ""}`.trim()}>
      <progress
        max={progress.total}
        value={progress.done}
        className={progress.done === progress.total ? "complete" : ""}
        aria-label={label || tr("Прогрес")}
      />
      <span className="w-progress-text">
        {progress.done}/{progress.total}
        {!compact && <small> · {percent}%</small>}
      </span>
    </span>
  );
}
