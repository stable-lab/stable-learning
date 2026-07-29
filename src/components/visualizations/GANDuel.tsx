import { useCallback, useEffect, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { gaussian, makeRng } from "./lib/diffusionMath";
import { MLP, sigmoid } from "./lib/tinynn";
import { useSimLoop } from "./lib/useSimLoop";

// A real GAN, trained in the browser: two 2→16→16→k MLPs, hand-written
// backprop, Adam(β₁=0.5), non-saturating loss by default. Nothing here is
// scripted or animated — every dot is the current generator's actual output.
//
// The measured behaviour, over 8 seeds at the default config, is the reason
// this widget exists and the reason its Reset button matters:
//
//   1 D step, lr 2e-3  →  effective modes 3–8, mass off the ring 11%–79%
//   4 D steps, lr 8e-3 →  effective modes 6–8, mass off the ring  9%–15%
//
// So: most runs work, some runs are terrible, the hyperparameters are
// identical, and the loss curves look about the same either way. That spread
// IS the pathology — not a scripted collapse. Note also that a *stronger*
// discriminator tightens the spread rather than causing collapse; with the
// non-saturating loss, a weak D is what starves the generator of gradient.

const MODES = 8;
const RING = 1.0;
const SD = 0.06;
const BATCH = 64;
const N_SHOW = 400;
const SPEEDS = [
	{ label: "1×", value: 30 },
	{ label: "5×", value: 150 },
	{ label: "15×", value: 450 },
];

function modeCenter(m: number): [number, number] {
	const a = (m / MODES) * 2 * Math.PI;
	return [RING * Math.cos(a), RING * Math.sin(a)];
}

interface Nets {
	G: MLP;
	D: MLP;
	rng: () => number;
	iter: number;
}

export default function GANDuel() {
	const [dSteps, setDSteps] = useState(1);
	const [saturating, setSaturating] = useState(false);
	const [speed, setSpeed] = useState(SPEEDS[1].value);
	const [seed, setSeed] = useState(1);
	const [, forceRender] = useState(0);

	const netsRef = useRef<Nets | null>(null);
	const fakeRef = useRef<Float64Array[]>([]);
	const realRef = useRef<Float64Array[]>([]);
	const dLoss = useRef<number[]>([]);
	const gLoss = useRef<number[]>([]);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const realSample = (rng: () => number) => {
		const m = Math.floor(rng() * MODES);
		const [cx, cy] = modeCenter(m);
		return Float64Array.from([cx + gaussian(rng) * SD, cy + gaussian(rng) * SD]);
	};

	const build = useCallback((s: number): Nets => {
		const rng = makeRng(s * 104729 + 17);
		const nets: Nets = {
			G: new MLP([2, 16, 16, 2], ["tanh", "tanh", "none"], makeRng(s * 3 + 1)),
			D: new MLP([2, 16, 16, 1], ["lrelu", "lrelu", "none"], makeRng(s * 7 + 2)),
			rng,
			iter: 0,
		};
		// Populate both clouds before any training, so the opening frame shows
		// the target distribution and the untrained generator's blob rather
		// than an empty ring of circles.
		const noise = () => {
			const z = new Float64Array(2);
			z[0] = gaussian(rng);
			z[1] = gaussian(rng);
			return z;
		};
		realRef.current = Array.from({ length: N_SHOW }, () => realSample(rng));
		fakeRef.current = nets.G.forward(Array.from({ length: N_SHOW }, noise)).map(
			(v) => v.slice(),
		);
		return nets;
	}, []);

	if (!netsRef.current) netsRef.current = build(1);

	const train = useCallback(
		(iters: number) => {
			const nets = netsRef.current;
			if (!nets) return;
			const { G, D, rng } = nets;
			const noise = () => {
				const z = new Float64Array(2);
				z[0] = gaussian(rng);
				z[1] = gaussian(rng);
				return z;
			};

			for (let it = 0; it < iters; it++) {
				let dl = 0;
				for (let d = 0; d < dSteps; d++) {
					const real = Array.from({ length: BATCH }, () => realSample(rng));
					const fake = G.forward(Array.from({ length: BATCH }, noise)).map((v) =>
						v.slice(),
					);
					D.zeroGrad();
					const lr_ = D.forward(real);
					D.backward(lr_.map((o) => Float64Array.from([sigmoid(o[0]) - 1])));
					const lf_ = D.forward(fake);
					D.backward(lf_.map((o) => Float64Array.from([sigmoid(o[0])])));
					D.step(dSteps > 1 ? 8e-3 : 2e-3, 2 * BATCH);
					if (d === dSteps - 1) {
						for (let i = 0; i < BATCH; i++) {
							dl -= Math.log(Math.max(sigmoid(lr_[i][0]), 1e-9)) / (2 * BATCH);
							dl -= Math.log(Math.max(1 - sigmoid(lf_[i][0]), 1e-9)) / (2 * BATCH);
						}
					}
				}

				const z = Array.from({ length: BATCH }, noise);
				const fake = G.forward(z);
				const lo = D.forward(fake.map((v) => v.slice()));
				D.zeroGrad();
				// non-saturating −log D(G(z)) vs the original minimax log(1−D(G(z)))
				const gd = D.backward(
					lo.map((o) =>
						Float64Array.from([
							saturating ? -sigmoid(o[0]) : sigmoid(o[0]) - 1,
						]),
					),
				);
				G.zeroGrad();
				G.backward(gd);
				G.step(2e-3, BATCH);

				let gl = 0;
				for (let i = 0; i < BATCH; i++) {
					gl -= Math.log(Math.max(sigmoid(lo[i][0]), 1e-9)) / BATCH;
				}
				nets.iter++;
				if (nets.iter % 10 === 0) {
					dLoss.current.push(dl);
					gLoss.current.push(gl);
					if (dLoss.current.length > 400) {
						dLoss.current.shift();
						gLoss.current.shift();
					}
				}
			}

			// Refresh the displayed clouds.
			fakeRef.current = G.forward(Array.from({ length: N_SHOW }, noise)).map((v) =>
				v.slice(),
			);
			realRef.current = Array.from({ length: N_SHOW }, () => realSample(rng));
		},
		[dSteps, saturating],
	);

	const onTick = useCallback(
		(ticks: number) => {
			train(Math.min(ticks, 40));
			forceRender((v) => v + 1);
		},
		[train],
	);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const reset = useCallback(
		(nextSeed?: number) => {
			setPlaying(false);
			const s = nextSeed ?? seed + 1;
			setSeed(s);
			netsRef.current = build(s);
			fakeRef.current = [];
			realRef.current = [];
			dLoss.current = [];
			gLoss.current = [];
			forceRender((v) => v + 1);
		},
		[seed, build, setPlaying],
	);

	/* ---------------- what the generator actually covers ---------------- */

	const stats = (() => {
		const pts = fakeRef.current;
		if (pts.length === 0) return { eff: 0, off: 0, maxShare: 0 };
		const cnt = new Array(MODES).fill(0);
		let off = 0;
		for (const s of pts) {
			let best = -1;
			let bd = Number.POSITIVE_INFINITY;
			for (let m = 0; m < MODES; m++) {
				const [cx, cy] = modeCenter(m);
				const d = Math.hypot(s[0] - cx, s[1] - cy);
				if (d < bd) {
					bd = d;
					best = m;
				}
			}
			if (bd < 0.22) cnt[best]++;
			else off++;
		}
		const share = cnt.map((c) => c / pts.length);
		return {
			eff: share.filter((p) => p > 0.02).length,
			off: off / pts.length,
			maxShare: Math.max(...share),
		};
	})();

	/* ---------------- drawing ---------------- */

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const css = 250;
		const px = Math.round(css * dpr);
		if (canvas.width !== px) {
			canvas.width = px;
			canvas.height = px;
		}
		ctx.clearRect(0, 0, px, px);
		const mid = px / 2;
		const sc = mid / 1.45;
		const X = (v: number) => mid + v * sc;
		const Y = (v: number) => mid - v * sc;

		// Target modes.
		ctx.strokeStyle = "rgba(140,130,110,0.5)";
		ctx.lineWidth = 1 * dpr;
		for (let m = 0; m < MODES; m++) {
			const [cx, cy] = modeCenter(m);
			ctx.beginPath();
			ctx.arc(X(cx), Y(cy), 0.22 * sc, 0, 2 * Math.PI);
			ctx.stroke();
		}
		const dot = (p: Float64Array, color: string, r: number) => {
			ctx.fillStyle = color;
			ctx.fillRect(X(p[0]) - r, Y(p[1]) - r, r * 2, r * 2);
		};
		for (const p of realRef.current) dot(p, "rgba(148,163,184,0.75)", 1.1 * dpr);
		for (const p of fakeRef.current) dot(p, "#3b82f6", 1.3 * dpr);
	});

	const iter = netsRef.current?.iter ?? 0;

	return (
		<SimShell
			title="A GAN, actually training"
			playing={playing}
			onToggle={toggle}
			onReset={() => reset()}
			onStep={() => onTick(20)}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "seed", value: `${seed}` },
				{ label: "iter", value: `${iter}` },
				{
					label: "modes covered",
					value: `${stats.eff} / ${MODES}`,
					color: stats.eff >= 7 ? "var(--viz-reward)" : "var(--viz-danger)",
				},
				{
					label: "mass off the data",
					value: `${(stats.off * 100).toFixed(0)}%`,
					color: stats.off > 0.3 ? "var(--viz-danger)" : "var(--viz-reward)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<canvas
						ref={canvasRef}
						style={{ width: "250px", height: "250px", display: "block" }}
						role="img"
						aria-label="real and generated samples over eight target modes"
					/>
					<div className="viz-legend" style={{ justifyContent: "center" }}>
						<span>
							<i style={{ borderColor: "#94a3b8" }} />
							real data
						</span>
						<span>
							<i style={{ borderColor: "#3b82f6" }} />
							generated
						</span>
					</div>
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">discriminator loss</div>
					<Sparkline
						series={[{ data: dLoss.current, color: "var(--viz-danger)", width: 1.6 }]}
						height={64}
						yInclude={[0, 1.4]}
						refLine={{ value: Math.log(4), label: "tie", color: "var(--viz-ref)" }}
						formatY={(v) => v.toFixed(2)}
					/>
					<div className="viz-panel-title" style={{ marginTop: "0.5rem" }}>
						generator loss
					</div>
					<Sparkline
						series={[{ data: gLoss.current, color: "var(--viz-policy)", width: 1.6 }]}
						height={64}
						yInclude={[0, 1.4]}
						formatY={(v) => v.toFixed(2)}
					/>
					<p style={{ fontSize: "0.75rem", lineHeight: 1.45, margin: "0.4rem 0 0", color: "var(--sl-color-gray-3)" }}>
						Neither curve tells you whether this run is good. Compare them
						against the mode readout above as you reset.
					</p>
				</div>
			</div>

			<div className="viz-controls-row">
				<div className="viz-slider" style={{ flex: "0 0 auto" }}>
					<span>discriminator strength</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem" }}>
						{[
							{ label: "weak (1 step)", value: 1 },
							{ label: "strong (4 steps)", value: 4 },
						].map((o) => (
							<button
								key={o.value}
								type="button"
								className={`viz-speed-btn${o.value === dSteps ? " active" : ""}`}
								onClick={() => {
									setDSteps(o.value);
									reset(seed);
								}}
							>
								{o.label}
							</button>
						))}
					</span>
				</div>
				<div className="viz-slider" style={{ flex: "0 0 auto" }}>
					<span>generator loss</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem" }}>
						{[
							{ label: "non-saturating", value: false },
							{ label: "original minimax", value: true },
						].map((o) => (
							<button
								key={String(o.value)}
								type="button"
								className={`viz-speed-btn${o.value === saturating ? " active" : ""}`}
								onClick={() => {
									setSaturating(o.value);
									reset(seed);
								}}
							>
								{o.label}
							</button>
						))}
					</span>
				</div>
			</div>
		</SimShell>
	);
}
