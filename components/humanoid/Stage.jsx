'use client';

/* ------------------------------------------------------------------
   Stage

   Tohle je celý důvod, proč routy nerozbily humanoida.

   Canvas žije v layoutu, ne ve stránce. Next App Router při přechodu
   mezi /boot, /login a / layout neodmontuje — přepíše jen children.
   Kdyby byl canvas ve stránce, každá navigace by zlikvidovala WebGL
   kontext, znovu postavila 57 tisíc částic a spustila sestavování od
   nuly. Takhle se figura nikdy nepřeruší.

   Stránky si runtime berou přes useHumanoid(). Nedrží si na něj
   vlastní odkaz a nesmí ho odklízet — patří layoutu.
   ------------------------------------------------------------------ */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createHumanoid } from './runtime.js';
import { createI18n } from '../i18n.js';

const Ctx = createContext(null);

export function useHumanoid() {
  return useContext(Ctx);
}

export default function Stage({ children }) {
  const canvasRef = useRef(null);
  const skyRef = useRef(null);
  const flashRef = useRef(null);
  const faceRef = useRef(null);
  const i18nRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState({ state: 'assembling', label: 'ASSEMBLING… 0%' });

  useEffect(() => {
    const face = createHumanoid(THREE, canvasRef.current, {
      onStatus: (s) => setStatus({ state: s.state, label: s.label }),
    });
    faceRef.current = face;
    i18nRef.current = createI18n('cs');
    setReady(true);

    return () => {
      face.dispose();
      faceRef.current = null;
    };
  }, []);

  const value = {
    ready,
    status,
    get face() { return faceRef.current; },
    get i18n() { return i18nRef.current; },
    skyRef,
    flashRef,
  };

  return (
    <Ctx.Provider value={value}>
      <div className="stage">
        <canvas ref={canvasRef} />
        <div className="sky" ref={skyRef} />
        <div className="flash" ref={flashRef} />
      </div>
      {children}
    </Ctx.Provider>
  );
}
