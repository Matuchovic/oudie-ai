/* ------------------------------------------------------------------
   Login

   This file renders a form and hands what was typed to an adapter. It
   deliberately does not implement authentication: a password must never
   be stored, logged, or outlive the submit, and the surest way to
   guarantee that is not to be the thing holding it. Supabase Auth is the
   adapter in production; its client does the exchange and owns the
   session.

   Keys: only the project URL and the anon key belong in a browser, and
   the anon key is public by design — row level security decides what it
   can reach. The service role key must never appear in this project.

   The visual idea: there is no card. The fields sit on the void in front
   of the humanoid, and the humanoid answers the form. Focus a field and
   it brightens and leans in. Get the password wrong and its face cools to
   red before you have read the message. Sign in and the halo opens
   outward and the form dissolves through it.
   ------------------------------------------------------------------ */

import { injectOnce } from '../style.js';

const LOGIN_CSS = `
.au-root{position:fixed;inset:0;z-index:80;
  display:flex;flex-direction:column;justify-content:flex-end;
  padding:0 clamp(22px,7vw,64px) calc(env(safe-area-inset-bottom,0px) + 34px);
  font:400 15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  color:#d9ecfa;pointer-events:none;
  opacity:0;transition:opacity .7s cubic-bezier(.16,1,.3,1)}
.au-root.au-on{opacity:1;pointer-events:auto}
.au-root[hidden]{display:none}

/* Desktop has room to put the form beside the figure instead of under it. */
@media (min-width:900px) and (orientation:landscape){
  .au-root{justify-content:center;align-items:flex-end;padding-bottom:0}
  .au-box{margin-right:max(4vw,40px)}
}

.au-box{width:min(430px,100%)}

.au-status{font:600 10.5px ui-monospace,monospace;letter-spacing:.22em;
  text-transform:uppercase;color:#f0c34a;margin:0 0 18px;
  transition:color .4s}

.au-field{margin-bottom:16px}
.au-field label{display:block;font:600 9.5px ui-monospace,monospace;
  letter-spacing:.22em;text-transform:uppercase;color:#4a6b83;margin-bottom:5px;
  transition:color .3s}
.au-field input{
  appearance:none;-webkit-appearance:none;
  width:100%;background:transparent;color:#eaf6ff;
  border:0;border-bottom:1px solid rgba(56,189,248,.26);
  border-radius:0;padding:8px 2px;
  /* 16px stops iOS Safari zooming the page when a field takes focus. */
  font:400 16px/1.4 inherit;
  transition:border-color .3s}
.au-field input::placeholder{color:#33556b}
.au-field input:focus{outline:none;border-bottom-color:rgba(56,189,248,.9)}
.au-field.au-live label{color:#7fc4e8}

.au-msg{margin:0 0 14px;min-height:18px;font-size:13px;color:#e2665a;
  opacity:0;transform:translateY(-3px);transition:opacity .3s,transform .3s}
.au-msg.au-show{opacity:1;transform:none}

.au-actions{display:flex;align-items:center;gap:14px}
.au-btn{appearance:none;-webkit-appearance:none;cursor:pointer;
  background:transparent;font:500 14px inherit;letter-spacing:.04em;
  border:1px solid rgba(56,189,248,.42);border-radius:999px;
  color:#9fd4f0;min-height:50px;padding:0 26px;flex:1;
  transition:border-color .3s,color .3s,background .3s}
.au-btn:hover:not(:disabled){border-color:rgba(56,189,248,.85);color:#e2f5ff}
.au-btn:disabled{opacity:.5;cursor:default}
.au-btn.au-ghost{flex:0 0 auto;border-color:rgba(95,134,165,.28);color:#6f93ae;
  font-size:13px;padding:0 20px}
.au-btn.au-ghost:hover{color:#cfe6f5;border-color:rgba(95,134,165,.6)}
.au-btn:focus-visible{outline:2px solid #35c6ff;outline-offset:3px}
.au-or{font:600 9.5px ui-monospace,monospace;letter-spacing:.2em;color:#3d5a70}

.au-foot{margin:18px 0 0;font-size:11.5px;color:#3f5f76}

/* The one moment of motion: on success the ring opens outward and the
   form goes through it rather than being replaced by a spinner. */
.au-root.au-out .au-box{opacity:0;transform:translateY(10px) scale(.98);
  transition:opacity .5s,transform .5s}
`;

/* The adapter contract. Anything satisfying this works — Supabase in
   production, this stub in development. Nothing here ever sees a token. */
export function stubAuth() {
  return {
    async signIn() { throw new Error('AUTH_NOT_CONFIGURED'); },
    async signInWithGoogle() { throw new Error('AUTH_NOT_CONFIGURED'); },
    async currentUser() { return null; },
    async signOut() {},
  };
}

