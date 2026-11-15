Work Module Update — Implementation Plan
File: PLAN.md
Audience: Claude Code, OpenAI Codex, and the engineering team
Target: The existing, already deployed Work module
Purpose: A repository-first, staged implementation plan for the approved Technical Specification: Work Module Update
Primary UX reference: ClickUp — interaction patterns and information hierarchy only
Task hierarchy reference: Jira — parent/child rules and completion constraints only
Status: Implementation plan; not evidence that any requirement has already been implemented or verified 0. Mission and Operating Principles
0.1 Mission
Upgrade the existing Work module in place. The first task is to understand the real repository and current behavior, then map the approved requirements to the current implementation, and only then implement the smallest safe set of changes needed to satisfy them.

This is not a greenfield project. Do not create a parallel Work module, replace the current architecture for stylistic reasons, or duplicate existing domain entities, APIs, components, storage mechanisms, or permission systems when they can be safely reused.

The target is a compact, predictable, responsive, accessible task-management experience with:

- multi-level task hierarchy;
- safe task creation and parent reassignment;
- hierarchy-aware task lists, views, filtering, and sorting;
- progress based on direct children only;
- server-enforced completion constraints;
- a combined task viewing/editing workspace;
- secure descriptions and attachments;
- immutable activity history;
- personalized notifications.
  0.2 Non-negotiable principles

1. Inspect before changing. Confirm the actual stack, architecture, routes, data model, permissions, recurrence behavior, storage, and test commands from the repository.
2. Preserve before replacing. Reuse working task models, APIs, services, policies, recurrence logic, comments, user relationships, file storage, events, and UI primitives.
3. Server is authoritative. Authorization, hierarchy integrity, completion rules, file access, activity creation, and notification creation must be enforced server-side. UI checks are for usability, not security.
4. No silent data loss. Do not delete tables, columns, records, files, task branches, history, or legacy code without dependency analysis and explicit approval where required.
5. No invented business rules. Do not guess status semantics, defaults, process ownership, permission inheritance, recurrence behavior, recipient rules, or deletion consequences.
6. Preserve recurrence semantics. Requirement РБ-005 is a presentation change. Do not rewrite recurrence calculation, generation, scheduling, storage, or series behavior.
7. Preserve hierarchy context. Filtering, sorting, pagination, expansion, and mutations must not orphan, duplicate, or silently hide matching tasks.
8. Deliver incrementally. Keep changes small, reviewable, and independently verifiable. Do not proceed past a phase gate when critical checks fail.
9. Evidence over claims. A requirement is not verified merely because code was written or a UI was rendered. Record exact test commands, scenarios, and results.
10. Keep unrelated modules stable. Recheck shared routes, components, APIs, models, and services that may be used outside Work.
    0.3 Scope boundaries
    In scope:

- РБ-001–РБ-014 and approved decisions У-001–У-007;
- responsive app shell, compact header, sidebar, and simplified navigation;
- task hierarchy, quick-create, parent reassignment, and hierarchy-aware lists;
- existing recurrence controls presented more compactly;
- task create/edit and detail experience;
- active/completed visibility, direct-child progress, and completion guard;
- safe task deletion according to an explicitly approved policy;
- description editing, attachment lifecycle, activity history, and notification center;
- server/API validation, authorization, migrations where required, automated tests, security checks, and rollout preparation.
  Out of scope unless the repository already supports it and the product owner explicitly approves it:
- replacing the technology stack, application architecture, authentication, or organization model;
- rebuilding the Work module from scratch;
- physical deletion of Reports or Schedule/Graph code, routes, tables, or data;
- rewriting recurrence algorithms or migrating recurrence records;
- drag-and-drop task ordering or parent reassignment;
- automatically changing child statuses when a parent changes status;
- deleting an entire task subtree;
- introducing a new queue, message broker, realtime platform, or feature-flag system merely for modernization;
- broad redesign of unrelated modules.
  0.4 Requirement identifiers and status vocabulary
  Use the identifiers from the approved specification exactly: РБ-001–РБ-014 and У-001–У-007. Do not silently rename, merge, or omit them.

Use only these implementation statuses in the traceability matrix:

- NOT_STARTED — not yet investigated or implemented;
- AUDITED — current behavior has been investigated and documented;
- IN_PROGRESS — implementation is underway;
- IMPLEMENTED — code has been written, but acceptance checks are incomplete;
- VERIFIED — acceptance checks have actually passed and evidence is recorded;
- BLOCKED — a blocker or missing approval has been recorded;
- EXCEPTION_APPROVED — an exception has been explicitly approved and its decision reference is recorded.
  Do not use DONE, COMPLETE, or VERIFIED as substitutes for untested implementation.

1. How Claude Code / Codex Must Work
   1.1 Mandatory pre-flight sequence
   Before editing application code:
1. Run git status and inspect the current branch, staged and unstaged changes, untracked files, and existing local modifications. Do not overwrite or discard user work.
1. Read repository instructions and their applicable scopes: AGENTS.md, CLAUDE.md, README, contribution guides, architecture decision records, package scripts, formatting/lint rules, and instructions in relevant subdirectories.
1. Map the repository and identify the actual languages, frameworks, runtime versions, package managers, build tools, and frontend/backend boundaries.
1. Identify local startup, environment configuration shape, test commands, CI checks, and a safe method to reproduce the current application.
1. Inspect the Work module end to end: routes, layouts, pages, components, state/query layer, APIs, services, data entities, migrations, permission checks, storage, jobs/events, and tests.
1. Reproduce current behavior using a test environment and test data. Do not experiment against production data.
1. Create the audit, current-state matrix, baseline test report, risk register, and approval questions described in Phase 0.
1. Present the audit findings and proposed change plan before editing application files.
   Hard gate: Do not edit application source files, alter application behavior, or apply schema/data migrations until Phase 0 is complete and the current-state matrix and change plan have been presented. Audit documentation may be created during Phase 0. After the gate, proceed only with work that has no unresolved high-risk approval dependency.
   1.2 Sources of truth and precedence
1. The approved Technical Specification and decisions У-001–У-007 define the required product behavior.
1. The actual repository defines the current implementation: stack, APIs, schemas, routes, permissions, defaults, recurrence, storage, and business logic.
1. Existing tests are evidence of current expected behavior, but do not override explicit approved requirements. Explain conflicts rather than silently changing either side.
1. ClickUp is a UX reference for compact task lists, sorting/filtering patterns, and task detail organization. Do not copy its proprietary code or pixel-perfect design.
1. Jira is a behavior reference for parent/child relationships and completion constraints. Do not copy its proprietary code or pixel-perfect design.
1. Google Calendar is a compact recurrence-UI reference only. Existing recurrence semantics remain authoritative.
   If the specification conflicts with established application behavior, document the exact conflict, user/data impact, and safe options. Seek approval before decisions that change data, permissions, destructive behavior, or established business semantics.
   1.3 Prohibited actions and assumptions

- Do not create a new Work module instead of updating the existing one.
- Do not replace the current architecture solely because another stack or pattern appears more modern.
- Do not create duplicate components, APIs, tables, entities, participant relations, notification systems, or file storage when an existing implementation can be safely extended.
- Do not assume a technology stack, route name, table/column, status value, role, permission, process owner, default value, recurrence format, or storage provider.
- Do not infer the organizational hierarchy from arbitrary profile fields. Find the actual direct-report relation.
- Do not assume task permissions are inherited from a parent to a child. Audit the existing access model.
- Do not weaken permissions or expand access to make a view/filter easier to implement.
- Do not enforce critical permissions only by hiding a button or menu item.
- Do not copy a parent's assignee, priority, deadline, recurrence, or other values into a quick-created child unless the existing regular task-creation behavior explicitly applies that rule.
- Do not silently change status semantics, recurrence behavior, assignment behavior, event recipients, or task deletion behavior.
- Do not cascade-delete subtasks or attached data without explicit approval.
- Do not physically delete Reports or Schedule/Graph code, routes, schemas, or data as part of hiding those sections.
- Do not bulk-transform or reassign existing data without a migration plan, backup/recovery strategy, and validation against a copy.
- Do not delete a test merely because it blocks a change. Do not alter expected test behavior without documenting why.
- Do not report a command as passed unless it was run and its result was observed.
- Do not commit, push, deploy, or modify production data unless explicitly instructed.
  1.4 Safe execution rules
- Use the smallest implementation slice that can be tested.
- Follow existing naming, dependency injection, state management, API, ORM, localization, and error-handling conventions.
- Reuse installed dependencies and components where suitable. Justify any new dependency against the existing stack.
- Keep domain rules out of presentation-only code.
- Keep server validation authoritative; client validation may mirror it for immediate feedback.
- Use transactions and appropriate locking/isolation for related mutations when supported by the actual database.
- Preserve API compatibility where separate frontend/backend deployment or older clients make it relevant.
- Inspect diffs for unrelated edits, generated artifacts, secrets, and accidental data changes.

2. Phase 0 — Mandatory Repository and Work Module Audit
   Goal: Build a verified map of the existing system and capture its baseline before implementation.
   2.1 Repository, stack, and runtime audit
   Inspect and document:

- repository layout, workspace/monorepo boundaries, and application packages;
- frontend and backend languages, frameworks, versions, runtime versions, package managers, and build tools;
- entry points, module registration, dependency injection, and environment configuration shape;
- local startup procedure, test data/seeding method, and safe test environment;
- routing, nested layouts, route guards, middleware, redirects, lazy loading, and navigation ownership;
- design system: tokens, typography, spacing, colors, breakpoints, icons, buttons, forms, menus, dialogs, popovers, tables, trees, and toast patterns;
- localization and supported languages;
- API style: REST, GraphQL, RPC, server actions, or repository-specific conventions;
- database engine, ORM/query layer, schemas, migrations, relations, indexes, foreign keys, and delete behavior;
- authentication, current-user resolution, roles, policies, permissions, tenant/company scopes, and access helpers;
- task-related services, controllers/handlers, repositories, DTOs/schemas, validators, and all endpoint consumers;
- comments, replies, participants/watchers, processes, process ownership, employee/user relationships, and direct-report structure;
- recurrence representation, calculation, generation, scheduled jobs, time zones, daylight-saving behavior, series/instance semantics, and tests;
- storage provider, file metadata, upload/download paths, signed URLs, CDN/object storage, previews, and cleanup jobs;
- audit/activity mechanisms, notification records, queues, outbox, event bus, websocket/SSE, polling, retry behavior, and monitoring;
- unit, integration, API, component, end-to-end, security, and performance tests;
- formatting, lint, type-check, build, CI/CD, deployment, backup, and rollback conventions.
  Use commands appropriate to the detected stack. Examples only (not assumptions):
  pwd
  ls -la
  git status --short --branch
  git log -5 --oneline
  find . -maxdepth 2 -type f | sort | head -n 300
  Inspect manifests and infrastructure files only when present, for example package.json, lockfiles, composer.json, pyproject.toml, go.mod, Cargo.toml, \*.csproj, pubspec.yaml, Docker/Compose files, CI workflows, and environment examples.

