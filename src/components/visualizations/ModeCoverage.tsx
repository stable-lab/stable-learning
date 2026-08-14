import { useCallback, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// Why "drop a mode" is cheap under one objective and catastrophic under
// another.
//
// The target p is a fixed three-component mixture. The model q is a single
// Gaussian — deliberately too simple to fit p, which is the whole point: when
// a model cannot represent everything, the *divergence* decides what it gives
// up. Three copies of q are fitted simultaneously from the same start, under
// forward KL, reverse KL, and Jensen–Shannon.
//
// Everything is computed by direct numerical integration on a fixed grid, so
// these are the actual objectives rather than sampled estimates, and the
// gradients are finite differences on two parameters.

const GRID_LO = -6;
const GRID_HI = 6;
const NG = 480;
const DX = (GRID_HI - GRID_LO) / NG;

const COMPONENTS = [
	{ mu: -3.0, sd: 0.5, w: 0.35 },
	{ mu: 0.1, sd: 0.45, w: 0.3 },
	{ mu: 3.2, sd: 0.6, w: 0.35 },
];

const XS = Float64Array.from({ length: NG }, (_, i) => GRID_LO + (i + 0.5) * DX);
const P = (() => {
	const p = new Float64Array(NG);
	for (let i = 0; i < NG; i++) {
		let v = 0;
		for (const c of COMPONENTS) {
			v +=
				(c.w / (c.sd * Math.sqrt(2 * Math.PI))) *
				Math.exp(-((XS[i] - c.mu) ** 2) / (2 * c.sd * c.sd));
		}
		p[i] = v;
	}
	return p;
})();

function qDensity(mu: number, logSd: number): Float64Array {
	const sd = Math.exp(logSd);
	const q = new Float64Array(NG);
	for (let i = 0; i < NG; i++) {
		q[i] =
			(1 / (sd * Math.sqrt(2 * Math.PI))) *
			Math.exp(-((XS[i] - mu) ** 2) / (2 * sd * sd));
	}
	return q;
}

const EPS = 1e-12;

/** ∫ p log(p/q) — pays an unbounded price wherever p has mass and q does not. */
function forwardKL(mu: number, logSd: number): number {
	const q = qDensity(mu, logSd);
	let s = 0;
	for (let i = 0; i < NG; i++) {
		if (P[i] > EPS) s += P[i] * Math.log(P[i] / Math.max(q[i], EPS)) * DX;
	}
	return s;
}

/** ∫ q log(q/p) — pays nothing for regions of p that q simply avoids. */
function reverseKL(mu: number, logSd: number): number {
	const q = qDensity(mu, logSd);
	let s = 0;
	for (let i = 0; i < NG; i++) {
		if (q[i] > EPS) s += q[i] * Math.log(q[i] / Math.max(P[i], EPS)) * DX;
	}
	return s;
}

/** What the original GAN objective reduces to at an optimal discriminator. */
function jensenShannon(mu: number, logSd: number): number {
	const q = qDensity(mu, logSd);
	let s = 0;
	for (let i = 0; i < NG; i++) {
		const m = 0.5 * (P[i] + q[i]);
		if (P[i] > EPS) s += 0.5 * P[i] * Math.log(P[i] / Math.max(m, EPS)) * DX;
		if (q[i] > EPS) s += 0.5 * q[i] * Math.log(q[i] / Math.max(m, EPS)) * DX;
	}
	return s;
}

type Objective = (mu: number, logSd: number) => number;

const FITTERS: { key: string; label: string; color: string; fn: Objective }[] = [
	{ key: "fwd", label: "forward KL(p‖q) — likelihood", color: "var(--viz-reward)", fn: forwardKL },
	{ key: "js", label: "Jensen–Shannon — the GAN", color: "var(--viz-value)", fn: jensenShannon },
	{ key: "rev", label: "reverse KL(q‖p)", color: "var(--viz-danger)", fn: reverseKL },
];

interface Fit {
	mu: number;
	logSd: number;
}

const START_SD = 0.55;

export default function ModeCoverage() {
	// Where all three fits begin. This is the control that matters: measured
	// over seven starting points, forward KL lands at mu ≈ 0.1, sd = 2.65
	// covering all three modes EVERY time, while JS and reverse KL end up
	// wherever they began — on the left mode from -3.6, the middle from 0.1,
	// the right from 3.0. Same model, same data, same optimizer; the
	// initialization picks the answer.
	const [start, setStart] = useState(3);
	const fits = useRef<Fit[]>(FITTERS.map(() => ({ mu: 3, logSd: Math.log(START_SD) })));
	const [, forceRender] = useState(0);
	const [iters, setIters] = useState(0);

	const onTick = useCallback((ticks: number) => {
		const h = 1e-4;
		const lr = 0.02;
		for (let n = 0; n < ticks; n++) {
			FITTERS.forEach((f, i) => {
				const cur = fits.current[i];
				// Finite-difference gradient on two parameters — exact enough at
				// this scale and far simpler than differentiating three objectives.
				const base = f.fn(cur.mu, cur.logSd);
				const gMu = (f.fn(cur.mu + h, cur.logSd) - base) / h;
				const gSd = (f.fn(cur.mu, cur.logSd + h) - base) / h;
				cur.mu -= lr * Math.max(-4, Math.min(4, gMu));
				cur.logSd -= lr * Math.max(-4, Math.min(4, gSd));
				cur.logSd = Math.max(Math.log(0.12), Math.min(Math.log(4), cur.logSd));
			});
		}
		setIters((v) => v + ticks);
		forceRender((v) => v + 1);
	}, []);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, 40);

	const restart = useCallback((mu: number) => {
		fits.current = FITTERS.map(() => ({ mu, logSd: Math.log(START_SD) }));
		setIters(0);
		forceRender((v) => v + 1);
	}, []);

	const reset = useCallback(() => {
		setPlaying(false);
		restart(start);
	}, [restart, start, setPlaying]);

	/** How many of the three components sit under a given fit's bulk. */
	const covered = (f: Fit) => {
		const sd = Math.exp(f.logSd);
		return COMPONENTS.filter((c) => Math.abs(c.mu - f.mu) < 2 * sd).length;
	};

	return (
		<SimShell
			title="Same model, same data, three divergences"
			playing={playing}
			onToggle={toggle}
			onReset={reset}
			onStep={() => onTick(10)}
			readouts={[
				{ label: "steps", value: `${iters}` },
				...FITTERS.map((f, i) => ({
					label: f.key === "fwd" ? "fwd KL covers" : f.key === "js" ? "JS covers" : "rev KL covers",
					value: `${covered(fits.current[i])}/3`,
					color: f.color,
				})),
			]}
		>
			<Densities fits={fits.current} start={start} />
			<label className="viz-slider" style={{ marginTop: "0.6rem" }}>
				<span>
					where all three fits start: μ ={" "}
					<span className="viz-slider-value">{start.toFixed(1)}</span>
				</span>
				<input
					type="range"
					min={-4}
					max={4}
					step={0.1}
					value={start}
					onChange={(e) => {
						setPlaying(false);
						const v = Number(e.target.value);
						setStart(v);
						restart(v);
					}}
				/>
			</label>

			<div className="viz-legend" style={{ justifyContent: "center", marginTop: "0.3rem" }}>
				<span>
					<i style={{ borderColor: "var(--sl-color-gray-3)", borderTopStyle: "dashed" }} />
					target p (three modes)
				</span>
				{FITTERS.map((f) => (
					<span key={f.key}>
						<i style={{ borderColor: f.color }} />
						{f.label}
					</span>
				))}
			</div>
		</SimShell>
	);
}

