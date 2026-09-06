# Nasazení

## 1 · Na GitHub

Rozbal archiv a z adresáře `Oudie/`:

```bash
git init
git add .
git commit -m "Humanoid view: 3D particle bust with assembly, listening and speaking states"
git branch -M main
git remote add origin https://github.com/Matuchovic/Oudie.git
git push -u origin main
```

Repo je prázdné, takže push projde bez `--force`.

## 2 · Vercel

Nejjednodušší cesta je import z GitHubu, ne CLI:

1. vercel.com → **Add New → Project**
2. **Import Git Repository** → vyber `Matuchovic/Oudie`
3. Framework se detekuje jako **Next.js**, build command i output nech prázdné
4. **Deploy**

Žádné env proměnné zatím nejsou potřeba — humanoid nemá backend.
Každý push do `main` pak nasadí sám.

## 3 · Kontrola

Po nasazení otevři root URL. Mělo by se spustit sestavení a po 6,9 s
naskočit `STATUS: LISTENING`. Když je plátno černé, koukni do konzole —
při chybějícím WebGL2 se bloom přepne na `UnsignedByteType` a záře je
slabší, ale renderovat to musí.

## Poznámka k `dist/`

`.gitignore` vylučuje `dist/`, takže standalone náhled se do repa nedostane.
Když ho tam chceš (hodí se pro rychlé sdílení), smaž řádek `dist` z
`.gitignore` a spusť `npm run preview` před commitem.
