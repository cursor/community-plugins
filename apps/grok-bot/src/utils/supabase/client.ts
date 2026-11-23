import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser's Supabase client, for signing in and out, reading the session
 * and uploading a picture to storage. It can't read or write tables: the
 * publishable key has no access to the database. Data comes from the server.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
