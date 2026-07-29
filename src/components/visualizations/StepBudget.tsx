import { useCallback, useMemo, useRef, useState } from "react";
import PixelCanvas from "./lib/PixelCanvas";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import {
	alphaBar,
	entropyBits,
	epsFromX0,
	expectedX0,
	gaussian,
	makeRng,
	posteriorWeights,
	reverseStep,
} from "./lib/diffusionMath";
import { makeDataset, meanImage, SPRITE_N, SPRITE_SIZE } from "./lib/sprites";
import { useSimLoop } from "./lib/useSimLoop";

// Reverse sampling with the exact denoiser, run at a step budget the reader
// picks.
//
// The one-step case is the point of the widget: with a single step the model
// must jump from pure noise straight to a clean image, its posterior over
// which training image it is looking at is uniform, and the mean of that
// posterior is the average of the whole dataset — a blur. Measured at 42%
// midtone pixels against 5% for a real sprite.
//
// A kernel-width knob was built here and then removed: widening the posterior
// does NOT buy generalization, measured flat at 0.0032 distance-to-nearest
// training image across widths 1-8 and across an effective-noise floor up to
// 0.4. In 576 dimensions the posterior over a finite training set is
// effectively deterministic, so smoothing only delays saturation instead of
// preventing it. Generalization needs a different function class, not a
// wider kernel — which is the argument the page makes.
//
// What this widget deliberately does NOT claim is that quality keeps climbing
// to T = 1000. It does not, and measurement says so: with an *exact*
// denoiser this converges by about T = 4 regardless of dataset size. Real
// systems need far more because their denoiser is learned and approximate.
// The page says that in prose rather than faking a knob for it.

const DATASET_SIZE = 128;
const STEP_CHOICES = [1, 2, 4, 8, 16, 50, 200];
const SPEEDS = [
	{ label: "1×", value: 6 },
	{ label: "4×", value: 24 },
	{ label: "20×", value: 120 },
];

interface Run {
	/** Current iterate. */
	x: Float32Array;
	/** The denoiser's current guess at the clean image. */
	x0hat: Float32Array;
	/** Sorted posterior mass, largest first — how sure the model is. */
	top: number[];
	entropy: number;
	step: number;
	ab: number;
	done: boolean;
}

