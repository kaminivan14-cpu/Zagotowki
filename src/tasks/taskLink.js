// Task deep links: `?task=<id>` opens that task's workspace inside the Tasks module.
// Pure helpers (string in, string out) so they are unit-testable; access is still checked by tasks_details.
export function taskIdFromSearch(search) {
  const raw = new URLSearchParams(search || "").get("task");
  if (!raw || !/^\d{1,18}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function searchWithTask(search, id) {
  const params = new URLSearchParams(search || "");
  if (id) params.set("task", String(id));
  else params.delete("task");
  const text = params.toString();
  return text ? `?${text}` : "";
}
// Keeps the address bar in sync without adding history entries (Back/Forward never reopen stale dialogs).
export function writeTaskLink(id) {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  const next = searchWithTask(search, id);
  if (next !== search) window.history.replaceState(window.history.state, "", `${pathname}${next}${hash}`);
}
