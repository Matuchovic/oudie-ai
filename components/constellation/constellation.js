/* ------------------------------------------------------------------
   Constellation

   SVG rather than WebGL, on purpose: the labels stay crisp at any zoom,
   the nodes are real hit targets with real focus rings, and it needs no
   second renderer alongside the humanoid's.

   Everything is generated from roster.js. Adding an agent there makes it
   appear here, wired to whatever it delegates to.
   ------------------------------------------------------------------ */

import { AGENTS, BY_ID, CORE, VIEWBOX, edges } from './roster.js';
import { mulberry32 } from '../rng.js';

const NS = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';

const COLOR = {
  live: '#38bdf8',
  busy: '#f5b83d',
  off: '#5b7fa6',
};

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}


const CSS = `
.cn-root{position:fixed;inset:0;opacity:0;pointer-events:none;transition:opacity .45s ease}
.cn-root.cn-on{opacity:1;pointer-events:auto}
.cn-root svg{width:100%;height:100%;display:block}

.cn-flow path{fill:none;stroke:#2f8fd0;stroke-width:1.4;opacity:.20}
.cn-trace{fill:none;stroke:#2f8fd0;stroke-width:1.1;opacity:.34}
.cn-trace-dot{fill:#4fc3f7;opacity:.75}
.cn-link{fill:none;stroke:#38bdf8;stroke-width:1;opacity:.16;
  transition:opacity .3s ease,stroke-width .3s ease,stroke .3s ease}
.cn-link.cn-lit{opacity:.85;stroke-width:2;stroke:#8fe0ff}

/* Traffic. Each dot rides an actual delegation edge, so what you see
   moving is the same graph the orchestrator routes through. */
.cn-pulse{fill:#9fe8ff;offset-rotate:0deg;
  animation:cn-run 4.2s linear infinite;pointer-events:none}
.cn-pulse.cn-gold{fill:#ffd479}
@keyframes cn-run{from{offset-distance:0%;opacity:0}
  8%{opacity:.95}88%{opacity:.95}to{offset-distance:100%;opacity:0}}
.cn-link.cn-link-off{stroke-dasharray:5 7;opacity:.09}

.cn-ring{fill:none;stroke:#f0c34a;stroke-width:5}
.cn-ticks{transform-box:fill-box;transform-origin:center;animation:cn-spin 90s linear infinite}
.cn-ring-soft{fill:none;stroke:#f0c34a;stroke-width:13;opacity:.16}
.cn-tick{stroke:#f0c34a;stroke-width:2.4;opacity:.8}
.cn-core-dot{fill:#7fdcff}

.cn-node{cursor:pointer;transition:opacity .3s ease}
/* Selecting an agent dims everything it cannot reach. The picture then
   answers "who can this one hand work to" without a legend. */
.cn-root.cn-focus .cn-node{opacity:.22}
.cn-root.cn-focus .cn-node.cn-near{opacity:1}
.cn-root.cn-focus .cn-pulse{opacity:0!important;animation:none}

@keyframes cn-arrive{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:none}}
.cn-root.cn-on .cn-node{transform-box:fill-box;transform-origin:center;
  animation:cn-arrive .7s cubic-bezier(.16,1,.3,1) backwards}
.cn-node circle.cn-hit{fill:transparent}
.cn-node .cn-ring2{fill:#0a1420;stroke-width:2.6}
.cn-node .cn-halo{fill:none;stroke-width:9;opacity:.14}
.cn-node text{font:500 21px ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  fill:#eaf6ff;paint-order:stroke;letter-spacing:.01em}
.cn-node.cn-off text{fill:#7fa6c4;font-size:19px}
.cn-node.cn-off .cn-ring2{stroke-dasharray:4 5}
.cn-node:focus{outline:none}
.cn-node:focus-visible .cn-halo{opacity:.5}
.cn-node:hover .cn-halo{opacity:.34}
.cn-node.cn-sel .cn-halo{opacity:.55}

@keyframes cn-spin{to{transform:rotate(360deg)}}
@keyframes cn-pulse{0%,100%{opacity:.16}50%{opacity:.42}}
@keyframes cn-twinkle{0%,100%{opacity:.35}50%{opacity:1}}
.cn-node.cn-off .cn-ring2{transform-box:fill-box;transform-origin:center;animation:cn-spin 14s linear infinite}
.cn-node.cn-busy .cn-halo{animation:cn-pulse 2.1s ease-in-out infinite}
.cn-core-dot{animation:cn-twinkle 2.6s ease-in-out infinite}

.cn-card{position:fixed;width:360px;z-index:60;visibility:hidden;
  font:400 15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  background:rgba(8,17,30,.94);border:1px solid rgba(56,189,248,.28);
  border-radius:14px;padding:18px 20px;color:#d9ecfa;
  box-shadow:0 18px 50px rgba(0,0,0,.55)}
.cn-card.cn-card-on{visibility:visible}
.cn-card h3{margin:0 0 2px;font-size:19px;font-weight:600;color:#fff}
.cn-card .cn-state{font:600 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
.cn-card p{margin:10px 0 0;color:#a9c6dd}
.cn-card .cn-lab{margin:14px 0 5px;font:600 10px ui-monospace,monospace;
  letter-spacing:.16em;text-transform:uppercase;color:#5f86a5}
.cn-chip{display:inline-block;margin:0 5px 5px 0;padding:3px 9px;border-radius:999px;
  font:500 12px ui-monospace,monospace;background:rgba(56,189,248,.11);
  border:1px solid rgba(56,189,248,.22);color:#8fd4f5}
.cn-card button{margin-top:14px;appearance:none;border:1px solid rgba(56,189,248,.3);
  background:transparent;color:#9fd0ea;font:inherit;font-size:13px;
  padding:6px 14px;border-radius:999px;cursor:pointer}
.cn-card button:hover{color:#fff;border-color:rgba(56,189,248,.6)}

@media (prefers-reduced-motion:reduce){
  .cn-node.cn-off .cn-ring2,.cn-node.cn-busy .cn-halo,.cn-core-dot,
  .cn-pulse,.cn-ticks,.cn-root.cn-on .cn-node{animation:none}
  .cn-pulse{display:none}
}
`;

