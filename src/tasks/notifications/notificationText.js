import { tr } from "../../i18n/runtime.js";
// Human-readable notification lines (РБ-013). Returns { title, detail } for one notification record.
const kinds = {
  TASK_CREATED: "призначив(ла) вам завдання",
  COMMENT_ADDED: "додав(ла) коментар",
  TASK_UPDATED: "змінив(ла) параметри завдання",
  TASK_ASSIGNED: "змінив(ла) виконавця",
  TASK_PLANNED: "запланував(ла) завдання",
  TASK_STARTED: "розпочав(ла) завдання",
  TASK_RESUMED: "відновив(ла) завдання",
  TASK_PAUSED: "призупинив(ла) завдання",
  TASK_COMPLETED: "завершив(ла) завдання",
  TASK_POSTPONED: "переніс(ла) завдання",
  TASK_CANCELLED: "скасував(ла) завдання",
  TASK_DELETED: "видалив(ла) завдання",
  TASK_REOPENED: "повторно відкрив(ла) завдання",
  TASK_PARENT_CHANGED: "змінив(ла) батьківське завдання",
  TASK_ATTACHMENT_ADDED: "додав(ла) вкладення",
  TASK_ATTACHMENT_REMOVED: "видалив(ла) вкладення",
  TASK_AUTO_RESCHEDULED: "завдання перенесено автоматично",
  TASK_RESCHEDULE_REQUESTED: "запитав(ла) перенесення",
  TASK_RESCHEDULE_APPROVED: "погодив(ла) перенесення",
  TASK_RESCHEDULE_REJECTED: "відхилив(ла) перенесення",
  TASK_APPROVAL_REQUESTED: "запитав(ла) погодження",
  TASK_APPROVAL_APPROVED: "погодив(ла) завдання",
  TASK_APPROVAL_REJECTED: "відхилив(ла) завдання",
  TASK_RESULT_SUBMITTED: "надіслав(ла) результат",
  TASK_RESULT_APPROVED: "підтвердив(ла) результат",
  TASK_CRITICAL_DECLINED: "відклав(ла) критичне завдання",
  PROGRESS_CHANGED: "змінив(ла) прогрес підзавдань",
};
export function notificationText(n) {
  const actor = n.actor?.name || tr("Система"),
    action = tr(kinds[n.kind] || "оновив(ла) завдання"),
    title = n.task?.title || tr("Завдання недоступне");
  const detail =
    n.kind === "COMMENT_ADDED" && n.metadata?.text
      ? String(n.metadata.text).slice(0, 140)
      : n.kind?.startsWith("TASK_ATTACHMENT") && n.metadata?.file?.name
        ? n.metadata.file.name
        : "";
  return { actor, action, title, detail };
}
export const notificationKinds = Object.keys(kinds);
