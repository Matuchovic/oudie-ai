/* End-to-end check of the REAL Next app, not the standalone bundle.

   Those are two different code paths, and for a while only the first was
   ever tested. The app shipped broken: boot handed over to a login that
   never appeared, because the session lookup was awaited before the form
   was rendered and the auth server was slow. Nothing in the standalone
   could have caught that.

   Usage:
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

const PROBE = [
  '(function(){',
  '  var a = document.querySelector(".au-root");',
  '  var b = document.querySelector(".bt-root");',
  '  var cs = a ? getComputedStyle(a) : null;',
  '  return [',
  '    document.body.dataset.screen || "none",',
  '    cs ? cs.display : "missing",',
  '    cs ? cs.opacity : "0",',
  '    b ? getComputedStyle(b).display : "missing"',
  '  ].join("|");',
  '})()',
].join('\n');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 760, show: false });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 3) errors.push(msg.slice(0, 160));
  });

  await win.loadURL(process.env.URL || 'http://localhost:3111/');

  await sleep(3000);
  let [screen] = (await win.webContents.executeJavaScript(PROBE)).split('|');
  check('boot screen is up', screen === 'boot', 'screen=' + screen);

  // Long enough for the 6.9s assembly plus the beat before the form.
  await sleep(11000);
  const parts = (await win.webContents.executeJavaScript(PROBE)).split('|');
  check('login follows boot', parts[0] === 'login', 'screen=' + parts[0]);
  check('login panel is visible', parts[1] !== 'none' && Number(parts[2]) > 0.5,
    parts[1] + ' opacity ' + parts[2]);
  check('boot is gone by then', parts[3] === 'none', parts[3]);
  check('no console errors', errors.length === 0, errors[0] || '');

  console.log(failures.length ? '\n' + failures.length + ' failed' : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
