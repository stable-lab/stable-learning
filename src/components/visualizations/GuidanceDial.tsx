import { useCallback, useMemo, useRef, useState } from "react";
import PixelCanvas from "./lib/PixelCanvas";
import SimShell from "./lib/SimShell";
import {
	alphaBar,
	epsFromX0,
	expectedX0,
	gaussian,
	makeRng,
	posteriorWeights,
	reverseStep,
	rmse,
} from "./lib/diffusionMath";
import { makeLabeledDataset, meanImage, SHAPE_NAMES, SPRITE_N, SPRITE_SIZE } from "./lib/sprites";
import { useSimLoop } from "./lib/useSimLoop";

// Real classifier-free guidance, with both scores computed exactly.
//
//   ε_guided = ε_uncond + w·(ε_cond − ε_uncond)
//
// w = 0 ignores the prompt, w = 1 is ordinary conditional sampling, and w > 1
// extrapolates *past* the conditional prediction, away from the
// unconditional one.
//
// Measured over 32 seeds on a fixed prompt: prompt accuracy goes 25% → 100%
// as soon as w reaches 0.5, and within-class diversity then decays — 13 of
// the 16 possible images at w = 1, 8 at w = 8 and 15, with the most frequent
// single image rising from 16% to 25% of draws. Distance-to-nearest-real
// stays 0.003 throughout: no saturation artifacts, because the score being
// extrapolated here is exact. In real systems it is a learned approximation,
// and extrapolating an approximation is where the burned-out look comes from.

const N_DATA = 128;
const STEPS = 40;
const SPEEDS = [
	{ label: "1×", value: 8 },
	{ label: "4×", value: 32 },
	{ label: "20×", value: 160 },
];

