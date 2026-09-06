/* ------------------------------------------------------------------
   Supabase v prohlížeči

   Rozdíl proti původnímu supabase-js klientovi je jediný, ale zásadní:
   tenhle ukládá session do cookies, ne do localStorage. Middleware
   běží na edge a do localStorage nevidí — bez cookies by žádná
   ochrana rout nefungovala.

   Anon klíč patří do prohlížeče. Je veřejný záměrně; co s ním jde
   dosáhnout, rozhoduje row level security. Service role klíč do
   tohohle projektu nepatří nikam.
   ------------------------------------------------------------------ */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
