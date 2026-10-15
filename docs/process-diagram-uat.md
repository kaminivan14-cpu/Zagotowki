# Processes diagram — UAT-only release

## Scope and implementation

Frontend-only update on `feature/tasks-processes-i18n`. No migration, RPC,
permissions, Storage, or Production changes.

Reuses the existing canonical process definition (`depends_on` task UUIDs),
`editDependency`, dependency validation, wizard state, and save command.
The diagram never stores a separate graph. Existing implicit stage dependencies
remain protected; explicit links can be redirected with the target handle.

The oversized arrows were SVG markers scaled by the invisible 16px hit stroke.
Only the thin visible path now owns a fixed-unit 7px marker. Hit paths stay
transparent. Stable topological layers, predecessor ordering, wider spacing,
and outer routing lanes keep connectors outside task card interiors. Fit uses
both available width and height. Large graphs require zoom/pan for reading;
fit is an overview, not a promise that all text fits on one screen.

Select a connector, drag its target handle to another card, or activate the
handle by keyboard and select a card. Invalid/self/cyclic changes leave the
canonical data unchanged. Escape/background cancels selection. Changes are
reflected immediately in Step 2 and saved through the existing draft flow.

## Files

- src/tasks/processes/model.js — layered layout and orthogonal connector routes
- src/tasks/processes/ProcessDiagram.jsx — thin edges, target drag, keyboard cancellation, fit
- src/tasks/processes/ProcessWizard.jsx — canonical dependency update callback
- src/tasks/processes/processes.css — edge/handle/drop-target styles
- src/i18n/pl.js — Polish interaction labels
- tests/process-diagram.test.mjs — 80-task geometry and immutable dependency updates
- tests/browser/tasks-admin.spec.js — drag at 375/768/1440, saved 40-task graph, zoom/pan/cancel

## Validation

- 11 targeted Node tests PASS (including critical seven-level DAG).
- 21 Admin/Processes Playwright tests PASS, local mocked backend.
- lint PASS; build:uat PASS; diff whitespace check PASS.
- Existing build warning: main bundle exceeds 500 kB.
- Screenshots inspected locally; no business data used in browser fixtures.

## Deployment gate

Requires push of this release commit to the existing Preview branch. Confirm
Vercel environment=Preview and deployed SHA matches the commit. The previous
Preview requires Vercel authentication; authenticated live UAT smoke is not
covered by the local mocked tests. No Production deploy or main merge authorized.

## Follow-up: direct arrow dragging

Removed repeated add-task buttons from diagram stage headers; Step 2 task
creation is unchanged. An explicit dependency now starts target rewiring by
pressing and dragging the black connector itself (line or arrow-tip hit area).
A click without movement still selects the edge; the existing handle and
keyboard interaction remain available. Pan/read-only/implicit stage rules
remain protected. Escape cancels an in-flight pointer operation.

Validation: 5 focused browser tests PASS, including direct arrow drag at
375/768/1440 and form/save synchronization; 11 model tests, lint, build:uat PASS.

## Stage grouping and creating links from a task

Each stage now owns exactly one region and one heading/collapse control.
Stage areas are ordered topologically when possible. If dependencies interleave
stages in both directions (without a task-level cycle), separate horizontal
stage lanes preserve downward task edges. No dependencies or stage assignments
are added/changed by layout. Cross-stage links use outside routing lanes.

Selecting a task exposes an outgoing + connector below its card. Drag it to a
target card to add a canonical dependency; keyboard activation also works.
A temporary thin connector follows the pointer. Existing edge rewiring remains
available. Duplicate connections now display a duplicate-specific message.

Validation for this update: 12 Node tests, 7 focused browser tests (including
mobile/desktop creation and existing dragging), lint and build:uat PASS.
Stage containment includes the interleaved-stage case. No migrations required.
