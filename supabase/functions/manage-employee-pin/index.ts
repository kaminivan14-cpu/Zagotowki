import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { pinHandler } from '../_shared/pin-handlers.js'
Deno.serve(pinHandler('manage', { createClient, env: (name: string) => Deno.env.get(name) }))
