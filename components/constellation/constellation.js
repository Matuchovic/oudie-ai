/* ------------------------------------------------------------------
   Constellation

   SVG rather than WebGL: labels stay crisp, nodes are real hit targets
   with real focus rings, and it needs no second renderer.

   Everything is generated from roster.js — including the portrait layout.
   A 16:9 board letterboxes into an unreadable strip on a phone, so the
   scene is rebuilt against portrait coordinates whenever the aspect ratio
   crosses over. Rebuilding rather than transforming keeps label sides,
   card placement and hit areas correct in both modes.
   ------------------------------------------------------------------ */

import { AGENTS, BY_ID, edges, layoutFor } from './roster.js';
import { mulberry32 } from '../rng.js';
import { injectOnce } from '../style.js';

const NS = 'http://www.w3.org/2000/svg';
const COLOR = { live: '#38bdf8', busy: '#f5b83d', off: '#5b7fa6' };

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

const CONSTELLATION_CSS = `
.cn-root{position:fixed;inset:0;opacity:0;pointer-events:none;transition:opacity .45s ease}
.cn-root.cn-on{opacity:1;pointer-events:auto}
.cn-root svg{width:100%;height:100%;display:block}

.cn-flow path{fill:none;stroke:#2f8fd0;stroke-width:1.4}
.cn-trace{fill:none;stroke:#2f8fd0;stroke-width:1.1}
.cn-trace-dot{fill:#4fc3f7;opacity:.75}
.cn-link{fill:none;stroke:#38bdf8;stroke-width:1;opacity:.16;
  transition:opacity .3s ease,stroke-width .3s ease,stroke .3s ease}
.cn-link.cn-lit{opacity:.85;stroke-width:2;stroke:#8fe0ff}
.cn-link.cn-link-off{stroke-dasharray:5 7;opacity:.09}

.cn-pulse{fill:#9fe8ff;offset-rotate:0deg;animation:cn-run 4.2s linear infinite;pointer-events:none}
.cn-pulse.cn-gold{fill:#ffd479}
@keyframes cn-run{from{offset-distance:0%;opacity:0}8%{opacity:.95}88%{opacity:.95}to{offset-distance:100%;opacity:0}}

.cn-ring{fill:none;stroke:#f0c34a;stroke-width:5}
.cn-ring-soft{fill:none;stroke:#f0c34a;stroke-width:13;opacity:.16}
.cn-tick{stroke:#f0c34a;stroke-width:2.4;opacity:.8}
.cn-ticks{transform-box:fill-box;transform-origin:center;animation:cn-spin 90s linear infinite}
.cn-core-dot{fill:#7fdcff;animation:cn-twinkle 2.6s ease-in-out infinite}

.cn-node{cursor:pointer;transition:opacity .3s ease}
.cn-node circle.cn-hit{fill:transparent}
.cn-node .cn-ring2{fill:#0a1420;stroke-width:2.6}
.cn-node .cn-halo{fill:none;stroke-width:9;opacity:.14}
.cn-root.cn-portrait .cn-node text{font-size:25px}
.cn-node text{font:500 21px ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  fill:#eaf6ff;letter-spacing:.01em}
.cn-node.cn-off text{fill:#7fa6c4;font-size:19px}
.cn-node.cn-off .cn-ring2{stroke-dasharray:4 5;transform-box:fill-box;
  transform-origin:center;animation:cn-spin 14s linear infinite}
.cn-node:focus{outline:none}
.cn-node:focus-visible .cn-halo{opacity:.5}
.cn-node:hover .cn-halo{opacity:.34}
.cn-node.cn-sel .cn-halo{opacity:.55}
.cn-node.cn-busy .cn-halo{animation:cn-pulse 2.1s ease-in-out infinite}

/* Selecting an agent dims everything it cannot reach, so the picture
   answers "who can this one hand work to" without a legend. */
.cn-root.cn-focus .cn-node{opacity:.22}
.cn-root.cn-focus .cn-node.cn-near{opacity:1}
.cn-root.cn-focus .cn-pulse{opacity:0!important;animation:none}

@keyframes cn-spin{to{transform:rotate(360deg)}}
@keyframes cn-pulse{0%,100%{opacity:.16}50%{opacity:.42}}
@keyframes cn-twinkle{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes cn-arrive{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:none}}
.cn-root.cn-on .cn-node{transform-box:fill-box;transform-origin:center;
  animation:cn-arrive .7s cubic-bezier(.16,1,.3,1) backwards}

.cn-card{position:fixed;width:360px;z-index:60;visibility:hidden;
  font:400 15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  background:rgba(8,17,30,.96);border:1px solid rgba(56,189,248,.28);
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
  background:transparent;color:#9fd0ea;font:inherit;font-size:14px;
  min-height:44px;padding:8px 18px;border-radius:999px;cursor:pointer}
.cn-card button:hover{color:#fff;border-color:rgba(56,189,248,.6)}

/* On a phone the card becomes a sheet: full width, pinned above the bar,
   instead of floating half off-screen beside a node near the edge. */
.cn-card.cn-sheet{left:10px;right:10px;width:auto;top:auto;
  bottom:calc(env(safe-area-inset-bottom, 0px) + 96px);
  max-height:54vh;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:18px}

@media (prefers-reduced-motion:reduce){
  .cn-node.cn-off .cn-ring2,.cn-node.cn-busy .cn-halo,.cn-core-dot,
  .cn-pulse,.cn-ticks,.cn-root.cn-on .cn-node{animation:none}
  .cn-pulse{display:none}
}
`;


