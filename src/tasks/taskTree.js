// Pure helpers for the hierarchical task list (РБ-007). The server returns authorised rows in
// pre-order with `tree_parent_id`, `depth` and `match`; the client only groups and reveals them.
export function buildTree(rows) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    const parent =
      row.tree_parent_id != null ? byId.get(row.tree_parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
export const parentIds = (rows) =>
  rows
    .filter((r) => rows.some((c) => c.tree_parent_id === r.id))
    .map((r) => r.id);
// Fresh list state starts collapsed; only ancestors of matching rows auto-expand when a filter is active.
export function initialExpanded(rows, filtered) {
  if (!filtered) return new Set();
  const expanded = new Set();
  for (const row of rows) if (!row.match) expanded.add(row.id);
  return expanded;
}
export function visibleRows(rows, expanded) {
  const hidden = new Set();
  const out = [];
  for (const row of rows) {
    if (
      row.tree_parent_id != null &&
      (hidden.has(row.tree_parent_id) || !expanded.has(row.tree_parent_id))
    )
      hidden.add(row.id);
    else out.push(row);
  }
  return out;
}
export function toggleExpanded(expanded, id) {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
export const hasChildren = (rows, id) =>
  rows.some((r) => r.tree_parent_id === id);
export const childCount = (rows, id) =>
  rows.filter((r) => r.tree_parent_id === id).length;
// Compatibility for list payloads without tree fields (the pre-hierarchy `tasks_list`, i.e. a database where
// migration 202611110001 is not applied yet): children are nested under their parent through `parent_task_id`
// when the parent is on the same page, in pre-order with computed depth. Payloads that already carry
// `tree_parent_id` (current backend) are returned unchanged.
export function normalizeTreeRows(rows) {
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.every((r) => "tree_parent_id" in r)
  )
    return rows || [];
  const ids = new Set(rows.map((r) => r.id));
  const parentOf = (r) =>
    r.parent_task_id != null &&
    ids.has(r.parent_task_id) &&
    r.parent_task_id !== r.id
      ? r.parent_task_id
      : null;
  const children = new Map(),
    roots = [];
  for (const r of rows) {
    const p = parentOf(r);
    if (p == null) roots.push(r);
    else children.set(p, [...(children.get(p) || []), r]);
  }
  const out = [],
    seen = new Set();
  const walk = (r, depth, parent) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push({ ...r, tree_parent_id: parent, depth, match: r.match ?? true });
    for (const c of children.get(r.id) || []) walk(c, depth + 1, r.id);
  };
  for (const r of roots) walk(r, 0, null);
  // A parent cycle cannot exist in valid data; any row not reached is still shown, as a root.
  for (const r of rows) if (!seen.has(r.id)) walk(r, 0, null);
  return out;
}
