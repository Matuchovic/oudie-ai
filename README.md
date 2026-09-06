# Oudie — humanoid view (krok 1)

3D particle bust: sestavovací sekvence, stav *listening* a *speaking*.
Postaveno podle referenčního záznamu, ne podle původního repa — ten
tuhle vrstvu vůbec neobsahuje.

## Spuštění

```bash
npm install
npm run dev          # http://localhost:3000
```

Bez instalace čehokoli:

```bash
npm run preview      # otevři dist/oudie-humanoid.html v prohlížeči
```

`dist/oudie-humanoid.html` je jeden soubor bez závislostí (three.js z CDN).
Sestavuje se ze stejných zdrojů jako appka, takže se náhled nemůže rozejít
s tím, co poběží na produkci.

## Jak je to postavené

Bust **není mrak bodů**. Je to stack vodorovných vrstevnicových pásů
vyříznutých z rotační plochy s proměnnými eliptickými poloměry. Tohle
je ten „scanline" vzhled z reference: silueta vzniká tam, kde pásy končí.

Tři rozhodnutí, na kterých to celé stojí:

**Obrys je fresnel, ne geometrie.** Zářící okraj je `pow(1 - |dot(n, view)|, 4.6)`
na normále plochy. Žádný outline pass, žádná druhá geometrie.

**Oranžový obličej je tentýž objekt.** Není to samostatný mesh — jsou to
tytéž pásy, přebarvené radiální maskou a s větší amplitudou vlnění.
Jedna geometrie, jeden draw call, ~48 000 bodů, 60 fps i na telefonu.

**Pořadí příletu je vázané na azimut.** Částice přilétají po směru, jak
se otáčí kamera. Proto to čte jako „nakreslené z profilu a pak otočené
k tobě", a ne jako fade-in.

Bloom je zapečený v spritu (ostré jádro + dlouhý měkký ocas) místo
postprocessing passu. Proto standalone build nepotřebuje žádné balíčky.

## Časování

`ASSEMBLY_DURATION = 6.9 s` — změřeno po půlsekundách z referenčního
záznamu. Kamera obíhá z −72° na 0°, emitor dole pohasne na 80 % a zmizí
na 96 %. Pak naskočí halo kruhy (vizualizace *vstupu*, ne výstupu —
v referenci mizí, když postava mluví).

## Zvuk

`enableMic()` napojí skutečný mikrofon přes Web Audio. Bez povolení běží
syntetická slabiková obálka, aby náhled nebyl mrtvý. V produkci sem
půjde úroveň z TTS výstupu.

## Ladicí páky

| kde | co |
|---|---|
| `geometry.js` → `PROFILE` | proporce bustu (y, poloměr X, poloměr Z) |
| `geometry.js` → `FACE` | pozice a velikost tepelné masky obličeje |
| `shaders.js` → `vRim` exponent | jak úzký je zářící obrys |
| `runtime.js` → `ASSEMBLY_DURATION` | délka sestavení |
| `runtime.js` → `quality: 'low'` | méně bodů pro slabší zařízení |

`scripts/preview_render.py` vyrenderuje bust offline do PNG ze tří úhlů —
rychlá kontrola siluety, když šaháš do `PROFILE`.

## Co ještě není

Konstelace s 18 uzly, self-check panel (12 checků), přechod mezi pohledy,
Supabase, hlas, Vercel deploy.

## Pojmenování

Autor reference má v README výslovně napsáno, že kód je MIT, ale jméno
„Apex" a branding pod licenci nespadají. Než to nasadíš veřejně, vyber
si vlastní název — v kódu není nikde natvrdo, je jen v `metadata.title`
a v názvu balíčku.

## Ladicí páky (ověřené v headless prohlížeči)

| soubor | co |
|---|---|
| `geometry.js` → `FACE` | pozice, šířka a výška tepelné masky obličeje |
| `geometry.js` → `faceMask()` mocnina | jak ostře oranžová opadá; vyšší = menší jádro |
| `geometry.js` → `density` | bodů na pás; víc = souvislejší čára |
| `shaders.js` → `amp` | amplituda vlnění pásů. Musí být výrazně menší než rozteč pásů, jinak se slijí |
| `shaders.js` → `float i = (...)` | první člen je jas mezer, `vRim` obrys, `f` obličej |
| `shaders.js` → `vRim` exponent | nižší = širší měkčí obrys |
| `runtime.js` → `bloom.setStrength(a, b)` | a = úzká záře, b = široké halo |
| `runtime.js` → `bloom.setThreshold(t, knee)` | od jakého jasu se vůbec září. **Nízký práh = zamlžený obraz** — bez něj se rozmazávají i střední tóny a mezery mezi pásy se zaplní |
| `shaders.js` → `vScan` | šířka scan pruhu; `runtime.js` → `SCAN_PERIOD` jak často jede |
| `shaders.js` → `vTwinkle` | jemné jiskření bodů |
| `shaders.js` → `breathe` | dýchání, ±0.45 % — víc už vypadá jako chyba |
| `bloom.js` → `top` / `bot` | pozadí. Pozor: **lineární hodnoty**, gamma je na výstupu zvedne. 0.010 odejde jako 37/255, ne jako černá |
| `bloom.js` → `* 1.35` v composite | expozice celé scény |

## Testování

```bash
node scripts/build-standalone.mjs
xvfb-run -a node_modules/.bin/electron scripts/shoot.cjs
```

Vyrenderuje timeline ve skutečném Chromiu (WebGL2) do `/tmp/shots`.
`scripts/preview_render.py` je jen rychlá kontrola siluety — **není to
test rendereru**, protože shader reimplementuje. Dvakrát se shodl sám se
sebou a rozešel se s GPU. Vždycky ověřuj `shoot.cjs`.

