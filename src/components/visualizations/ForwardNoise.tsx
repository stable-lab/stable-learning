import { useCallback, useMemo, useRef, useState } from "react";
import PixelCanvas from "./lib/PixelCanvas";
import SimShell from "./lib/SimShell";
import { alphaBar, gaussian, makeRng, snr } from "./lib/diffusionMath";
import { radialPowerSpectrum } from "./lib/spectrum";
import { SPRITES, SPRITE_N, SPRITE_SIZE } from "./lib/sprites";
import { useSimLoop } from "./lib/useSimLoop";

// The forward process, in three simultaneous views of the same slider.
//
// The noise realization ε is drawn ONCE and held fixed as t moves. That is
// the whole reason the left panel dissolves smoothly instead of reshuffling:
// the reader is watching one fixed noise vector being mixed in at increasing
// strength, which is what x_t = √ᾱ·x₀ + √(1-ᾱ)·ε actually says. Reset draws
// a fresh ε.
//
// The right panel is the load-bearing one. Signal power scales by ᾱ, the
// noise floor is n²(1-ᾱ) flat across all frequencies, and where they cross
// is the frequency above which detail is gone. That crossing sweeps
// leftward as t grows — fine detail dies first, silhouette dies last — and
// it is why denoising comes back coarse-to-fine.

const T = 1000;
const SPEEDS = [
	{ label: "1×", value: 90 },
	{ label: "3×", value: 260 },
	{ label: "8×", value: 700 },
];
const HIST_BINS = 46;
const HIST_LO = -3.2;
const HIST_HI = 3.2;

export default function ForwardNoise() {
	const [t, setT] = useState(0);
	const [spriteIdx, setSpriteIdx] = useState(0);
	const [seed, setSeed] = useState(1);
	const [speed, setSpeed] = useState(SPEEDS[0].value);
	const dir = useRef(1);

	const x0 = SPRITES[spriteIdx].data;

	// One fixed noise vector per (seed) — see note above.
	const eps = useMemo(() => {
		const rng = makeRng(seed * 7919 + 13);
		const e = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) e[i] = gaussian(rng);
		return e;
	}, [seed]);

	const ab = alphaBar(t / T);

	const xt = useMemo(() => {
		const sa = Math.sqrt(ab);
		const sn = Math.sqrt(1 - ab);
		const out = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) out[i] = sa * x0[i] + sn * eps[i];
		return out;
	}, [ab, x0, eps]);

	const onTick = useCallback((ticks: number) => {
		setT((prev) => {
			let next = prev + dir.current * ticks;
			if (next >= T) {
				next = T;
				dir.current = -1;
			} else if (next <= 0) {
				next = 0;
				dir.current = 1;
			}
			return next;
		});
	}, []);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const reset = useCallback(() => {
		setPlaying(false);
		dir.current = 1;
		setT(0);
		setSeed((s) => s + 1);
	}, [setPlaying]);

	/* ---------------- histogram of pixel values ---------------- */

	const hist = useMemo(() => {
		const bins = new Float64Array(HIST_BINS);
		const w = (HIST_HI - HIST_LO) / HIST_BINS;
		for (let i = 0; i < xt.length; i++) {
			const b = Math.floor((xt[i] - HIST_LO) / w);
			if (b >= 0 && b < HIST_BINS) bins[b] += 1;
		}
		// Normalize to a density so the N(0,1) overlay is directly comparable.
		let peak = 0;
		for (let b = 0; b < HIST_BINS; b++) {
			bins[b] /= xt.length * w;
			if (bins[b] > peak) peak = bins[b];
		}
		return { bins, w, peak: Math.max(peak, 0.42) };
	}, [xt]);

	/* ---------------- power spectra ---------------- */

	const cleanSpec = useMemo(() => radialPowerSpectrum(x0, SPRITE_SIZE), [x0]);
	const noisySpec = useMemo(() => radialPowerSpectrum(xt, SPRITE_SIZE), [xt]);

	// Flat expected noise power per DFT coefficient: n²·σ² with σ² = 1-ᾱ.
	const noiseFloor = SPRITE_N * (1 - ab);

	// Highest frequency whose surviving signal still beats the noise floor.
	const crossK = useMemo(() => {
		let last = 0;
		for (let i = 0; i < cleanSpec.k.length; i++) {
			if (ab * cleanSpec.power[i] > noiseFloor) last = cleanSpec.k[i];
		}
		return last;
	}, [cleanSpec, ab, noiseFloor]);

	const detailPct = Math.round((crossK / (SPRITE_SIZE / 2)) * 100);

	return (
		<SimShell
			title="The forward process"
			playing={playing}
			onToggle={toggle}
			onReset={reset}
			onStep={() => onTick(40)}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "t", value: `${t} / ${T}` },
				{ label: "ᾱ", value: ab.toFixed(3), color: "var(--viz-policy)" },
				{ label: "SNR", value: `${(10 * Math.log10(snr(ab))).toFixed(1)} dB` },
				{
					label: "detail surviving",
					value: `${detailPct}%`,
					color: detailPct > 0 ? "var(--viz-reward)" : "var(--viz-danger)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<div className="viz-panel-title">the image</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<PixelCanvas
							data={x0}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={92}
							label="x₀ (clean)"
						/>
						<PixelCanvas
							data={xt}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={92}
							label={`xₜ at t = ${t}`}
							accent="var(--viz-policy)"
						/>
					</div>
					<div className="viz-sprite-row">
						{SPRITES.map((s, i) => (
							<button
								key={s.name}
								type="button"
								className={`viz-sprite-btn${i === spriteIdx ? " active" : ""}`}
								onClick={() => setSpriteIdx(i)}
								aria-label={s.name}
								aria-pressed={i === spriteIdx}
							>
								<PixelCanvas
									data={s.data}
									cols={SPRITE_SIZE}
									rows={SPRITE_SIZE}
									size={22}
								/>
							</button>
						))}
					</div>
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">pixel histogram</div>
					<Histogram hist={hist} />
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">power spectrum</div>
					<Spectrum
						cleanK={cleanSpec.k}
						cleanP={cleanSpec.power}
						noisyP={noisySpec.power}
						ab={ab}
						noiseFloor={noiseFloor}
						crossK={crossK}
					/>
					<div className="viz-legend">
						<span>
							<i style={{ borderColor: "var(--viz-reward)" }} />
							signal left (ᾱ·clean)
						</span>
						<span>
							<i style={{ borderColor: "var(--viz-danger)" }} />
							noise floor
						</span>
						<span>
							<i style={{ borderColor: "var(--viz-policy)" }} />
							measured xₜ
						</span>
						<span>
							<i
								style={{
									borderColor: "var(--viz-ref)",
									borderTopStyle: "dashed",
								}}
							/>
							clean x₀
						</span>
					</div>
				</div>
			</div>

			<label className="viz-slider" style={{ marginTop: "0.7rem" }}>
				<span>
					noise level t ={" "}
					<span className="viz-slider-value">{t}</span>
				</span>
				<input
					type="range"
					min={0}
					max={T}
					step={1}
					value={t}
					onChange={(e) => {
						setPlaying(false);
						setT(Number(e.target.value));
					}}
				/>
			</label>
		</SimShell>
	);
}

