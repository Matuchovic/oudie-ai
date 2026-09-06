/* ------------------------------------------------------------------
   Agent roster

   This is not a list of labels. Each entry carries the capabilities the
   agent is allowed to use and the agents it may delegate to, so the same
   file drives BOTH the picture and, later, the orchestrator's routing.
   One source of truth: if the constellation shows an edge, a request can
   actually travel down it.

   Coordinates live in a 1600x900 viewBox with the core at (800, 400).
   Positions follow the reference layout — deliberately asymmetric, since
   an even ring reads as a template.
   ------------------------------------------------------------------ */

/* state:
     live   — configured and answering
     busy   — currently handling a request (gold in the UI)
     off    — not configured yet (dashed and dim)
   The backend flips these at runtime; the values here are the defaults
   for a fresh install where nothing is connected. */

export const AGENTS = [
  {
    id: 'chief',
    x: 585, y: 385, side: 'left', state: 'live',
    cs: { name: 'Vedoucí kanceláře', role: 'Rozhodne, kdo úkol převezme, a hlídá, že se dotáhl.' },
    en: { name: 'Chief of staff', role: 'Decides who takes a task and makes sure it lands.' },
    can: ['route', 'summarise', 'follow-up'],
    to: ['strategist', 'research', 'finance', 'ops', 'editor', 'memory'],
  },
  {
    id: 'strategist',
    x: 690, y: 240, side: 'left', state: 'live',
    cs: { name: 'Stratég', role: 'Rozebere rozhodnutí na varianty a řekne, co každá stojí.' },
    en: { name: 'Strategist', role: 'Breaks a decision into options and prices each one.' },
    can: ['compare', 'forecast', 'risk'],
    to: ['research', 'finance', 'analytics'],
  },
  {
    id: 'research',
    x: 505, y: 300, side: 'left', state: 'live',
    cs: { name: 'Rešeršista', role: 'Dohledá podklady a označí, čemu se dá věřit.' },
    en: { name: 'Researcher', role: 'Finds the sources and flags which ones hold up.' },
    can: ['web-search', 'read-doc', 'cite'],
    to: ['editor', 'memory'],
  },
  {
    id: 'finance',
    x: 1010, y: 305, side: 'right', state: 'live',
    cs: { name: 'Finance', role: 'Hlídá faktury, splatnosti a co z toho zbyde.' },
    en: { name: 'Finance', role: 'Tracks invoices, due dates and what is left over.' },
    can: ['invoice', 'cashflow', 'due-dates'],
    to: ['analytics', 'crm'],
  },
  {
    id: 'editor',
    x: 1300, y: 395, side: 'right', state: 'live',
    cs: { name: 'Editor', role: 'Přepíše text tak, aby ho šlo poslat ven.' },
    en: { name: 'Editor', role: 'Rewrites text until it can go out the door.' },
    can: ['draft', 'rewrite', 'tone'],
    to: ['memory'],
  },
  {
    id: 'memory',
    x: 1075, y: 470, side: 'right', state: 'live',
    cs: { name: 'Paměť', role: 'Pamatuje si, co jsme řešili minule, a vytáhne to včas.' },
    en: { name: 'Memory', role: 'Remembers earlier decisions and surfaces them in time.' },
    can: ['recall', 'store', 'link'],
    to: [],
  },
  {
    id: 'sales',
    x: 470, y: 490, side: 'left', state: 'busy',
    cs: { name: 'Obchod', role: 'Sleduje rozjednané zakázky a připomene, kdo se dlouho neozval.' },
    en: { name: 'Sales', role: 'Watches open deals and flags who has gone quiet.' },
    can: ['pipeline', 'nudge', 'quote'],
    to: ['crm', 'editor'],
  },
  {
    id: 'marketing',
    x: 520, y: 545, side: 'left', state: 'busy',
    cs: { name: 'Marketing', role: 'Plánuje, co kdy vyjde ven a komu to má dojít.' },
    en: { name: 'Marketing', role: 'Plans what goes out when, and who should see it.' },
    can: ['campaign', 'copy', 'schedule'],
    to: ['social', 'design', 'editor'],
  },
  {
    id: 'ops',
    x: 600, y: 578, side: 'left', state: 'busy',
    cs: { name: 'Provoz', role: 'Drží přehled o směnách, lidech a tom, co hoří.' },
    en: { name: 'Ops', role: 'Keeps shifts, people and whatever is on fire in view.' },
    can: ['shifts', 'incidents', 'roster'],
    to: ['engineering', 'calendar'],
  },
  {
    id: 'social',
    x: 795, y: 615, side: 'left', state: 'live',
    cs: { name: 'Sociální sítě', role: 'Publikuje a hlásí, na co lidi reagují.' },
    en: { name: 'Social', role: 'Publishes, and reports what people actually react to.' },
    can: ['post', 'engagement'],
    to: ['analytics'],
  },
  {
    id: 'engineering',
    x: 1000, y: 590, side: 'right', state: 'busy',
    cs: { name: 'Inženýrství', role: 'Řeší, co je technicky únosné a co se rozbije.' },
    en: { name: 'Engineering', role: 'Works out what is buildable and what will break.' },
    can: ['spec', 'estimate', 'review'],
    to: ['developer'],
  },
  {
    id: 'design',
    x: 1150, y: 545, side: 'right', state: 'busy',
    cs: { name: 'Design', role: 'Navrhne, jak to má vypadat a proč zrovna takhle.' },
    en: { name: 'Design', role: 'Proposes how it should look, and argues for why.' },
    can: ['layout', 'brand', 'mockup'],
    to: [],
  },
  {
    id: 'developer',
    x: 365, y: 605, side: 'left', state: 'off',
    cs: { name: 'Vývojář', role: 'Píše a nasazuje kód. Zatím nenapojeno.' },
    en: { name: 'Developer', role: 'Writes and ships code. Not connected yet.' },
    can: ['code', 'deploy', 'test'],
    to: [],
  },
  {
    id: 'analytics',
    x: 655, y: 640, side: 'left', state: 'off',
    cs: { name: 'Analytika', role: 'Počítá čísla a hledá, kde se něco láme. Zatím nenapojeno.' },
    en: { name: 'Analytics', role: 'Crunches numbers and finds where things bend. Not connected yet.' },
    can: ['report', 'trend', 'anomaly'],
    to: [],
  },
  {
    id: 'crm',
    x: 915, y: 655, side: 'right', state: 'live',
    cs: { name: 'CRM', role: 'Ví, kdo je kdo a kdy jsme spolu naposled mluvili.' },
    en: { name: 'CRM', role: 'Knows who is who and when you last spoke.' },
    can: ['contacts', 'history'],
    to: [],
  },
  {
    id: 'calendar',
    x: 1250, y: 590, side: 'right', state: 'live',
    cs: { name: 'Kalendář', role: 'Vidí do diáře a najde, kdy máte oba čas.' },
    en: { name: 'Calendar', role: 'Reads the diary and finds when you are both free.' },
    can: ['read-events', 'find-slot', 'create-event'],
    to: [],
  },
  {
    id: 'email',
    x: 1345, y: 520, side: 'right', state: 'off',
    cs: { name: 'Pošta', role: 'Třídí příchozí a upozorní na to, co nepočká. Zatím nenapojeno.' },
    en: { name: 'Email', role: 'Triages the inbox and flags what will not wait. Not connected yet.' },
    can: ['read-inbox', 'draft-reply'],
    to: ['editor'],
  },
  {
    id: 'drive',
    x: 1290, y: 245, side: 'right', state: 'off',
    cs: { name: 'Úložiště', role: 'Hledá v dokumentech a zakládá nové. Zatím nenapojeno.' },
    en: { name: 'Drive', role: 'Searches your documents and files new ones. Not connected yet.' },
    can: ['search-files', 'read-file'],
    to: ['research'],
  },
];

export const CORE = { x: 800, y: 400, r: 148 };
export const VIEWBOX = { w: 1600, h: 900 };

/* Lookup by id, built once. The orchestrator will hit this on every turn. */
export const BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

/* Every delegation edge, deduplicated. An agent may only hand work to
   somebody it has an edge to — the drawing and the permission are the
   same data, so they cannot drift apart. */
export function edges() {
  const seen = new Set();
  const out = [];
  for (const a of AGENTS) {
    for (const t of a.to) {
      const key = [a.id, t].sort().join('>');
      if (seen.has(key) || !BY_ID[t]) continue;
      seen.add(key);
      out.push({ from: a.id, to: t });
    }
  }
  return out;
}

export function canDelegate(fromId, toId) {
  const a = BY_ID[fromId];
  return !!a && a.to.includes(toId) && BY_ID[toId]?.state !== 'off';
}
