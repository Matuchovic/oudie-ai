'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createHumanoid } from './humanoid/runtime.js';

/* Thin wrapper. All the work lives in runtime.js, which the standalone
   preview mounts too — so what you see in dist/apex-humanoid.html is
   what you get here, byte for byte. */
export default function HumanoidView({ onReady }) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const [label, setLabel] = useState('ASSEMBLING… 0%');
  const [state, setState] = useState('assembling');
  const [mic, setMic] = useState(null);
  const [diag, setDiag] = useState(null);
  const [safe, setSafe] = useState(false);

  useEffect(() => {
    const api = createHumanoid(THREE, canvasRef.current, {
      onStatus: (s) => {
        setLabel(s.label);
        setState(s.state);
      },
    });
    apiRef.current = api;
    onReady?.(api);
    // Poll rather than push: cheap, and it keeps the render loop allocation-free.
    const t = setInterval(() => setDiag(api.diagnostics()), 500);
    return () => {
      clearInterval(t);
      api.dispose();
    };
  }, [onReady]);

  const busy = state === 'assembling';

  return (
    <div className="stage">
      <canvas ref={canvasRef} />
      <div className="status">{label}</div>

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
        <button onClick={() => apiRef.current?.replay()}>Replay</button>
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
          aria-pressed={safe}
          onClick={() => {
            const next = !safe;
            setSafe(next);
            apiRef.current?.setSafeMode(next);
          }}
        >
          No bloom
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
