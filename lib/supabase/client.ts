import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in the browser (client components).
 * Uses the public anon key — safe to expose, access is enforced by
 * Row-Level Security policies in the database.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — see SETUP.md."
    );
  }

  return createBrowserClient(url, anonKey);
}
