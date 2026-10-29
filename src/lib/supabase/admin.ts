import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES row-level security — use only inside server
 * actions / route handlers, after you have verified the caller yourself
 * (e.g. the Enka signature check). Never import from a Client Component.
 * Returns null when SUPABASE_SECRET_KEY is not configured.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
