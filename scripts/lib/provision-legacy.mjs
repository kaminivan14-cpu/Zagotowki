// Server/operator-only. No PIN parameter and no SELECT of pin_hash.
import { validPinEmail } from '../../supabase/functions/_shared/pin-protocol.js'
const checked = async promise => {
  const result = await promise
  if (result.error) throw new Error('PROVISION_FAILED')
  return result.data
}
export async function provisionEmployee(client, employeeId) {
  try {
    const prepare = async () => {
      const rows = await checked(client.rpc('upgrade_pin_prepare', { p_employee: employeeId }))
      const row = rows?.[0]
      if (!row || String(row.employee_id) !== String(employeeId) || !validPinEmail(row.email, 'production') || !row.provisioning_id) throw new Error('IDENTITY')
      return row
    }
    const target = await prepare()
    let userId = target.auth_user_id
    if (!userId) {
      const created = await client.auth.admin.createUser({ email: target.email, email_confirm: true,
        app_metadata: { pin_employee_id: String(employeeId), pin_provisioning_id: target.provisioning_id } })
      if (created.error) {
        const retry = await prepare()
        if (retry.email !== target.email || retry.provisioning_id !== target.provisioning_id) throw new Error('IDENTITY')
        userId = retry.auth_user_id
      } else userId = created.data?.user?.id
    }
    if (!userId) throw new Error('IDENTITY')
    await checked(client.rpc('upgrade_pin_finish', { p_employee: employeeId, p_auth_user: userId }))
    return { employee_id: employeeId, status: 'LINKED' }
  } catch { return { employee_id: employeeId, status: 'REVIEW_OR_RETRY' } }
}
export async function linkAdministrator(client, employeeId, authUserId) {
  try {
    await checked(client.rpc('upgrade_link_administrator', { p_employee: employeeId, p_auth_user: authUserId }))
    return { employee_id: employeeId, status: 'ADMIN_LINKED' }
  } catch { return { employee_id: employeeId, status: 'REVIEW_OR_RETRY' } }
}
