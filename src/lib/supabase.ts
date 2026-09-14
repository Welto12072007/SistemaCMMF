import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oykrtlkksqekvjiiqafy.supabase.co'
// Publishable key (sb_publishable_...) replaces the legacy anon JWT key
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// User management (create/list/delete/generateLink) requires the service role key,
// which must never reach the browser. Those actions go through /api/admin-users
// (server-side, requires an admin session) — see src/lib/adminApi.ts.
