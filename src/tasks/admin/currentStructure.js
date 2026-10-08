// Snapshot assignments are authoritative for today's organization. Keep legacy
// values separate so ordinary profile saves cannot overwrite versioned links.
export function withCurrentStructure(directory, structure, today) {
 const assignments = new Map(structure.assignments.map(a => [a.employee_id, a]))
 return {...directory, can_manage_structure: structure.can_manage, employees: directory.employees.map(e => {
  const manager = directory.reporting_lines
   .filter(r => r.employee_id === e.id && r.effective_from <= today && (!r.effective_to || r.effective_to > today))
   .sort((a,b) => b.effective_from.localeCompare(a.effective_from))[0]?.manager_employee_id ?? null
  const assignment = assignments.get(e.id)
  return {...e, stored_department_id: e.department_id ?? null, stored_manager_id: manager,
   department_id: assignment ? assignment.department_id : e.department_id,
   current_manager_id: assignment ? assignment.manager_employee_id : manager}
 })}
}
