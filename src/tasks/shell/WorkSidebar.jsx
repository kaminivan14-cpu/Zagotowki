import { tr } from "../../i18n/runtime";
import TasksIcon from "../components/ui/TasksIcon";
import TasksButton from "../components/ui/TasksButton";
import { availableSections } from "./navigation";
// Persistent vertical navigation (РБ-003). On narrow screens the same element becomes a bottom bar.
export default function WorkSidebar({ screen, onNavigate, onCreate, capabilities, canCreate }) {
  return (
    <aside className="work-sidebar">
      <div className="work-sidebar-create">
        <TasksButton variant="primary" icon="plus" onClick={onCreate} disabled={!canCreate} className="work-create">
          {tr("Створити завдання")}
        </TasksButton>
      </div>
      <nav className="work-nav" aria-label={tr("Розділи роботи")}>
        {availableSections(capabilities).map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={screen === s.id}
            aria-current={screen === s.id ? "page" : undefined}
            onClick={() => onNavigate(s.id)}
          >
            <TasksIcon name={s.icon} size={20} />
            <span>{tr(s.label)}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