Never copy secrets, access tokens, passwords, private URLs, personal data, or production records into audit documentation. Record configuration variable names and structure only, with values redacted.
2.2 Work module inventory
Find and document:

- Work module mount point, route tree, global/module layouts, and navigation/header/sidebar ownership;
- pages/tabs for Work, Planning, Processes, Tasks, Reports, Schedule/Graph, and Admin Panel;
- all task list/table/card implementations, menus, filters, sorting, search, pagination, and saved views if present;
- task creation and editing forms, fields, validation, defaults, and side effects;
- task detail route/panel/modal and all current editing workflows;
- task entity/model and the canonical parent-child representation, including any depth constraints;
- status values, canonical completion semantics, priorities, assignees, authors, participants, deadlines, and process relations;
- recurrence model and all code paths that create/update recurring tasks;
- comments/replies, current activity/history, attachments, and storage references;
- task relations to processes and organizational structures;
- deletion behavior, soft-delete/archive conventions, foreign keys, cascades, and child handling;
- read/create/update/move/complete/delete permissions for tasks;
- upload/open/download/delete permissions for files;
- current notifications, recipient rules, read states, and navigation behavior;
- Reports and Schedule/Graph menu entries, direct routes, API dependencies, and shared consumers.
  2.3 Current-behavior baseline
  Using a test environment and test data, record:
- how a normal task is created and which fields/defaults/side effects apply;
- how a subtask is currently represented and created, if supported;
- whether current hierarchy permits multiple levels and what storage/ORM limits exist;
- how statuses transition and which states count as complete;
- what happens when completing or reopening a parent/child;
- current recurrence behavior, including supported patterns, edge cases, timezone handling, series, and exceptions;
- visibility and access rules in existing task views;
- filter, search, sorting, pagination, and expansion behavior;
- what deletion does to children, files, comments, history, and references;
- how descriptions, comments, and files are added/edited/opened/deleted;
- which user actions currently generate events or notifications;
- what happens when permissions are missing or become stale.
  Do not modify production data to discover behavior. Use existing tests, test fixtures, local development, staging, or sanitized data.
  2.4 Audit deliverables
  Create or update repository documentation, following existing documentation conventions. Suggested files:
- docs/work-module-audit.md — stack map, route/component map, current behavior, reusable functionality, data and permission maps, baseline checks;
- docs/work-module-requirements-matrix.md — full traceability matrix for РБ-001–РБ-014 and У-001–У-007;
- docs/work-module-decisions.md — unresolved questions, evidence, options, consequences, recommended safe choice, approval status;
- docs/work-module-rollout.md — only when rollout/migration details are known; do not invent deployment procedures.
  If the repository already has an equivalent document or tracking system, extend it rather than creating duplicate documentation.

The audit must contain:

1. Confirmed stack and versions.
2. Work module route tree and navigation ownership.
3. Component/state/service/API map.
4. Existing task schema and relationships.
5. Existing status and recurrence semantics.
6. Authorization and permission matrix.
7. Process owner, participant, and direct-report data sources.
8. Storage and attachment lifecycle.
9. Activity/notification/event infrastructure.
10. Current behavior and known defects.
11. Reuse map: reusable unchanged, extend, UI-only replace, or new gap.
12. All requirement rows with current state and evidence.
13. Baseline test commands and exact results.
14. Risks, dependencies, and decisions requiring approval.
15. A technical implementation sequence adapted to the actual repository.
    2.5 Gate 0 — mandatory exit criteria
    Do not begin application-code implementation until all items below are either confirmed or explicitly recorded as blockers:

- actual architecture and stack identified;
- Work module entry points, routes, and navigation owners found;
- task model and parent-child representation identified;
- regular task creation defaults documented;
- completion status semantics identified or blocked pending approval;
- recurrence model/engine and baseline tests identified;
- permissions and access checks documented;
- process-owner and direct-report relations identified or marked unknown;
- file storage and authorization behavior documented;
- activity/notification infrastructure documented;
- Reports and Schedule/Graph dependencies identified;
- reusable components/services identified;
- baseline tests executed or exact inability to run them documented;
- traceability matrix completed with AUDITED, BLOCKED, or NOT_STARTED as appropriate;
- implementation plan and high-risk approval questions presented.
  If a requirement cannot be safely mapped, do not fill the gap with an assumption. Mark the affected part BLOCKED while continuing independent low-risk work where possible.

3. Requirements Traceability Matrix
   The matrix is mandatory and must be maintained throughout implementation. During Phase 0, populate the current-state and evidence columns from the repository. After each phase, update status, changed files, tests, and risks.

Required columns:

ID | Expected outcome | Current state | Related files/entities | Gap | Planned change | Server-side validation | UI change | Tests/evidence | Risk/dependency | Status
3.1 Functional requirements РБ-001–РБ-014
ID Expected outcome Main areas / dependencies
РБ-001 One compact, responsive header containing language selection, Work identity, authenticated user, settings, module switching, logout, and a notification-center entry point. App shell, header, localization, authentication, global navigation; prepare for РБ-013.
РБ-002 Hide Reports and Schedule/Graph from navigation and disable their routes; relocate Admin Panel to header/settings without changing its permission guard; retain Work, Planning, Processes, Tasks, and a separate Create Task action. Navigation, router/guards, module permissions; no physical deletion.
РБ-003 Compact persistent vertical sidebar with icons, labels, active state, distinct Create Task action, and usable mobile behavior. App shell, responsive navigation, design system.
РБ-004 Full-featured subtasks at arbitrary product depth; quick-create requires only a title; use existing regular-task defaults; reject self-parent and cycles. Task model, task creation service, hierarchy API, permissions, tree UI.
РБ-005 Compact recurrence summary/control with advanced settings in a small modal/popover; preserve existing recurrence logic and all currently supported parameters. Existing recurrence UI/model/engine/jobs and regression tests.
РБ-006 Wider, denser, logically grouped, responsive create/edit form; preserve every existing field, validation, default, and side effect. Existing forms, validation schemas, design system.
РБ-007 Hierarchical task list with expandable/collapsible nodes at any depth, collapsed by default, Expand All/Collapse All, stable rows, and hierarchy-safe filtering/sorting. Tree query, list UI, task identity, pagination; РБ-004/РБ-009/РБ-010.
РБ-008 Editable parent-task field; allow changing or clearing parent; preserve descendants; reject self-parent, descendant cycles, and unauthorized moves. Task detail/form, parent picker, server mutation, transaction/locking.
РБ-009 My Tasks, Team Tasks, Relevant to Me, and All Tasks views; hierarchy-aware filtering and sorting; only minimum ancestor chain is shown for matching descendants. Authorization scope, user/org relations, process ownership, list API/query, tree UI.
РБ-010 Hide completed items in active views, provide Completed view, optionally show completed children in details, calculate progress from direct children only, and block parent completion while any direct child is incomplete. Canonical status service, task query/aggregation, status mutation paths, UI.
РБ-011 Task menu has Open Task and safe Delete Task actions; deletion is permission-checked, confirmed, and follows an explicitly approved policy for tasks with children. Task menu, delete API, FK/cascade behavior, retention, audit.
РБ-012 One stable ClickUp-inspired workspace for reviewing/editing a task, including existing fields, subtasks, activity, and attachments. Task detail route/panel, field editing, responsive layout; РБ-013/РБ-014.
РБ-013 Personalized notification center and separate immutable task activity history; server-side events, recipient scoping, read states, and duplicate prevention. Existing event/audit/notification infrastructure, user/task relations, delivery, task detail, header.
РБ-014 Editable persisted description and secure multi-file attachments with metadata, preview/open/download/delete permissions, and activity records. Description editor, storage, metadata, upload/download controllers, ACL, activity.

3.2 Approved clarifications У-001–У-007
ID Approved decision Required implementation evidence
У-001 Relevant to Me includes tasks where the current user is assignee, author, participant, or responsible/owner of a related process. Exact repository sources for each relation; server-side query tests; deduplication tests.
У-002 Team Tasks includes tasks of direct reports only, according to the actual organizational structure and existing permissions. Confirmed direct-report relation; tests proving indirect reports are not included unless the existing model explicitly defines them as direct.
У-003 A parent cannot be completed while at least one direct child is incomplete. Server tests for every status-changing path, including concurrency-sensitive behavior.
У-004 Filtered results show only the minimum ancestor chain needed for context, with no unrelated siblings. API/query tests for deep descendants, shared ancestors, duplicate prevention, and privacy boundaries.
У-005 A task with no direct children displays — and no progress bar. Unit/API/UI tests.
У-006 Reports and Schedule/Graph are hidden and their routes disabled; physical deletion is deferred until separate dependency review and approval. Navigation and direct-route tests; no destructive migration or code/data removal.
У-007 ClickUp is the sorting/filtering UX reference; reuse suitable existing components. Documented UX behavior and reuse decisions; no unnecessary duplicate component system.

3.3 Matrix rules

- Do not mark a row VERIFIED without test/manual evidence.
- A requirement spanning multiple phases may remain IN_PROGRESS until all its server, UI, permission, persistence, and regression checks pass.
- Record approved exceptions with a decision reference and impact.
- A test not run must be recorded as NOT RUN, not PASS.
- Distinguish current-state audit evidence from post-change verification evidence.

4. Domain Model and Business Invariants
   This section describes required behavior. It does not mandate new table names, fields, APIs, or an ORM. Map every rule to the existing model and extend it only where a demonstrated gap exists.
   4.1 Task identity and fields

- Reuse the canonical existing Task entity at every hierarchy level whenever possible.
- Every child is a full task with the same applicable fields, validation, permissions, comments, recurrence, attachments, and activity rules as any other task.
- Map logical concepts to existing fields/relations: identifier, title, description, status, priority, assignee(s), author/creator, participants, dates/deadlines, process relation, parent relation, recurrence, timestamps, tenant/team ownership, and other existing metadata.
- Do not create duplicate fields or a simplified separate subtask entity if the Task model already supports this.
  4.2 Hierarchy invariants — РБ-004 / РБ-008
  Required logical structure: a task has zero or one direct parent and zero or more direct children, unless the audited domain explicitly uses an equivalent representation. The product must not impose an artificial maximum depth.

Invariants:

