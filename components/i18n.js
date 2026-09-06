/* ------------------------------------------------------------------
   Language

   Czech is the default. English is one toggle away, and — because the
   assistant is spoken to — also one sentence away: saying "mluv anglicky"
   or "speak Czech" flips it without touching the UI.
   ------------------------------------------------------------------ */

export const STRINGS = {
  cs: {
    locale: 'cs-CZ',
    voice: 'cs-CZ',
    standby: 'POHOTOVOST',
    listening: 'POSLOUCHÁM',
    speaking: 'MLUVÍM',
    thinking: 'PŘEMÝŠLÍM',
    assembling: 'SESTAVUJI',
    tapToStop: 'KLEPNUTÍM UKONČÍTE',
    chat: 'Psát',
    voiceOn: 'Hlas zapnut',
    voiceOff: 'Hlas vypnut',
    replay: 'Přehrát znovu',
    noBloom: 'Bez záře',
    mic: 'Mikrofon',
    useMic: 'Zapnout mikrofon',
    micOn: 'Mikrofon běží',
    micBlocked: 'Mikrofon zamítnut',
    track: 'Sledovat',
    trackOn: 'Sleduje',
    showFace: 'Ukázat tvář',
    showTeam: 'Ukázat tým',
    hints: ['řekni „Oudie"', '„otevři tým"', '„ukaž tvář"'],
    dragToOrbit: 'tažením otočíš',
    close: 'Zavřít',
    canDo: 'Umí',
    handsOffTo: 'Předává',
    stateLive: 'připraven',
    stateBusy: 'pracuje',
    stateOff: 'nenapojeno',
    agentCount: (n) => `${n} agentů`,
    langName: 'Čeština',
  },
  en: {
    locale: 'en-GB',
    voice: 'en-GB',
    standby: 'STANDBY',
    listening: 'LISTENING',
    speaking: 'SPEAKING',
    thinking: 'THINKING',
    assembling: 'ASSEMBLING',
    tapToStop: 'TAP TO STOP',
    chat: 'Chat',
    voiceOn: 'Voice on',
    voiceOff: 'Voice off',
    replay: 'Replay',
    noBloom: 'No bloom',
    mic: 'Mic',
    useMic: 'Use mic',
    micOn: 'Mic on',
    micBlocked: 'Mic blocked',
    track: 'Track me',
    trackOn: 'Tracking',
    showFace: 'Show face',
    showTeam: 'Show team',
    hints: ['say "Oudie"', '"open the team"', '"show your face"'],
    dragToOrbit: 'drag to orbit',
    close: 'Close',
    canDo: 'Can',
    handsOffTo: 'Hands off to',
    stateLive: 'ready',
    stateBusy: 'working',
    stateOff: 'not connected',
    agentCount: (n) => `${n} agents`,
    langName: 'English',
  },
};

/* Spoken language switches. Matched loosely because speech recognition
   punctuates and cases unpredictably. */
const SWITCH_TO_EN = [
  /\bmluv(te)?\s+anglicky\b/i,
  /\bp[řr]epni.*angli[čc]tin/i,
  /\bspeak\s+english\b/i,
  /\bin\s+english\s+please\b/i,
];
const SWITCH_TO_CS = [
  /\bmluv(te)?\s+[čc]esky\b/i,
  /\bp[řr]epni.*[čc]e[šs]tin/i,
  /\bspeak\s+czech\b/i,
  /\bin\s+czech\s+please\b/i,
];

/* Returns 'cs' | 'en' | null. Null means the sentence was not a language
   instruction and should be passed through to the model untouched. */
export function detectLanguageCommand(text) {
  if (!text) return null;
  if (SWITCH_TO_EN.some((r) => r.test(text))) return 'en';
  if (SWITCH_TO_CS.some((r) => r.test(text))) return 'cs';
  return null;
}

export function createI18n(initial = 'cs') {
  let lang = STRINGS[initial] ? initial : 'cs';
  const listeners = new Set();

  return {
    get lang() { return lang; },
    get t() { return STRINGS[lang]; },
    other() { return lang === 'cs' ? 'en' : 'cs'; },
    set(next) {
      if (!STRINGS[next] || next === lang) return false;
      lang = next;
      listeners.forEach((fn) => fn(lang));
      return true;
    },
    toggle() { return this.set(this.other()); },
    /* Feed every recognised utterance through here before the model sees
       it. Returns true when it was a language switch and nothing else. */
    handleUtterance(text) {
      const want = detectLanguageCommand(text);
      return want ? this.set(want) || want === lang : false;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
