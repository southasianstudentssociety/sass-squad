"use client";

import { createBrowserClient } from "@supabase/ssr";

// Used only to upload receipts straight to Storage: phone photos are bigger than
// a Server Action (1 MB) or a Vercel function (4.5 MB) accepts. Storage RLS limits
// uploads to the user's own folder.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
