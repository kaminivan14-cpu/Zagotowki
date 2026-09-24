import { createClient } from '@supabase/supabase-js'
import { passwordRedirect } from './auth/passwordRecovery'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Prefer the deployment variable; retain the previous name for existing environments.
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const initialPasswordRedirect = passwordRedirect(window.location.href)

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
