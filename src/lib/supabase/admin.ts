import { createClient } from '@supabase/supabase-js';

/**
 * Service-role admin client. Server-only — never import in client components.
 * Uses SUPABASE_SERVICE_ROLE_KEY which must NOT be prefixed NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase admin env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}
