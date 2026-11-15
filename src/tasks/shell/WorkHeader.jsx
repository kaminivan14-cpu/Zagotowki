import { tr } from "../../i18n/runtime";
import TasksLanguageSwitcher from "../components/ui/TasksLanguageSwitcher";
import TasksIcon from "../components/ui/TasksIcon";
import TasksButton from "../components/ui/TasksButton";
import TasksPopover from "../components/ui/TasksPopover";
import TasksBackButton from "../components/ui/TasksBackButton";
import PersonAvatar from "../employees/PersonAvatar";
import { roleName } from "../admin/labels";
import NotificationCenter from "../notifications/NotificationCenter";
// Single compact header (РБ-001): language, module identity, notifications, admin entry, settings,
// account menu with module switch and logout. Nothing from the previous two bars was dropped.
export default function WorkHeader({
  employee,
  capabilities,
  screen,
  unread,
  unreadStale = false,
  onNavigate,
  onSettings,
  onModules,
  onSignOut,
  onOpenTask,
  run,
  onCreate,
  canCreate,
}) {
  const admin = capabilities.includes("tasks.admin");
  return (
    <header className="work-header">
      <TasksBackButton onBack={onModules} label={tr("Модулі")} className="work-back" />
      <div className="work-brand">
        <span className="work-logo" aria-hidden="true">
          <TasksIcon name="work" size={18} />
        </span>
        <div className="work-brand-text">
          <h1>{tr("Робота")}</h1>
          <small>ALKI</small>
        </div>
      </div>
      <div className="work-header-actions">
        <TasksButton
          variant="primary"
          size="sm"
          icon="plus"
          iconOnly
          className="work-create-compact"
          onClick={onCreate}
          disabled={!canCreate}
        >
          {tr("Створити завдання")}
        </TasksButton>
        <TasksLanguageSwitcher />
        <NotificationCenter
          unread={unread}
          stale={unreadStale}
          onOpenTask={onOpenTask}
          run={run}
        />
        {admin && (
          <TasksButton
            variant={screen === "settings" ? "primary" : "ghost"}
            size="sm"
            icon="admin"
            aria-pressed={screen === "settings"}
            onClick={() => onNavigate("settings")}
            className="work-admin-button"
            title={tr("Адмін панель")}
          >
            <span className="work-admin-label">{tr("Адмін панель")}</span>
          </TasksButton>
        )}
        <TasksButton variant="ghost" size="sm" icon="settings" iconOnly onClick={onSettings} title={tr("Налаштування")}>
          {tr("Налаштування")}
        </TasksButton>
        <TasksPopover
          align="end"
          label={tr("Обліковий запис")}
          triggerClassName="tk-btn tk-btn-ghost tk-btn-sm work-account"
          trigger={
            <>
              <PersonAvatar person={employee} size={28} />
              <span className="work-account-name">{employee.name}</span>
              <TasksIcon name="chevronDown" size={16} />
            </>
          }
          panelClassName="work-account-panel"
        >
          <>
              <div className="work-account-identity">
                <PersonAvatar person={employee} size={36} />
                <div>
                  <strong>{employee.name}</strong>
                  <small>{roleName(employee.role)}</small>
                </div>
              </div>
              <div className="tk-menu-sep" />
              <button type="button" className="tk-menu-item" data-popover-close onClick={onSettings}>
                <TasksIcon name="settings" size={16} />
                <span>{tr("Налаштування")}</span>
              </button>
              {admin && (
                <button type="button" className="tk-menu-item" data-popover-close onClick={() => onNavigate("settings")}>
                  <TasksIcon name="admin" size={16} />
                  <span>{tr("Адмін панель")}</span>
                </button>
              )}
              {/* TODO: Disabled because «Модулі» is now a visible header button (TasksBackButton); kept for reference.
              {onModules && (
                <button type="button" className="tk-menu-item" data-popover-close onClick={onModules}>
                  <TasksIcon name="modules" size={16} />
                  <span>{tr("Модулі")}</span>
                </button>
              )} */}
              <button type="button" className="tk-menu-item tk-menu-danger" data-popover-close onClick={onSignOut}>
                <TasksIcon name="logout" size={16} />
                <span>{tr("Вийти")}</span>
              </button>
          </>
        </TasksPopover>
      </div>
    </header>
  );
}
