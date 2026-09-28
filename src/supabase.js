import { createClient } from '@supabase/supabase-js'
import { passwordRedirect } from './auth/passwordRecovery'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Prefer the deployment variable; retain the previous name for existing environments.
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const initialPasswordRedirect = passwordRedirect(window.location.href)

// Temporary recovery diagnostics: never log URLs, sessions, errors or credentials.
console.info('[recovery-diag] BEFORE_CREATE_CLIENT', {
  recoveryInHash: new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery',
  recoveryInSearch: new URLSearchParams(window.location.search).get('type') === 'recovery',
  recoveryDetected: initialPasswordRedirect.requested,
})

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Subscribe before React mounts so early SDK events are observable too.
const { data: { subscription: recoveryDiagnostics } } = supabase.auth.onAuthStateChange(event => {
  console.info('[recovery-diag] AUTH_EVENT', event)
})
if (import.meta.hot) import.meta.hot.dispose(() => recoveryDiagnostics.unsubscribe())

void supabase.auth.initialize().then(async ({ error }) => {
  const { data, error: sessionError } = await supabase.auth.getSession()
  console.info('[recovery-diag] SDK_INITIALIZED', {
    initializationError: Boolean(error),
    sessionReadError: Boolean(sessionError),
    hasSession: Boolean(data.session),
  })
}).catch(() => {
  console.info('[recovery-diag] SDK_DIAGNOSTIC_FAILED', true)
})
