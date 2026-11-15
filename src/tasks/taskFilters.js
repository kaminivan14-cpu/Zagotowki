import { tr } from "../i18n/runtime.js";
import { statuses, priorities } from "./labels.uk.js";
// Query helpers for the task list filters (plain module so screens and tests can share them).
export const filterKeys = ["status", "priority", "assignee", "category", "deadline_from", "deadline_to"];
export function activeFilters(query, { assignees = [], categories = [] } = {}) {
  const names = {
    status: (v) => `${tr("Статус")}: ${statuses[v] || v}`,
    priority: (v) => `${tr("Пріоритет")}: ${priorities[v] || v}`,
    assignee: (v) => `${tr("Виконавець")}: ${assignees.find((p) => String(p.id) === String(v))?.name || v}`,
    category: (v) => `${tr("Категорія")}: ${categories.find((c) => String(c.id) === String(v))?.name || v}`,
    deadline_from: (v) => `${tr("Дедлайн від")}: ${v.split("-").reverse().join(".")}`,
    deadline_to: (v) => `${tr("Дедлайн до")}: ${v.split("-").reverse().join(".")}`,
  };
  return filterKeys.filter((k) => query[k]).map((k) => ({ key: k, label: names[k](query[k]) }));
}
// Query keys introduced with the hierarchy-aware tasks_list (migration 202611110001). The 2026-10-26 version
// rejects a query containing any of them (INVALID_QUERY), even with an empty value.
export const hierarchyListKeys = ["view", "page_size", "dir"];
export function legacyListQuery(query) {
  const legacy = { ...query };
  for (const key of hierarchyListKeys) delete legacy[key];
  return legacy;
}
// Only the hierarchy-aware tasks_list returns per-view counters; the legacy response never has `views`.
export const isLegacyListResponse = (result) =>
  Boolean(result) && typeof result === "object" && !("views" in result);
