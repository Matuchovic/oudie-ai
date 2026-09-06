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

## Sledování kamerou

`components/humanoid/tracker.js`. Humanoid otáčí hlavu za tím, **kde jsi** —
ne za tím, kde se něco pohnulo. Ten rozdíl je celý vtip: detektor pohybu tě
ztratí ve chvíli, kdy se zastavíš, a hlava se vrátí do středu. Odtud to
cuknutí tam a zpět.

Tři části, bez modelu strojového učení a bez stahování:

**Model pozadí.** Pomalu se adaptující klouzavý průměr. Odečtením vznikne
popředí — člověk, který jen stojí, tam pořád je, zatímco rozdíl snímků
nevidí nic.

**Mean-shift.** Z poslední známé pozice se vezme těžiště v okně a okno se
na něj přesune, třikrát. Tím se to zamkne na jeden cíl místo aby zprůměrovalo
ruku a procházející stín do prázdna mezi nimi. Váhy jsou Epanechnikovovo
jádro, takže odhad nejde přetáhnout něčím, co jen zavadilo o roh okna.

**Držení.** Bez důvěryhodného pozorování se cíl nepohne vůbec. Nikdy nedrží
ke středu, protože „nevidím tě" není totéž co „jsi uprostřed".

Testy jsou v `scripts/tracker.test.mjs` a běží na syntetických snímcích, bez
kamery: `node scripts/tracker.test.mjs`. Ten podstatný ověřuje přesně tuhle
regresi — po zastavení se pozice posune o 0,003.

Otáčení je v shaderu kolem kloubu na spodku krku s náběhem, takže se ohne
krk a ramena zůstanou. Rozsah ±36° vodorovně, ±17° svisle.

Kamera i mikrofon se zapínají **automaticky při přepnutí na tvář** a vypínají
při odchodu z ní. Žádné další přepínače. Odmítnutí nic nerozbije.

## Mobilní optimalizace

Zařízení se rozpozná samo: hrubý ukazatel plus malá obrazovka, nebo
`deviceMemory` do 4 GB. Telefon pak dostane **30 tisíc bodů místo 57 tisíc**.

Render se **úplně zastaví**, když je záložka skrytá nebo když konstelace
překrývá plátno. To ušetří na baterii víc než všechna ostatní opatření
dohromady — dřív se humanoid počítal i schovaný za diagramem.

Sledování jede na 24 Hz, ne na každý snímek, a kamera se ptá na 240×180
místo aby si vyžádala 720p a zahodila je.

Rozpočet framebufferu je 2,6 milionu pixelů; na 5K displeji se DPR sníží,
místo aby bloom žvýkal čtrnáct milionů pixelů na snímek.

## Boot a přihlášení

Loading obrazovka **je** sestavení. Nic se nepředstírá: procento je skutečný
postup 57 tisíc částic a odškrtávané položky jsou integrace, na kterých
appka bude reálně stát. Vypisovat tam něco, co nepoužívá, by z boot screenu
udělalo lháře.

Jediná divadelní věc je hlava. Zůstane sklopená, dokud se postava staví —
zaneprázdněná, ještě o tobě neví — a přes posledních 45 % se zvedne tak, aby
dorazila do vodorovné polohy přesně ve chvíli dokončení. Pak vteřina ticha
a teprve potom formulář.

Ta vteřina je podstatná. Bez ní formulář ten okamžik sežere dřív, než ho
stihneš zaregistrovat.

**Je to tentýž humanoid**, ne kopie. Stejná instance `createHumanoid`, stejná
geometrie, stejný shader. Boot jen řídí `setLook()`.

### Login reaguje

Formulář nemá kartu ani rámečky — pole sedí na prázdnotě před postavou.

| stav | co udělá humanoid |
|---|---|
| klid | tlumená tvář, slabá svatozář |
| zaostřené pole | tvář se rozjasní, svatozář se rozšíří, stav „Poslouchá" |
| ověřuji | plná pozornost |
| odmítnuto | tvář zchladne do červené, tělo ztmavne |
| vpuštěn | svatozář se rozletí a formulář jí projde |

Řízené uniformou `uAffect` (pozornost, odmítnutí) a `setHalo()`. Všechny
stavy jsou v jedné tabulce `MOODS`, takže se text, barva a chování postavy
nemůžou rozejít.

## Tři obrazovky

`boot` → `login` → `app`. Řídí se přes `document.body.dataset.screen` a CSS,
ne přes JavaScript, který by co skrýval — je vždy vidět **právě jedna**.

Ostatní jsou `display: none`, ne jen průhledné. Průhledná vrstva pořád bere
kliknutí a pořád nechává popisky nad tou pod sebou; přesně tak se boot text
překryl se stavovým řádkem appky a konstelace prosvítala do přihlášení.

Humanoid je ve všech třech **tentýž** — stejná instance, stejná geometrie.
Mění se jen chrome kolem něj.

## Testy

```bash
node scripts/tracker.test.mjs                  # sledování, syntetické snímky
node scripts/build-standalone.mjs              # kolize jmen, shadery, CSS závorky
npx next build && npx next start -p 3111 &
xvfb-run -a electron scripts/e2e.cjs           # boot → login na skutečné appce
```

Ten poslední existuje kvůli konkrétní chybě. Standalone soubor a Next appka
jsou **dvě různé cesty kódu** a dlouho se testovala jen ta první. Appka pak
šla ven rozbitá: boot předal řízení přihlášení, které se nikdy neobjevilo,
protože se čekalo na ověření session **dřív**, než se formulář vykreslil —
a boot už mezitím zmizel. Ve standalone se to projevit nemohlo, protože tam
žádný Supabase není.

Oprava je v pořadí: formulář se ukáže hned, session se ověří až potom, a
dotaz má čtyřsekundový strop. Vracející se uživatel zahlédne formulář na
okamžik; opačné pořadí stálo všechny ostatní mrtvou obrazovku.
