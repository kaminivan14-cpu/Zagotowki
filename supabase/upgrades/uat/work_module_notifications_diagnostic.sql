-- Work module — why are there no notifications? UAT diagnostic (READ-ONLY). Target: meuzkduxttjcuiynsnaa.
-- Paste the WHOLE file into an empty SQL Editor tab and click Run: the result shown is N3 (classification of every
-- activity event). N1 and N2 can be run on their own with "Run selected".
-- Notifications are created only by app_private.task_notify, called from app_private.task_event in the same
-- transaction as the activity event (since migration 202611110001). Rules (D-8, D-27): the actor is never a
-- recipient; recipients are the task's assignee and author, commenters, pending approvers, the process owner / step
-- approver, and for some types the parent's assignee / author; only active, non-archived employees; one row per event
-- and recipient. Events recorded before 202611110001 were never turned into notifications (no back-fill, by design).

-- N1. Accounts usable for the two-account test: active employee, linked Auth user, role with tasks.access.
SELECT e.id AS employee_id, e.name, e.role, u.email AS login_email,
       app_private.role_has_permission(e.role, 'tasks.access') AS tasks_access,
       app_private.role_has_permission(e.role, 'tasks.assign') AS can_assign_others,
       (SELECT count(*) FROM public."Tasks" t WHERE t.assigned_to_employee_id = e.id AND t.deleted_at IS NULL) AS assigned_tasks,
       EXISTS (SELECT FROM app_private.org_assignments(current_date) o WHERE o.manager_employee_id = e.id) AS has_direct_reports
FROM public."Employees" e LEFT JOIN auth.users u ON u.id = e.auth_user_id
WHERE e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL
ORDER BY tasks_access DESC, e.id;

-- N2. Notifications per recipient (all-time).
SELECT n.recipient_employee_id, e.name, count(*) AS notifications, count(*) FILTER (WHERE n.read_at IS NULL) AS unread,
       max(n.created_at) AS newest
FROM public."Task_notifications" n JOIN public."Employees" e ON e.id = n.recipient_employee_id
GROUP BY 1, 2 ORDER BY 1;

-- N3. Why each activity event did or did not produce a notification.
--     "after_migration": the event's task snapshot already contains the 202611110001 column deleted_at.
WITH ev AS (
  SELECT e.id, e.task_id, e.event_type, e.actor_employee_id, e.created_at, e.metadata,
         e.metadata -> 'after' ? 'deleted_at' AS after_migration,
         EXISTS (SELECT FROM public."Task_notifications" n WHERE n.event_id = e.id) AS notified,
         (e.metadata -> 'after' ->> 'assigned_to_employee_id')::bigint AS assignee,
         (e.metadata -> 'after' ->> 'created_by_employee_id')::bigint AS creator,
         (e.metadata -> 'after' ->> 'parent_task_id')::bigint AS parent_id,
         e.metadata -> 'after' ->> 'source_type' AS source_type,
         e.metadata -> 'after' -> 'source_metadata' AS source_metadata
  FROM public."Task_events" e
), candidates AS (
  SELECT ev.*,
    (SELECT count(*) FROM (
        SELECT ev.assignee AS id UNION SELECT ev.creator
        UNION SELECT c.actor_employee_id FROM public."Task_events" c WHERE c.task_id = ev.task_id AND c.event_type = 'COMMENT_ADDED' AND c.id <= ev.id
        UNION SELECT r.approver_employee_id FROM public."Task_approval_requests" r WHERE r.task_id = ev.task_id AND r.status = 'pending'
        UNION SELECT i.owner_employee_id FROM public."Process_instances" i WHERE ev.source_type = 'process' AND i.id = (ev.source_metadata ->> 'process_instance_id')::bigint
        UNION SELECT (ev.source_metadata -> 'step' ->> 'approver_id')::bigint
        UNION SELECT p.assigned_to_employee_id FROM public."Tasks" p WHERE p.id = ev.parent_id
              AND ev.event_type IN ('TASK_COMPLETED','TASK_CANCELLED','TASK_DELETED','TASK_CREATED','TASK_PARENT_CHANGED','TASK_REOPENED')
        UNION SELECT p.created_by_employee_id FROM public."Tasks" p WHERE p.id = ev.parent_id
              AND ev.event_type IN ('TASK_COMPLETED','TASK_CANCELLED','TASK_DELETED','TASK_CREATED','TASK_PARENT_CHANGED','TASK_REOPENED')
      ) r JOIN public."Employees" x ON x.id = r.id AND x.active AND x.archived_at IS NULL
      WHERE r.id IS DISTINCT FROM ev.actor_employee_id) AS other_people,
    ev.event_type IN ('TASK_CREATED','COMMENT_ADDED','TASK_UPDATED','TASK_ASSIGNED','TASK_PLANNED','TASK_STARTED','TASK_RESUMED',
      'TASK_PAUSED','TASK_COMPLETED','TASK_POSTPONED','TASK_CANCELLED','TASK_DELETED','TASK_REOPENED','TASK_PARENT_CHANGED',
      'TASK_ATTACHMENT_ADDED','TASK_ATTACHMENT_REMOVED','TASK_AUTO_RESCHEDULED','TASK_RESCHEDULE_REQUESTED','TASK_RESCHEDULE_APPROVED',
      'TASK_RESCHEDULE_REJECTED','TASK_APPROVAL_REQUESTED','TASK_APPROVAL_APPROVED','TASK_APPROVAL_REJECTED','TASK_RESULT_SUBMITTED',
      'TASK_RESULT_APPROVED','TASK_CRITICAL_DECLINED')
    AND NOT (ev.event_type = 'TASK_UPDATED' AND (ev.metadata ? 'recurrence' OR ev.metadata ->> 'reason' = 'process_launch')) AS type_notifies,
    ev.event_type = 'TASK_ASSIGNED' AND (ev.metadata -> 'before' ->> 'assigned_to_employee_id') IS NOT DISTINCT FROM (ev.metadata -> 'after' ->> 'assigned_to_employee_id') AS unchanged_assignee
  FROM ev
), classified AS (
  SELECT *, CASE
    WHEN notified THEN '1 notified'
    WHEN NOT after_migration THEN '2 recorded before 202611110001 - notifications did not exist yet (no back-fill)'
    WHEN NOT type_notifies THEN '3 event type never notifies (internal / recurrence / process launch)'
    WHEN unchanged_assignee THEN '4 assignment without a change of assignee - nobody notified (D-14)'
    WHEN other_people = 0 THEN '5 only the actor is involved - by design nobody else to notify'
    ELSE '6 SHOULD HAVE NOTIFIED - send these event ids for investigation' END AS classification
  FROM candidates
)
SELECT classification, event_type, count(*) AS events, min(id) AS first_event_id, max(id) AS last_event_id,
       max(created_at) AS newest_event
FROM classified GROUP BY classification, event_type ORDER BY classification, event_type;
