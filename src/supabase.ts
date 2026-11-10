import { createClient } from '@supabase/supabase-js';

// Both values are safe to be public: the publishable key only works within the
// Row Level Security rules defined in supabase-setup.sql.
const SUPABASE_URL = 'https://fmfvuljxmtijtgvflojg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_flj8IS03aD2XVyJjTYHhhA_3PCRs4S-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
