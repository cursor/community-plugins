import "server-only";

import { createServerClient } from "@supabase/ssr";

/**
 * Privileged Supabase client using the secret key — bypasses RLS entirely.
 * Server-side only. Callers are responsible for any visibility filtering
 * (e.g. `.eq("public", true)`) and ownership checks.
 */
export async function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      cookies: {
        getAll() {
          return null;
        },
        setAll() {},
      },
    },
  );
}
