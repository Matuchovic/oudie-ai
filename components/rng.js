/* Deterministic 32-bit PRNG. Shared, because the standalone build inlines
   every module into one scope and two copies of the same top-level
   function is a hard SyntaxError there — which silently killed the whole
   bundle once already. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
