import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabase = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { flowType: 'pkce' },
    })
  : null
