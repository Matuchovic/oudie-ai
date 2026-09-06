'use client';

/* / — appka. Chráněná routa; nepřihlášeného sem middleware nepustí. */

import { useEffect, useRef, useState } from 'react';
import { useHumanoid } from '@/components/humanoid/Stage';
import { createConstellation } from '@/components/constellation/constellation.js';
import { signOut } from './actions';

export default function AppPage() {
  const { ready, face, i18n, status, skyRef, flashRef } = useHumanoid();
  const skyApi = useRef(null);
  const [view, setView] = useState('team');
  const [lang, setLang] = useState('cs');
  const [track, setTrack] = useState(false);
  const [mic, setMic] = useState(null);
  const [diag, setDiag] = useState(null);

  useEffect(() => {
    if (!ready || !face) return;

    // Vracející se uživatel jde rovnou sem a sestavování nevidí —
    // /boot mu middleware přeskočí. Kdyby runtime zůstal v
    // 'assembling', čekal by 6,9 sekundy na nic.
    // TODO: nahradit voláním na jednotném stavovém modelu, až bude.
    if (face.getState() === 'assembling') face.setState('listening');

    skyApi.current = createConstellation(skyRef.current, { i18n });
    skyApi.current.show();
    const stopLang = i18n.onChange(setLang);
    const t = setInterval(() => setDiag(face.diagnostics()), 500);

    return () => {
      clearInterval(t);
      stopLang();
      skyApi.current?.dispose();
      skyApi.current = null;
    };
  }, [ready, face, i18n, skyRef]);

  if (!ready) return null;

  const t = i18n?.t;
  const team = view === 'team';
  const busy = status.state === 'assembling';

  function toggleView() {
    const f = flashRef.current;
    if (f?.classList.contains('go')) return;
    if (f) { f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
    setTimeout(() => {
      const next = team ? 'face' : 'team';
      setView(next);
      if (next === 'team') skyApi.current?.show();
      else { skyApi.current?.hide(); face?.replay(); }
    }, 200);
    setTimeout(() => f?.classList.remove('go'), 660);
  }

  return (
    <>
      {!team && <div className="status">{status.label}</div>}

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
        <button onClick={toggleView}>
          {team ? (t?.showFace ?? 'Show face') : (t?.showTeam ?? 'Show team')}
        </button>
        <button onClick={() => i18n?.toggle()}>{lang === 'cs' ? 'EN' : 'CS'}</button>
        <button onClick={() => face?.replay()}>{t?.replay ?? 'Replay'}</button>
        <button
          aria-pressed={status.state === 'listening'}
          disabled={busy}
          onClick={() => face?.setState('listening')}
        >
          Listening
        </button>
        <button
          aria-pressed={status.state === 'speaking'}
          disabled={busy}
          onClick={() => face?.setState('speaking')}
        >
          Speaking
        </button>
        <button
          aria-pressed={track}
          onClick={async () => {
            if (face?.isTracking()) { face.stopTracking(); setTrack(false); }
            else setTrack(await face?.startTracking());
          }}
        >
          {track ? (t?.trackOn ?? 'Sleduje') : (t?.track ?? 'Sledovat')}
        </button>
        <button
          aria-pressed={mic === true}
          onClick={async () => setMic(await face?.enableMic())}
        >
          {mic === null ? 'Use mic' : mic ? 'Mic on' : 'Mic blocked'}
        </button>

        {/* Odhlášení. Formulář se serverovou akcí, ne onClick — session
            je v cookies a zrušit ji musí server. */}
        <form action={signOut}>
          <button type="submit">{lang === 'cs' ? 'Odhlásit' : 'Sign out'}</button>
        </form>
      </div>
    </>
  );
}