let cssDone = false;
function injectCSS() {
  if (cssDone || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  cssDone = true;
}

export function createConstellation(container, opts = {}) {
  injectCSS();
  const i18n = opts.i18n;
  const onSelect = opts.onSelect ?? (() => {});
  const rand = mulberry32(20260906);

  const root = document.createElement('div');
  root.className = 'cn-root';
  container.appendChild(root);

  const svg = el('svg', {
    viewBox: `0 0 ${VIEWBOX.w} ${VIEWBOX.h}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
  }, root);

  const gFlow = el('g', { class: 'cn-flow' }, svg);
  const gTrace = el('g', { class: 'cn-traces' }, svg);
  const gLink = el('g', { class: 'cn-links' }, svg);
  const gCore = el('g', { class: 'cn-core' }, svg);
  const gNodes = el('g', { class: 'cn-nodes' }, svg);

  /* --- flow curves ------------------------------------------------
     Long beziers sweeping the full canvas behind everything. They carry
     no meaning; they are the depth the scene would otherwise lack. */
  for (let i = 0; i < 16; i++) {
    const y0 = 120 + rand() * 700;
    const y1 = 120 + rand() * 700;
    const bow = (rand() - 0.5) * 620;
    el('path', {
      d: `M -60 ${y0} C ${VIEWBOX.w * 0.3} ${y0 + bow}, ${VIEWBOX.w * 0.7} ${y1 - bow}, ${VIEWBOX.w + 60} ${y1}`,
      style: `opacity:${(0.10 + rand() * 0.16).toFixed(2)}`,
    }, gFlow);
  }

  /* --- PCB traces --------------------------------------------------
     Right-angle runs from each node out to the frame, ending in a dot.
     Orthogonal on purpose: it reads as a board, not as more curves. */
  for (const a of AGENTS) {
    const dir = a.side === 'left' ? -1 : 1;
    const step = 90 + rand() * 130;
    const drop = (rand() - 0.5) * 150;
    const endX = dir < 0 ? -40 : VIEWBOX.w + 40;
    const midX = a.x + dir * step;
    el('path', {
      class: 'cn-trace',
      d: `M ${a.x} ${a.y} H ${midX} V ${a.y + drop} H ${endX}`,
      style: `opacity:${(0.18 + rand() * 0.3).toFixed(2)}`,
    }, gTrace);
    el('circle', { class: 'cn-trace-dot', cx: midX, cy: a.y + drop, r: 4.5 }, gTrace);
  }

  const gPulse = el('g', { class: 'cn-pulses' }, svg);

  /* CSS Motion Path rather than SMIL: it composites on the GPU and does
     not need a rAF loop, so 70 dots cost essentially nothing. */
  function traffic(d, count, gold) {
    for (let i = 0; i < count; i++) {
      el('circle', {
        class: `cn-pulse${gold ? ' cn-gold' : ''}`,
        r: gold ? 3.4 : 2.6,
        cx: 0, cy: 0,
        style: `offset-path:path('${d}');animation-duration:${(3.2 + rand() * 3).toFixed(2)}s;animation-delay:-${(rand() * 6).toFixed(2)}s`,
      }, gPulse);
    }
  }

  /* --- delegation links -------------------------------------------
     Every edge in the roster, drawn. If two agents are connected on
     screen, work can genuinely travel between them. */
  for (const e of edges()) {
    const A = BY_ID[e.from];
    const B = BY_ID[e.to];
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2 + (rand() - 0.5) * 70;
    const dead = A.state === 'off' || B.state === 'off';
    const d = `M ${A.x} ${A.y} Q ${mx} ${my} ${B.x} ${B.y}`;
    el('path', {
      class: `cn-link${dead ? ' cn-link-off' : ''}`,
      d, 'data-a': e.from, 'data-b': e.to,
    }, gLink);
    if (!dead) traffic(d, 1, A.state === 'busy');
  }
  for (const a of AGENTS) {
    const d = `M ${a.x} ${a.y} Q ${(a.x + CORE.x) / 2} ${(a.y + CORE.y) / 2 + (rand() - 0.5) * 90} ${CORE.x} ${CORE.y}`;
    el('path', {
      class: `cn-link${a.state === 'off' ? ' cn-link-off' : ''}`,
      d, 'data-a': a.id, 'data-b': '@core',
    }, gLink);
    // Busier agents send more. Idle ones still tick over so the graph
    // never looks frozen.
    if (a.state !== 'off') traffic(d, a.state === 'busy' ? 3 : 2, a.state === 'busy');
  }

  /* --- core -------------------------------------------------------- */
  el('circle', { class: 'cn-ring-soft', cx: CORE.x, cy: CORE.y, r: CORE.r }, gCore);
  el('circle', { class: 'cn-ring', cx: CORE.x, cy: CORE.y, r: CORE.r }, gCore);
  const gTicks = el('g', { class: 'cn-ticks' }, gCore);
  for (let i = 0; i < 48; i++) {
    const th = (i / 48) * Math.PI * 2;
    const r0 = CORE.r + 4;
    const r1 = CORE.r + (i % 4 === 0 ? 15 : 9);
    el('line', {
      class: 'cn-tick',
      x1: CORE.x + Math.cos(th) * r0, y1: CORE.y + Math.sin(th) * r0,
      x2: CORE.x + Math.cos(th) * r1, y2: CORE.y + Math.sin(th) * r1,
    }, gTicks);
  }
  for (let i = 0; i < 420; i++) {
    const th = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * (CORE.r - 12);
    el('circle', {
      class: 'cn-core-dot',
      cx: CORE.x + Math.cos(th) * rr,
      cy: CORE.y + Math.sin(th) * rr,
      r: 0.9 + rand() * 1.7,
      style: `animation-delay:${(rand() * 2.6).toFixed(2)}s;opacity:${(0.3 + rand() * 0.7).toFixed(2)}`,
    }, gCore);
  }

  /* --- nodes -------------------------------------------------------- */
  const nodeEls = new Map();
  let selected = null;

  for (const a of AGENTS) {
    const c = COLOR[a.state];
    const g = el('g', {
      class: `cn-node cn-${a.state}`,
      tabindex: '0',
      role: 'button',
      'data-id': a.id,
    }, gNodes);

    el('circle', { class: 'cn-halo', cx: a.x, cy: a.y, r: 15, stroke: c }, g);
    el('circle', { class: 'cn-ring2', cx: a.x, cy: a.y, r: 10, stroke: c }, g);
    const label = el('text', {
      x: a.side === 'left' ? a.x - 24 : a.x + 24,
      y: a.y + 7,
      'text-anchor': a.side === 'left' ? 'end' : 'start',
    }, g);
    el('circle', { class: 'cn-hit', cx: a.x, cy: a.y, r: 30 }, g);
    // Ordered by distance from the core: the graph grows outward.
    const dist = Math.hypot(a.x - CORE.x, a.y - CORE.y);
    g.style.animationDelay = `${(0.12 + dist / 2600).toFixed(3)}s`;

    const paint = () => { label.textContent = a[i18n.lang].name; };
    paint();
    nodeEls.set(a.id, { g, label, paint, agent: a });

    const open = () => select(a.id);
    g.addEventListener('click', open);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  /* --- info card ---------------------------------------------------
     Mounted on document.body, not inside the SVG's parent. foreignObject
     lays out and then declines to paint; an absolutely-positioned child of
     the SVG wrapper loses the stacking-context argument. Fixed position on
     the body has neither problem. */
  /* Built once and reused. Creating the element on click makes a fresh
     compositing layer that some renderers never composite in — the card
     was present, sized and styled, and still painted nothing. Toggling
     an existing node avoids that and stops the DOM churn besides. */
  const card = document.createElement('div');
  card.className = 'cn-card';
  card.setAttribute('role', 'dialog');
  document.body.appendChild(card);

  function lightSubgraph(id) {
    root.classList.add('cn-focus');
    const reach = new Set([id, ...(BY_ID[id]?.to ?? [])]);
    // Anyone who can hand work TO this agent counts as connected too.
    for (const a of AGENTS) if (a.to.includes(id)) reach.add(a.id);
    nodeEls.forEach((r, k) => r.g.classList.toggle('cn-near', reach.has(k)));
    gLink.querySelectorAll('.cn-link').forEach((p) => {
      const a = p.getAttribute('data-a');
      const b = p.getAttribute('data-b');
      p.classList.toggle('cn-lit', a === id || b === id);
    });
  }

  function clearSubgraph() {
    root.classList.remove('cn-focus');
    nodeEls.forEach((r) => r.g.classList.remove('cn-near'));
    gLink.querySelectorAll('.cn-lit').forEach((p) => p.classList.remove('cn-lit'));
  }

  function closeCard() {
    clearSubgraph();
    card.classList.remove('cn-card-on');
    if (selected) nodeEls.get(selected)?.g.classList.remove('cn-sel');
    selected = null;
  }

  // SVG user units -> viewport pixels, so the card can sit beside its node
  // wherever the viewBox happens to have been letterboxed.
  function toScreen(x, y) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = x; p.y = y;
    return p.matrixTransform(ctm);
  }

  function select(id) {
    if (selected === id) return closeCard();
    closeCard();
    const rec = nodeEls.get(id);
    if (!rec) return;
    selected = id;
    rec.g.classList.add('cn-sel');
    lightSubgraph(id);

    const a = rec.agent;
    const t = i18n.t;
    const stateLabel = { live: t.stateLive, busy: t.stateBusy, off: t.stateOff }[a.state];
    const hands = a.to.map((k) => BY_ID[k]?.[i18n.lang]?.name).filter(Boolean);

    card.innerHTML = `
      <h3>${a[i18n.lang].name}</h3>
      <div class="cn-state" style="color:${COLOR[a.state]}">${stateLabel}</div>
      <p>${a[i18n.lang].role}</p>
      <div class="cn-lab">${t.canDo}</div>
      <div>${a.can.map((k) => `<span class="cn-chip">${k}</span>`).join('')}</div>
      ${hands.length ? `<div class="cn-lab">${t.handsOffTo}</div><div>${hands.map((n) => `<span class="cn-chip">${n}</span>`).join('')}</div>` : ''}
      <button type="button">${t.close}</button>
    `;
    card.querySelector('button').addEventListener('click', closeCard);
    card.classList.add('cn-card-on');

    // Place beside the node, on the side away from its label, then clamp.
    const pt = toScreen(a.x, a.y);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let left = a.side === 'left' ? pt.x + 46 : pt.x - w - 46;
    let top = pt.y - 60;
    left = Math.max(16, Math.min(window.innerWidth - w - 16, left));
    top = Math.max(16, Math.min(window.innerHeight - h - 100, top));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;

    onSelect(a);
  }

  svg.addEventListener('click', (e) => {
    if (!e.target.closest('.cn-node')) closeCard();
  });

  const stopI18n = i18n.onChange(() => {
    nodeEls.forEach((r) => r.paint());
    if (selected) { const id = selected; closeCard(); select(id); }
  });

  return {
    show() { root.classList.add('cn-on'); },
    hide() { closeCard(); root.classList.remove('cn-on'); },
    select,
    closeCard,
    /* The backend flips agent state as work moves through the graph. */
    setState(id, state) {
      const rec = nodeEls.get(id);
      if (!rec || !COLOR[state]) return;
      rec.agent.state = state;
      rec.g.setAttribute('class', `cn-node cn-${state}`);
      rec.g.querySelector('.cn-halo').setAttribute('stroke', COLOR[state]);
      rec.g.querySelector('.cn-ring2').setAttribute('stroke', COLOR[state]);
    },
    dispose() { stopI18n(); card.remove(); root.remove(); },
  };
}
