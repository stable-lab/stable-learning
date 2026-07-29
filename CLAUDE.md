# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Astro Starlight static site of lab learning materials (Research 101, RL, Speculative Decoding, Cache Coherence). Content is MDX; the distinguishing feature is that nearly every concept ships with a **live React simulator** rather than a static figure. Deployed to GitHub Pages at `https://stable-lab.github.io/stable-learning` on every push to `main` (`.github/workflows/deploy.yml`).

## Commands

```bash
npm install          # Node 22 (.nvmrc)
npm run dev          # http://localhost:4321/stable-learning/  (base path applies in dev too)
npm run build        # the only real check — no test suite, no lint script
npm run preview      # serve dist/; needed to exercise search (Pagefind only builds in prod)
```

There is no test runner and no lint script. `@biomejs/biome` is a devDependency with **no `biome.json`**, so formatting is Biome defaults (tabs, double quotes) — matching the existing `.tsx` files. Run it explicitly if needed: `npx @biomejs/biome check src/`.

`npm run build` is the acceptance gate. Per `MILESTONES.md`: run it after each increment and keep the site shippable.

## Architecture

**Sidebar is half-automatic.** Pages autogenerate within a directory, but each chapter directory must be registered by hand as an `items` entry in `astro.config.mjs`. Creating `src/content/docs/<track>/0N-chapter/` alone does nothing — add the `autogenerate: { directory: '<track>/0N-chapter' }` line too. Within a chapter, ordering comes from `sidebar.order` in each file's frontmatter.

**Base path is the recurring footgun.** `base: '/stable-learning'` means any absolute internal URL (`/rl/01-.../`, string-concatenated `import.meta.env.BASE_URL`) 404s on Pages while looking fine locally. Use **relative hrefs** in MDX (`href="rl/01-action-chain-rewards/"`) and import images through the asset pipeline (`import logo from '../../assets/x.jpeg'` → `logo.src`), as `src/components/starlight/Footer.astro` does. Both classes of bug have shipped before.

**Math** is remark-math + rehype-katex, configured at the `markdown` level in `astro.config.mjs` — `$inline$` and `$$display$$` work in any MDX page with no per-file import.

**Theme** (`src/styles/custom.css`) overrides Starlight's color tokens for a warm-paper editorial look: serif (Newsreader) prose, sans (Inter) for UI/tables/asides. Note Starlight's inverted semantics — `--sl-color-white` is the *text* color, `--sl-color-black` the *background*; they flip per theme. Dark is the default; light is `:root[data-theme='light']`.

### Visualizations (`src/components/visualizations/`)

Three rendering paths, deliberately split:

- **Animated / frame-rate widgets** use the dependency-free stack in `lib/`: `useSimLoop` (rAF loop that batches ticks so high rates don't spam React renders, caps `dt` so a backgrounded tab doesn't fast-forward), `SimShell` (play/pause/step/reset chrome, speed selector, readout chips), `Sparkline` (SVG line chart, autoscaling, EMA + reference line). ~20 components.
- **Static parameter-explorers** use `LazyPlot.tsx`, a Plotly wrapper that lazy-loads `react-plotly.js` and injects site theme defaults (font, colorway, transparent backgrounds, hidden modebar) plus a `MutationObserver` on `data-theme` so charts re-render on theme toggle. Caller `layout`/`config` wins over the defaults. ~16 components.
- **Canvas**, for anything with hundreds of marks per frame — `lib/PixelCanvas.tsx` (images, via one `ImageData` blit) and inline `<canvas>` refs in `MixingReversibility`/`GANDuel` (particle clouds). Introduced by the diffusion track: a 24×24 frame is 576 cells and re-rendering that many React `<rect>`s per frame across several panels spends the whole frame budget in reconciliation. **`PixelCanvas` renders grayscale in both themes on purpose** — theme-inverting an image makes one sprite read as two different images — so only its frame is theme-aware. It redraws on every commit (no dep array) because sims mutate their `Float32Array`s in place.

**Domain libraries** under `lib/`, all pure and unit-testable outside React: `diffusionMath.ts` (schedule, forward sampling, exact posterior denoiser, DDIM/DDPM step), `sprites.ts` (procedural training images + poses + labels), `spectrum.ts` (radial power spectrum by separable DFT), `pca.ts` (power iteration), `tinynn.ts` (MLP with hand-written backprop and Adam, for the live GAN).

Plotly cannot SSR, and the sim components read `performance.now()`/DOM on mount, so MDX embeds use `client:only="react"` almost everywhere (45 uses vs 4 `client:visible`). Prefer `client:only="react"` unless the component is pure and SSR-safe. Give widgets a fixed height to avoid layout shift.

**Color semantics are shared across all widgets** — one color, one meaning, tokens in `custom.css`: `--viz-policy` blue (thing being learned), `--viz-value` amber (critic/baseline), `--viz-reward` green, `--viz-danger` red (variance/collapse), `--viz-ref` gray (reference/old policy), `--viz-kl` purple. Don't introduce ad-hoc colors for these roles.

## Content conventions

House style is documented and tracked in `MILESTONES.md` (read it before adding a chapter). The bar the repo holds itself to:

- Prose is **tension-driven**: what breaks → why → the fix. Not a definition list.
- Every simulator gets a structured caption in a `<div class="viz-caption">` with bolded **What it models** / **Knobs** / **Try this** paragraphs — see `research101/01-principles/why-do-research.mdx` or `rl/05-ppo/index.mdx`.
- Simulators should *run, learn, and be able to fail* — the failure regime (reward collapse, burnout, saturation) is usually what motivates the next chapter.
- Numeric and citation claims in prose are expected to be verified against the simulator's own behavior or a named source, and `MILESTONES.md` records the verification.

**Verify claims before writing the caption, not after.** The `lib/` modules are plain TypeScript with no React imports, so they run directly under `node --experimental-strip-types` — write a throwaway script, measure the thing the caption is about, then write the caption around the result. On the diffusion track this repeatedly overturned the planned narrative: the step-count sweep converges at T=4 rather than climbing to 1000, a stronger GAN discriminator helps rather than causing collapse, and reverse KL does not mode-seek from an arbitrary start. Each of those would have shipped as a confident false statement. `MILESTONES.md` records what was measured and what it changed.

**Never ship a control that does nothing.** A kernel-width knob and a dead Run button were both built and then removed on the diffusion track. If a knob's effect can't be measured, cut it and say why in a code comment so it isn't re-added.

MDX imports reach up out of `src/content/docs/<track>/<chapter>/` with four levels: `import X from '../../../../components/visualizations/X';`.

Frontmatter is Starlight's `docsSchema` (`src/content.config.ts`): `title`, `description`, `sidebar: { order }`.

## Adding a track

1. `src/content/docs/<track>/0N-<section>/*.mdx`
2. New sidebar group in `astro.config.mjs` with one `autogenerate` entry per section
3. `<LinkCard>` block in `src/content/docs/index.mdx` — **relative href**, with a "Prerequisites" line, following the existing pattern
