/* ------------------------------------------------------------------
   Supabase na serveru

   Čte session z cookies requestu, takže se serverové akce a route
   handlery chovají jako přihlášený uživatel. RLS tím pádem platí i
   na ně — proto tu není a nebude service role klíč.

   Nesmí se volat na úrovni modulu: cookies() existuje jen za běhu
   requestu a při statickém buildu by to spadlo.
   ------------------------------------------------------------------ */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const store = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        } catch {
          // Serverová komponenta zapisovat cookies nesmí. Obnovu session
          // dělá middleware, takže tohle je bezpečné spolknout.
        }
      },
    },
  });
}
