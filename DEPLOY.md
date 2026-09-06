# Nasazení

## Aktualizace už nasazeného projektu

Ve složce, odkud jsi naposledy pushoval:

```bash
git add -A
git status --short | wc -l      # musí být pár souborů, ne tisíce
git commit -m "Fix point size math; cap framebuffer; Next 15.1.9"
git push
```

Vercel nasadí sám. Nic dalšího nastavovat nemusíš.

## Nový import na Vercel

Add New → Project → Import Git Repository → `oudie-ai`.
Framework se detekuje jako Next.js. Build command, output i install
nech prázdné. Env proměnné žádné.
