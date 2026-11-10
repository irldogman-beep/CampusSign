import { createClient } from '@supabase/supabase-js';

// Environment values override the current CampusSign project's safe public
// defaults. This makes the USB copy portable to another Supabase project.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fmfvuljxmtijtgvflojg.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_flj8IS03aD2XVyJjTYHhhA_3PCRs4S-';

// The publishable key is designed for browser use. Row Level Security and
// server-side RPC checks are the security boundary. Never use service_role here.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
