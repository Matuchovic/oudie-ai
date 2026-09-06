/* ------------------------------------------------------------------
   Middleware

   Dělá dvě věci: obnovuje session (jinak by vypršela a uživatel by
   vypadl uprostřed práce) a rozhoduje, kdo kam smí.

   Pravidla:
     /        appka, jen přihlášený
     /boot    sestavování, veřejné
     /login   formulář, veřejné; přihlášeného pošle do appky

   Nepřihlášený na / jde na /boot, ne rovnou na /login — sestavovací
   sekvence je součástí prvního dojmu. Přihlášený /boot nikdy
   neuvidí: nikdo nemá koukat na loading screen dvakrát.
   ------------------------------------------------------------------ */

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const PUBLIC = ['/boot', '/login'];

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Bez klíčů nemá smysl nikoho nikam přesměrovávat: appka by pak
  // jen cyklila mezi /login a /, kde se stejně nedá přihlásit.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser(), ne getSession(): ověřuje token proti Supabase.
  // getSession() jen přečte cookie, které se dá podvrhnout.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.includes(path);

  if (!user && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = '/boot';
    return NextResponse.redirect(to);
  }

  if (user && isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = '/';
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  matcher: [
    // Všechno kromě statiky a ikon. Middleware, který běží na každý
    // .png, je jen daň z latence.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|ico|svg|jpg|jpeg|webp)$).*)',
  ],
};