export function createLogin(opts = {}) {
  injectOnce('login', LOGIN_CSS);
  const auth = opts.auth ?? stubAuth();
  const i18n = opts.i18n;
  const face = opts.face ?? null;      // the humanoid runtime, optional
  const onSignedIn = opts.onSignedIn ?? (() => {});

  const cs = i18n?.lang !== 'en';
  const T = cs
    ? { locked: 'Zamčeno', listening: 'Poslouchá', denied: 'Odmítnuto', welcome: 'Vítej',
        email: 'E-mail', pass: 'Heslo', go: 'Probudit', google: 'Google', or: 'nebo',
        working: 'Ověřuji', bad: 'Nesprávný e-mail nebo heslo.', missing: 'Vyplň obojí.',
        notset: 'Přihlašování zatím není nastavené.',
        foot: 'Heslo se nikde neukládá ani neloguje.' }
    : { locked: 'Locked', listening: 'Listening', denied: 'Denied', welcome: 'Welcome',
        email: 'Email', pass: 'Password', go: 'Wake up', google: 'Google', or: 'or',
        working: 'Checking', bad: 'Wrong email or password.', missing: 'Fill in both.',
        notset: 'Sign-in is not configured yet.',
        foot: 'Your password is never stored or logged.' };

  const root = document.createElement('div');
  root.className = 'au-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.hidden = true;
  root.innerHTML = `
    <div class="au-box">
      <p class="au-status" role="status" aria-live="polite">${T.locked}</p>
      <div class="au-field" data-f="email">
        <label for="au-email">${T.email}</label>
        <input id="au-email" type="email" autocomplete="email" inputmode="email"
               autocapitalize="off" spellcheck="false" placeholder="ty@firma.cz" required>
      </div>
      <div class="au-field" data-f="pass">
        <label for="au-pass">${T.pass}</label>
        <input id="au-pass" type="password" autocomplete="current-password" required>
      </div>
      <p class="au-msg"></p>
      <div class="au-actions">
        <button class="au-btn" type="button" data-go>${T.go}</button>
        <span class="au-or">${T.or}</span>
        <button class="au-btn au-ghost" type="button" data-google>${T.google}</button>
      </div>
      <p class="au-foot">${T.foot}</p>
    </div>`;
  document.body.appendChild(root);

  const email = root.querySelector('#au-email');
  const pass = root.querySelector('#au-pass');
  const status = root.querySelector('.au-status');
  const msg = root.querySelector('.au-msg');
  const goBtn = root.querySelector('[data-go]');

  /* Every visual state in one place, so the copy, the colour and what the
     humanoid does can never disagree with each other. */
  const MOODS = {
    locked:   { text: T.locked,    col: '#f0c34a', attention: 0,    alert: 0,   halo: 0.16 },
    focused:  { text: T.listening, col: '#38bdf8', attention: 0.85, alert: 0,   halo: 0.55 },
    checking: { text: T.working,   col: '#38bdf8', attention: 1,    alert: 0,   halo: 0.75 },
    denied:   { text: T.denied,    col: '#e2665a', attention: 0.3,  alert: 1,   halo: 0.5 },
    welcome:  { text: T.welcome,   col: '#7fdcff', attention: 1,    alert: 0,   halo: 1 },
  };

  let mood = 'locked';
  function setMood(name) {
    const m = MOODS[name];
    if (!m) return;
    mood = name;
    status.textContent = m.text;
    status.style.color = m.col;
    face?.setMood?.(m.attention, m.alert);
    face?.setHalo?.(m.halo);
  }

  function say(text) {
    msg.textContent = text;
    msg.classList.toggle('au-show', !!text);
  }

  for (const f of root.querySelectorAll('.au-field')) {
    const input = f.querySelector('input');
    input.addEventListener('focus', () => {
      f.classList.add('au-live');
      if (mood !== 'checking') setMood('focused');
    });
    input.addEventListener('blur', () => {
      f.classList.remove('au-live');
      if (mood === 'focused' && !root.querySelector('.au-field.au-live')) setMood('locked');
    });
    // Clearing the refusal as soon as they start fixing it: leaving the
    // face red while someone retypes reads as the app sulking.
    input.addEventListener('input', () => {
      if (mood === 'denied') { say(''); setMood('focused'); }
    });
  }

  async function submit() {
    if (!email.value.trim() || !pass.value) { say(T.missing); return; }
    goBtn.disabled = true;
    say('');
    setMood('checking');
    try {
      const user = await auth.signIn(email.value.trim(), pass.value);
      pass.value = '';                       // drop it the moment it is handed over
      setMood('welcome');
      root.classList.add('au-out');
      setTimeout(() => { hide(); onSignedIn(user); }, 620);
    } catch (err) {
      pass.value = '';
      setMood('denied');
      say(err?.message === 'AUTH_NOT_CONFIGURED' ? T.notset : T.bad);
    } finally {
      goBtn.disabled = false;
    }
  }

  goBtn.addEventListener('click', submit);
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') pass.focus(); });
  root.querySelector('[data-google]').addEventListener('click', async () => {
    setMood('checking');
    try { await auth.signInWithGoogle(); }
    catch (err) {
      setMood('denied');
      say(err?.message === 'AUTH_NOT_CONFIGURED' ? T.notset : T.bad);
    }
  });

  function show() {
    root.hidden = false;
    root.classList.remove('au-out');
    requestAnimationFrame(() => root.classList.add('au-on'));
    setMood('locked');
    setTimeout(() => email.focus({ preventScroll: true }), 300);
  }

  function hide() {
    root.classList.remove('au-on');
    face?.releaseHalo?.();
    face?.setMood?.(0, 0);
    setTimeout(() => { root.hidden = true; }, 700);
  }

  return {
    show,
    hide,
    /* Show the form first, then check for an existing session.

       The other order — await the session, then decide what to render —
       leaves a blank screen for as long as the auth server takes to
       answer, and forever if it never does. The boot screen has already
       been dismissed by then, so there is nothing underneath. Showing
       first costs a returning user a brief glimpse of a form; awaiting
       first costs everyone else a dead app. */
    async resume() {
      show();
      let user = null;
      try {
        user = await Promise.race([
          auth.currentUser(),
          new Promise((r) => setTimeout(() => r(null), 4000)),
        ]);
      } catch { /* any failure counts as signed out */ }
      if (user) hide();
      return user;
    },
    async signOut() {
      await auth.signOut();
      // A cached shell outliving a sign-out is a quiet leak.
      navigator.serviceWorker?.controller?.postMessage('oudie:purge');
      show();
    },
    dispose() { root.remove(); },
  };
}