export default function StepBudget() {
	const [steps, setSteps] = useState(1);
	const [eta, setEta] = useState(1);
	const [speed, setSpeed] = useState(SPEEDS[0].value);
	const [seed, setSeed] = useState(1);
	const [, forceRender] = useState(0);

	const dataset = useMemo(() => makeDataset(DATASET_SIZE, 3), []);
	const datasetMean = useMemo(() => meanImage(dataset), [dataset]);

	const rngRef = useRef<() => number>(makeRng(1));
	const entropyTrace = useRef<number[]>([]);
	const gallery = useRef<Float32Array[]>([]);

	const start = useCallback(
		(s: number): Run => {
			const rng = makeRng(s * 6151 + 7);
			rngRef.current = rng;
			entropyTrace.current = [];
			const x = new Float32Array(SPRITE_N);
			for (let i = 0; i < SPRITE_N; i++) x[i] = gaussian(rng);
			// Before any step has run, the model has seen nothing but noise: the
			// posterior is exactly uniform and its mean is the dataset average.
			// Seed the display with that rather than an empty buffer, so the
			// opening state shows the claim the caption makes about it.
			return {
				x,
				x0hat: datasetMean,
				top: new Array(12).fill(1 / DATASET_SIZE),
				entropy: Math.log2(DATASET_SIZE),
				step: 0,
				ab: alphaBar(1),
				done: false,
			};
		},
		[datasetMean],
	);

	const runRef = useRef<Run>(start(1));

	const advance = useCallback(() => {
		const run = runRef.current;
		if (run.done) return;
		const k = steps - run.step;
		const abT = alphaBar(k / steps);
		const abPrev = alphaBar((k - 1) / steps);

		const w = posteriorWeights(run.x, dataset, abT);
		const x0hat = expectedX0(dataset, w);
		const eps = epsFromX0(run.x, x0hat, abT);
		const next = reverseStep(run.x, x0hat, eps, abT, abPrev, eta, rngRef.current);

		const sorted = Array.from(w).sort((a, b) => b - a).slice(0, 12);
		const h = entropyBits(w);
		entropyTrace.current.push(h);

		const done = run.step + 1 >= steps;
		runRef.current = {
			x: next,
			x0hat,
			top: sorted,
			entropy: h,
			step: run.step + 1,
			ab: abPrev,
			done,
		};
		if (done) {
			gallery.current = [next.slice(), ...gallery.current].slice(0, 6);
		}
	}, [dataset, steps, eta]);

	const onTick = useCallback(
		(ticks: number) => {
			for (let i = 0; i < ticks; i++) {
				if (runRef.current.done) break;
				advance();
			}
			forceRender((v) => v + 1);
		},
		[advance],
	);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const restart = useCallback(
		(nextSeed: number) => {
			runRef.current = start(nextSeed);
			forceRender((v) => v + 1);
		},
		[start],
	);

	const reset = useCallback(() => {
		setPlaying(false);
		gallery.current = [];
		const s = seed + 1;
		setSeed(s);
		restart(s);
	}, [seed, restart, setPlaying]);

	/** Fraction of pixels stranded between ink and paper — a blend's signature. */
	const midtone = useMemo(() => {
		const src = runRef.current.done ? runRef.current.x : runRef.current.x0hat;
		let n = 0;
		for (const v of src) if (Math.abs(v) < 0.5) n++;
		return n / src.length;
		// runRef is a ref: recompute whenever the render was forced.
	}, [runRef.current.step, runRef.current.done]);

	const run = runRef.current;
	const started = run.step > 0;

	return (
		<SimShell
			title="Reverse sampling, on a step budget"
			playing={playing}
			onToggle={() => {
				if (run.done) {
					const s = seed + 1;
					setSeed(s);
					restart(s);
				}
				toggle();
			}}
			onReset={reset}
			onStep={() => onTick(1)}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "step", value: `${run.step} / ${steps}` },
				{ label: "ᾱ", value: run.ab.toFixed(3), color: "var(--viz-policy)" },
				{
					label: "posterior",
					value: `${run.entropy.toFixed(2)} bits`,
					color: "var(--viz-kl)",
				},
				{
					label: "midtone",
					value: `${(midtone * 100).toFixed(0)}%`,
					color: midtone > 0.2 ? "var(--viz-danger)" : "var(--viz-reward)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<div className="viz-panel-title">the sample</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<PixelCanvas
							data={run.x}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={96}
							label={run.done ? "final sample" : "xₜ (noisy)"}
							accent={run.done ? "var(--viz-reward)" : undefined}
						/>
						<PixelCanvas
							data={run.x0hat}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={96}
							label="x̂₀ — best guess"
							accent="var(--viz-policy)"
						/>
					</div>
					<div className="viz-legend" style={{ justifyContent: "center" }}>
						<span>
							{started
								? "left: where the chain is. right: what it thinks the answer is."
								: "before the first step, every training image is equally likely — so the best guess is their average."}
						</span>
					</div>
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">how sure is it? (posterior mass)</div>
					<WeightBars top={run.top} total={DATASET_SIZE} />
					<div className="viz-panel-title" style={{ marginTop: "0.55rem" }}>
						posterior entropy over the run
					</div>
					<Sparkline
						series={[
							{ data: entropyTrace.current, color: "var(--viz-kl)", width: 1.8 },
						]}
						height={74}
						yInclude={[0, Math.log2(DATASET_SIZE)]}
						refLine={{
							value: 0,
							label: "certain",
							color: "var(--viz-reward)",
						}}
						xMax={Math.max(steps, 2)}
						formatY={(v) => `${v.toFixed(1)}b`}
					/>
				</div>
			</div>

			<div className="viz-controls-row">
				<div className="viz-slider" style={{ flex: "1 1 13rem" }}>
					<span>
						step budget T = <span className="viz-slider-value">{steps}</span>
					</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem" }}>
						{STEP_CHOICES.map((n) => (
							<button
								key={n}
								type="button"
								className={`viz-speed-btn${n === steps ? " active" : ""}`}
								onClick={() => {
									setPlaying(false);
									setSteps(n);
									restart(seed);
								}}
							>
								{n}
							</button>
						))}
					</span>
				</div>

				<div className="viz-slider" style={{ flex: "0 0 auto" }}>
					<span>sampler</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem" }}>
						{[
							{ label: "DDPM (η=1)", value: 1 },
							{ label: "DDIM (η=0)", value: 0 },
						].map((o) => (
							<button
								key={o.label}
								type="button"
								className={`viz-speed-btn${o.value === eta ? " active" : ""}`}
								onClick={() => {
									setPlaying(false);
									setEta(o.value);
									restart(seed);
								}}
							>
								{o.label}
							</button>
						))}
					</span>
				</div>

			</div>

			{gallery.current.length > 0 && (
				<>
					<div className="viz-panel-title" style={{ marginTop: "0.6rem" }}>
						finished samples (newest first) — is it covering the dataset?
					</div>
					<div className="viz-sprite-row" style={{ justifyContent: "flex-start" }}>
						{gallery.current.map((g, i) => (
							<PixelCanvas
								// Gallery entries are immutable snapshots pushed in order.
								key={`${i}-${g[0]}`}
								data={g}
								cols={SPRITE_SIZE}
								rows={SPRITE_SIZE}
								size={44}
							/>
						))}
					</div>
				</>
			)}
		</SimShell>
	);
}

/* ------------------------------------------------------------------ */

function WeightBars({ top, total }: { top: number[]; total: number }) {
	const W = 300;
	const H = 66;
	const n = 12;
	const bw = W / n;
	const uniform = 1 / total;
	// Uniform mass is 1/128 — on a 0..1 axis that is half a pixel tall and
	// reads as "no bars at all", which is the opposite of what the flat
	// posterior is meant to show. Scale to the leading weight instead, with a
	// floor of 8x uniform so the flat state stays legible.
	const scale = Math.max(top[0] ?? uniform, uniform * 8);
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="viz-panel-chart"
			role="img"
			aria-label="largest posterior weights over the training set"
		>
			<title>Twelve largest posterior weights</title>
			{Array.from({ length: n }, (_, i) => {
				const w = top[i] ?? 0;
				const h = Math.min(1, w / scale) * (H - 12);
				return (
					<rect
						key={i}
						x={i * bw + 1.5}
						y={H - 10 - h}
						width={bw - 3}
						height={Math.max(h, 0.6)}
						fill={i === 0 ? "var(--viz-policy)" : "var(--viz-ref)"}
						opacity={i === 0 ? 0.95 : 0.6}
					/>
				);
			})}
			{/* Where the bars would sit if every training image were equally likely. */}
			<line
				x1={0}
				y1={H - 10 - (uniform / scale) * (H - 12)}
				x2={W}
				y2={H - 10 - (uniform / scale) * (H - 12)}
				stroke="var(--viz-danger)"
				strokeWidth={1}
				strokeDasharray="3 2"
			/>
			<line x1={0} y1={H - 10} x2={W} y2={H - 10} stroke="var(--sl-color-gray-5)" />
			<text x={0} y={H - 1} fontSize={8.5} fill="var(--sl-color-gray-3)">
				top 12 of {total} training images
			</text>
		</svg>
	);
}
