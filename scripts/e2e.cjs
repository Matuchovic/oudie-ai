/* End-to-end kontrola SKUTEČNÉ Next appky, ne standalone bundlu.

   Jsou to dvě různé cesty a dlouho se testovala jen ta druhá. Appka
   šla ven rozbitá: boot předal řízení loginu, který se nikdy
   neobjevil. Standalone to zachytit nemohl.

   Od přechodu na routy testujeme navíc jednu věc, která se dřív
   nemohla pokazit: že humanoid přežije navigaci. Canvas žije v
   layoutu, takže Next by ho odmontovat neměl — ale kdyby ho někdo
   přesunul do stránky, sestavování by se spustilo znovu při každém
   přechodu a nikdo by si toho nemusel všimnout, protože to pořád
   "nějak vypadá". Značka na elementu to odhalí: když se element
   přemontuje, vlastnost na něm zmizí.

   Použití:
     npx next build && npx next start -p 3111 &
     xvfb-run -a electron scripts/e2e.cjs
*/

const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('use-gl', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.disableHardwareAcceleration();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

function check(name, ok, detail) {
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? '  - ' + detail : ''));
  if (!ok) failures.push(name);
}

const BASE = process.env.URL || 'http://localhost:3111';

const PATH = 'location.pathname';
const MARK = '(function(){ var c = document.querySelector("canvas"); if (!c) return "no-canvas"; c.__oudieProbe = "keep"; return "marked"; })()';
const PROBE = '(function(){ var c = document.querySelector("canvas"); if (!c) return "no-canvas"; return c.__oudieProbe === "keep" ? "same" : "remounted"; })()';
const COUNT = 'document.querySelectorAll("canvas").length';
const LOGIN = '(function(){ var a = document.querySelector(".au-root"); if (!a) return "missing"; var s = getComputedStyle(a); return s.display + "|" + s.opacity; })()';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 760, show: false });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 3) errors.push(msg.slice(0, 160));
  });

  await win.loadURL(BASE + '/');
  await sleep(3000);

  const js = (code) => win.webContents.executeJavaScript(code);

  // Nepřihlášený na / musí skončit na /boot. Tohle je ta ochrana,
  // kterou dřív dělalo CSS a nedělalo ji vůbec.
  check('/ přesměruje nepřihlášeného na /boot', (await js(PATH)) === '/boot',
    'pathname=' + (await js(PATH)));

  check('canvas je právě jeden', (await js(COUNT)) === 1, 'count=' + (await js(COUNT)));

  await js(MARK);

  // 6,9 s sestavování plus pauza před formulářem.
  await sleep(11000);

  check('po sestavení následuje /login', (await js(PATH)) === '/login',
    'pathname=' + (await js(PATH)));

  // Jádro věci: stejný canvas, ne nový.
  const probe = await js(PROBE);
  check('humanoid přežil navigaci', probe === 'same', probe);

  check('canvas je pořád právě jeden', (await js(COUNT)) === 1, 'count=' + (await js(COUNT)));

  const [display, opacity] = (await js(LOGIN)).split('|');
  check('přihlašovací formulář je vidět', display !== 'none' && Number(opacity) > 0.5,
    display + ' opacity ' + opacity);

  check('žádné chyby v konzoli', errors.length === 0, errors[0] || '');

  console.log(failures.length ? '\n' + failures.length + ' failed' : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
