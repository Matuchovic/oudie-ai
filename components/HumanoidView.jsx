'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createHumanoid } from './humanoid/runtime.js';
import { createConstellation } from './constellation/constellation.js';
import { createI18n } from './i18n.js';
import { createLogin, stubAuth } from './auth/login.js';
import { createSupabaseAuth } from './auth/supabase.js';
import { createBoot } from './boot/boot.js';

/* Thin wrapper. All the work lives in runtime.js, which the standalone
   preview mounts too — so what you see in dist/apex-humanoid.html is
   what you get here, byte for byte. */
/* A malformed URL makes createClient throw, and an exception here would
   take the whole mount with it — no boot, no login, nothing. */
function safeAuth() {
  try {
    return createSupabaseAuth() ?? stubAuth();
  } catch {
    return stubAuth();
  }
}

export default function HumanoidView({ onReady }) {
  const canvasRef = useRef(null);
  const skyRef = useRef(null);
  const i18nRef = useRef(null);
  const skyApi = useRef(null);
  const flashRef = useRef(null);
  const loginRef = useRef(null);
  const bootRef = useRef(null);
  const apiRef = useRef(null);
  const [label, setLabel] = useState('ASSEMBLING… 0%');
  const [state, setState] = useState('assembling');
  const [mic, setMic] = useState(null);
  const [diag, setDiag] = useState(null);
  const [view, setView] = useState('face');
  const [lang, setLang] = useState('cs');
  const [track, setTrack] = useState(false);

  useEffect(() => {
    const api = createHumanoid(THREE, canvasRef.current, {
      onStatus: (s) => {
        setLabel(s.label);
        setState(s.state);
      },
    });
    apiRef.current = api;

    const i18n = createI18n('cs');
    i18nRef.current = i18n;

    // Real auth when the keys are present, otherwise a panel that says so.
    // Boot first, then the gate. The humanoid is the loading screen, and
    // the same instance stays on screen behind the form.
    const screen = (n) => { document.body.dataset.screen = n; };
    screen('boot');

    const gate = createLogin({
      i18n,
      face: api,
      auth: safeAuth(),
      onSignedIn: () => screen('app'),
    });
    loginRef.current = gate;

    const boot = createBoot({
      face: api,
      i18n,
      onDone: () => {
        screen('login');
        gate.resume().then((user) => { if (user) screen('app'); });
      },
    });
    bootRef.current = boot;
    boot.run();
    skyApi.current = createConstellation(skyRef.current, { i18n });
    skyApi.current.show();
    const stopLang = i18n.onChange(setLang);

    onReady?.(api);
    // Poll rather than push: cheap, and it keeps the render loop allocation-free.
    const t = setInterval(() => setDiag(api.diagnostics()), 500);
    return () => {
      clearInterval(t);
      stopLang();
      bootRef.current?.dispose();
      loginRef.current?.dispose();
      skyApi.current?.dispose();
      api.dispose();
    };
  }, [onReady]);

  const busy = state === 'assembling';
  const t = i18nRef.current?.t;
  const team = view === 'team';

  function toggleView() {
    if (flashRef.current?.classList.contains('go')) return;
    const f = flashRef.current;
    if (f) { f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
    // Swap at the peak of the burst, not before it and not after.
    setTimeout(() => {
      const next = team ? 'face' : 'team';
      setView(next);
      if (next === 'team') skyApi.current?.show();
      else { skyApi.current?.hide(); apiRef.current?.replay(); }
    }, 200);
    setTimeout(() => f?.classList.remove('go'), 660);
  }

  return (
    <div className="stage">
      <canvas ref={canvasRef} className={team ? 'dim' : ''} />
      <div className="sky" ref={skyRef} />
      <div className="flash" ref={flashRef} />
      {!team && <div className="status">{label}</div>}

      {diag && (
        <div className="diag">
          <div>WebGL {diag.webgl} · HDR bloom {diag.hdrBloom ? 'yes' : 'no'}</div>
          <div>canvas {diag.canvas} @ {diag.dpr}x</div>
          <div>uScale {diag.uScale} · point {diag.pointPx}px</div>
          <div>{diag.points.toLocaleString()} points · {diag.drawCalls} draws</div>
          <div>{diag.fps} fps{diag.safeMode ? ' · safe mode' : ''}</div>
          {diag.shaderErrors.length > 0 && (
            <div className="diag-err">shader: {diag.shaderErrors[0]}</div>
          )}
        </div>
      )}

      <div className="bar" role="group" aria-label="Humanoid controls">
        <button onClick={toggleView}>{team ? (t?.showFace ?? 'Show face') : (t?.showTeam ?? 'Show team')}</button>
        <button onClick={() => i18nRef.current?.toggle()}>{lang === 'cs' ? 'EN' : 'CS'}</button>
        <button onClick={() => apiRef.current?.replay()}>{t?.replay ?? 'Replay'}</button>
        <button
          aria-pressed={state === 'listening'}
          disabled={busy}
          onClick={() => apiRef.current?.setState('listening')}
        >
          Listening
        </button>
        <button
          aria-pressed={state === 'speaking'}
          disabled={busy}
          onClick={() => apiRef.current?.setState('speaking')}
        >
          Speaking
        </button>
        <button
          aria-pressed={track}
          onClick={async () => {
            if (apiRef.current?.isTracking()) { apiRef.current.stopTracking(); setTrack(false); }
            else setTrack(await apiRef.current?.startTracking());
          }}
        >
          {track ? (t?.trackOn ?? 'Sleduje') : (t?.track ?? 'Sledovat')}
        </button>
        <button
          aria-pressed={mic === true}
          onClick={async () => setMic(await apiRef.current?.enableMic())}
        >
          {mic === null ? 'Use mic' : mic ? 'Mic on' : 'Mic blocked'}
        </button>
      </div>
    </div>
  );
}