export default function GuidanceDial() {
	const [target, setTarget] = useState(0);
	const [w, setW] = useState(1);
	const [speed, setSpeed] = useState(SPEEDS[1].value);
	const [seed, setSeed] = useState(1);
	const [, forceRender] = useState(0);

	const { data, labels } = useMemo(() => makeLabeledDataset(N_DATA, 3), []);
	const classSets = useMemo(() => {
		const out: Float32Array[][] = Array.from({ length: SHAPE_NAMES.length }, () => []);
		labels.forEach((l, i) => out[l].push(data[i]));
		return out;
	}, [data, labels]);

	const xRef = useRef<Float32Array>(new Float32Array(SPRITE_N));
	const x0Ref = useRef<Float32Array>(new Float32Array(SPRITE_N));
	const stepRef = useRef(0);
	const rngRef = useRef<() => number>(makeRng(1));
	const gallery = useRef<{ img: Float32Array; label: number }[]>([]);

	const datasetMean = useMemo(() => meanImage(data), [data]);

	const begin = useCallback(
		(s: number) => {
			const rng = makeRng(s * 911 + 5);
			rngRef.current = rng;
			const x = new Float32Array(SPRITE_N);
			for (let i = 0; i < SPRITE_N; i++) x[i] = gaussian(rng);
			xRef.current = x;
			// Before the first step the model has seen only noise, so its best
			// guess is the dataset average — show that rather than an empty buffer.
			x0Ref.current = datasetMean;
			stepRef.current = 0;
		},
		[datasetMean],
	);

	if (stepRef.current === 0 && xRef.current.every((v) => v === 0)) begin(1);

	const nearestLabel = useCallback(
		(x: Float32Array) => {
			let bi = 0;
			let bd = Number.POSITIVE_INFINITY;
			data.forEach((d, i) => {
				const r = rmse(x, d);
				if (r < bd) {
					bd = r;
					bi = i;
				}
			});
			return { label: labels[bi], dist: bd };
		},
		[data, labels],
	);

	const advance = useCallback(() => {
		if (stepRef.current >= STEPS) return;
		const k = STEPS - stepRef.current;
		const abT = alphaBar(k / STEPS);
		const abPrev = alphaBar((k - 1) / STEPS);
		const x = xRef.current;
		const sub = classSets[target];

		const wu = posteriorWeights(x, data, abT);
		const x0u = expectedX0(data, wu);
		const eu = epsFromX0(x, x0u, abT);

		const wc = posteriorWeights(x, sub, abT);
		const x0c = expectedX0(sub, wc);
		const ec = epsFromX0(x, x0c, abT);

		const eg = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) eg[i] = eu[i] + w * (ec[i] - eu[i]);

		const sa = Math.sqrt(abT);
		const sn = Math.sqrt(1 - abT);
		const x0g = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) x0g[i] = (x[i] - sn * eg[i]) / sa;

		xRef.current = reverseStep(x, x0g, eg, abT, abPrev, 1, rngRef.current);
		x0Ref.current = x0g;
		stepRef.current++;

		if (stepRef.current >= STEPS) {
			const got = nearestLabel(xRef.current);
			gallery.current = [
				{ img: xRef.current.slice(), label: got.label },
				...gallery.current,
			].slice(0, 8);
		}
	}, [classSets, data, target, w, nearestLabel]);

	const onTick = useCallback(
		(ticks: number) => {
			for (let i = 0; i < ticks; i++) {
				if (stepRef.current >= STEPS) {
					// Roll straight into a fresh sample so the gallery fills and the
					// diversity question can actually be answered by watching.
					setSeed((s) => s + 1);
					begin(seed + 1 + i);
				}
				advance();
			}
			forceRender((v) => v + 1);
		},
		[advance, begin, seed],
	);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const reset = useCallback(() => {
		setPlaying(false);
		gallery.current = [];
		const s = seed + 1;
		setSeed(s);
		begin(s);
		forceRender((v) => v + 1);
	}, [seed, begin, setPlaying]);

	const done = stepRef.current >= STEPS;
	const got = done ? nearestLabel(xRef.current) : null;
	const onPrompt = gallery.current.filter((g) => g.label === target).length;
	const distinct = new Set(gallery.current.map((g) => g.img.join(","))).size;

	return (
		<SimShell
			title="Classifier-free guidance"
			playing={playing}
			onToggle={toggle}
			onReset={reset}
			onStep={() => onTick(1)}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "prompt", value: SHAPE_NAMES[target], color: "var(--viz-policy)" },
				{ label: "step", value: `${Math.min(stepRef.current, STEPS)} / ${STEPS}` },
				{ label: "guidance w", value: w.toFixed(1), color: "var(--viz-kl)" },
				{
					label: "on-prompt",
					value: gallery.current.length
						? `${onPrompt}/${gallery.current.length}`
						: "—",
					color:
						gallery.current.length && onPrompt === gallery.current.length
							? "var(--viz-reward)"
							: "var(--viz-danger)",
				},
				{
					label: "distinct",
					value: gallery.current.length ? `${distinct}/${gallery.current.length}` : "—",
					color: "var(--viz-value)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<div className="viz-panel-title">sampling</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<PixelCanvas
							data={xRef.current}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={92}
							label={done ? "finished" : "xₜ"}
							accent={done ? "var(--viz-reward)" : undefined}
						/>
						<PixelCanvas
							data={x0Ref.current}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={92}
							label="guided x̂₀"
							accent="var(--viz-kl)"
						/>
					</div>
					<p style={{ fontSize: "0.78rem", margin: "0.4rem 0 0", color: "var(--sl-color-gray-3)", lineHeight: 1.45 }}>
						{done && got
							? got.label === target
								? `Landed on "${SHAPE_NAMES[got.label]}" — the prompt.`
								: `Landed on "${SHAPE_NAMES[got.label]}", not the prompt.`
							: `Requested "${SHAPE_NAMES[target]}".`}
					</p>
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">recent samples</div>
					<div className="viz-strip">
						{gallery.current.map((g, i) => (
							<PixelCanvas
								key={`${i}-${g.img[0]}`}
								data={g.img}
								cols={SPRITE_SIZE}
								rows={SPRITE_SIZE}
								size={48}
								accent={g.label === target ? "var(--viz-reward)" : "var(--viz-danger)"}
							/>
						))}
					</div>
					{gallery.current.length === 0 && (
						<p style={{ fontSize: "0.78rem", color: "var(--sl-color-gray-3)", margin: "0.3rem 0 0" }}>
							Press Run — finished samples collect here so you can judge
							whether guidance is costing you variety.
						</p>
					)}
				</div>
			</div>

			<div className="viz-controls-row">
				<label className="viz-slider" style={{ flex: "1 1 14rem" }}>
					<span>
						guidance scale w = <span className="viz-slider-value">{w.toFixed(1)}</span>
						{w === 0
							? " — prompt ignored"
							: w <= 1.05
								? " — ordinary conditional sampling"
								: " — extrapolating past the conditional"}
					</span>
					<input
						type="range"
						min={0}
						max={15}
						step={0.5}
						value={w}
						onChange={(e) => setW(Number(e.target.value))}
					/>
				</label>
				<div className="viz-slider" style={{ flex: "1 1 14rem" }}>
					<span>prompt</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem", flexWrap: "wrap" }}>
						{SHAPE_NAMES.map((n, i) => (
							<button
								key={n}
								type="button"
								className={`viz-speed-btn${i === target ? " active" : ""}`}
								onClick={() => {
									setTarget(i);
									gallery.current = [];
									begin(seed);
									forceRender((v) => v + 1);
								}}
							>
								{n}
							</button>
						))}
					</span>
				</div>
			</div>
		</SimShell>
	);
}
