import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// ─── Browser client (used in Client Components only) ──────────────────────────
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
