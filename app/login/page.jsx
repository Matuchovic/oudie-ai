'use client';

/* /login — formulář. Přihlášení běží přes browser klienta z
   @supabase/ssr, takže se session uloží do cookies a middleware ji
   uvidí. Po úspěchu router.refresh(), aby se serverová část
   dozvěděla o nové session, a teprve pak přechod do appky. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHumanoid } from '@/components/humanoid/Stage';
import { createLogin, stubAuth } from '@/components/auth/login.js';
import { createClient } from '@/lib/supabase/client';

function browserAuth() {
  let supabase = null;
  try {
    supabase = createClient();
  } catch {
    supabase = null;
  }
  if (!supabase) return stubAuth();

  return {
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      // Supabase rozlišuje "uživatel neexistuje" od "špatné heslo",
      // což prozrazuje, které adresy jsou registrované. Nepředáváme dál.
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
  };
}

export default function LoginPage() {
  const router = useRouter();
  const { ready, face, i18n } = useHumanoid();

  useEffect(() => {
    if (!ready) return;

    const gate = createLogin({
      i18n,
      face,
      auth: browserAuth(),
      onSignedIn: () => {
        router.refresh();
        router.replace('/');
      },
    });
    // Rovnou show(), ne resume(): jestli tu session je, řeší
    // middleware, a ten sem nepřihlášeného pustí jen když opravdu není.
    gate.show();
    return () => gate.dispose();
  }, [ready, face, i18n, router]);

  return null;
}