export function createConstellation(container, opts = {}) {
  injectOnce('constellation', CONSTELLATION_CSS);
  const i18n = opts.i18n;
  const onSelect = opts.onSelect ?? (() => {});

  const root = document.createElement('div');
  root.className = 'cn-root';
  container.appendChild(root);

  const card = document.createElement('div');
  card.className = 'cn-card';
  card.setAttribute('role', 'dialog');
  document.body.appendChild(card);

  let svg = null;
  let L = null;
  let gLink = null;
  let nodeEls = new Map();
  let selected = null;

  function aspect() {
    const w = root.clientWidth || window.innerWidth || 1;
    const h = root.clientHeight || window.innerHeight || 1;
    return w / h;
  }

  function build() {
    L = layoutFor(aspect());
    root.classList.toggle('cn-portrait', L.portrait);
    const rand = mulberry32(20260906);
    const { core, box } = L;

    if (svg) svg.remove();
    nodeEls = new Map();

    svg = el('svg', {
      viewBox: `0 0 ${box.w} ${box.h}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'group',
    }, root);

    const gFlow = el('g', { class: 'cn-flow' }, svg);
    const gTrace = el('g', { class: 'cn-traces' }, svg);
    gLink = el('g', { class: 'cn-links' }, svg);
    const gPulse = el('g', { class: 'cn-pulses' }, svg);
    const gCore = el('g', { class: 'cn-core' }, svg);
    const gNodes = el('g', { class: 'cn-nodes' }, svg);

    /* Traffic rides real delegation edges, so what moves is the graph the
       orchestrator will route through. CSS Motion Path composites on the
       GPU, so ~70 dots cost nothing and need no rAF loop. */
    function traffic(d, count, gold) {
      for (let i = 0; i < count; i++) {
        el('circle', {
          class: `cn-pulse${gold ? ' cn-gold' : ''}`,
          r: gold ? 3.4 : 2.6, cx: 0, cy: 0,
          style: `offset-path:path('${d}');animation-duration:${(3.2 + rand() * 3).toFixed(2)}s;` +
                 `animation-delay:-${(rand() * 6).toFixed(2)}s`,
        }, gPulse);
      }
    }

    for (let i = 0; i < 16; i++) {
      const y0 = box.h * 0.12 + rand() * box.h * 0.76;
      const y1 = box.h * 0.12 + rand() * box.h * 0.76;
      const bow = (rand() - 0.5) * box.h * 0.7;
      el('path', {
        d: `M -60 ${y0} C ${box.w * 0.3} ${y0 + bow}, ${box.w * 0.7} ${y1 - bow}, ${box.w + 60} ${y1}`,
        style: `opacity:${(0.10 + rand() * 0.16).toFixed(2)}`,
      }, gFlow);
    }

    for (const a of AGENTS) {
      const p = L.pos(a);
      const dir = p.x < box.w / 2 ? -1 : 1;
      const midX = p.x + dir * box.w * (0.05 + rand() * 0.08);
      const dropY = p.y + (rand() - 0.5) * box.h * 0.16;
      el('path', {
        class: 'cn-trace',
        d: `M ${p.x} ${p.y} H ${midX} V ${dropY} H ${dir < 0 ? -40 : box.w + 40}`,
        style: `opacity:${(0.18 + rand() * 0.3).toFixed(2)}`,
      }, gTrace);
      el('circle', { class: 'cn-trace-dot', cx: midX, cy: dropY, r: 4.5 }, gTrace);
    }

    for (const e of edges()) {
      const A = L.pos(BY_ID[e.from]);
      const B = L.pos(BY_ID[e.to]);
      const dead = BY_ID[e.from].state === 'off' || BY_ID[e.to].state === 'off';
      const d = `M ${A.x} ${A.y} Q ${(A.x + B.x) / 2} ${(A.y + B.y) / 2 + (rand() - 0.5) * 70} ${B.x} ${B.y}`;
      el('path', { class: `cn-link${dead ? ' cn-link-off' : ''}`, d,
                   'data-a': e.from, 'data-b': e.to }, gLink);
      if (!dead) traffic(d, 1, BY_ID[e.from].state === 'busy');
    }

    for (const a of AGENTS) {
      const p = L.pos(a);
      const d = `M ${p.x} ${p.y} Q ${(p.x + core.x) / 2} ${(p.y + core.y) / 2 + (rand() - 0.5) * 90} ${core.x} ${core.y}`;
      el('path', { class: `cn-link${a.state === 'off' ? ' cn-link-off' : ''}`, d,
                   'data-a': a.id, 'data-b': '@core' }, gLink);
      if (a.state !== 'off') traffic(d, a.state === 'busy' ? 3 : 2, a.state === 'busy');
    }

    el('circle', { class: 'cn-ring-soft', cx: core.x, cy: core.y, r: core.r }, gCore);
    el('circle', { class: 'cn-ring', cx: core.x, cy: core.y, r: core.r }, gCore);
    const gTicks = el('g', { class: 'cn-ticks' }, gCore);
    for (let i = 0; i < 48; i++) {
      const th = (i / 48) * Math.PI * 2;
      const r0 = core.r + 4;
      const r1 = core.r + (i % 4 === 0 ? 15 : 9);
      el('line', { class: 'cn-tick',
        x1: core.x + Math.cos(th) * r0, y1: core.y + Math.sin(th) * r0,
        x2: core.x + Math.cos(th) * r1, y2: core.y + Math.sin(th) * r1 }, gTicks);
    }
    for (let i = 0; i < 420; i++) {
      const th = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * (core.r - 12);
      el('circle', { class: 'cn-core-dot',
        cx: core.x + Math.cos(th) * rr, cy: core.y + Math.sin(th) * rr,
        r: 0.9 + rand() * 1.7,
        style: `animation-delay:${(rand() * 2.6).toFixed(2)}s;opacity:${(0.3 + rand() * 0.7).toFixed(2)}`,
      }, gCore);
    }

    for (const a of AGENTS) {
      const p = L.pos(a);
      const c = COLOR[a.state];
      const g = el('g', { class: `cn-node cn-${a.state}`, tabindex: '0',
                          role: 'button', 'data-id': a.id }, gNodes);
      el('circle', { class: 'cn-halo', cx: p.x, cy: p.y, r: 15, stroke: c }, g);
      el('circle', { class: 'cn-ring2', cx: p.x, cy: p.y, r: 10, stroke: c }, g);
      // Portrait puts labels under the node. Beside it they either run
      // across the core or off the edge — there is no horizontal room on a
      // phone once the viewBox is scaled down.
      const label = el('text', L.portrait
        ? { x: p.x, y: p.y + 38, 'text-anchor': 'middle' }
        : { x: p.side === 'left' ? p.x - 24 : p.x + 24, y: p.y + 7,
            'text-anchor': p.side === 'left' ? 'end' : 'start' }, g);
      // Bigger hit radius in portrait: the viewBox is scaled well down on a
      // phone, and a 30-unit target ends up smaller than a fingertip.
      el('circle', { class: 'cn-hit', cx: p.x, cy: p.y, r: L.portrait ? 46 : 30 }, g);

      const dist = Math.hypot(p.x - core.x, p.y - core.y);
      g.style.animationDelay = `${(0.12 + dist / 2600).toFixed(3)}s`;

      const paint = () => { label.textContent = a[i18n.lang].name; };
      paint();
      nodeEls.set(a.id, { g, paint, agent: a, p });

      const open = () => select(a.id);
      g.addEventListener('click', open);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }

    svg.addEventListener('click', (e) => {
      if (!e.target.closest('.cn-node')) closeCard();
    });
  }

  function lightSubgraph(id) {
    root.classList.add('cn-focus');
    const reach = new Set([id, ...(BY_ID[id]?.to ?? [])]);
    for (const a of AGENTS) if (a.to.includes(id)) reach.add(a.id);
    nodeEls.forEach((r, k) => r.g.classList.toggle('cn-near', reach.has(k)));
    gLink.querySelectorAll('.cn-link').forEach((p) => {
      p.classList.toggle('cn-lit',
        p.getAttribute('data-a') === id || p.getAttribute('data-b') === id);
    });
  }

  function closeCard() {
    root.classList.remove('cn-focus');
    nodeEls.forEach((r) => r.g.classList.remove('cn-near'));
    if (gLink) gLink.querySelectorAll('.cn-lit').forEach((p) => p.classList.remove('cn-lit'));
    card.classList.remove('cn-card-on');
    if (selected) nodeEls.get(selected)?.g.classList.remove('cn-sel');
    selected = null;
  }

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
      ${hands.length ? `<div class="cn-lab">${t.handsOffTo}</div><div>${hands
        .map((n) => `<span class="cn-chip">${n}</span>`).join('')}</div>` : ''}
      <button type="button">${t.close}</button>
    `;
    card.querySelector('button').addEventListener('click', closeCard);
    card.classList.toggle('cn-sheet', L.portrait);
    card.classList.add('cn-card-on');

    if (L.portrait) {
      card.style.left = '';
      card.style.top = '';
    } else {
      const pt = toScreen(rec.p.x, rec.p.y);
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      card.style.left = `${Math.round(Math.max(16, Math.min(window.innerWidth - w - 16,
        rec.p.side === 'left' ? pt.x + 46 : pt.x - w - 46)))}px`;
      card.style.top = `${Math.round(Math.max(16, Math.min(window.innerHeight - h - 100, pt.y - 60)))}px`;
    }

    onSelect(a);
  }

  build();

  // Rebuild only when the orientation actually flips. Every other resize is
  // handled by the viewBox, and rebuilding on each one would restart the
  // entrance animation on every browser-chrome nudge.
  let portrait = L.portrait;
  const ro = new ResizeObserver(() => {
    const next = layoutFor(aspect()).portrait;
    if (next === portrait) return;
    portrait = next;
    const keep = selected;
    closeCard();
    build();
    if (keep) select(keep);
  });
  ro.observe(root);

  const stopI18n = i18n.onChange(() => {
    nodeEls.forEach((r) => r.paint());
    if (selected) { const id = selected; closeCard(); select(id); }
  });

  return {
    show() { root.classList.add('cn-on'); },
    hide() { closeCard(); root.classList.remove('cn-on'); },
    select,
    closeCard,
    isPortrait: () => L.portrait,
    /* The backend flips agent state as work moves through the graph. */
    setState(id, state) {
      const rec = nodeEls.get(id);
      if (!rec || !COLOR[state]) return;
      rec.agent.state = state;
      rec.g.setAttribute('class', `cn-node cn-${state}`);
      rec.g.querySelector('.cn-halo').setAttribute('stroke', COLOR[state]);
      rec.g.querySelector('.cn-ring2').setAttribute('stroke', COLOR[state]);
    },
    dispose() { stopI18n(); ro.disconnect(); card.remove(); root.remove(); },
  };
}