1. A task cannot be its own parent.
2. A task cannot be moved under one of its descendants.
3. The hierarchy must remain a tree/forest without cycles.
4. Moving a task changes only its parent relationship and necessary existing derived hierarchy data; it must not detach, recreate, reassign, or lose descendants.
5. Parent changes must be atomic: either the relationship is fully updated or nothing is changed.
6. Cycle validation is mandatory on the server for every parent-changing path.
7. The actor must be authorized to edit the task and attach it to the selected parent. Access to both objects must be checked.
8. Clearing the parent makes the task a root task and preserves its children.
9. The implementation must not impose a user-facing nesting limit for convenience. Identify any database/ORM/serialization limitation and propose a safe solution if one exists.
   Conceptual validation flow:
   validateParentChange(taskId, newParentId, actor):
   authorize actor to edit taskId

if newParentId is null:
validate that root-level move is permitted
atomically clear the parent relation
return success

if newParentId == taskId:
reject SELF_PARENT

authorize actor to view/use newParentId as a parent
obtain descendants of taskId using the repository's safe hierarchy strategy

if newParentId is in descendants:
reject CYCLE_DETECTED

validate tenant/company and domain constraints
persist the parent change atomically
record the parent-change activity event
Implementation requirements:

- Use recursive database queries or the existing safe hierarchy service where appropriate.
- Do not return a private descendant list to the client if it would reveal inaccessible records.
- Use database-appropriate transactions, locking/isolation, and revalidation to prevent concurrent moves from creating a cycle.
- A simple foreign key is not sufficient to prevent graph cycles.
- A defensive operational guard may protect against corrupt/pathological data, but must not silently truncate valid hierarchy or become an arbitrary product nesting limit.
  4.3 Quick-create subtask defaults — РБ-004
- The only required user-entered value in quick-create is the title.
- Reuse the same server-side creation service/factory/defaulting rules used for an ordinary task.
- Other fields must receive the ordinary task defaults that the current application already applies.
- Do not copy assignee, priority, deadline, recurrence, process, or other parent values merely because the new task is a child. Copy only if the audited existing business logic explicitly does so.
- Apply normal server-side validation, permission checks, tenant ownership, and side effects.
- After success, show the new row under the correct parent without duplicate insertion. If the parent was collapsed, expand it only if this is consistent with existing UX conventions and preserves the user's context.
- Preserve the entered title on recoverable server errors. Never leave a phantom/empty child row after a failed request.
- Allow full editing of the child after creation.
  4.4 Progress calculation — РБ-010 / У-005
  For each task, calculate progress from its direct children only:
  children = direct children of task

if children.count == 0:
progress = not_applicable
else:
completed = count(children whose status is completed by the canonical domain rule)
total = children.count
percentage = use one consistent existing rounding convention
Display when direct children exist:

- completed / total (for example, 2/4);
- percentage (for example, 50%);
- progress bar.
  Display when no direct children exist:
- —;
- no progress bar.
  Rules:
- Grandchildren and deeper descendants do not contribute to a parent's numerator or denominator.
- Hidden completed children still count.
- Filtering, sorting, collapsed state, or pagination must not affect the calculation.
- The denominator is the total number of direct children, including completed children.
- Use the application's canonical completion definition. Do not hardcode a guessed status label or invent terminal statuses.
- Apply the same rule at every node relative to that node's own direct children.
- Keep list and detail values consistent and independent of the current visible subset.
- Avoid N+1 queries: use aggregation, batch loading, or a stack-appropriate equivalent.
- Do not persist derived progress unless measurement demonstrates a need and invalidation is reliable.
  Acceptance example:
  Parent A
  Child 1 — completed
  Child 2 — completed
  Child 3 — active
  Child 3.1 — completed
  Child 4 — active

Parent A progress = 2/4 = 50%
4.5 Parent completion guard — РБ-010 / У-003
A task must not transition to a completed status while at least one of its direct children is incomplete.

Server requirements:

- Enforce the rule in the canonical domain/status-transition path, not only in a UI component or one endpoint.
- Find and cover every completion path that exists: regular endpoint, inline edit, bulk action, automation, import, scheduler/background job, recurrence workflow, admin action, and internal service calls where applicable.
- Evaluate each task against its own direct children. Do not count all descendants as direct children.
- Determine “completed” using the existing canonical domain rule. If the repository has no reliable definition or multiple conflicting definitions, record the ambiguity and block this part pending approval.
- Return a stable, machine-readable domain error code in the project's error-contract style, plus a localized human-readable message explaining that all direct subtasks must be completed first.
- Do not automatically change child statuses.
- A task with no direct children can be completed under this rule.
- Reopening a parent must not automatically reopen children unless an existing approved domain rule explicitly requires it.
- The validation and status update must be race-safe. Use a transaction plus suitable locking/isolation/recheck so a child cannot become incomplete concurrently while the parent is committed as completed.
- Create activity and notifications only after the status transition is valid and committed, following the event strategy selected for the repository.
  UI requirements:
- Provide immediate feedback when current data shows incomplete direct children.
- Explain the reason clearly and, where practical, show the number of incomplete direct children.
- Treat the server response as authoritative because UI state may be stale.
- On a conflict/rejection, refresh the relevant task and child data without losing the user's place or unsaved unrelated edits.
  4.6 Completed task visibility — РБ-010
- Active lists hide tasks considered completed by the existing canonical rule, including All Tasks.
- Provide a separate Completed view for completed tasks the user is authorized to access.
- Define in the audit how Completed interacts with My/Team/Relevant/All scopes; do not expand the user's authorized data scope.
- In an active parent detail view, hide completed direct children by default.
- Provide a clear toggle/action to show completed direct children.
- Hidden completed children continue to count toward progress.
- Do not delete or omit records required by progress, history, or authorized Completed views.
- Verify recurrence instance/series behavior and do not change it as a side effect of filtering.
- If a completed task is required as an ancestor to display an active matching descendant, preserve only the necessary context when permitted by the access model. Make the context state visually distinct and do not count it as an active matching result. Verify this interaction explicitly; do not leak inaccessible ancestor data.
  4.7 View definitions — РБ-009 / У-001 / У-002
  Implement each view from actual relationships and existing authorization rules:
- My Tasks: current user is an assignee according to the existing assignment model.
- Team Tasks: task is assigned to one of the current user's direct reports according to the actual organization model and existing permissions. Do not silently include indirect reports.
- Relevant to Me: current user is an assignee, author/creator, participant/watcher/equivalent, or responsible/owner of a related process as defined by the actual process model.
- All Tasks: all tasks the current user is permitted to access. This never means every database record.
- Completed: completed tasks within the authorized scope and selected view semantics, as documented during audit.
  For each view:
- identify the exact source relation for each role;
- resolve authorization independently of view membership;
- perform scope checks server-side;
- de-duplicate task IDs when multiple relationships match;
- respect tenant/company boundaries;
- verify sorting, pagination, counts, and empty states;
- prevent inaccessible records from appearing as ancestor context;
- do not assume parent permissions are inherited by children or vice versa.
  4.8 Hierarchical filtering — РБ-009 / У-004
  Keep two distinct sets:

1. Matching set: tasks that actually satisfy view scope, search, and filters.
2. Visible tree: matching tasks plus the minimum authorized ancestor chain needed for context.
   For each matching task:

- include the task;
- include only the necessary ancestors up to the visible root/context boundary;
- mark non-matching ancestors as context rows;
- exclude non-matching siblings;
- exclude unrelated descendants;
- de-duplicate shared ancestors and task IDs;
- keep context ancestors navigable only to the extent allowed by existing authorization;
- do not treat context rows as matching results for result counts, selection, or bulk operations.
  Do not fetch unauthorized records and merely hide them in the browser. Build the visible tree from authorized data on the server or through a safe repository query strategy.
  4.9 Hierarchical sorting and pagination
- Preserve parent/child adjacency.
- Default recommendation: sort siblings within each parent group, not a flattened list that detaches children from parents.
- Reuse supported sort fields from the existing model; do not invent missing fields.
- Define deterministic null ordering and stable tie-breakers.
- Keep contextual ancestors above their descendants.
- Ensure filter + sort combinations do not duplicate or lose records.
- Do not paginate arbitrary flattened rows if that can split a hierarchy and orphan children.
- Prefer root-group pagination or an explicit hierarchy-aware cursor/fragment model where needed.
- If the existing application uses another tree pagination contract, preserve it only if it can meet the context and privacy rules; document the behavior.
- Document Expand All behavior for partially loaded or paginated trees.
- Add indexes only after observing query patterns and query plans.

5. UI/UX Requirements and Interaction Architecture
   Use the existing design system as the baseline. The goal is a compact, calm, information-dense workspace, not a pixel-perfect ClickUp clone. Reuse existing tokens, breakpoints, localization, icons, controls, forms, menus, dialogs, and query/state patterns.
   5.1 App shell
   The Work experience should use the existing global/module shell with two primary areas:

- one compact header;
- workspace content consisting of a sidebar and the active section.
  Do not add a second redundant module header unless the existing architecture requires it.
  5.2 РБ-001 — Compact header
  Preserve and present in one compact bar:
- language selector;
- module identity/name “Work”;
- authenticated user's name (and existing avatar if available);
- settings;
- module switcher/navigation;
- Admin entry if the user has the existing required permission;
- logout;
- notification bell/entry point for РБ-013.
  Behavior:
- stable placement and order; no layout jumps between loading/authenticated states;
- long user names truncate or move into a menu/tooltip;
- icons have accessible names and tooltips where appropriate;
- dropdowns have predictable placement and close on Escape/navigation;
- narrow layouts may group lower-frequency actions into a menu, but must not remove their functionality;
- localization and long translated labels must not break the header;
- choose sticky/fixed behavior only if it matches the current application shell and usability needs; stickiness is not a new business requirement.
  5.3 РБ-002 — Simplified navigation
- Hide Reports and Schedule/Graph from user-facing navigation.
- Disable their routes so direct old URLs do not expose those sections.
- Choose redirect, not-found, or forbidden behavior according to existing router conventions and access policy.
- Relocate Admin Panel to header/settings while preserving its existing server-side permission checks.
- Keep Work, Planning, Processes, and Tasks reachable.
- Keep Create Task as a distinct action, not buried inside ordinary navigation.
- Preserve Reports/Schedule/Graph code, schemas, tables, and data. Do not perform cleanup in this change.
  5.4 РБ-003 — Sidebar
  Desktop:
- compact vertical sidebar;
- icon and clear label for primary sections;
- active section state;
- stable width/alignment;
- distinct Create Task action;
- if an icon-only collapse mode already exists, reuse it with accessible labels/tooltips; do not add unnecessary complexity.
  Mobile/tablet:
