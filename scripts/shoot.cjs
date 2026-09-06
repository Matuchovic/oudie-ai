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

/* capturePage() in this offscreen/SwiftShader setup returns the frame as
   it was at first paint and ignores later DOM changes — a plain div added
   by script never showed up. Nudging the window size forces a full
   repaint. Without this the harness silently reports stale frames, which
   is worse than no harness at all. */
let frozen = false;
async function repaint(win) {
  if (!frozen) {
    // CSS transitions need compositor frames to advance, and this harness
    // does not produce them: an element could sit at opacity 0 for ever
    // after its class was removed. Freeze transitions so captures show the
    // settled state instead of a stalled one.
    await win.webContents.executeJavaScript(
      "var s=document.createElement('style');s.textContent='*{transition:none !important}';document.head.appendChild(s);'ok'"
    ).catch(() => {});
    frozen = true;
  }
  const [w, h] = win.getSize();
  win.setSize(w + 1, h);
  await sleep(260);
  win.setSize(w, h);

  // Resizing throws away the WebGL drawing buffer and every render target.
  // Under SwiftShader a frame can take a full second, so a short wait here
  // captures an empty canvas and looks exactly like a rendering bug. Wait
  // for real frames instead of guessing.
  await win.webContents.executeJavaScript(`
    new Promise(res => {
      let n = 0;
      const tick = () => (++n >= 4 ? res(n) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
      setTimeout(() => res(n), 6000);
    })`).catch(() => {});
  await sleep(200);
}

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

  // Constellation is the default view now.
  await repaint(win);
  const img0 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, '00_team.png'), img0.toPNG());
  await win.webContents.executeJavaScript("document.querySelector('.cn-node[data-id=\"chief\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  await sleep(400);
  await repaint(win);
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, '00b_card.png'), img1.toPNG());
  await win.webContents.executeJavaScript("document.getElementById('b-lang').click()");
  await sleep(400);
  await repaint(win);
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, '00c_en.png'), img2.toPNG());
  await win.webContents.executeJavaScript("document.getElementById('b-lang').click();document.getElementById('b-view').click()");
  await sleep(400);

  const marks = [
    ['01_assembling_early', 0],
    ['02_assembling_mid', 2200],
    ['03_assembling_late', 2200],
    ['04_assembled', 2400],
    ['05_listening', 2500],
  ];

  const extra = async (name, js) => {
    await win.webContents.executeJavaScript(js);
    await sleep(700);
    await repaint(win);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
  };

  for (const [name, wait] of marks) {
    if (wait) await sleep(wait);
    await repaint(win);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());

    const d = await win.webContents.executeJavaScript(
      'document.getElementById("diag") ? document.getElementById("diag").textContent : "no panel"'
    );
    console.log(`--- ${name} ---\n${d}\n`);
  }

  // The sweep runs 2.5s out of every 7.5s, so a single grab misses it.
  // Burst-capture and keep the brightest frame.
  for (let i = 0; i < 9; i++) {
    await sleep(420);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `scan_${String(i).padStart(2, '0')}.png`), img.toPNG());
  }
  await extra('07_speaking', "document.getElementById('b-speak').click()");

  if (logs.length) console.log('CONSOLE:\n' + logs.join('\n'));

  const webgl = await win.webContents.executeJavaScript(`(() => {
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return gl ? { ver: gl.getParameter(gl.VERSION), err: gl.getError() } : 'no context';
  })()`);
  console.log('WEBGL:', JSON.stringify(webgl));

  app.quit();
});
