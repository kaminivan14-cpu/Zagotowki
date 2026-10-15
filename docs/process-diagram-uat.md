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
