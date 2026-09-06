/* ------------------------------------------------------------------
   Login

   This file deliberately does NOT implement authentication. It renders a
   form and hands what the person typed straight to an adapter.

   Why that matters here: a password must never be stored, logged, kept in
   a variable that outlives the submit, or written to a cache. The safe way
   to get that guarantee is to not be the one holding it. The adapter is
   Supabase Auth in production — its client takes the credentials, does the
   exchange over TLS and owns the session.

   Keys: only the Supabase URL and the anon key belong in the browser, and
   the anon key is public by design — it is safe precisely because row
   level security decides what it can reach. The service role key must
   never appear in this project, in any file, at any time.
   ------------------------------------------------------------------ */

import { injectOnce } from '../style.js';

const LOGIN_CSS = `
.au-root{position:fixed;inset:0;z-index:80;display:grid;place-items:center;
  padding:24px calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom))
    calc(24px + env(safe-area-inset-left));
  background:radial-gradient(120% 90% at 50% 0%,#101827 0%,#05070c 68%);
  font:400 15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  color:#d9ecfa}
.au-root[hidden]{display:none}

.au-box{width:min(420px,100%);display:flex;flex-direction:column;gap:14px}
.au-mark{display:flex;justify-content:center;margin-bottom:2px}
.au-logo{width:min(190px,44vw);height:auto;
  filter:drop-shadow(0 0 34px rgba(56,189,248,.35))}
@media (max-height:680px){.au-logo{width:min(130px,32vw)}}
.au-lead{margin:0 0 10px;color:#8fb4cd;text-align:center}

.au-field{display:flex;flex-direction:column;gap:6px}
.au-field label{font:600 10px ui-monospace,monospace;letter-spacing:.16em;
  text-transform:uppercase;color:#5f86a5}
.au-field input{
  appearance:none;-webkit-appearance:none;
  background:rgba(10,20,34,.9);color:#eaf6ff;
  border:1px solid rgba(56,189,248,.22);border-radius:12px;
  /* 16px keeps iOS Safari from zooming the page on focus. */
  font:400 16px/1.4 inherit;padding:14px 15px;min-height:52px;width:100%}
.au-field input:focus{outline:none;border-color:rgba(56,189,248,.7);
  box-shadow:0 0 0 3px rgba(56,189,248,.14)}

.au-btn{appearance:none;-webkit-appearance:none;cursor:pointer;
  min-height:52px;border-radius:999px;font:600 15px inherit;
  border:1px solid transparent;transition:background .18s,border-color .18s,color .18s}
.au-primary{background:#1c7fb8;border-color:#2b9fdd;color:#fff}
.au-primary:hover:not(:disabled){background:#2790cd}
.au-primary:disabled{opacity:.55;cursor:default}
.au-ghost{background:transparent;border-color:rgba(56,189,248,.3);color:#9fd0ea}
.au-ghost:hover{color:#fff;border-color:rgba(56,189,248,.65)}
.au-btn:focus-visible{outline:2px solid #35c6ff;outline-offset:2px}

.au-sep{display:flex;align-items:center;gap:12px;color:#456980;
  font:600 10px ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}
.au-sep::before,.au-sep::after{content:"";flex:1;height:1px;background:rgba(56,189,248,.16)}

.au-msg{margin:0;min-height:20px;font-size:13.5px;color:#ff9a7a}
.au-msg.au-ok{color:#7fd4a0}
.au-foot{margin:4px 0 0;font-size:12.5px;color:#4d6d84}
`;


/* The wordmark is part of the artwork, so the login leads with the logo
   itself rather than repeating the name beside a small glyph. The path is
   configurable because the standalone build runs from file://, where a
   leading slash points at the filesystem root rather than the app. */
const mark = (src) => `<img class="au-logo" src="${src}" alt="Oudie — HumanoidAI Auren"
  width="190" height="190" decoding="async">`;

/* The adapter contract. Anything satisfying this works — Supabase in
   production, a stub in development. Nothing below ever sees a session
   token; the adapter owns it. */
export function stubAuth() {
  return {
    async signIn() {
      throw new Error('AUTH_NOT_CONFIGURED');
    },
    async signInWithGoogle() {
      throw new Error('AUTH_NOT_CONFIGURED');
    },
    async currentUser() {
      return null;
    },
    async signOut() {},
  };
}

