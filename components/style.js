/* Shared stylesheet injection. Each caller passes an id so its block is
   added exactly once, and — because the standalone build inlines every
   module into one scope — no two modules need their own `CSS` constant or
   `injectCSS` helper. Two of those collided and the build refused to ship. */
const done = new Set();

export function injectOnce(id, css) {
  if (typeof document === 'undefined' || done.has(id)) return;
  const el = document.createElement('style');
  el.setAttribute('data-oudie', id);
  el.textContent = css;
  document.head.appendChild(el);
  done.add(id);
}
