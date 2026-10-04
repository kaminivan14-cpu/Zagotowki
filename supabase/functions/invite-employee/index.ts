import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { invitationHandler } from '../_shared/invite-handler.js'

Deno.serve(invitationHandler({ createClient, env: (name: string) => Deno.env.get(name) }))
