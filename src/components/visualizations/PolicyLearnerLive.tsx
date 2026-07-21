import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// The same 4×4 gridworld the reader steers by hand in ActionChainDemo,
// now learned live by tabular REINFORCE with a per-state value baseline.
// Rewards match the manual demo: step −1, trap −5 (non-terminal), goal +10.

const N = 4;
const S0 = { r: 3, c: 0 };
const GOAL = { r: 0, c: 3 };
const TRAP = { r: 1, c: 2 };
const GAMMA = 0.9;
const MAX_STEPS = 40;
const OPTIMAL = 5; // 6-move path: five −1 steps, then +10
const ACTIONS = [
	{ dr: -1, dc: 0 }, // up
	{ dr: 1, dc: 0 }, // down
	{ dr: 0, dc: -1 }, // left
	{ dr: 0, dc: 1 }, // right
];
const CELL = 72;
const GAP = 4;
const GRID_W = N * CELL + (N + 1) * GAP;

const sIdx = (r: number, c: number) => r * N + c;
const isGoal = (r: number, c: number) => r === GOAL.r && c === GOAL.c;
const isTrap = (r: number, c: number) => r === TRAP.r && c === TRAP.c;
const cellReward = (r: number, c: number) =>
	isGoal(r, c) ? 10 : isTrap(r, c) ? -5 : -1;

function softmax(theta: Float32Array, s: number): number[] {
	let m = -Infinity;
	for (let a = 0; a < 4; a++) m = Math.max(m, theta[s * 4 + a]);
	const e = [0, 0, 0, 0];
	let z = 0;
	for (let a = 0; a < 4; a++) {
		e[a] = Math.exp(theta[s * 4 + a] - m);
		z += e[a];
	}
	return e.map((v) => v / z);
}

interface Sim {
	theta: Float32Array;
	V: Float32Array;
	visits: Float32Array;
	pos: { r: number; c: number };
	traj: { s: number; a: number; rew: number }[];
	path: { r: number; c: number }[];
	episode: number;
	emaReturn: number | null;
	returns: number[];
	emaCurve: number[];
}

function freshSim(): Sim {
	return {
		theta: new Float32Array(N * N * 4),
		V: new Float32Array(N * N),
		visits: new Float32Array(N * N),
		pos: { ...S0 },
		traj: [],
		path: [{ ...S0 }],
		episode: 0,
		emaReturn: null,
		returns: [],
		emaCurve: [],
	};
}

const SPEEDS = [
	{ label: "1×", value: 12 },
	{ label: "5×", value: 60 },
	{ label: "25×", value: 300 },
	{ label: "125×", value: 1500 },
];

