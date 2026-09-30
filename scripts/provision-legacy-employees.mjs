// Manual operator tool, never run by CI/build. Secrets only from the operator's environment.
import { createClient } from '@supabase/supabase-js'
import { provisionEmployee, linkAdministrator } from './lib/provision-legacy.mjs'
import { PROD_URL } from '../supabase/functions/_shared/pin-protocol.js'

const args = process.argv.slice(2)
if (args[0] !== '--confirm-production' || args[1] !== 'ssheqxdgsmndiutthxvd' ||
    process.env.SUPABASE_URL !== PROD_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('REFUSED: explicit production confirmation and matching environment required.')
  process.exit(1)
}
const client = createClient(PROD_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
try {
  if (args.length === 5 && args[2] === '--link-admin' && /^[1-9][0-9]*$/.test(args[3]) && /^[a-f0-9-]{36}$/i.test(args[4])) {
    const result = await linkAdministrator(client, args[3], args[4])
    console.info(JSON.stringify(result)); if (result.status !== 'ADMIN_LINKED') process.exitCode = 1
  } else if (args.length === 2) {
    const { data, error } = await client.rpc('upgrade_candidates')
    if (error || !Array.isArray(data)) throw new Error('CANDIDATES')
    for (const { employee_id } of data) {
      const result = await provisionEmployee(client, employee_id)
      console.info(JSON.stringify(result))
      if (result.status !== 'LINKED') { process.exitCode = 1; break }
    }
  } else throw new Error('ARGUMENTS')
} catch { console.error('STOP: provisioning failed; no automatic cleanup or deletion.'); process.exitCode = 1 }