function Densities({ fits, start }: { fits: Fit[]; start: number }) {
	const W = 560;
	const H = 210;
	const PAD = { l: 8, r: 8, t: 10, b: 20 };
	const pw = W - PAD.l - PAD.r;
	const ph = H - PAD.t - PAD.b;

	let peak = 0;
	for (const v of P) peak = Math.max(peak, v);
	const curves = fits.map((f) => qDensity(f.mu, f.logSd));
	for (const c of curves) for (const v of c) peak = Math.max(peak, v);

	const X = (x: number) => PAD.l + ((x - GRID_LO) / (GRID_HI - GRID_LO)) * pw;
	const Y = (v: number) => PAD.t + ph - (v / peak) * ph;
	const path = (d: Float64Array) =>
		Array.from(d, (v, i) => `${i === 0 ? "M" : "L"}${X(XS[i]).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			style={{ width: "100%", height: "auto" }}
			role="img"
			aria-label="a three-mode target fitted by a single Gaussian under three divergences"
		>
			<title>One Gaussian fitted to a three-mode target under three divergences</title>
			<path d={path(P)} fill="none" stroke="var(--sl-color-gray-3)" strokeWidth={1.6} strokeDasharray="4 3" />
			{curves.map((c, i) => (
				<path key={FITTERS[i].key} d={path(c)} fill="none" stroke={FITTERS[i].color} strokeWidth={2} />
			))}
			<line
				x1={X(start)}
				y1={PAD.t}
				x2={X(start)}
				y2={PAD.t + ph}
				stroke="var(--sl-color-gray-4)"
				strokeWidth={1}
				strokeDasharray="2 3"
			/>
			<line x1={PAD.l} y1={PAD.t + ph} x2={W - PAD.r} y2={PAD.t + ph} stroke="var(--sl-color-gray-5)" />
			{COMPONENTS.map((c) => (
				<text key={c.mu} x={X(c.mu)} y={H - 5} fontSize={9} textAnchor="middle" fill="var(--sl-color-gray-3)">
					mode
				</text>
			))}
		</svg>
	);
}