export default function PolicyLearnerLive() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(60);
	const [lrSlider, setLrSlider] = useState(15); // 0..100 log scale, 0.05 → 5; 15 ⇒ α ≈ 0.1
	const alpha = 0.05 * 10 ** ((lrSlider / 100) * 2);
	const alphaRef = useRef(alpha);
	alphaRef.current = alpha;

	const envStep = useCallback(() => {
		const S = sim.current;
		const s = sIdx(S.pos.r, S.pos.c);
		S.visits[s] += 1;
		const pi = softmax(S.theta, s);
		let u = Math.random();
		let a = 3;
		for (let i = 0; i < 4; i++) {
			u -= pi[i];
			if (u <= 0) {
				a = i;
				break;
			}
		}
		const nr = Math.max(0, Math.min(N - 1, S.pos.r + ACTIONS[a].dr));
		const nc = Math.max(0, Math.min(N - 1, S.pos.c + ACTIONS[a].dc));
		const rew = cellReward(nr, nc);
		S.traj.push({ s, a, rew });
		S.pos = { r: nr, c: nc };
		S.path.push({ r: nr, c: nc });

		if (isGoal(nr, nc) || S.traj.length >= MAX_STEPS) {
			// Episode over: REINFORCE update with value baseline.
			const al = alphaRef.current;
			let G = 0;
			const Gs = new Array<number>(S.traj.length);
			for (let t = S.traj.length - 1; t >= 0; t--) {
				G = S.traj[t].rew + GAMMA * G;
				Gs[t] = G;
			}
			for (let t = 0; t < S.traj.length; t++) {
				const { s: st, a: at } = S.traj[t];
				const adv = Gs[t] - S.V[st];
				S.V[st] += 0.15 * (Gs[t] - S.V[st]);
				const pit = softmax(S.theta, st);
				for (let b = 0; b < 4; b++) {
					S.theta[st * 4 + b] += al * adv * ((b === at ? 1 : 0) - pit[b]);
				}
			}
			const total = S.traj.reduce((acc, x) => acc + x.rew, 0);
			S.emaReturn =
				S.emaReturn === null ? total : 0.95 * S.emaReturn + 0.05 * total;
			S.returns.push(total);
			S.emaCurve.push(S.emaReturn);
			if (S.returns.length > 3000) {
				S.returns = S.returns.filter((_, i) => i % 2 === 0);
				S.emaCurve = S.emaCurve.filter((_, i) => i % 2 === 0);
			}
			S.episode++;
			for (let i = 0; i < S.visits.length; i++) S.visits[i] *= 0.98;
			S.pos = { ...S0 };
			S.traj = [];
			S.path = [{ ...S0 }];
		}
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) envStep();
			commit();
		},
		[envStep],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const S = sim.current;
	// Entropy weighted by state visitation: unvisited corners stay uniform
	// forever, so a plain average would never drop — weighting makes "the
	// policy locked up along its route" read as ~0 bits.
	let entropy = 0;
	let visitZ = 0;
	for (let s = 0; s < N * N; s++) visitZ += S.visits[s];
	const policies: number[][] = [];
	for (let s = 0; s < N * N; s++) {
		const pi = softmax(S.theta, s);
		policies.push(pi);
		let h = 0;
		for (const p of pi) if (p > 1e-9) h -= p * Math.log2(p);
		entropy += visitZ > 0 ? (S.visits[s] / visitZ) * h : h / (N * N);
	}

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	const vColor = (v: number) => {
		const t = Math.max(-1, Math.min(1, v / 10));
		return t >= 0
			? `rgba(34,197,94,${0.32 * t})`
			: `rgba(239,68,68,${0.32 * -t})`;
	};

	const cx = (c: number) => GAP + c * (CELL + GAP) + CELL / 2;
	const cy = (r: number) => GAP + r * (CELL + GAP) + CELL / 2;

	return (
		<SimShell
			title="REINFORCE, live"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "episode", value: String(S.episode) },
				{
					label: "avg return",
					value: S.emaReturn === null ? "—" : S.emaReturn.toFixed(1),
					color:
						S.emaReturn !== null && S.emaReturn > 2
							? "var(--viz-reward)"
							: S.emaReturn !== null && S.emaReturn < -15
								? "var(--viz-danger)"
								: undefined,
				},
				{
					label: "policy entropy",
					value: `${entropy.toFixed(2)} bits`,
					color: entropy < 0.15 ? "var(--viz-danger)" : undefined,
				},
			]}
		>
			<div
				style={{
					display: "flex",
					gap: "1.1rem",
					flexWrap: "wrap",
					alignItems: "flex-start",
				}}
			>
				<svg
					viewBox={`0 0 ${GRID_W} ${GRID_W}`}
					style={{ width: 300, maxWidth: "100%", flex: "0 0 auto" }}
					role="img"
					aria-label="Gridworld with learned policy arrows and value heatmap"
				>
					{Array.from({ length: N }, (_, r) =>
						Array.from({ length: N }, (_, c) => {
							const s = sIdx(r, c);
							const pi = policies[s];
							const terminal = isGoal(r, c);
							return (
								<g key={s}>
									<rect
										x={GAP + c * (CELL + GAP)}
										y={GAP + r * (CELL + GAP)}
										width={CELL}
										height={CELL}
										rx={6}
										fill={terminal ? "rgba(34,197,94,0.25)" : vColor(S.V[s])}
										stroke="var(--sl-color-gray-5)"
									/>
									{isTrap(r, c) && (
										<text
											x={cx(c)}
											y={cy(r) + 24}
											textAnchor="middle"
											fontSize={11}
											fill="var(--viz-danger)"
											fontWeight={700}
										>
											−5
										</text>
									)}
									{terminal && (
										<text
											x={cx(c)}
											y={cy(r) + 5}
											textAnchor="middle"
											fontSize={14}
											fill="var(--viz-reward)"
											fontWeight={700}
										>
											+10
										</text>
									)}
									{r === S0.r && c === S0.c && (
										<text
											x={cx(c) - CELL / 2 + 8}
											y={cy(r) - CELL / 2 + 16}
											fontSize={11}
											fill="var(--sl-color-gray-3)"
											fontWeight={700}
										>
											S
										</text>
									)}
									{!terminal &&
										ACTIONS.map((act, a) => {
											const p = pi[a];
											const len = 8 + p * 20;
											const x2 = cx(c) + act.dc * len;
											const y2 = cy(r) + act.dr * len;
											const hx = act.dc === 0 ? 4 : 0;
											const hy = act.dr === 0 ? 4 : 0;
											return (
												<g key={a} opacity={0.18 + 0.82 * p}>
													<line
														x1={cx(c)}
														y1={cy(r)}
														x2={x2}
														y2={y2}
														stroke="var(--viz-policy)"
														strokeWidth={1.6 + p * 2.4}
													/>
													<polygon
														points={`${x2 + act.dc * 5},${y2 + act.dr * 5} ${x2 - hx},${y2 - hy} ${x2 + hx},${y2 + hy}`}
														fill="var(--viz-policy)"
													/>
												</g>
											);
										})}
								</g>
							);
						}),
					)}
					{S.path.length > 1 && (
						<polyline
							points={S.path.map((p) => `${cx(p.c)},${cy(p.r)}`).join(" ")}
							fill="none"
							stroke="var(--viz-policy)"
							strokeWidth={2.5}
							opacity={0.35}
							strokeLinejoin="round"
						/>
					)}
					<circle
						cx={cx(S.pos.c)}
						cy={cy(S.pos.r)}
						r={9}
						fill="var(--viz-policy)"
						stroke="var(--sl-color-bg)"
						strokeWidth={2}
					/>
				</svg>

				<div style={{ flex: "1 1 260px", minWidth: 240 }}>
					<Sparkline
						label="return per episode (EMA in bold)"
						series={[
							{
								data: S.returns,
								color: "var(--viz-reward)",
								width: 1,
								opacity: 0.25,
							},
							{ data: S.emaCurve, color: "var(--viz-reward)", width: 2.2 },
						]}
						height={150}
						refLine={{ value: OPTIMAL, label: "optimal +5" }}
						yInclude={[-20, 10]}
					/>
					<label className="viz-slider" style={{ marginTop: "0.7rem" }}>
						<span>
							learning rate α ={" "}
							<span
								className="viz-slider-value"
								style={{
									color:
										alpha >= 0.5 ? "var(--viz-danger)" : "var(--viz-policy)",
								}}
							>
								{alpha.toFixed(2)}
							</span>
							{alpha >= 0.5 && (
								<span style={{ color: "var(--viz-danger)" }}>
									{" "}
									⚠ unstable zone
								</span>
							)}
						</span>
						<input
							type="range"
							min={0}
							max={100}
							step={1}
							value={lrSlider}
							onChange={(e) => setLrSlider(parseInt(e.target.value, 10))}
						/>
					</label>
					<div
						style={{
							fontSize: "0.78rem",
							color: "var(--sl-color-gray-3)",
							marginTop: "0.5rem",
							lineHeight: 1.5,
						}}
					>
						Arrows: π(a|s), longer = more probable. Cell tint: learned baseline
						V(s), green = valuable. γ = {GAMMA} fixed; baseline update α
						<sub>V</sub> = 0.15.
					</div>
				</div>
			</div>
		</SimShell>
	);
}