## Konstelace

`components/constellation/roster.js` je jediný zdroj pravdy. Každý agent
nese `can` (co umí) a `to` (komu smí předat práci). Z těch samých dat se
kreslí hrany **i** se bude řídit orchestrátor — když je linka vidět, práce
po ní opravdu může jít. `canDelegate(a, b)` navíc odmítne cíl ve stavu
`off`, takže nenapojený agent nemůže dostat úkol.

Stavy: `live` cyanová · `busy` zlatá · `off` přerušovaná a rotující.
Backend je za běhu přepíná přes `setState(id, state)`.

Přidat agenta = přidat záznam do rosteru. Uzel, popisek, hrany, karta
i překlady naskočí samy.

## Jazyk

`components/i18n.js`. Čeština je výchozí, angličtina na jedno tlačítko.
`detectLanguageCommand()` chytá i mluvené „mluv anglicky" / „speak Czech",
takže se dá přepnout větou. Vrací `null`, když věta není jazykový příkaz —
tou se pak model nechá projít nedotčenou.

## Poznámka k harness

`shoot.cjs` po každé změně DOMu **vynutí překreslení změnou velikosti okna**.
Bez toho `capturePage()` vrací snímek z prvního vykreslení a pozdější změny
ignoruje: karta agenta byla v DOMu se správnou geometrií, stylem i textem, a
na snímku nebyla. Ověřeno tak, že se nekreslil ani obyčejný div vytvořený
skriptem. Harness, který mlčky vrací zastaralé snímky, je horší než žádný.

## Animace v konstelaci

**Provoz po hranách.** Tečky putují po skutečných delegačních linkách, ne
po dekoraci. Zlaté jedou z agentů ve stavu `busy`, cyanové z ostatních.
Dělá se to přes CSS Motion Path (`offset-path`), takže to kompozituje
grafika a 70 teček nestojí prakticky nic — žádná rAF smyčka.

**Zaostření podgrafu.** Klik na agenta zhasne všechno, kam nedosáhne.
Zůstanou svítit ti, komu předává, i ti, kdo předávají jemu. Obrázek pak
odpoví na otázku „komu tenhle může dát práci" bez legendy.

**Příchod uzlů** je odstupňovaný podle vzdálenosti od jádra, takže graf
při přepnutí vyroste zevnitř ven místo aby naskočil.

**Přechod mezi pohledy** — 200 ms. Scéna se rozzáří do modrého radiálního
bloomu a **výměna proběhne v jeho vrcholu**, takže oko nikdy nevidí žádný
z pohledů mizet: vidí záblesk a za ním něco jiného. Časování je odečtené
z referenčního záznamu po půlsekundách.

Všechno respektuje `prefers-reduced-motion`.

## Ladicí páky konstelace

| kde | co |
|---|---|
| `constellation.js` → `traffic(d, count, gold)` | hustota provozu na hraně |
| `.cn-pulse` `animation-duration` | rychlost teček |
| `.cn-root.cn-focus .cn-node` opacity | jak silně zhasne zbytek grafu |
| `#flash` keyframes | průběh záblesku; swap je pevně na 200 ms |
| `roster.js` → `x`, `y` | rozmístění uzlů ve viewBoxu 1600×900 |

## Mobil

Konstelace má **dvě sady souřadnic**. Na šířku 1600×900, na výšku 900×1500 —
16:9 deska se na telefonu složí do nečitelného pruhu. Scéna se přestaví,
až když se poměr stran skutečně překlopí; ostatní resize řeší viewBox, a
přestavovat při každém pohnutí lišty prohlížeče by pokaždé znovu spustilo
příchodovou animaci.

Na výšku jdou popisky **pod uzly**. Vedle nich buď přejíždějí přes jádro,
nebo utečou z obrazovky. Dotykové plochy jsou v portrait režimu větší,
protože viewBox je na telefonu výrazně zmenšený.

Karta agenta se na telefonu mění ve spodní sheet. Lišta scrolluje vodorovně
místo aby přetékala, tlačítka mají 44 px.

## PWA

Ikony nejsou jedna zmenšenina. Každá platforma ořezává jinak:

| soubor | k čemu | proč zrovna takhle |
|---|---|---|
| `icon-192/256/384/512` | manifest `any` | celá dlaždice včetně wordmarku |
| `apple-touch-icon` | iOS | neprůhledná, rámeček odsazený o 4,5 %, aby ho squircle neuřízl |
| `icon-maskable-*` | Android | jen postava na 72 %, Android ořezává do kruhu |
| `favicon-16/32/48` | záložka | jen hlava — wordmark je v téhle velikosti kaše |

Service worker drží shell offline, ale **nikdy nekešuje `/api/`, `/auth/`
ani nic s tokenem** a při odhlášení dostane `oudie:purge` a smaže vše. Keš,
která přežije odhlášení, je únik, kterého si nikdo nevšimne.

## Přihlášení

`components/auth/login.js` **záměrně neimplementuje autentizaci.** Vykreslí
formulář a předá zadané údaje adaptéru. Heslo se nikde neukládá, neloguje
ani nepřežije odeslání — nejjistější způsob, jak to zaručit, je nedržet ho.

V produkci je adaptérem Supabase Auth. Do prohlížeče patří jen URL projektu
a **anon key, který je veřejný záměrně** — chrání ho row level security.
Service role key se v tomhle projektu nesmí objevit nikdy a nikde.

Bez nastaveného adaptéru panel naskočí a řekne, že přihlašování není
nastavené. Nepředstírá, že je někdo přihlášený.
