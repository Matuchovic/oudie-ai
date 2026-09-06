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
