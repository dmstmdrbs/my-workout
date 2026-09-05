const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const publicAppUrl = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://trainlog-psi.vercel.app').replace(/\/$/, '')

export const env = {
  supabaseUrl,
  supabasePublishableKey,
  publicAppUrl,
  isSupabaseConfigured: Boolean(supabaseUrl && supabasePublishableKey),
} as const