- use the product's existing drawer/sheet/bottom-navigation pattern where suitable;
- close the navigation after selecting a route;
- retain active section indication;
- keep Create Task reachable;
- avoid covering the primary content/action or trapping focus/scroll;
- support keyboard and screen-reader interaction.
  5.5 РБ-006 — Task creation form
  Before modifying the form, inventory every current field, validation rule, default, dependency, and side effect.
- Choose a wide modal or dedicated page based on the existing architecture, form complexity, deep-link needs, and mobile usability.
- Reduce unnecessary vertical whitespace while keeping comfortable touch targets and readable text.
- Group fields logically without removing or renaming existing fields.
- Preserve all current fields, server rules, client validations, defaults, and submission side effects.
- Use responsive multi-column layout on wider screens and one column on narrow screens.
- Place validation messages beside relevant fields.
- Preserve user input on server errors where possible.
- Prevent duplicate submission and show submitting/loading/error/success states.
- Follow the current post-create workflow; do not unexpectedly change navigation or close/open behavior.
  Suggested field groups (adapt to actual fields):

1. Basics — title, description.
2. Execution/ownership — status, priority, assignee, participants.
3. Planning — dates, deadline, recurrence, only if currently supported.
4. Relationships — parent task, process, and other existing relations.
5. Additional — all other current fields.
   5.6 РБ-005 — Compact recurrence settings

- Show a concise summary of the current stored rule or “Does not repeat.”
- Provide “Configure recurrence” to open a small popover/modal.
- Display all parameters actually supported by the current recurrence engine.
- Permit editing and clearing where the current model supports it.
- Display a readable summary derived from the rule actually saved by the existing system.
- Preserve the exact existing storage format, generation logic, time zones, daylight-saving behavior, end dates, intervals, weekday/month-day rules, exceptions, series/instance semantics, and supported edge cases.
- Do not reduce the existing options to a smaller invented set.
- Do not rewrite or migrate recurrence data as part of a UI refactor.
- Run baseline recurrence regression tests before and after the UI change.
  5.7 РБ-012 — Task detail view
  Create or adapt one primary workspace for viewing and editing a task. Use a dedicated route, side panel, or responsive combination based on the current architecture.

Recommended organization:

Top area

- parent breadcrumb/path when applicable;
- task title;
- status and priority;
- primary permitted actions;
- overflow menu;
- close/back navigation if rendered in a panel.
  Main content
- editable description;
- subtasks in their hierarchy;
- existing comments/replies;
- activity timeline;
- attachments.
  Properties area
- assignee;
- author/participants if supported;
- deadline and other existing dates;
- priority/status;
- parent task;
- recurrence;
- related process and other existing fields.
  Behavior:
- view and edit in one coherent interface, without unnecessary modal hopping;
- keep field behavior consistent with the task list where the same field is editable in both places;
- preserve existing explicit-save or autosave conventions;
- do not add per-keystroke autosave unless the project already has reliable debouncing, conflict handling, and visible save states;
- show Saving/Saved/Error where autosave exists;
- handle validation and concurrent-update conflicts without silently overwriting newer server data;
- read-only users see values but do not receive active controls for unauthorized operations;
- minimize layout shifts and unnecessary page remounts;
- on narrow screens, properties become sequential blocks/accordions and the main content remains usable.
  5.8 РБ-008 — Parent task field/picker
- Show the current parent task as a clear, navigable value.
- Allow selecting a new eligible parent or clearing the current parent.
- Search by title/identifier using actual API capabilities; avoid loading the entire task tree into a dropdown for large datasets.
- Exclude the current task, its descendants, inaccessible tasks, and invalid parent candidates.
- Enforce authorization and cycle rules again on the server.
- Show self-parent, cycle, not-found/forbidden, and conflict errors in the field/workspace without losing the current selection or unrelated draft data.
- After a successful move, refresh old/new parent branches and preserve the moved task's descendants.
- Drag-and-drop is explicitly out of scope for this update.
  5.9 РБ-007 — Hierarchical task list
  Each row should reuse existing task fields and include, where available:
- title;
- expand/collapse affordance when children exist;
- status;
- priority, assignee, due date, or other existing useful columns;
- direct-child progress where applicable;
- stable overflow menu placement.
  Behavior:
- child rows appear directly beneath their parent;
- support expansion/collapse at every depth;
- fresh list state starts collapsed at all levels unless the product already persists user expansion state and that behavior is intentionally preserved;
- provide Expand All and Collapse All for the currently loaded/visible scope;
- use stable task IDs as keys/identities, never array indexes for mutable tree identity;
- collapsing hides rows but never deletes or resets their data;
- auto-expand only the ancestor path required to reveal a filtered matching result;
- clear filters back to a predictable prior/default tree state;
- visually distinguish matching rows from context ancestors;
- prevent repeated fetches of each node individually when batching/lazy loading is available;
- evaluate virtualization only if actual data volume requires it and only with hierarchy semantics preserved;
- support keyboard navigation and accessible tree/treeitem/expanded semantics where appropriate to the framework.
  5.10 РБ-009 — Views, filters, and sorting UI
  The active view must be explicit and easy to identify:
- My Tasks;
- Team Tasks;
- Relevant to Me;
- All Tasks;
- Completed.
  Also provide, using existing controls where suitable:
- search;
- filter controls and visible active-filter chips/summary;
- clear-one-filter and clear-all actions;
- sorting controls;
- Expand All / Collapse All;
- empty state that explains no results and offers a way to clear filters;
- distinct loading, error, permission-denied, empty, and populated states.
  Changing view/filter/sort must not expand access or discard hierarchy context. Preserve the current list context when opening/closing a task, unless the existing UX has a documented different behavior.
  5.11 РБ-010 — Progress and completion UI
- Display direct-child progress as completed/total, percentage, and a compact progress bar when children exist.
- Display — without a bar when there are no direct children.
- Keep hidden completed children in the progress calculation.
- Hide completed direct children by default in active task details; add a clear show/hide completed subtasks toggle.
- Explain a blocked parent completion attempt and direct the user to complete the unfinished direct children first.
- Do not make a child appear completed merely because its parent is complete.
- Refresh relevant tree rows, parent progress, and details after a valid status change without duplication or unexpected loss of position/context.
  5.12 РБ-011 — Action menu and deletion
  The task menu contains:
- Open Task;
- Delete Task, with trash icon and destructive styling.
  Deletion behavior:
- check permission on the server;
- show confirmation identifying the task title;
- if children exist, clearly state their presence and the exact consequences of the approved policy;
- never silently delete an entire hierarchy;
- re-check permissions, child state, references, and policy on the server at submission time;
- prevent duplicate submissions;
- preserve the row and show a useful error on failure;
- update the parent progress and list correctly on success.
  Approval blocker: The approved specification does not define the final policy for deleting a task that has children. Do not implement cascade/subtree deletion. Do not independently choose a permanent child policy. During audit, document current behavior and database/application cascades, then request approval with options and consequences. Until approval, preserve existing safe behavior or block the dangerous scenario with a clear explanation; do not introduce destructive behavior.
  5.13 РБ-014 — Description and attachments UI
  Description:
- reuse the current editor/serialization format where possible;
- allow editing an existing task description;
- save server-side and show the persisted version after reload/reopen;
- preserve text on failure/conflict;
- safely render existing rich text/Markdown/HTML under the current security model;
- record description changes in activity without unnecessarily copying sensitive full content into general logs.
  Attachments:
- allow multiple uploads of infrastructure-approved file types;
- display file name, type, author/uploader, upload date/time, and size if available;
- show image thumbnails and safe previews where supported;
- provide authenticated open/download actions;
- expose delete only when the current user has permission;
- show progress and error/retry state separately per file;
- ensure retrying one failed file does not duplicate files already uploaded successfully;
- truncate long names while making the full name accessible;
- enforce type/size/count limits based on existing infrastructure and approved policy;
- do not expose private storage paths or permanent public URLs for private files.
  5.14 РБ-013 — Notification center and activity UI
  Notification center:
- bell icon in the header;
- accurate unread counter (compact visual cap such as 99+ is acceptable only if the true count remains available);
- All / Unread / Read tabs;
- event type, concise text, timestamp, and task context where the user can still access it;
- mark one notification as read;
- mark all applicable current-user notifications as read;
- open the corresponding task after re-checking access;
- distinct loading/error/empty states;
- do not mark as read on hover; follow the audited/approved read interaction.
  Activity timeline:
- show task events chronologically using the product's established direction;
- display actor, localized action description, timestamp in the product's timezone convention, and old/new values when appropriate;
- paginate/load more for long histories;
- link to comments/files only when those entities remain accessible;
- ordinary task editing cannot update or erase historical records.
  5.15 Responsive, accessibility, and visual QA
  Use current design tokens and breakpoints. If they are absent, propose consistent additions in the audit rather than scattering arbitrary values.

Test at minimum:

- narrow and wide desktop;
- tablet portrait/landscape where applicable;
- narrow mobile;
- long task titles, user names, localized labels, and file names;
- missing avatars and optional properties;
- many children and deep hierarchy;
- loading, empty, error, disabled, read-only, and success states;
- keyboard navigation and visible focus;
- accessible names, modal focus trapping/restoration, Escape handling, and tree expansion announcements;
- sufficient contrast and reduced-motion behavior where supported.

6. Backend, API, and Server Contract Guidance
   All names below are conceptual. Map them onto the actual controllers, services, repositories, GraphQL operations, RPC methods, server actions, or API routes. Do not create duplicate endpoints or entities without evidence that a new contract is necessary.
   6.1 General API requirements

- Use the existing API/error schema and validation conventions.
- Validate payloads server-side.
- Authenticate and authorize every resource and operation.
- Resolve the actor from the authenticated session/token; do not trust a client-supplied user ID, role, or permission.
- Apply tenant/company boundaries consistently if present.
- Avoid disclosing the existence of inaccessible tasks, users, files, or notifications through different errors unless existing policy allows it.
- Keep contracts backward-compatible where relevant; inspect every consumer before changing a shared endpoint.
- Document changed request/response/error contracts and cover them with tests.
- Use server-side filtering/sorting/pagination for large datasets where consistent with the stack.
  6.2 Required use cases to map to the existing architecture

