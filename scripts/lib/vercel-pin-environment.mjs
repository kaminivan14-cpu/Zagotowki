import { trustedEnvironment } from '../../supabase/functions/_shared/pin-protocol.js'

// Only platform-provided deployment/branch hosts, never request Host or Origin.
const deploymentOrigin = host => typeof host === 'string' &&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(host)
  ? `https://${host}` : null

export function vercelPinEnvironment(env) {
  const environment = ({ preview: 'uat', production: 'production' })[env.VERCEL_ENV]
  if (environment === 'uat' && env.VERCEL_URL) {
    const origin = deploymentOrigin(env.VERCEL_URL)
    const branchOrigin = env.VERCEL_BRANCH_URL ? deploymentOrigin(env.VERCEL_BRANCH_URL) : null
    if (!origin || (env.VERCEL_BRANCH_URL && !branchOrigin)) return null
    const config = trustedEnvironment(environment, env.VITE_SUPABASE_URL, origin)
    return config ? { config, additionalOrigins: branchOrigin || '' } : null
  }
  // Compatibility for existing deployments/local proxy tests. Production is unchanged.
  const config = trustedEnvironment(environment, env.VITE_SUPABASE_URL, env.APP_URL)
  return config ? { config, additionalOrigins: env.PIN_MANAGEMENT_ORIGINS || '' } : null
}
