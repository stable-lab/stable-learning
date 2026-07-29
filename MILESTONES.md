# RL Track Revamp — Milestones

Goal: bring the RL track up to the bar set by interactive systems blogs
(e.g. humans&'s "The 4-bitter Lesson"): every core concept should have a
**living** demo — something that *runs, learns, and can fail* in front of the
reader — not just a slider that redraws a static curve. Writing should be
tension-driven (what breaks → why → the fix), and every figure gets a
structured caption (*What it models / Knobs / Try this*).

Reference points from the blog worth copying:
- One flagship simulator up top that embodies the whole track's story arc.
- Time dynamics everywhere: you *watch* training happen, including failures
  (reward collapse, saturation) that motivate the next chapter.
- Structured figure captions: what it models → what the knobs do → what to try.
- Consistent visual language across all widgets.

Color semantics (shared across all RL widgets, defined in `src/styles/custom.css`):
policy = blue `--viz-policy`, value/critic = amber `--viz-value`,
reward = green `--viz-reward`, danger/variance = red `--viz-danger`,
reference/old policy = gray `--viz-ref`, KL/regularization = purple `--viz-kl`.

---

## M0 — Shared viz infrastructure ("make motion cheap")

- [x] `src/components/visualizations/lib/useSimLoop.ts` — fixed-rate rAF sim
      loop hook (play/pause, ticks-per-second, batches ticks per frame).
- [x] `src/components/visualizations/lib/SimShell.tsx` — shared widget chrome:
      title bar, play/pause/step/reset, speed selector, readout chips.
- [x] `src/components/visualizations/lib/Sparkline.tsx` — dependency-free SVG
      line chart for live curves (raw + EMA series, reference line, autoscale).
      Plotly stays for static parameter-explorers only; anything animated at
      frame rate uses SVG.
- [x] CSS design tokens + `.viz-*` classes (panel, buttons, chips, captions)
      in `src/styles/custom.css`, dark-mode aware via Starlight variables.
- Acceptance: `npm run build` clean; hero widget (M1) consumes all three.

## M1 — Flagship: "Watch a policy learn" (rl/01 index, top of page)

- [x] `PolicyLearnerLive.tsx` — the *same* 4×4 gridworld the reader plays by
      hand in the existing demo, now learned live by tabular
      REINFORCE-with-baseline. Policy arrows + value heat update in place;
      live return sparkline with EMA and optimal-return reference line;
      entropy readout. Learning-rate slider goes into the unstable regime on
      purpose: crank α and watch the policy saturate and collapse — the
      cliffhanger that motivates PPO in chapter 5.
- [x] Embed at top of `rl/01-action-chain-rewards/index.mdx` with a
      structured caption and a hook paragraph.
- Acceptance: visibly improves within ~10 s at 1× on a fresh policy; collapse
  reproducible with α ≥ 3; no layout shift (fixed height, `client:only`);
  dark mode OK.

## M2 — One living centerpiece per chapter

- [x] ch04 policy gradient: `BaselineRace.tsx` on `baseline-variance.mdx` —
      two REINFORCE learners (with vs without baseline) consume the *same*
      reward stream side by side; gradient-magnitude sparklines make variance
      reduction visible instead of asserted.
- [x] ch05 PPO: `PPOTrainingDynamics.tsx` on `05-ppo/index.mdx` — batched
      multi-epoch updates on a 10-armed bandit; ratio histogram, KL readout,
      reward curve. Toggle clipping OFF → ratios run away, policy saturates
      on a noisy arm, reward collapses; ON → ratios pinned to [1−ε, 1+ε],
      steady climb. The chapter's whole argument in one toggle.
- [x] ch06 GRPO: `GRPOLive.tsx` on `06-grpo/index.mdx` — animated group
      pipeline: prompt → G rollouts stream out → rewards land → group mean/std
      → signed advantages push the policy. Shows the σ=0 "wasted group"
      degenerate case live (why solved prompts stop teaching — the hook for
      dynamic sampling / DAPO).
- [x] ch02/ch03 already animate (QLearningGrid, MCTSDemo) — light-touch only:
      structured captions, color-token alignment. (captions deferred to M3)
- Acceptance: each new widget runs unattended without jank; every knob's
  effect is observable within seconds; build clean.

## M3 — Narrative pass (tension-driven rewrites)

- [ ] Every page opens with the *problem* (what breaks without this concept),
      not a definition. Definitions arrive after the reader wants them.
- [x] Every widget gets a structured caption: **What it models / Knobs /
      Try this.** (done for the four new widgets; pending for legacy ones)
- [ ] Cross-chapter continuity: ch01 collapse → foreshadows ch05 clipping;
      ch05 critic cost → foreshadows ch06 group baseline; make the arcs
      explicit at chapter boundaries.
- [x] References section per chapter: all 15 RL pages now cite their
      primary sources (Sutton & Barto, Watkins, Mnih, Coulom/Kocsis, Williams,
      Schulman ×3, DeepSeekMath/R1/DAPO); spec-decode pages had them from
      day one. Footnote-style asides still open.

## M4 — Consistency & polish

- [x] Visual design system (pulled forward from this milestone): warm-paper
      light theme + warm charcoal dark theme, Newsreader serif for prose /
      Inter for UI and annotations (self-hosted via fontsource), deep-teal
      accent, card treatment for all widgets. Verified by headless-browser
      screenshots in both themes.
- [x] `LazyPlot` now injects site-wide Plotly defaults (theme-following text
      and gridline colors via a `data-theme` MutationObserver, shared
      colorway, Inter font, no mode bar) — fixes illegible chart text in
      dark mode across every existing Plotly widget, RL and cache tracks.
- [ ] Migrate remaining slider-only widgets to shared chrome (SimShell or
      `.viz-sim` panel) and shared color tokens.
- [ ] Mobile layout audit (grids wrap, SVGs scale, no horizontal scroll).
- [ ] Perf audit: `client:only` + fixed heights for anything animated
      (no CLS); Plotly only where static.
- [ ] Figure numbering + "What to notice" → caption-format unification.
- [ ] Expressive-code (code block) theme aligned with the warm palette.

---

## M5 — New track: Speculative Decoding (fundamentals → EAGLE → DFlash/DSpark)

Three chapters under `specdec/`, same house style: tension-first prose, a
living simulator per chapter, structured captions, references per page.

- [x] ch01 fundamentals: draft–verify loop (`SpecDecodeLive` flagship: token
      race vs autoregressive baseline, γ/α/cost knobs, "slower than baseline"
      failure regime), lossless acceptance rule (`RejectionSampler`: empirical
      histogram converges to p under the min(1, p/q) rule, biased under naive
      acceptance), speedup arithmetic (`SpeedupExplorer`: E[tokens/cycle] and
      wall-clock speedup vs γ, break-even line).
- [x] ch02 the EAGLE line: EAGLE-1 feature-space drafting (+ static
      architecture diagram `EagleFeatureFlow`) (why features beat
      tokens, sampled-token conditioning), EAGLE-2 dynamic draft trees
      (`TreeDraftLive`: static vs confidence-expanded tree under a node
      budget), EAGLE-3 training-time test + multi-layer fusion + the data
      scaling law.
- [x] ch03 parallel drafting: DFlash block-diffusion drafter (KV injection,
      one-pass block drafts, why same acceptance length ⇒ much higher
      speedup), DSpark confidence-scheduled variable-length verification
      (`SuffixDecayViz`: suffix acceptance decay, semi-AR fix, verify-budget
      pruning under batch load).
- [x] Landing-page cards + cross-links; whole-site internal-link check
      passes (0 broken links, now 40 content pages).
- [x] ch01 addendum: `tree-verification.mdx` + `TreeVerifyViz` — tree
      attention as an interactive mask (hover a node ⇒ its attention row;
      siblings structurally invisible), animated top-down acceptance walk
      with bonus/correction accounting; cross-linked from EAGLE-1 and
      EAGLE-2 pages. Refs: SpecInfer 2305.09781, Medusa 2401.10774.
- [x] `BlockDiffusionViz` on the DFlash page — controlled drafting race:
      both drafters draw the same acceptance coins per cycle (identical
      accepted tokens by construction), so the only free variable is
      drafting time; masked cells pulse and commit in confidence order over
      S refinement passes. Empirical speedups converge to the closed-form
      chips (verified: 2.37×/3.09× vs theory 2.22×/3.17× at defaults,
      gap = (K+V)/(S+V) = 1.43×).
- Sources verified 2026-07-21: EAGLE-3 arXiv 2503.01840; DFlash arXiv
  2602.06036 + LMSYS "next-generation speculative decoding" post (measured
  acc-len/speedup table); DSpark arXiv 2607.05147 + LMSYS SGLang integration
  post (STS calibration, SPS cost model, verify modes).
- [x] ch03 addendum: `mean-field-trap.mdx` + `MeanFieldSampler` — why parallel
      blocks sample a product of marginals, not the joint: marginalization
      primer (contingency tables, np/torch multi-modal collision), the
      CE-objective-learns-the-marginal insight, MTP (DeepSeek-V3, D=1) as the
      degenerate case, DSpark's first-order Markov head as the cheap fix, and
      the parallelism-vs-joint-fidelity axis (Medusa/DFlash → MTP → EAGLE →
      DSpark). Live sampler: watch `np.tensor` mass pile into impossible
      cells under mean-field, empty out under the Markov head. Slots between
      the DFlash and DSpark pages (orders 0/1/2).
- [x] ch03 restructure (2026-07-28): `mean-field-trap.mdx` dissolved — the
      marginalization/mean-field material now opens the DSpark page ("Repair
      the Joint, Meter the Verify": trap → Markov fix → confidence-scheduled
      verify, `MeanFieldSampler` moved along); MTP promoted to its own page
      `mtp.mdx` ("The Frame That Locates Everyone": Gloeckle training signal,
      Medusa, DeepSeek-V3 D=1 self-drafter with 85–90% second-token
      acceptance / 1.8× TPS, the chain-rule axis table as track closer).
      New sidebar order: DFlash (0) → DSpark (1) → MTP (2).
- [x] Model architecture diagrams, EagleFeatureFlow idiom (static SVG,
      theme-var colors): `DFlashArchitecture` (target prefill → per-layer KV
      injection → masked block → S refinement passes → one verify pass),
      `DSparkArchitecture` (parallel backbone → base logits → Markov-head
      bias sweep; confidence head → load-aware scheduler → red verify-window
      cut), `MTPModules` (parallel heads vs V3's sequential module,
      side by side).

---

## M6 — New track: Research 101 (how to do research, for new lab members)

One chapter under `research101/01-principles/`, same house style: the PI's
three principles for new researchers, tension-first prose, a living simulator
per principle, structured captions, verified references per page.

- [x] Track index `index.mdx` — why problem choice and pace dominate outcomes;
      the three principles and their tests at a glance.
- [x] ch. "Work on the Frontier" + `FrontierMap` — Matt Might's circle of
      knowledge made live: busy-but-interior work vs. pushing the boundary.
- [x] ch. "Bet on What Scales" + `ScalingRace` — the Bitter Lesson as a race:
      structure-first method leads early, saturates, gets crossed over as
      compute doubles; committed years get stranded.
- [x] ch. "Research Is a Race" + `PriorityRace` — repeated priority races
      vs. rival labs: effort knob, mid-race pause button, evaporated-months
      counter.
- [x] Sidebar group + landing-page card (track listed first — onboarding).
- [x] ch. "Why Do Research" (order 1, before the how) — the motivation audit:
      LLM-agent-era urgency, degree-motivation → quit early, the PhD as a
      high-cost uncertain bet, the two motivations that survive; The Why Test.
- [x] ch. "The Complete Researcher" (order 5, closes the track) + `StaminaSim`
      — taste (literature/philosophy/art as training) and stamina (the
      80-hour week as a fitness achievement; burnout failure regime live).
- [x] "Don't Be an Ostrich" section in Bet on What Scales — reference the
      strongest implementations, watch frontier industry labs, compete.
- [x] `MotivationSim` on Why Do Research — two students, identical coins,
      different fuel (degree vs curiosity): the degree lane spirals and
      quits in years 2-4 while the curiosity lane survives the decade;
      claims verified by 20k-seed simulation across the knob range.
- [x] Data charts on Why Do Research: `EarningsPremium` (Casey/Economist
      premiums over non-graduates — BA 14% / MA 23% / PhD 26%, the 3-point
      marginal edge bracketed; baseline error in the prose caught and
      fixed) + `MentalHealthRates` (Evans 41/39% vs 6% with the
      convenience-sample caveat; Levecque 32% vs 14% GHQ4+).
- [x] Site-wide author byline in the footer: Written by Zhongming Yu.
- Acceptance: `npm run build` clean; both themes OK; references verified.

---

## M7 — New track: Image Generation & Diffusion

Three chapters under `diffusion/`, placed before the specdec track because
`specdec/03-parallel-drafting` already leans on diffusion for DFlash and
assumed the reader knew what it was. House style throughout: tension-first
prose, a living simulator per idea, structured captions, verified references.

Shared infrastructure — the track needed a rendering primitive the site did
not have:

- [x] `lib/PixelCanvas.tsx` — canvas-backed image renderer. The site was 100%
      SVG/Plotly; a 24×24 frame is 576 cells and re-rendering that many React
      `<rect>`s per frame across four panels spends the frame budget in
      reconciliation. Grayscale in both themes on purpose (theme-inverting an
      image makes one sprite read as two different images).
- [x] `lib/sprites.ts` — eight procedural 24×24 glyphs plus `makeDataset()`
      for posed variants. No image assets, no licensing, byte-identical for
      every reader.
- [x] `lib/diffusionMath.ts` — cosine schedule as a *continuous* function of
      t/T, forward sampling, the exact closed-form posterior denoiser, and a
      unified DDIM/DDPM reverse step (η = 1 / η = 0).
- [x] `lib/spectrum.ts` — radially-averaged power spectrum by separable DFT.

**Colour semantics** follow the existing tokens: policy/blue for the thing
being predicted, value/amber for x₀, reward/green for ε and for "signal
surviving", danger/red for noise floors and failure, kl/purple for score and
entropy.

### Chapter 2 — Destroy It, Then Learn to Undo (`02-diffusion`)

Built first, because it is the payoff chapter and the track ships standalone
with it.

- [x] `index.mdx` + `MixingReversibility` — ink in water and dye in corn syrup
      as one simulation with one knob. Both media get identical Taylor–Couette
      advection (closed form, so cranking back undoes the shear exactly); the
      only difference is Brownian jitter scaled √dt. Verified: at jitter 0 the
      dye smears to 6.25 rad of angular spread and returns to displacement
      **0.0000**; at jitter 0.25/0.5/1.0 the forward half is statistically
      identical (6.19–6.23 rad) but comes home at 0.19/0.36/0.57.
      The demo is used as a **contrast, not an analogy** — the syrup unmixes
      because Stokes flow destroys nothing, whereas our forward process
      genuinely does. It earns its place by separating "looks destroyed" from
      "is destroyed", and the page says so explicitly.
- [x] `forward-process.mdx` + `ForwardNoise` — one t slider, three panels:
      image dissolving, pixel histogram sliding off its bimodal ink/paper
      spikes onto 𝒩(0,1), and the power spectrum showing the flat noise floor
      rising through the falling signal curve. Verified cutoff frequency
      12 → 6 → 1 → 0 at t = 0/200/700/1000, so "detail dies before silhouette"
      is measured rather than asserted.
- [x] `predict-the-noise.mdx` + `ThreeTargets` — the three parameterizations
      shown to be one object, and separated by error amplification:
      x₀-pred ×1 flat, ε-pred √(1-ᾱ)/√ᾱ, score-pred (1-ᾱ)/√ᾱ. Verified
      ε-pred ×0.006/×0.042/×0.17 at t = 1/20/100 and ×6.4/×316 at t = 900/999
      — so ε-prediction is not uniformly better, it wins hugely where quality
      is decided and loses where it is not, which is the argument for
      v-prediction.
- [x] `one-step-vs-many.mdx` + `StepBudget` — real DDPM/DDIM sampling with the
      exact denoiser over 128 posed shapes. The T=1 mode-averaging collapse is
      the lesson, and it is the same failure as `mean-field-trap` (a marginal
      substituted for a conditional) — cross-linked both ways.

**Measured findings that changed this chapter**, recorded so they are not
re-litigated:

- The planned claim "sharpness keeps improving from T=1 to T=1000" is **false
  for an exact denoiser.** Distance-to-nearest-real-image runs 0.50 / 0.063 /
  0.0032 at T = 1 / 2 / 4 and then sits at 0.0032 through T=200. Growing the
  training set 8 → 1024 changed nothing; injecting per-call denoiser error
  (σ = 0.15/0.3/0.6) changed nothing either — it sets a floor ≈ σ at every T.
  The page now says outright that four steps converges here, and that real
  systems need more because their denoiser is a *learned approximation* — with
  DDIM (1000→50) and consistency models (→1–4 steps) as the evidence.
- A kernel-width knob was built to demonstrate generalization and then
  **removed**: it does nothing, measured flat at 0.0032 across widths 1–8 and
  across an effective-noise floor up to 0.4. In 576 dimensions the posterior
  over a finite training set is effectively deterministic. That failure became
  the page's argument for why generalization needs a different function class
  rather than a wider kernel.

### Chapter 1 — What Generation Asks For (`01-the-problem`)

- [x] `index.mdx` + `ManifoldSlice` — the same two endpoints joined by two
      straight lines: one through all 576 pixels (double-exposure ghosts at
      the midpoint), one through the four pose parameters the sprites are
      actually drawn from (valid images throughout). The pose path is a real
      latent space, not a stand-in, which is why the contrast is honest.
      Plus uniformly-random pixel frames for scale.
- [x] `gan.mdx` + `GANDuel` — a genuine GAN: two 2→16→16 MLPs in
      `lib/tinynn.ts` with hand-written backprop and Adam(β₁=0.5), on the
      eight-Gaussians benchmark. Nothing scripted.
- [x] `why-gans-broke.mdx` + `ModeCoverage` — one Gaussian fitted to a
      three-mode target under forward KL, reverse KL and Jensen–Shannon, by
      direct numerical integration on a 480-point grid. Closes on the
      generative trilemma.

**Measured findings that rewrote this chapter:**

- The planned GAN narrative — "crank the discriminator learning rate and watch
  the generator stall/collapse" — is **false here**. A *stronger* discriminator
  helps: 4 D-steps at lr 8e-3 gives 6–8 effective modes and 9–15% of mass off
  the data, versus 3–8 modes and 11–79% off with 1 step at lr 2e-3. With the
  non-saturating loss a *weak* D is the danger, because a critic that cannot
  tell real from fake gives the generator nothing to follow. The folk story is
  about the 2014 minimax loss; the page says so.
- What *is* reproducible is **seed variance**: over 8 seeds at one fixed
  config, outcomes range from 3 modes / 79% off-data to 8 modes / 11% off,
  with the loss curves looking much the same either way. That became the
  page's thesis, and Reset became its most important control.
- `ModeCoverage` was going to show "reverse KL locks onto one mode." From the
  original default start it does **not** — it goes broad and covers 3/3. The
  real structure, measured over seven starting points: forward KL lands at
  μ ≈ 0.1, σ = 2.65, covering 3/3 **every time**, while JS and reverse KL end
  up on whichever mode they started beside (1/3 from −3.6, −3.0, 0.1, 3.0,
  3.6). So the *start position* became the widget's only knob, and the chapter
  gained a much better thesis: maximum likelihood has one answer and finds it
  from anywhere; the adversarial objective has many and takes the nearest.
  This is the GAN seed variance reproduced with no networks in it.

### Chapter 3 — How Stable Diffusion Works (`03-real-systems`)

- [x] `index.mdx` + `LatentCompress` — a real encoder/decoder: PCA by power
      iteration (`lib/pca.ts`) over the 256-image dataset, with the residual
      panel showing exactly what each k discards.
- [x] `conditioning.mdx` — ε_θ(x_t, t) → ε_θ(x_t, t, c); why a *contrastive*
      text encoder, cross-attention as the injection mechanism, and why
      conditioning is a small change here and was a research programme for
      GANs. Reuses `GuidanceDial` at w = 1.
- [x] `guidance.mdx` + `GuidanceDial` — real classifier-free guidance,
      ε_uncond + w(ε_cond − ε_uncond), with both scores computed exactly.

**Measured findings:**

- Guidance steering reproduces exactly: prompt accuracy 25% at w = 0 (near the
  12.5% chance rate) → **100% for every w ≥ 0.5**. Within-class diversity then
  decays: over 32 seeds on a fixed prompt, 13 of 16 possible images at w = 1,
  8 at w = 8 and w = 15, with the most frequent single image rising 16% → 25%.
- The high-guidance **saturation artifacts do not reproduce** — distance to
  nearest real image holds at 0.003 from w = 1 through w = 15. With an exact
  score, extrapolating it is harmless. The artifacts in real systems are the
  *learned* score's approximation error, amplified by w. Written up as such.
- PCA is a **weak** encoder for this data and the page says so with numbers:
  68.6% of variance at k = 16, 92.8% at k = 64, still visibly soft. The cause
  is that two of the four degrees of freedom are rotation and translation,
  which are savagely non-linear in pixel space — which is precisely why real
  latent diffusion uses a convolutional non-linear autoencoder. The widget is
  presented as a lower bound establishing the *ordering* (semantics cheap,
  exact rendering expensive), not the achievable ratio.

### The through-line this track ended up with

Three separate pathologies vanish once the denoiser is exact — the thousand
step count (converges at T=4), generalization-by-kernel-widening (flat at
0.0032 across every setting), and guidance saturation (0.003 at every w).
Everything that *survives* in the exact-denoiser toy is mathematical; every
pathology that disappears was approximation error. That distinction is stated
explicitly on `guidance.mdx` and is the most useful thing the track teaches.

- Acceptance: `npm run build` clean; both themes checked; every simulator
  driven to the failure regime its caption claims; numeric claims verified by
  running the actual library, not by eye.

---

Working agreement: after each milestone increment, run `npm run build`; keep
checkboxes here current; each iteration should leave the site shippable.