1. Retrieve task lists with view scope, search, filters, sorting, active/completed scope, and pagination.
2. Retrieve hierarchy/tree fragments with minimum permitted ancestor context.
3. Create an ordinary task with current defaults and validation.
4. Quick-create a child with title-only UI input, parent context, and ordinary server defaults.
5. Retrieve task detail with properties, children, attachment metadata, and paginated activity.
6. Update permitted fields and description.
7. Change or clear parent with authorization and cycle validation.
8. Change status with direct-child completion guard.
9. Retrieve direct-child progress without N+1 query patterns.
10. Retrieve completed tasks/children within the authorized scope.
11. Delete a task only under the approved safe policy.
12. Upload, list, preview/open/download, and delete attachments.
13. Retrieve immutable task activity.
14. Retrieve personal notifications by All/Unread/Read state.
15. Mark one notification or the eligible current-user set as read.
    6.3 Stable errors and concurrency
    Use stable machine-readable errors consistent with the project for cases such as:

- self-parent attempt;
- cycle detected;
- invalid/inaccessible parent;
- parent completion blocked by incomplete direct children;
- task/attachment not found or inaccessible according to existing disclosure policy;
- permission denied;
- unsafe delete because of the approved child policy;
- invalid/unsupported file type or size;
- stale version/concurrent update conflict.
  Use existing optimistic concurrency/version fields where present. If absent and concurrent editing is a real risk, propose the smallest compatible mechanism. Never silently overwrite newer server state.
  6.4 Idempotency
- Prevent duplicate tasks on create retries where the existing API supports/request requires idempotency.
- Give successful uploads stable identities; a retry of one failed upload must not duplicate previously successful files.
- Use stable source-event/recipient idempotency for notification generation.
- Make background handlers safe to retry.
- Ensure repeated mark-read requests are harmless and scoped to the authenticated recipient.

7. Activity History and Personal Notifications — Technical Requirements
   Activity and notifications are separate data flows:

- Activity event: an immutable record that a task event occurred; it supports task audit/history.
- Notification: a personal inbox record for one recipient; it has its own read state.
  Reading a notification must never modify or delete the corresponding activity event.
  7.1 Activity event coverage — РБ-013
  Record server-side activity for material actions supported by the specification and existing domain, including:
- task creation;
- comment creation and replies;
- status changes;
- assignee changes;
- deadline changes;
- description changes;
- parent changes, including clearing the parent;
- attachment upload and deletion;
- task completion and reopening;
- meaningful progress changes where required by the product's event policy;
- other significant existing task-field changes.
  Each event should include, mapped to existing conventions:
- stable event ID;
- target task ID;
- actor/initiator (including an explicitly represented system actor where valid);
- canonical event type;
- timestamp;
- structured/versioned payload;
- field and old/new values where appropriate;
- optional correlation/request ID and idempotency key.
  Rules:
- events are created on the server, never trusted from frontend-generated descriptions;
- record the event in the same transaction as the business mutation where feasible;
- do not allow ordinary task-update APIs to edit/delete prior events;
- expose a permission-checked, paginated activity read path;
- retain stable entity references and meaningful historical snapshots where needed;
- do not fabricate historical events for old tasks. Start recording from the reliable rollout point unless existing trustworthy history already exists;
- avoid storing unnecessary sensitive description/file contents in the event payload or logs.
  7.2 Notification recipient resolution
  Potentially relevant recipients under У-001 are:
- task author/creator;
- current assignee;
- participants/watchers/equivalent existing relation;
- responsible/owner person of a linked process, using the actual process model.
  Rules:
- notify only users connected to the task and permitted to receive its notifications;
- do not notify every user in the organization;
- suppress the actor's own action by default, unless the existing product has another established rule or an exception is approved;
- if one user qualifies through multiple roles, create at most one notification for that event unless separate channels are explicitly modeled;
- re-check task visibility when showing/opening a notification;
- do not expose task title/details if the target is deleted or no longer accessible;
- resolve assignee-change recipients using existing behavior or a separately approved rule. Do not silently decide whether to notify the previous assignee, new assignee, or both;
- use event-specific recipient rules to avoid noisy notifications for low-value changes;
- respect existing notification preferences if present.
  The exact policy for process-owner changes, assignment changes, self-notifications, and progress notifications must be documented from current behavior or escalated where not defined.
  7.3 Reliable event processing and duplicate prevention
- Prefer an existing reliable event/outbox/queue pattern if suitable.
- When using an outbox, write the business mutation, activity event, and outbox event within the same transaction where supported.
- A retried handler must not create duplicate notifications.
- Enforce a stable unique idempotency key, such as source event plus recipient, according to the actual schema/database.
- Record failed processing attempts and provide a bounded retry policy using existing infrastructure.
- If no queue/outbox exists, evaluate the smallest reliable implementation. Do not introduce a message broker by default.
- A crash after the business commit must not silently lose an activity event or permanently suppress a required notification without an observable recovery path.
  7.4 Notification delivery strategy
  Choose only after the audit:

1. Reuse existing authorized realtime delivery if it is reliable and already supported.
2. Otherwise reuse the product's refresh/polling conventions.
3. Add realtime only if product expectations and measured needs justify the extra infrastructure.
   Document latency, load, retry, offline, and reconnection trade-offs. The feature is correct only if records/read states are reliable; realtime delivery is not itself a requirement.
   7.5 Notification read behavior

- read state is personal to each recipient;
- mark one as read only if it belongs to the authenticated user;
- mark all read applies only to the authenticated user's eligible notifications and the defined scope;
- new notifications created concurrently with mark-all-read must remain unread unless the API semantics explicitly define otherwise;
- unread counter must reflect actual deduplicated records;
- repeated requests must be safe;
- reading a notification does not alter activity history.

8. Attachments — Security and Lifecycle
   Do not design a new storage system until the existing infrastructure has been audited.
   8.1 Audit before implementation
   Establish:

- physical storage provider/location (local disk, object storage, CDN, third party, or other);
- public/private bucket behavior and URL generation;
- signed URL or authenticated-stream approach;
- current supported extensions/MIME/content types;
- size/count limits at application and proxy/infrastructure layers;
- malware scanning or quarantine capability;
- metadata ownership and attachment-to-task relationships;
- backup, retention, soft-delete, cleanup, and shared-file behavior;
- download authorization and tenant boundary checks.
  8.2 Validation and safe storage
- Use an allowlist consistent with current product/infrastructure policy.
- Validate extension, detected MIME/content, and size on the server; do not trust browser MIME alone.
- Sanitize display filenames.
- Generate storage keys independently from user-supplied names.
- Prevent path traversal, executable content, filename collisions, and unsafe active content.
- Keep private task files private; never rely on an obscure URL as authorization.
- Enforce upload count/size at all relevant infrastructure layers where applicable.
- Do not invent new size/type/count limits. Identify current limits and obtain approval for changes affecting expectations.
- If malware scanning is unavailable, document the residual risk and available mitigations.
- Safely handle interrupted uploads, orphan storage objects, and retries.
  8.3 Open/download/preview authorization
- Every open/download request must authorize both the task and attachment for the current actor.
- Use authenticated streaming or short-lived signed URLs compatible with the existing provider.
- Do not leak private storage keys, predictable public URLs, or metadata to unauthorized users.
- Set safe MIME/content-disposition/nosniff behavior consistent with the platform.
- Avoid inline rendering of untrusted active content.
- Preview images and safe document types only when supported by current infrastructure; otherwise provide a safe download.
- Test IDOR by changing task and attachment identifiers.
  8.4 Deletion and retention
- Check attachment-delete permission server-side.
- Reuse existing soft-delete/retention conventions.
- Do not physically delete a file that is shared or referenced by another entity.
- Keep metadata and storage state consistent if one side of deletion fails.
- Provide retry/recovery for asynchronous cleanup where applicable.
- Record attachment deletion in task activity.

9. Authorization and Permission Matrix
   The audit must identify actual roles/policies and the location of every authorization check. Do not invent roles or assume permissions are inherited.

At minimum document who can:
Operation Required server-side authorization question
View a task/list Can the actor view each returned task under current task, tenant, and organization rules?
View an ancestor as context Is the ancestor itself safe to reveal, or must the visible hierarchy stop at a privacy boundary?
Create a task Does the actor have create permission in the applicable scope?
Create a child Can the actor create under and access the selected parent?
Edit task fields Does the actor have task/field update permission?
Change/clear parent Can the actor edit the task and attach it to the new parent?
Change/complete status Does the actor have status permission and does the completion invariant pass?
Delete a task Does the actor have delete permission and does the approved child/retention policy allow it?
View activity Can the actor view the task and its activity?
View/read notification Does the notification belong to the authenticated actor, and is its target still accessible?
Upload attachment Can the actor attach files to the task and does the file pass validation?
Open/download attachment Can the actor currently view both the task and the attachment?
Delete attachment Does the actor have the specific delete permission and does retention allow the operation?
Open Admin Panel Does the actor satisfy the existing Admin permission guard?

Security requirements:

- authorization must be enforced on the server for every critical operation;
- client-supplied user IDs, roles, and permissions must never be trusted;
- do not broaden access to simplify Team/Relevant/All views;
- prevent IDOR against task, attachment, activity, and notification resources;
- do not leak inaccessible titles through ancestors, search/autocomplete, activity, or notification previews;
- use existing framework protections for CSRF, XSS, SQL injection, and request validation;
- log permission denials only with safe metadata; do not log secrets, file contents, or sensitive description bodies unnecessarily.

10. Data Model, API Compatibility, and Migrations
    10.1 Discover before adding
    First determine whether the application already has suitable entities/relations for:

- tasks and parent references;
- comments/replies;
- participants/watchers;
- process links and process owner/responsible person;
- organization/direct-report relationships;
- attachments and storage metadata;
- activity/audit events;
- notifications/read state;
- event/outbox processing.
  Reuse an existing entity when it already satisfies the functional and security requirements. Add a new entity/table only for a demonstrated gap.
  10.2 Migration rules
- Prefer additive, backward-compatible migrations.
- Do not rename/drop columns or tables before checking all readers/writers and external consumers.
- Document up and rollback/down behavior where practical.
- Inspect table size and query/locking impact before large or blocking operations.
- Add indexes based on measured query patterns and explain/query plans, not speculation.
- Check foreign keys and ON DELETE behavior explicitly; do not introduce cascade semantics without approval.
- Backfill in bounded, repeatable, observable batches if a backfill is genuinely required.
- Do not migrate recurrence records as part of a UI-only recurrence change.
- Test migrations against a sanitized production-like copy before deployment.
- Preserve old code/data for hidden Reports and Schedule/Graph sections.
  10.3 Backward-compatible rollout
  Where frontend/backend can be deployed separately:

1. Deploy compatible additive schema first.
2. Deploy backend code compatible with existing clients where practical.
3. Deploy frontend changes.
4. Enable event/notification processing only after recipient and idempotency checks pass.
5. Run smoke tests and monitor errors/jobs.
6. Remove legacy structures only in a separately approved cleanup after verifying no remaining consumers.
   Do not claim compatibility without checking the actual deployment topology and consumer versions.
