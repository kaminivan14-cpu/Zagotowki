import {test} from 'node:test'
import assert from 'node:assert/strict'
import {withCurrentStructure} from '../src/tasks/admin/currentStructure.js'
test('employee directory uses effective assignment, including null, without rewriting legacy profile data',()=>{
 const directory={employees:[{id:2,department_id:1,role:'manager',production_role:null}],reporting_lines:[{employee_id:2,manager_employee_id:3,effective_from:'2026-01-01'}]}
 const structure={can_manage:true,assignments:[{employee_id:2,department_id:4,manager_employee_id:null}]}
 const employee=withCurrentStructure(directory,structure,'2026-10-07').employees[0]
 assert.equal(employee.department_id,4);assert.equal(employee.current_manager_id,null)
 assert.equal(employee.stored_department_id,1);assert.equal(employee.stored_manager_id,3)
 assert.equal(employee.role,'manager');assert.equal(directory.employees[0].department_id,1)
 structure.assignments[0].department_id=null
 assert.equal(withCurrentStructure(directory,structure,'2026-10-07').employees[0].department_id,null)
 structure.assignments=[]
 assert.equal(withCurrentStructure(directory,structure,'2026-10-07').employees[0].current_manager_id,3)
})
