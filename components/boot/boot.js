/* ------------------------------------------------------------------
   Boot

   The loading screen is the assembly. Nothing is faked: the percentage is
   the real progress of 57,000 particles finding their positions, and the
   checks below it are the integrations the app will actually depend on.

   The one piece of theatre is the head. It stays down while the figure
   builds — busy, not yet aware of you — and lifts over the last stretch
   to arrive level exactly as the assembly finishes. Then a beat of
   nothing, and the form appears.

   That beat matters. Without it the form eats the moment before anyone
   has registered that something just looked at them.
   ------------------------------------------------------------------ */

import { injectOnce } from '../style.js';

const BOOT_CSS = `
.bt-root{position:fixed;inset:0;z-index:70;pointer-events:none;
  font:400 15px ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  opacity:1;transition:opacity .6s ease}
.bt-root.bt-done{opacity:0}
.bt-root[hidden]{display:none}

.bt-pct{position:absolute;right:clamp(16px,6vw,64px);top:50%;
  transform:translateY(-50%);
  font:600 11px ui-monospace,monospace;letter-spacing:.22em;color:#38bdf8;
  font-variant-numeric:tabular-nums;white-space:nowrap}

.bt-checks{position:absolute;left:clamp(16px,6vw,64px);
  bottom:calc(env(safe-area-inset-bottom,0px) + 30px);
  font:500 10px ui-monospace,monospace;letter-spacing:.14em;line-height:2;
  text-transform:uppercase}
.bt-checks div{color:#22374a;transition:color .45s}
.bt-checks div.bt-ok{color:#5f86a5}
.bt-checks div.bt-ok b{color:#38bdf8;font-weight:500}

.bt-line{position:absolute;left:0;bottom:0;height:1px;width:0;
  background:linear-gradient(90deg,rgba(56,189,248,0),#38bdf8);
  transition:width .12s linear}

@media (max-width:640px){
  .bt-checks{font-size:9px;line-height:1.85}
  .bt-pct{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 30px);transform:none}
}
@media (prefers-reduced-motion:reduce){
  .bt-root,.bt-line,.bt-checks div{transition:none}
}
`;

/* The integrations this app will actually lean on. Listing anything it
   does not use would make the boot screen a liar. */
const CHECKS = {
  cs: ['Roster agentu', 'Hlasova identita', 'Kalendar', 'Databaze', 'Posta', 'Kredity hlasu'],
  en: ['Agent roster', 'Voice identity', 'Calendar', 'Database', 'Mail', 'Voice credits'],
};

const ASSEMBLY = 6.9;   // measured off the reference footage
const LIFT_FROM = 0.55; // the head only rises once there is a head to raise
const DOWN = -0.52;     // radians. Further and the chin clips the chest.
const BEAT = 900;       // silence between arriving and being asked to sign in

export function createBoot(opts = {}) {
  injectOnce('boot', BOOT_CSS);
  const face = opts.face;
  const i18n = opts.i18n;
  const onDone = opts.onDone ?? (() => {});

  const en = i18n?.lang === 'en';
  const items = CHECKS[en ? 'en' : 'cs'];

  const root = document.createElement('div');
  root.className = 'bt-root';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML =
    '<div class="bt-pct">' + (en ? 'ASSEMBLING' : 'SESTAVUJI') +
    '&hellip; <span data-pct>0</span>%</div>' +
    '<div class="bt-checks">' +
    items.map(function (s) { return '<div>&middot;&nbsp;&nbsp;' + s + '</div>'; }).join('') +
    '</div><div class="bt-line"></div>';
  document.body.appendChild(root);

  const pct = root.querySelector('[data-pct]');
  const line = root.querySelector('.bt-line');
  const rows = [...root.querySelectorAll('.bt-checks div')];

  let raf = 0;
  let start = 0;
  let finished = false;

  function frame(now) {
    if (finished) return;
    raf = requestAnimationFrame(frame);
    const t = Math.min(1, (now - start) / (ASSEMBLY * 1000));

    pct.textContent = Math.round(t * 100);
    line.style.width = (t * 100).toFixed(1) + '%';

    const done = Math.floor(t * items.length * 1.06);
    rows.forEach(function (r, i) {
      const on = i < done;
      if (on !== r.classList.contains('bt-ok')) {
        r.classList.toggle('bt-ok', on);
        r.innerHTML = on
          ? '<b>&#10003;</b>&nbsp;&nbsp;' + items[i]
          : '&middot;&nbsp;&nbsp;' + items[i];
      }
    });

    // Eased out, so the head settles into level rather than stopping there.
    const k = t < LIFT_FROM ? 0 : Math.min(1, (t - LIFT_FROM) / (1 - LIFT_FROM));
    const e = 1 - Math.pow(1 - k, 3);
    if (face && face.setLook) face.setLook(0, DOWN * (1 - e));

    if (t >= 1) {
      finished = true;
      if (face && face.setLook) face.setLook(0, 0);
      setTimeout(function () {
        root.classList.add('bt-done');
        setTimeout(function () { root.hidden = true; }, 650);
        onDone();
      }, BEAT);
    }
  }

  return {
    run() {
      finished = false;
      root.hidden = false;
      root.classList.remove('bt-done');
      if (face) {
        if (face.setLook) face.setLook(0, DOWN);
        if (face.replay) face.replay();
      }
      start = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    /* A returning session skips straight to a figure that is already up
       and looking at you. Nobody should watch a loading screen twice. */
    skip() {
      finished = true;
      cancelAnimationFrame(raf);
      if (face && face.setLook) face.setLook(0, 0);
      root.hidden = true;
    },
    dispose() { cancelAnimationFrame(raf); root.remove(); },
  };
}
