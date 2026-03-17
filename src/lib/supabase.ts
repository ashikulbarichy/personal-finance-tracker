import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Environment resolution strategy
 *
 * Local (Vite):
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_ANON_KEY
 *
 * Vercel (Option 2 – using NEXT_PUBLIC_* from your snippet):
 *   - NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_FIN_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_FIN_SUPABASE_ANON_KEY
 */
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ??
  import.meta.env.NEXT_PUBLIC_FIN_SUPABASE_URL;

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_FIN_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
