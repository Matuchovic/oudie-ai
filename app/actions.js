'use server';

/* ------------------------------------------------------------------
   Odhlášení

   Serverová akce, ne volání z prohlížeče. Session je v cookies a
   smazat je musí server, jinak by v prohlížeči zůstala platná cookie
   a middleware by uživatele dál pouštěl dovnitř.
   ------------------------------------------------------------------ */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect('/login');
}
