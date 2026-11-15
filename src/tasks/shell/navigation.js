// Primary sections of the Work module (РБ-002). Reports and Schedule are intentionally absent:
// their code stays in src/tasks/screens and is re-enabled by adding entries here (see У-006).
export const sections = [
  { id: "work", label: "Робота", icon: "work" },
  { id: "planning", label: "Планування", icon: "planning" },
  { id: "processes", label: "Процеси", icon: "processes", capability: "processes.read" },
  { id: "tasks", label: "Завдання", icon: "tasks" },
];
// Screens that are reachable only through the header (admin) or no longer reachable (reports, schedule).
export const disabledScreens = ["reports", "schedule"];
export const availableSections = (capabilities) =>
  sections.filter((s) => !s.capability || capabilities.includes(s.capability));
export function resolveScreen(screen, capabilities) {
  if (disabledScreens.includes(screen)) return "work";
  if (screen === "settings") return capabilities.includes("tasks.admin") ? "settings" : "work";
  return availableSections(capabilities).some((s) => s.id === screen) ? screen : "work";
}