7. Implementation Phases and Exit Gates
   The audit may justify a different technical ordering, but every deviation must be documented. Keep each change small enough to review. Requirements can span phases; they are not VERIFIED until all acceptance evidence exists.
   Phase 0 — Repository audit and technical design (mandatory gate)
   Requirements: All РБ-001–РБ-014 and У-001–У-007 are audited.
   Work: Complete Section 2 and Section 3. No application source changes or migrations.

Deliverables:

- audit document;
- full traceability matrix;
- current routes/components/data/permissions maps;
- baseline tests and exact commands/results;
- reuse map;
- risk register;
- list of decisions requiring approval;
- file/API/schema-level change proposal mapped to actual repository paths;
- staged implementation plan adapted to the actual architecture.
  Exit gate: Criteria in Section 2.5 are met and the report is presented. High-risk unresolved decisions block only the affected workstream; independent safe work may continue after the gate.
  Phase 1 — App shell and navigation
  Requirements: РБ-001, РБ-002, РБ-003; prepare the РБ-013 header entry point.

Tasks:

1. Confirm route ownership and current global/module layout.
2. Consolidate existing top bars into one compact responsive header.
3. Preserve language, Work identity, authenticated user, settings, module switcher, logout, and permission-gated Admin access.
4. Reserve/add the notification bell slot, using a placeholder until notification data is connected.
5. Implement/adapt compact sidebar entries for Work, Planning, Processes, and Tasks.
6. Keep Create Task as a distinct, reachable action.
7. Implement active states, keyboard labels, and mobile navigation behavior.
8. Hide Reports and Schedule/Graph from menus.
9. Disable direct routes according to existing router conventions; preserve their code and data.
10. Verify all header actions and unaffected module routes.
    Checks:

- desktop, tablet, and mobile layouts;
- multiple languages and long translated labels;
- long authenticated user name and missing avatar;
- active route and navigation transitions;
- Reports/Schedule direct URL behavior;
- Admin entry visibility and direct access for unauthorized users;
- module switching, settings, logout, and Create Task;
- no regressions to other modules using the same shell.
  Exit gate: Navigation is coherent and responsive; hidden sections cannot be opened via old routes; Admin server permissions remain intact; no unrelated route regressions.
  Phase 2 — Server-side domain foundations: hierarchy, progress, completion, and event hooks
  Requirements: РБ-004 and РБ-008 foundations; РБ-010 domain rules; activity-event foundation for РБ-013.

Tasks:

1. Confirm/reuse the canonical task parent-child representation.
2. Implement transactional self-parent/cycle validation for every parent-changing path.
3. Implement safe parent move/clear behavior and preserve all descendants.
4. Verify authorization for both task and proposed parent.
5. Centralize/reuse normal task-creation defaults for quick-create.
6. Identify the canonical completed-status rule; block progress/completion work if unresolved.
7. Implement direct-child progress aggregation and no-child state.
8. Implement the server-side parent completion guard in every applicable status transition path.
9. Add concurrency protection appropriate to the actual database.
10. Define structured activity event creation and append hooks for mutations as they are introduced; reuse existing audit/event infrastructure where suitable.
11. Add only schema changes confirmed to be necessary.
12. Add unit, integration, API, and concurrency-oriented tests before UI integration.
    Checks:

- arbitrary product depth (including at least depth 3 and deeper);
- self-parent and descendant-parent rejection;
- concurrent reparent requests cannot create a cycle;
- move and clear preserve descendant IDs and related data;
- unauthorized parent changes are rejected;
- quick-create defaults match ordinary task creation;
- progress 2/4 = 50%, excluding grandchildren;
- completed hidden children still count;
- no children = not applicable (—);
- parent completion blocked with one or more incomplete direct children;
- completion allowed with zero children or all direct children complete;
- child/parent concurrent status race cannot persist an invalid state;
- activity event creation is coupled/recoverable according to the selected event strategy.
  Exit gate: Core hierarchy and completion invariants are covered by server-side tests. Do not proceed with dependent UI behavior while a critical invariant is unprotected.
  Phase 3 — Task creation, recurrence presentation, details, description, and attachments
  Requirements: РБ-004, РБ-005, РБ-006, РБ-008, РБ-012, РБ-014.

Tasks:

1. Improve create/edit form width, density, field grouping, and responsive behavior.
2. Preserve all existing fields, validations, defaults, and side effects.
3. Add quick-create subtask with title-only UI and ordinary server-side defaults.
4. Add searchable Parent Task selector with clear-to-root behavior.
5. Exclude self, descendants, inaccessible tasks, and invalid candidates in the picker; retain server validation.
6. Replace bulky recurrence presentation with a compact summary and Configure Recurrence popover/modal.
7. Preserve recurrence data/engine semantics and run regression tests.
8. Redesign the task detail page/panel as one viewing/editing workspace.
9. Add safe description editing and persistence, retaining entered data on errors/conflicts.
10. Integrate existing comments/replies rather than duplicate them.
11. Implement or extend secure multi-file attachments using the audited storage provider and ACL.
12. Add previews/open/download/delete only where supported and authorized.
13. Connect each new material mutation to the activity-event foundation.
14. Preserve activity pagination and task context as the view opens/closes or refreshes.
    Checks:

- field/validation parity with the existing form;
- create a child at 3+ levels using title only;
- defaults equal ordinary task creation and are not copied from parent without existing rule;
- move task with children and clear its parent;
- cycle and forbidden-parent errors preserve form input;
- recurrence options/data and existing series still work;
- detail view can read/edit all applicable existing fields;
- description persists after reload/reopen and records activity;
- multiple file upload, metadata display, previews, open/download/delete;
- invalid file type/size/count behavior based on actual limits;
- permission denied for file access/deletion;
- interrupted upload/retry does not duplicate successful files;
- responsive and keyboard behavior.
  Exit gate: Existing form behavior is preserved; hierarchy rules are enforced server-side; recurrence regression checks pass; description and attachment persistence/access are verified; material mutations record activity reliably.
  Phase 4 — Hierarchical task lists, views, filters, progress, and safe actions
  Requirements: РБ-007, РБ-009, РБ-010, РБ-011.

Tasks:

1. Implement/extend hierarchy-aware list query and tree representation.
2. Keep matching set and visible tree/context ancestor set separate.
3. Implement My Tasks, Team Tasks, Relevant to Me, All Tasks, and Completed using audited relationships and ACL.
4. Apply authorization before view filtering and hierarchy-context construction.
5. De-duplicate tasks qualifying through multiple relationships.
6. Implement minimum ancestor-chain behavior and exclude non-matching siblings.
7. Add recursive/nested rows with expand/collapse at any depth.
8. Start fresh trees collapsed; preserve expansion state during safe non-structural updates where practical.
9. Add Expand All / Collapse All for the loaded/visible scope.
10. Add hierarchy-safe sibling sorting and pagination/cursors.
11. Hide completed tasks in active lists; implement Completed scope and completed-child toggle.
12. Display direct-child progress consistently in list and detail.
13. Add Open Task and Delete Task actions.
14. Do not implement a destructive child deletion policy until approved; keep unsafe scenario blocked or preserve verified safe behavior.
15. Test large/partial trees, privacy boundaries, sorting/filter combinations, and mutations.
    Checks:

- hierarchy depth of 3+ and deeper;
- individual expand/collapse and Expand All/Collapse All;
- filtered descendant shows only its required ancestor chain;
- no non-matching sibling rows;
- shared ancestors appear once;
- context rows do not count as matching results or bulk targets;
- all views use approved definitions;
- Team Tasks includes direct reports only and respects ACL;
- unauthorized tasks never appear as results or context;
- progress includes hidden completed direct children and excludes grandchildren;
- no-child task displays — only;
- active/completed visibility rules;
- blocked/allowed parent completion;
- delete confirmation, permission, stale-child recheck, and approved policy behavior;
- no orphan/duplicate rows after create, move, status change, or delete.
  Exit gate: All view/query and domain invariants pass API/integration tests; hierarchy is preserved under filtering/sorting/pagination; no permission boundary is weakened.
  Phase 5 — Full activity history and personalized notification center
  Requirements: РБ-013; complete event hooks for РБ-004, РБ-008, РБ-010, and РБ-014.

Tasks:

1. Complete standardized event coverage for all required material task actions.
2. Confirm activity records are immutable through ordinary APIs.
3. Implement recipient resolution from У-001 relations and approved event-specific rules.
4. Suppress actor self-notifications by default unless existing behavior/approval says otherwise.
5. Deduplicate recipients and events.
6. Implement idempotent notification creation and retry handling.
7. Reuse the delivery mechanism selected during audit: existing realtime, polling, or queue/outbox pattern.
8. Add current-user-scoped All/Unread/Read list and count operations.
9. Add mark-one-read and mark-all-read operations.
10. Connect the notification bell/unread count in the header.
11. Add notification panel/page with task navigation and safe stale-target behavior.
12. Add paginated Activity timeline to task details.
13. Ensure opening/reading notifications never changes activity records.
14. Add operational logs/metrics for failed event processing without logging sensitive task/file content.
    Checks:

- every required event type has one correct server-side activity record;
- actor, timestamp, event type, and relevant old/new values are correct;
- activity cannot be edited/deleted through normal task APIs;
- notification recipients match approved roles and event rules;
- actor self-notification is suppressed according to the selected rule;
- multiple roles produce at most one record per event/recipient;
- retries/reprocessing do not create duplicates;
- marking read affects only the current user;
- mark-all-read does not mark another user's notifications;
- notifications created after mark-all-read remain unread according to the API contract;
- inaccessible/deleted target does not leak task data;
- opening notification navigates correctly and preserves normal route/back behavior;
- reading notification leaves task history unchanged;
- unread count matches actual records.
  Exit gate: Activity and notifications are independently reliable, personalized, idempotent, and permission-safe.
  Phase 6 — Stabilization, security, performance, and rollout
  Requirements: All РБ-001–РБ-014 and У-001–У-007.

Tasks:

1. Run complete unit, integration, API, component, and E2E suites.
2. Run migration tests against sanitized production-like schema/data.
3. Verify the full role/permission matrix.
4. Run hierarchy, cycle, move, completion, and deletion policy tests.
5. Run attachment validation, authorization, and IDOR checks.
6. Run event/notification idempotency and read-state tests.
7. Regression-test recurrence and existing task workflows.
8. Test all relevant views/filters/sorts/pagination combinations.
9. Test large/deep trees and query plans; address N+1 and unbounded queries.
10. Test responsive behavior, accessibility, localization, and long content.
11. Check other modules consuming shared components/APIs/tables.
12. Review migrations, deployment sequence, backup, rollback, and data integrity checks.
13. Enable features progressively only using existing feature flags or a justified minimal mechanism.
14. Run smoke tests and inspect errors, job retries, and key metrics.
15. Deliver the final report with actual evidence and known limitations.
    Exit gate: No unresolved critical/high security or data-loss issue; required acceptance tests pass; remaining limitations/exceptions are explicitly documented and approved.