/* ------------------------------------------------------------------ */

function Histogram({
	hist,
}: {
	hist: { bins: Float64Array; w: number; peak: number };
}) {
	const W = 300;
	const H = 168;
	const PAD = { l: 6, r: 6, t: 8, b: 18 };
	const plotW = W - PAD.l - PAD.r;
	const plotH = H - PAD.t - PAD.b;

	const xOf = (v: number) => PAD.l + ((v - HIST_LO) / (HIST_HI - HIST_LO)) * plotW;
	const yOf = (d: number) => PAD.t + plotH - (d / hist.peak) * plotH;

	const bars = [];
	for (let b = 0; b < HIST_BINS; b++) {
		const v0 = HIST_LO + b * hist.w;
		const h = plotH - (yOf(hist.bins[b]) - PAD.t);
		if (h <= 0) continue;
		bars.push(
			<rect
				key={b}
				x={xOf(v0) + 0.4}
				y={yOf(hist.bins[b])}
				width={(plotW / HIST_BINS) - 0.8}
				height={h}
				fill="var(--viz-policy)"
				opacity={0.55}
			/>,
		);
	}

	// The target: unit Gaussian, the distribution the forward process is
	// walking toward regardless of which image it started from.
	const curve: string[] = [];
	for (let i = 0; i <= 80; i++) {
		const v = HIST_LO + (i / 80) * (HIST_HI - HIST_LO);
		const d = Math.exp(-(v * v) / 2) / Math.sqrt(2 * Math.PI);
		curve.push(`${i === 0 ? "M" : "L"}${xOf(v).toFixed(1)},${yOf(d).toFixed(1)}`);
	}

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="viz-panel-chart"
			role="img"
			aria-label="histogram of pixel values against the unit Gaussian"
		>
			<title>Pixel-value histogram versus the unit Gaussian</title>
			{bars}
			<path d={curve.join(" ")} fill="none" stroke="var(--viz-danger)" strokeWidth={1.6} />
			<line
				x1={PAD.l}
				y1={PAD.t + plotH}
				x2={W - PAD.r}
				y2={PAD.t + plotH}
				stroke="var(--sl-color-gray-5)"
			/>
			{[-3, -2, -1, 0, 1, 2, 3].map((v) => (
				<text
					key={v}
					x={xOf(v)}
					y={H - 5}
					fontSize={9}
					textAnchor="middle"
					fill="var(--sl-color-gray-3)"
				>
					{v}
				</text>
			))}
			<text x={W - PAD.r} y={PAD.t + 8} fontSize={9.5} textAnchor="end" fill="var(--viz-danger)">
				𝒩(0,1)
			</text>
		</svg>
	);
}

