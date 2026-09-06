/* ------------------------------------------------------------------
   Supabase auth adapter

   The login panel never touches a password beyond handing it to whatever
   satisfies this contract. This is that thing in production.

   Keys:
     NEXT_PUBLIC_SUPABASE_URL       project URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY  anon key — public by design

   The anon key is meant to be in the browser. It is safe because row level
   security decides what it can reach, not because it is hidden. The
   service role key bypasses all of that and must never appear in this
   project, in any file, in any environment variable prefixed NEXT_PUBLIC_,
   or in anything that reaches a browser.

   Returns null when the keys are absent, so the app falls back to the stub
   and says sign-in is not configured rather than half-working.
   ------------------------------------------------------------------ */

import { createClient } from '@supabase/supabase-js';

export function createSupabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return {
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      // Deliberately not forwarding Supabase's message: it distinguishes
      // "no such user" from "wrong password", which tells an attacker which
      // addresses are registered.
      if (error) throw new Error('SIGN_IN_FAILED');
      return data.user;
    },

    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw new Error('SIGN_IN_FAILED');
    },

    async currentUser() {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    },

    async signOut() {
      await supabase.auth.signOut();
    },

    /* Lets the UI react when a session expires or a token refresh fails,
       instead of silently showing a signed-in shell with no session. */
    onChange(fn) {
      const { data } = supabase.auth.onAuthStateChange((_e, session) => fn(session?.user ?? null));
      return () => data.subscription.unsubscribe();
    },
  };
}