16. Test Strategy and Acceptance Scenarios
    Tests must live at the layer where each rule is authoritative. UI tests do not replace API/domain/database/security tests.
    12.1 Unit tests
    Cover pure/shared domain logic where applicable:

- completed-state determination using the canonical status rule;
- progress from direct children only;
- zero-child progress state;
- hidden completed children remain in progress totals;
- parent completion blocked/allowed rules;
- self-parent and cycle validation;
- root-level parent clearing;
- subtree preservation on reparent;
- quick-create default equivalence with regular task creation;
- matching-set and minimum ancestor-context calculation;
- direct-report scope versus indirect reports;
- Relevant-to-Me union and deduplication;
- notification recipient deduplication and actor suppression;
- event-to-timeline presentation;
- attachment filename/type/size validation at the appropriate layer.
  12.2 Integration/database/API tests
  Verify:
- task and child creation at multiple depths;
- parent changes in a branch with descendants;
- cycle prevention, including concurrent reparent attempts;
- transactions and rollback on failed parent changes;
- server-side completion guard across all status mutation paths;
- race between child state change and parent completion;
- authorization for every task/list/detail/mutation endpoint;
- view scopes, direct reports, process ownership, filters, sorting, pagination, and de-duplication;
- minimum ancestor chain without unauthorized ancestors or siblings;
- progress aggregation without N+1 behavior;
- active/completed visibility;
- safe delete policy and actual foreign-key/cascade behavior;
- description persistence and activity append;
- attachment storage, metadata, download authorization, delete authorization, and failure recovery;
- activity append in the business transaction or reliable recovery/outbox path;
- notification deduplication and current-user read state;
- migrations preserve existing rows and references.
  12.3 UI/component tests
  Verify:
- header actions, localization, long user name, and responsive layout;
- sidebar active state and mobile behavior;
- Reports/Schedule hidden and routes inaccessible;
- Admin permission guard;
- create form fields, validation, submit/loading/error behavior;
- quick-create title-only UI and error retention;
- recurrence summary/configuration with no lost parameters;
- task detail read/edit permissions and stable layout;
- parent picker filtering and clear-to-root;
- nested row expansion/collapse at multiple levels;
- Expand All/Collapse All;
- filtered ancestor rendering and matching/context distinction;
- Completed view and show/hide completed children;
- progress and completion feedback;
- delete confirmation and destructive styling;
- attachment preview/list/progress/retry/error/delete state;
- notification tabs, count, mark-read actions, and task navigation;
- activity timeline and pagination;
- keyboard focus in dialogs, menus, popovers, and tree controls.
  12.4 Twenty core end-to-end acceptance scenarios
  These scenarios are mandatory release checks and map to the approved specification:

# Scenario Expected result Requirements

1 Create a task, child, third-level task, and deeper descendants. Hierarchy persists without an artificial product depth limit. РБ-004, РБ-007
2 Create a subtask using only a title. Other fields receive the same existing defaults as ordinary task creation. РБ-004
3 Move a subtask under another parent. Move succeeds; all descendants and related data remain attached. РБ-008
4 Assign a task to itself or one of its descendants as parent. Server rejects both; data remains unchanged. РБ-004, РБ-008
5 Complete a parent with an incomplete direct child. Server rejects; UI explains that direct subtasks must be completed first. РБ-010, У-003
6 Complete all direct children, then complete the parent. Parent completion is allowed. РБ-010, У-003
7 Verify a parent with four direct children, two complete, and grandchildren. Progress is exactly 2/4 = 50%; grandchildren do not affect the count. РБ-010
8 Open a task with no direct children. — appears and no progress bar is rendered. РБ-010, У-005
9 Check active and Completed views. Completed tasks are hidden in active lists and available in Completed within permitted scope. РБ-010
10 Filter for only a deeply nested task. Only the matching task and its minimum ancestor chain appear; no non-matching siblings. РБ-009, У-004
11 Check My, Team, Relevant, and All views. Each view matches its approved definition and respects permissions. РБ-009, У-001, У-002
12 Edit an existing description and reload the task. New description persists and the change appears in activity. РБ-014, РБ-013
13 Upload an image and a document; open/download/delete them. Files work only for users with the corresponding permissions. РБ-014
14 Another user adds a comment. Relevant permitted user receives one notification according to the approved recipient rule. РБ-013
15 Change a task status. Exactly one correct activity record is created. РБ-013
16 Mark a notification as read. Notification read state changes; task activity remains intact. РБ-013
17 Delete a task. Confirmation, permission check, stale-state recheck, and approved child policy apply. РБ-011
18 Verify recurring tasks before/after UI changes. Existing recurrence behavior and data remain unchanged. РБ-005
19 Open Reports and Schedule/Graph through navigation and old URLs. They are hidden and their routes do not expose the sections; code/data remain preserved. РБ-002, У-006
20 Exercise unrelated modules using shared components/APIs. No regression is introduced. General / regression

12.5 Additional edge cases

1. Root task, one child, four children, and a large number of children.
2. A completed child has an incomplete grandchild: the child itself must not remain completed if its own direct-child rule blocks it.
3. A user matches multiple relevance roles for one task.
4. Multiple matching descendants share one or more ancestors.
5. An ancestor is accessible but a descendant is not, and vice versa; context behavior must not leak data.
6. Concurrent edits by different users.
7. Network loss during save or upload.
8. Retry after timeout when server outcome is uncertain.
9. Long title, description, file name, and localized strings.
10. Empty description, attachments, activity, and notification lists.
11. Task with recurrence and children.
12. Deletion permission is revoked after opening the confirmation dialog.
13. Process owner/assignee/participant changes that affect recipient resolution.
14. Notification target becomes inaccessible after creation.
15. Time-zone/daylight-saving boundaries where recurrence/date behavior supports them.
16. Large tree, slow network, and high request-count scenarios.
17. Parent move while filters or tree expansion state are active.
18. Completed ancestor needed as context for an active matching descendant.
    12.6 Security tests
    At minimum test actors that exist in the current system:

- task author/creator;
- assignee;
- participant/watcher;
- direct manager;
- indirect manager;
- unrelated employee;
- admin;
- user from another tenant/company if applicable;
- anonymous or expired session.
  Test:
- task/list/detail IDOR;
- attachment/activity/notification IDOR;
- user/role spoofing;
- private file access without task permission;
- disallowed file type and excessive size/count;
- path traversal and unsafe file names;
- self-parent and cycle attempts through direct API calls;
- parent completion through alternative endpoints/jobs;
- delete/upload/update without permission;
- team task access outside direct-report boundary;
- unauthorized parent picker/search results;
- leakage through ancestor context, activity payloads, or notification text;
- mark-read against another user's notification.
  12.7 Performance checks
  Use realistic/sanitized data volumes and inspect actual query plans:
- hundreds/thousands of tasks where representative;
- deep and broad trees;
- many matching descendants sharing ancestors;
- relevance queries with multiple user roles;
- Team Tasks with many direct reports;
- progress aggregation;
- notification unread count/list;
- long activity history and pagination;
- attachment metadata lists.
  Check N+1 behavior, unbounded tree loading, query plans, required indexes, pagination boundaries, request counts, and UI responsiveness. Do not add indexes without evidence.

13. Risks and Decisions Requiring Approval
    13.1 Risk register
    Risk Impact Required mitigation
    Existing hierarchy uses a different representation or has technical depth constraints. High Audit first; reuse representation; test deep traversal; propose migration only if necessary.
    Concurrent parent changes create a cycle. High Transactional validation, database-appropriate locking/isolation, concurrency tests.
    Completion guard exists only in the UI or one endpoint. High Enforce in canonical server transition path and test alternate mutation routes.
    Completion statuses are ambiguous. High Reuse canonical domain definition; stop this workstream and request approval if none exists.
    Parent deletion may cascade to children. Critical Inspect FK/application behavior; do not cascade; request policy approval.
    Filtering reveals inaccessible ancestors. High Build authorized ancestor context only; privacy-boundary tests.
    Flat pagination breaks tree context. Medium/High Root-group or hierarchy-aware pagination; tests for descendants on later pages.
    Recurrence UI changes stored semantics. High UI-only refactor; baseline and regression tests; no recurrence migration.
    File URLs bypass authorization. Critical Authenticated stream or short-lived signed URLs; per-request ACL; IDOR tests.
    Notifications reach unrelated users or are duplicated. Medium/High Event-specific recipients, actor rule, deduplication, idempotency constraints.
    Activity payload leaks private descriptions or task metadata. High Minimal payloads, access checks, safe historical snapshots, privacy tests.
    New schema breaks an older frontend/backend deployment. High Additive migration and backward-compatible deployment sequence.
    Hidden Reports/Schedule still have dependencies. Medium/High Hide/disable only; preserve code/data; audit shared consumers.
    Large trees degrade list performance. Medium/High Query plan review, batched aggregation, safe pagination/lazy loading.

13.2 Questions that must be resolved from code or escalated
These are not invitations to invent business rules. First inspect the implementation; if the answer cannot be established, record options and ask for approval.
Question Why it matters Safe action pending resolution
Which exact statuses count as completed? Affects progress, active/completed views, and parent completion. Reuse the canonical status definition; block affected logic if ambiguous.
What is the deletion policy for a task with children? Could destroy an entire branch and linked data. Do not cascade. Preserve current safe behavior or block unsafe deletion pending approval.
Who is the responsible/owner person for a related process? Affects Relevant to Me and notification recipients. Identify the real process model; do not invent a role.
What defines direct reports? Affects Team Tasks and access boundaries. Use only the verified direct-report relation and existing ACL.
Are permissions inherited between parent and child? Affects visibility and data exposure. Preserve current ACL; document actual behavior.
Who receives notifications when assignee changes? Could notify previous/new assignees or both. Preserve current rule or request a decision; do not expand recipients silently.
Are users notified about their own actions? Affects notification volume. Suppress by default unless current behavior or approval says otherwise.
What attachment types/sizes/counts are allowed? Depends on storage, proxy, and security policy. Identify current limits; request approval before changing user expectations.
What recurrence edge cases and series semantics exist? Risk of changing recurring task behavior. Keep engine/data unchanged; update only presentation.
How should old tasks appear in activity history? No requirement authorizes fake historical events. Show reliable existing events or begin recording from rollout onward.
Which timezone is used for activity timestamps? Affects audit accuracy and user display. Reuse existing product timestamp convention.
What is the scope of Completed and All Tasks? May expose a larger dataset than intended. Respect ACL, pagination, and documented view-scope semantics.
What happens to a completed ancestor needed as context for an active matching child? Potential conflict between completed hiding and minimum ancestor chain. Show only safe necessary context if permitted; verify and document.
What is the exact notification read moment? Hover/open/click behavior changes user expectations. Follow existing behavior or obtain UX decision; never mark read merely on hover.