/* ------------------------------------------------------------------ */

function Spectrum({
	cleanK,
	cleanP,
	noisyP,
	ab,
	noiseFloor,
	crossK,
}: {
	cleanK: number[];
	cleanP: number[];
	noisyP: number[];
	ab: number;
	noiseFloor: number;
	crossK: number;
}) {
	const W = 300;
	const H = 168;
	const PAD = { l: 30, r: 8, t: 8, b: 22 };
	const plotW = W - PAD.l - PAD.r;
	const plotH = H - PAD.t - PAD.b;

	const FLOOR = 1e-2;
	const lg = (p: number) => Math.log10(Math.max(p, FLOOR));

	const yLo = -2;
	const yHi = useMemo(() => {
		let m = 1;
		for (const p of cleanP) m = Math.max(m, lg(p));
		return Math.ceil(m) + 0.2;
	}, [cleanP]);

	const kMax = cleanK[cleanK.length - 1] ?? 12;
	const xOf = (k: number) => PAD.l + (Math.log10(k) / Math.log10(kMax)) * plotW;
	const yOf = (p: number) =>
		PAD.t + plotH - ((lg(p) - yLo) / (yHi - yLo)) * plotH;

	const line = (vals: number[], scale: number) =>
		cleanK
			.map(
				(k, i) =>
					`${i === 0 ? "M" : "L"}${xOf(k).toFixed(1)},${yOf(vals[i] * scale).toFixed(1)}`,
			)
			.join(" ");

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="viz-panel-chart"
			role="img"
			aria-label="radially averaged power spectrum, signal against noise floor"
		>
			<title>Power spectrum: surviving signal against the flat noise floor</title>

			{[yLo, 0, 2, 4].filter((v) => v >= yLo && v <= yHi).map((v) => (
				<g key={v}>
					<line
						x1={PAD.l}
						y1={yOf(10 ** v)}
						x2={W - PAD.r}
						y2={yOf(10 ** v)}
						stroke="var(--sl-color-gray-5)"
						strokeWidth={0.7}
					/>
					<text
						x={PAD.l - 4}
						y={yOf(10 ** v) + 3}
						fontSize={8.5}
						textAnchor="end"
						fill="var(--sl-color-gray-3)"
					>
						10{sup(v)}
					</text>
				</g>
			))}

			{/* Where surviving signal falls under the noise floor: everything to
			    the right of this line is detail that no longer exists. */}
			{crossK > 0 && crossK < kMax && (
				<>
					<rect
						x={xOf(crossK)}
						y={PAD.t}
						width={W - PAD.r - xOf(crossK)}
						height={plotH}
						fill="var(--viz-danger)"
						opacity={0.07}
					/>
					<line
						x1={xOf(crossK)}
						y1={PAD.t}
						x2={xOf(crossK)}
						y2={PAD.t + plotH}
						stroke="var(--viz-danger)"
						strokeWidth={1}
						strokeDasharray="3 2"
					/>
				</>
			)}

			{/* Clean spectrum, for reference: the 1/f-ish fall-off of real structure. */}
			<path d={line(cleanP, 1)} fill="none" stroke="var(--viz-ref)" strokeWidth={1.2} strokeDasharray="3 2" />
			{/* What survives at this noise level. */}
			<path d={line(cleanP, ab)} fill="none" stroke="var(--viz-reward)" strokeWidth={1.7} />
			{/* What is actually measured in x_t. */}
			<path d={line(noisyP, 1)} fill="none" stroke="var(--viz-policy)" strokeWidth={1.7} opacity={0.85} />
			{/* Flat noise floor. */}
			<line
				x1={PAD.l}
				y1={yOf(noiseFloor)}
				x2={W - PAD.r}
				y2={yOf(noiseFloor)}
				stroke="var(--viz-danger)"
				strokeWidth={1.4}
			/>

			<line x1={PAD.l} y1={PAD.t + plotH} x2={W - PAD.r} y2={PAD.t + plotH} stroke="var(--sl-color-gray-5)" />
			<text x={PAD.l} y={H - 6} fontSize={8.5} fill="var(--sl-color-gray-3)">
				coarse
			</text>
			<text x={W - PAD.r} y={H - 6} fontSize={8.5} textAnchor="end" fill="var(--sl-color-gray-3)">
				fine →
			</text>
		</svg>
	);
}

function sup(v: number): string {
	const map: Record<string, string> = {
		"-": "⁻",
		"0": "⁰",
		"1": "¹",
		"2": "²",
		"3": "³",
		"4": "⁴",
		"5": "⁵",
		"6": "⁶",
	};
	return String(v)
		.split("")
		.map((c) => map[c] ?? c)
		.join("");
}