export function createLogin(opts = {}) {
  injectOnce('login', LOGIN_CSS);
  const auth = opts.auth ?? stubAuth();
  const i18n = opts.i18n;
  const onSignedIn = opts.onSignedIn ?? (() => {});

  const cs = i18n?.lang !== 'en';
  const T = cs
    ? { lead: 'Přihlas se a Oudie si tě zapamatuje.', email: 'E-mail', pass: 'Heslo',
        go: 'Přihlásit se', google: 'Pokračovat přes Google', or: 'nebo',
        working: 'Přihlašuji…', bad: 'Nesprávný e-mail nebo heslo.',
        missing: 'Vyplň e-mail i heslo.',
        notset: 'Přihlašování zatím není nastavené. Chybí Supabase klíče.',
        foot: 'Heslo se nikde neukládá ani neloguje.' }
    : { lead: 'Sign in and Oudie will remember you.', email: 'Email', pass: 'Password',
        go: 'Sign in', google: 'Continue with Google', or: 'or',
        working: 'Signing in…', bad: 'Wrong email or password.',
        missing: 'Enter both email and password.',
        notset: 'Sign-in is not configured yet. Supabase keys are missing.',
        foot: 'Your password is never stored or logged.' };

  const root = document.createElement('div');
  root.className = 'au-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="au-box">
      <div class="au-mark">${mark(opts.logoSrc ?? '/logo.png')}</div>
      <p class="au-lead">${T.lead}</p>
      <div class="au-field">
        <label for="au-email">${T.email}</label>
        <input id="au-email" type="email" autocomplete="email"
               inputmode="email" autocapitalize="off" spellcheck="false" required>
      </div>
      <div class="au-field">
        <label for="au-pass">${T.pass}</label>
        <input id="au-pass" type="password" autocomplete="current-password" required>
      </div>
      <p class="au-msg" role="status" aria-live="polite"></p>
      <button class="au-btn au-primary" type="button" data-go>${T.go}</button>
      <div class="au-sep">${T.or}</div>
      <button class="au-btn au-ghost" type="button" data-google>${T.google}</button>
      <p class="au-foot">${T.foot}</p>
      ${opts.previewSkip ? `<button class="au-btn au-ghost" type="button" data-skip
        style="min-height:40px;font-size:13px;opacity:.7">${cs ? 'Prohlédnout bez přihlášení' : 'Look around without signing in'}</button>` : ''}
    </div>`;
  // Hidden until something asks for it. Created visible, it would flash over
  // the app on every load before gate() had a chance to resolve the session.
  root.hidden = true;
  document.body.appendChild(root);

  const email = root.querySelector('#au-email');
  const pass = root.querySelector('#au-pass');
  const msg = root.querySelector('.au-msg');
  const goBtn = root.querySelector('[data-go]');

  function say(text, ok = false) {
    msg.textContent = text;
    msg.classList.toggle('au-ok', ok);
  }

  function fail(err) {
    say(err?.message === 'AUTH_NOT_CONFIGURED' ? T.notset : T.bad);
  }

  async function submit() {
    if (!email.value.trim() || !pass.value) return say(T.missing);
    goBtn.disabled = true;
    say(T.working, true);
    try {
      const user = await auth.signIn(email.value.trim(), pass.value);
      // Drop the credential the moment it has been handed over. It must not
      // survive in a DOM node for the rest of the session.
      pass.value = '';
      hide();
      onSignedIn(user);
    } catch (err) {
      pass.value = '';
      fail(err);
    } finally {
      goBtn.disabled = false;
    }
  }

  goBtn.addEventListener('click', submit);
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') pass.focus(); });
  root.querySelector('[data-skip]')?.addEventListener('click', () => hide());
  root.querySelector('[data-google]').addEventListener('click', async () => {
    try { await auth.signInWithGoogle(); } catch (err) { fail(err); }
  });

  function show() { root.hidden = false; setTimeout(() => email.focus(), 60); }
  function hide() { root.hidden = true; }

  return {
    show,
    hide,
    /* Resolve who is signed in before showing anything. Returns the user
       or null, and puts the gate up when there is nobody. */
    async gate() {
      try {
        const user = await auth.currentUser();
        if (user) { hide(); return user; }
      } catch { /* treat any failure as signed out */ }
      show();
      return null;
    },
    async signOut() {
      await auth.signOut();
      // A cached shell that outlives a sign-out is a quiet leak.
      navigator.serviceWorker?.controller?.postMessage('oudie:purge');
      show();
    },
    dispose() { root.remove(); },
  };
}