13.3 Approval request format
For every approval request, provide:

1. evidence from the current code/data/model;
2. the exact requirement affected;
3. two or three viable options;
4. consequences for existing data, permissions, users, and deployment;
5. the recommended safest option and why;
6. which implementation parts are blocked and which can continue safely.
7. Development Workflow and Reporting
   14.1 Before each implementation slice
8. Re-read applicable repository instructions.
9. Check Git status and preserve unrelated changes.
10. Trace current behavior end-to-end.
11. Identify the smallest safe change and its dependencies.
12. Locate existing tests and add/update tests alongside the change.
13. Record assumptions and update the traceability matrix.
14. Confirm no unresolved approval item is being bypassed.
    14.2 After each implementation slice
15. Run targeted unit/integration/API/UI tests.
16. Run relevant formatter, lint, type-check, and build/compile commands.
17. Run the relevant manual/browser scenario when feasible.
18. Inspect the diff for unrelated changes, secrets, accidental deletions, and generated files.
19. Verify database/API/permission effects, not just rendered UI.
20. Update requirement statuses and evidence.
21. Report the exact commands and outcomes.
    14.3 Mandatory progress report format
    After every phase, provide:
    Phase: <name>
    Status: completed / partially completed / blocked
    Requirements: <РБ IDs and У IDs affected>
    What changed:

- <actual user-visible/server behavior>
  Files:
- <path> — <change and purpose>
  Database:
- <migration/index/constraint or none>
- <compatibility and rollback notes>
  API and permissions:
- <contracts and authorization checks changed or none>
  Checks:
- <exact command/scenario> — PASS / FAIL / NOT RUN
  Manual verification:
- <scenario> — PASS / FAIL / NOT RUN
  Risks/limitations:
- <details or none>
  Approval questions:
- <decision or none>
  Next safe step:
- <specific next increment>
  Never claim tests passed if not run. Distinguish IMPLEMENTED from VERIFIED.
  14.4 Suggested small implementation slices
  The following slices may be split further or reordered after the repository audit:

1. Audit and baseline only.
2. Header/sidebar/navigation.
3. Server-side hierarchy invariants and tests.
4. Quick-create and parent selector.
5. Task form and recurrence presentation.
6. Task detail workspace.
7. Description and attachment lifecycle.
8. Hierarchical task tree and expansion.
9. View scopes and hierarchy-aware filtering.
10. Progress, completion, and approved deletion behavior.
11. Activity-event foundation and coverage.
12. Notification recipients, idempotency, read state, and UI.
13. Regression, security, accessibility, performance, and rollout.
    Do not combine unrelated large changes into one unreviewable commit/PR. Follow repository branch and commit conventions; do not create commits or push unless instructed.
14. Monitoring, Release, and Rollback Readiness
    15.1 Observability
    Reuse the existing logging/monitoring system for:

- failed parent changes and cycle validation;
- rejected parent completion due to incomplete direct children;
- upload/open/download/delete failures;
- activity append or event-processing failures;
- notification delivery failures, retries, and deduplication;
- authorization denials on critical operations;
- recurrence UI/API errors after the presentation refactor;
- slow hierarchy/list/detail queries where supported.
  Possible metrics, only if supported by current infrastructure:
- successful/failed task creates and parent moves;
- cycle-validation failures;
- parent-completion rejections;
- upload success/failure/latency;
- activity events processed/failed;
- notification lag/retry/deduplication counts;
- task-list/detail latency and request/query counts.
  Do not log private descriptions, file contents, secrets, signed URLs, or unnecessary personal data.
  15.2 Pre-release checklist
- all required CI checks pass;
- migrations are reviewed and tested on sanitized production-like data;
- storage permissions and upload limits are verified in staging;
- notification jobs/queues/realtime/polling are verified in staging;
- existing recurrence records and behavior pass regression tests;
- Reports/Schedule route behavior is verified;
- permission matrix and file-access tests pass;
- smoke-test identities/data are prepared without exposing real user data;
- backup and rollback procedures are documented;
- key performance/error signals are observable.
  15.3 Deployment sequence
  Adapt to the actual CI/CD and deployment system. Where separate deploys are used, prefer:

1. additive schema changes;
2. backward-compatible backend release;
3. frontend release;
4. enable event/notification processing after verification;
5. smoke tests and monitoring review.
   Use feature flags/staged activation only if the project already supports them or a narrowly justified addition is approved. Do not invent a feature-flag platform by default.
   15.4 Rollback principles

- Keep schema additions compatible with the previous application version where practical.
- Do not automatically drop newly created activity/notification/attachment tables or records during rollback.
- Disable new event/notification processing safely if it creates incorrect/duplicate delivery.
- Restore the previous frontend/backend release if critical regressions occur.
- Preserve data written by the new version; plan reconciliation rather than destructive rollback.
- Document manual recovery steps and any approval required.

16. Final Acceptance Checklist
    Every item must be marked PASS, FAIL, or NOT APPLICABLE — APPROVED, with evidence.
    Functionality

- [ ] All РБ-001–РБ-014 are implemented or have an explicitly approved exception.
- [ ] У-001–У-007 are reflected in implementation and tests.
- [ ] Header and sidebar work across desktop, tablet, and mobile.
- [ ] Reports and Schedule/Graph are hidden and their routes disabled; code/data are preserved.
- [ ] Admin entry remains permission-gated on the server.
- [ ] Create Task remains a distinct accessible action.
- [ ] Subtasks support arbitrary product depth without artificial limits.
- [ ] Quick-create requires only a title and uses ordinary task defaults.
- [ ] Parent changes/clearing preserve descendants and reject cycles server-side.
- [ ] Recurrence behavior and stored data remain unchanged.
- [ ] Creation/edit forms preserve all current fields and validations.
- [ ] Task details provide one coherent view/edit workspace.
- [ ] Description is persisted and activity-recorded.
- [ ] Attachments support approved upload/open/download/preview/delete actions with ACL.
- [ ] Hierarchical list supports expand/collapse and hierarchy-aware filtering/sorting/pagination.
- [ ] My/Team/Relevant/All/Completed scopes follow verified definitions and ACL.
- [ ] Completed tasks are hidden from active lists by default.
- [ ] Progress uses direct children only; zero children display — with no bar.
- [ ] Parent completion is blocked server-side while any direct child is incomplete.
- [ ] Delete actions require permission and confirmation and follow the approved child policy.
- [ ] Activity history is server-created and immutable through ordinary task editing.
- [ ] Notifications are personalized, deduplicated, and separate from activity.
- [ ] Notification read state is scoped to the current user and does not alter activity.
      Quality, security, and data
- [ ] No critical build/type-check/lint errors.
- [ ] Relevant unit, integration, API, component, and E2E tests pass.
- [ ] All 20 core acceptance scenarios have results recorded.
- [ ] Recurrence regression checks pass.
- [ ] Permission boundaries and IDOR tests pass.
- [ ] Attachment security and access checks pass.
- [ ] Concurrent hierarchy and completion invariants are tested.
- [ ] Deep/large tree behavior and performance are acceptable.
- [ ] Responsive, keyboard, and accessibility checks are performed.
- [ ] Migrations are tested and rollback is documented.
- [ ] No data/code was physically deleted without required approval.
- [ ] No critical regression exists in unrelated modules.
- [ ] Known limitations and exceptions are explicit.
      Documentation and handoff
- [ ] Audit and traceability matrix are updated.
- [ ] Changed API/data contracts are documented.
- [ ] Permission/domain rules are documented.
- [ ] Migrations, deployment order, backup, and rollback are documented.
- [ ] Changed files are listed.
- [ ] Exact test commands and outcomes are recorded.
- [ ] Unresolved approval questions are listed separately.
- [ ] No requirement is marked VERIFIED without evidence.

17. Final Implementation Report Template
    At the end of the work, create/update a report using this structure:

# Work Module Update Report

## 1. Summary

- Overall status:
- Requirements implemented:
- Requirements verified:
- Approved exceptions:
- Blocked requirements:

## 2. Requirement Status

| ID  | Status | Implementation | Verification evidence |
| --- | ------ | -------------- | --------------------- |

## 3. Architectural Changes

- Frontend:
- Backend/API:
- Database/migrations:
- Storage:
- Events/notifications:
- Permissions:

## 4. Changed Files

| File | Change type | Purpose |
| ---- | ----------- | ------- |

## 5. Database and Compatibility

- Migrations:
- Indexes/constraints:
- Backward compatibility:
- Backup/rollback:

## 6. Checks

| Exact command/scenario | Result | Comment |
| ---------------------- | ------ | ------- |

## 7. Security and Data Integrity

- Permission checks:
- Hierarchy constraints:
- Completion guard/concurrency:
- File access:
- Activity/notification isolation and idempotency:

## 8. Known Limitations and Risks

- ...

## 9. Questions Requiring Approval

- ...

## 10. Recommended Next Step

- ...

18. Primary Instruction to Claude Code / OpenAI Codex
    Work as a senior full-stack engineer and product-minded UI/UX engineer on the existing deployed Work module.

Start with Phase 0. Do not edit application files until the audit is complete and the current-state matrix and change plan have been presented. Do not guess the stack, schema, routes, permissions, statuses, recurrence semantics, process ownership, file infrastructure, or deletion policy.

After the audit:

1. Complete the matrix for РБ-001–РБ-014 and У-001–У-007.
2. Identify existing functionality that can be reused unchanged, extended, or replaced only at the UI layer.
3. Map every proposed change to actual repository files, components, services, endpoints, entities, and migrations.
4. Identify risks, dependencies, and approval decisions.
5. Implement in small phases with tests and explicit exit gates.
6. Enforce permissions, hierarchy integrity, completion constraints, file access, activity recording, and notification idempotency on the server.
7. Preserve recurrence behavior and existing data.
8. Do not physically delete Reports/Schedule/Graph code or data without separate approval.
9. Do not cascade-delete child tasks without an approved policy.
10. Do not mark implementation complete until the acceptance scenarios and regression checks have actually passed.
    Success criterion: The existing Work module becomes a compact, responsive, accessible, and reliable task-management experience while remaining integrated with the real application architecture, preserving verified business behavior and data, and never weakening authorization.
