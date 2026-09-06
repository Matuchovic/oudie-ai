/* ------------------------------------------------------------------
   Screenshot harness

   Loads dist/oudie-humanoid.html in real Chromium (WebGL2, SwiftShader)
   and captures the assembly timeline plus the runtime diagnostics.

   This exists because the previous check was a Python reimplementation
   of the shader. It agreed with itself and disagreed with the GPU, which
   is how a 300px point size shipped. Test the renderer, not a model of it.

   Usage: xvfb-run -a node_modules/.bin/electron scripts/shoot.cjs
   ------------------------------------------------------------------ */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PAGE = process.env.PAGE || "/home/claude/apex/dist/test.html";
const OUT = process.env.OUT || '/tmp/shots';
const W = 1000;
const H = 900;

// SwiftShader: no GPU in the container, but a complete WebGL2 implementation.
app.commandLine.appendSwitch('use-gl', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.disableHardwareAcceleration();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });

  const logs = [];
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 1) logs.push(msg.slice(0, 300));
  });

  await win.loadURL("file://" + PAGE + (process.env.QS || ""));
  await sleep(1200); // let the context come up and the first frames run

  const marks = [
    ['01_assembling_early', 0],
    ['02_assembling_mid', 2200],
    ['03_assembling_late', 2200],
    ['04_assembled', 2400],
    ['05_listening', 2500],
  ];

  for (const [name, wait] of marks) {
    if (wait) await sleep(wait);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());

    const d = await win.webContents.executeJavaScript(
      'document.getElementById("diag") ? document.getElementById("diag").textContent : "no panel"'
    );
    console.log(`--- ${name} ---\n${d}\n`);
  }

  if (logs.length) console.log('CONSOLE:\n' + logs.join('\n'));

  const webgl = await win.webContents.executeJavaScript(`(() => {
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return gl ? { ver: gl.getParameter(gl.VERSION), err: gl.getError() } : 'no context';
  })()`);
  console.log('WEBGL:', JSON.stringify(webgl));

  app.quit();
});
