import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// A full PPO update loop on a 10-armed bandit: collect a batch from π_old,
// normalize advantages, then take several epochs of surrogate-gradient
// ascent on the SAME batch. The clip toggle is the whole story: with it,
// ratios stay pinned near 1; without it, multi-epoch reuse lets ratios run
// away and the policy can collapse onto a lucky arm.
// Parameters (B=16, lr≈1, E up to 16) were calibrated by offline simulation:
// clip ON converges 25/25 runs at E=16; clip OFF survives only ~6/25.

const K = 10;
const MU = [0.42, 0.55, 0.31, 0.66, 0.48, 0.25, 0.58, 0.9, 0.37, 0.61];
const BEST = 7;
const NOISE = 0.5;
const B = 16;

function gauss() {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function softmax(z: number[]): number[] {
	const m = Math.max(...z);
	const e = z.map((x) => Math.exp(x - m));
	const Z = e.reduce((a, b) => a + b, 0);
	return e.map((x) => x / Z);
}

interface Sim {
	z: number[];
	update: number;
	rewards: number[];
	kls: number[];
	ratios: number[]; // batch ratios after the last update's epochs
	emaReward: number | null;
}

function freshSim(): Sim {
	return {
		z: new Array(K).fill(0),
		update: 0,
		rewards: [],
		kls: [],
		ratios: [],
		emaReward: null,
	};
}

const SPEEDS = [
	{ label: "1×", value: 2 },
	{ label: "5×", value: 10 },
	{ label: "25×", value: 50 },
];

const HIST_MAX = 3; // ratios beyond this land in the red overflow bucket
const HIST_BINS = 15;

export default function PPOTrainingDynamics() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(10);
	const [clip, setClip] = useState(true);
	const [eps, setEps] = useState(0.2);
	const [epochs, setEpochs] = useState(8);
	const [lr, setLr] = useState(1.0);
	const knobs = useRef({ clip, eps, epochs, lr });
	knobs.current = { clip, eps, epochs, lr };

	const doUpdate = useCallback(() => {
		const S = sim.current;
		const { clip: useClip, eps: e, epochs: E, lr: a } = knobs.current;
		const piOld = softmax(S.z);
		const acts: number[] = [];
		const rews: number[] = [];
		for (let i = 0; i < B; i++) {
			let u = Math.random();
			let arm = K - 1;
			for (let j = 0; j < K; j++) {
				u -= piOld[j];
				if (u <= 0) {
					arm = j;
					break;
				}
			}
			acts.push(arm);
			rews.push(MU[arm] + NOISE * gauss());
		}
		const mean = rews.reduce((x, y) => x + y, 0) / B;
		const sd =
			Math.sqrt(rews.reduce((x, y) => x + (y - mean) ** 2, 0) / B) || 1;
		const adv = rews.map((r) => (r - mean) / sd);

		for (let ep = 0; ep < E; ep++) {
			const pi = softmax(S.z);
			const g = new Array(K).fill(0);
			for (let i = 0; i < B; i++) {
				const arm = acts[i];
				const rho = Math.min(1e6, pi[arm] / Math.max(1e-12, piOld[arm]));
				const clipped =
					useClip &&
					((adv[i] > 0 && rho > 1 + e) || (adv[i] < 0 && rho < 1 - e));
				if (clipped) continue; // gradient is exactly zero for clipped samples
				const w = adv[i] * rho;
				for (let b = 0; b < K; b++) g[b] += w * ((b === arm ? 1 : 0) - pi[b]);
			}
			for (let b = 0; b < K; b++) S.z[b] += (a * g[b]) / B;
		}

		const piNew = softmax(S.z);
		let kl = 0;
		for (let j = 0; j < K; j++) {
			if (piOld[j] > 1e-12)
				kl += piOld[j] * Math.log(piOld[j] / Math.max(1e-12, piNew[j]));
		}
		S.ratios = acts.map((arm) =>
			Math.min(1e6, piNew[arm] / Math.max(1e-12, piOld[arm])),
		);
		S.emaReward = S.emaReward === null ? mean : 0.9 * S.emaReward + 0.1 * mean;
		S.rewards.push(mean);
		S.kls.push(Math.min(20, kl));
		if (S.rewards.length > 2500) {
			S.rewards = S.rewards.filter((_, i) => i % 2 === 0);
			S.kls = S.kls.filter((_, i) => i % 2 === 0);
		}
		S.update++;
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) doUpdate();
			commit();
		},
		[doUpdate],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const S = sim.current;
	const pi = softmax(S.z);
	const lastKL = S.kls.length ? S.kls[S.kls.length - 1] : 0;
	const maxRho = S.ratios.length ? Math.max(...S.ratios) : 1;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	// Ratio histogram of the last update's batch
	const bins = new Array(HIST_BINS + 1).fill(0);
	for (const r of S.ratios) {
		if (r >= HIST_MAX) bins[HIST_BINS]++;
		else bins[Math.floor((r / HIST_MAX) * HIST_BINS)]++;
	}
	const HW = 250;
	const HH = 120;
	const binW = HW / (HIST_BINS + 1.4);
	const xOf = (r: number) => (r / HIST_MAX) * HIST_BINS * binW;

	const BAR_W = 300;
	const BAR_H = 130;
	const bw = BAR_W / K;

	return (
		<SimShell
			title="PPO update loop, live"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "update", value: String(S.update) },
				{
					label: "reward (EMA)",
					value: S.emaReward === null ? "—" : S.emaReward.toFixed(2),
					color:
						S.emaReward !== null && S.emaReward > 0.8
							? "var(--viz-reward)"
							: undefined,
				},
				{
					label: "KL(π_old‖π_new)",
					value: lastKL.toFixed(3),
					color: lastKL > 0.5 ? "var(--viz-danger)" : "var(--viz-kl)",
				},
				{
					label: "max ρ in batch",
					value: maxRho >= 100 ? maxRho.toExponential(1) : maxRho.toFixed(2),
					color: maxRho > 2 ? "var(--viz-danger)" : undefined,
				},
			]}
		>
			<div
				style={{
					display: "flex",
					gap: "1.2rem",
					flexWrap: "wrap",
					alignItems: "flex-start",
					marginBottom: "0.6rem",
				}}
			>
				<div style={{ flex: "1 1 280px", minWidth: 250 }}>
					<svg
						viewBox={`0 0 ${BAR_W} ${BAR_H + 18}`}
						style={{ width: "100%", height: "auto" }}
						role="img"
						aria-label="Policy probabilities per arm"
					>
						{MU.map((mu, i) => (
							<g key={i}>
								<rect
									x={i * bw + 3}
									y={BAR_H - mu * BAR_H}
									width={bw - 6}
									height={mu * BAR_H}
									fill="var(--sl-color-gray-5)"
									opacity={0.55}
									rx={2}
								/>
								<rect
									x={i * bw + 7}
									y={BAR_H - pi[i] * BAR_H}
									width={bw - 14}
									height={pi[i] * BAR_H}
									fill="var(--viz-policy)"
									rx={2}
								/>
								<text
									x={i * bw + bw / 2}
									y={BAR_H + 13}
									textAnchor="middle"
									fontSize={10}
									fill={
										i === BEST ? "var(--viz-reward)" : "var(--sl-color-gray-3)"
									}
									fontWeight={i === BEST ? 700 : 400}
								>
									{i === BEST ? "★" : i}
								</text>
							</g>
						))}
						<text
							x={3}
							y={12}
							fontSize={11}
							fontWeight={600}
							fill="var(--sl-color-gray-2)"
						>
							π per arm (gray = true mean reward, ★ = best arm)
						</text>
					</svg>
				</div>
				<div style={{ flex: "1 1 230px", minWidth: 220 }}>
					<svg
						viewBox={`0 0 ${HW} ${HH + 18}`}
						style={{ width: "100%", height: "auto" }}
						role="img"
						aria-label="Ratio histogram for the last batch"
					>
						<rect
							x={xOf(Math.max(0, 1 - eps))}
							y={14}
							width={xOf(1 + eps) - xOf(Math.max(0, 1 - eps))}
							height={HH - 14}
							fill="var(--viz-reward)"
							opacity={0.13}
						/>
						<line
							x1={xOf(1)}
							x2={xOf(1)}
							y1={14}
							y2={HH}
							stroke="var(--viz-ref)"
							strokeDasharray="4 3"
							strokeWidth={1}
						/>
						{bins.map((count, bi) => {
							const overflow = bi === HIST_BINS;
							const h = (count / B) * (HH - 20);
							return (
								<rect
									key={bi}
									x={overflow ? HIST_BINS * binW + 4 : bi * binW + 1}
									y={HH - h}
									width={binW - 2}
									height={h}
									fill={overflow ? "var(--viz-danger)" : "var(--viz-kl)"}
									opacity={overflow ? 0.95 : 0.75}
									rx={1.5}
								/>
							);
						})}
						<text
							x={3}
							y={11}
							fontSize={11}
							fontWeight={600}
							fill="var(--sl-color-gray-2)"
						>
							ratios ρᵢ after {epochs} epochs (green = clip band)
						</text>
						<text
							x={xOf(1)}
							y={HH + 13}
							textAnchor="middle"
							fontSize={10}
							fill="var(--sl-color-gray-3)"
						>
							1
						</text>
						<text
							x={HIST_BINS * binW + 4 + binW / 2}
							y={HH + 13}
							textAnchor="middle"
							fontSize={10}
							fill="var(--viz-danger)"
						>
							&gt;{HIST_MAX}
						</text>
					</svg>
				</div>
			</div>

			<Sparkline
				label="mean batch reward"
				series={[{ data: S.rewards, color: "var(--viz-reward)", width: 1.8 }]}
				height={120}
				refLine={{ value: MU[BEST], label: "best arm 0.90" }}
				yInclude={[0, 1]}
			/>
			<div style={{ marginTop: "0.4rem" }}>
				<Sparkline
					label="KL(π_old ‖ π_new) per update"
					series={[
						{ data: S.kls, color: "var(--viz-kl)", width: 1.8, fill: true },
					]}
					height={84}
					yInclude={[0, 0.1]}
					formatY={(v) => v.toFixed(2)}
				/>
			</div>

			<div
				style={{
					display: "flex",
					gap: "1rem",
					flexWrap: "wrap",
					alignItems: "flex-end",
					marginTop: "0.75rem",
				}}
			>
				<button
					type="button"
					className="viz-btn"
					onClick={() => setClip(!clip)}
					style={
						clip
							? {
									borderColor: "var(--viz-reward)",
									color: "var(--viz-reward)",
									fontWeight: 700,
								}
							: {
									background: "var(--viz-danger)",
									borderColor: "var(--viz-danger)",
									color: "#fff",
									fontWeight: 700,
								}
					}
				>
					{clip ? "clipping: ON" : "clipping: OFF ⚠"}
				</button>
				<label className="viz-slider" style={{ flex: "1 1 120px" }}>
					<span>
						ε = <span className="viz-slider-value">{eps.toFixed(2)}</span>
					</span>
					<input
						type="range"
						min={0.05}
						max={0.5}
						step={0.05}
						value={eps}
						onChange={(e) => setEps(parseFloat(e.target.value))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 120px" }}>
					<span>
						epochs per batch ={" "}
						<span
							className="viz-slider-value"
							style={{
								color: epochs >= 12 && !clip ? "var(--viz-danger)" : undefined,
							}}
						>
							{epochs}
						</span>
					</span>
					<input
						type="range"
						min={1}
						max={16}
						step={1}
						value={epochs}
						onChange={(e) => setEpochs(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 120px" }}>
					<span>
						learning rate ={" "}
						<span className="viz-slider-value">{lr.toFixed(1)}</span>
					</span>
					<input
						type="range"
						min={0.1}
						max={3}
						step={0.1}
						value={lr}
						onChange={(e) => setLr(parseFloat(e.target.value))}
					/>
				</label>
			</div>
			<div
				style={{
					fontSize: "0.78rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.5rem",
					lineHeight: 1.5,
				}}
			>
				Each update: sample a fresh batch of {B} pulls from π_old, normalize
				advantages within the batch, then reuse that batch for the chosen number
				of surrogate-ascent epochs.
			</div>
		</SimShell>
	);
}
