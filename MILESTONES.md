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

---

Working agreement: after each milestone increment, run `npm run build`; keep
checkboxes here current; each iteration should leave the site shippable.
