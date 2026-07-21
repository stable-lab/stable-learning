import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// The full GRPO loop, one group per tick: sample G rollouts for a prompt,
// score them 0/1, normalize within the group, push the policy. Prompts
// alternate between an easy and a hard type sharing one policy — so the
// reader can watch easy prompts stop teaching (all-correct ⇒ σ=0) while
// hard prompts keep producing signal. That asymmetry is the motivation for
// dynamic sampling in DAPO.

const STRATS = ["CoT", "Direct", "Guess", "Refuse"];
const P_EASY = [0.95, 0.8, 0.6, 0.3];
const P_HARD = [0.15, 0.05, 0.02, 0.005];

function softmax(z: number[]): number[] {
	const m = Math.max(...z);
	const e = z.map((x) => Math.exp(x - m));
	const Z = e.reduce((a, b) => a + b, 0);
	return e.map((x) => x / Z);
}

interface Row {
	strat: number;
	ok: boolean;
	adv: number;
}

interface Group {
	hard: boolean;
	rows: Row[];
	mean: number;
	sd: number;
	wasted: boolean;
}

interface Sim {
	z: number[];
	groups: number;
	last: Group | null;
	emaEasy: number | null;
	emaHard: number | null;
	easyCurve: number[];
	hardCurve: number[];
	wastedEasy: number[]; // sliding-window flags
	wastedHard: number[];
	wasteEasyCurve: number[];
	wasteHardCurve: number[];
}

function freshSim(): Sim {
	return {
		z: [0, 0, 0, 0],
		groups: 0,
		last: null,
		emaEasy: null,
		emaHard: null,
		easyCurve: [],
		hardCurve: [],
		wastedEasy: [],
		wastedHard: [],
		wasteEasyCurve: [],
		wasteHardCurve: [],
	};
}

const SPEEDS = [
	{ label: "1×", value: 1.5 },
	{ label: "5×", value: 8 },
	{ label: "25×", value: 40 },
];

export default function GRPOLive() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(1.5);
	const [G, setG] = useState(8);
	const [sigmaNorm, setSigmaNorm] = useState(true);
	const [lr, setLr] = useState(0.5);
	const knobs = useRef({ G, sigmaNorm, lr });
	knobs.current = { G, sigmaNorm, lr };

	const doGroup = useCallback(() => {
		const S = sim.current;
		const { G: g, sigmaNorm: sn, lr: a } = knobs.current;
		const hard = Math.random() < 0.5;
		const P = hard ? P_HARD : P_EASY;
		const pi = softmax(S.z);
		const rows: Row[] = [];
		for (let i = 0; i < g; i++) {
			let u = Math.random();
			let s = 3;
			for (let j = 0; j < 4; j++) {
				u -= pi[j];
				if (u <= 0) {
					s = j;
					break;
				}
			}
			rows.push({ strat: s, ok: Math.random() < P[s], adv: 0 });
		}
		const mean = rows.reduce((x, r) => x + (r.ok ? 1 : 0), 0) / g;
		const sd = Math.sqrt(
			rows.reduce((x, r) => x + ((r.ok ? 1 : 0) - mean) ** 2, 0) / g,
		);
		const wasted = sd < 1e-9;
		if (!wasted) {
			for (const r of rows)
				r.adv = sn ? ((r.ok ? 1 : 0) - mean) / sd : (r.ok ? 1 : 0) - mean;
			const gv = [0, 0, 0, 0];
			for (const r of rows) {
				for (let b = 0; b < 4; b++)
					gv[b] += r.adv * ((b === r.strat ? 1 : 0) - pi[b]);
			}
			for (let b = 0; b < 4; b++) S.z[b] += (a * gv[b]) / g;
		}
		S.last = { hard, rows, mean, sd, wasted };
		if (hard) {
			S.emaHard = S.emaHard === null ? mean : 0.92 * S.emaHard + 0.08 * mean;
			S.wastedHard.push(wasted ? 1 : 0);
			if (S.wastedHard.length > 60) S.wastedHard.shift();
		} else {
			S.emaEasy = S.emaEasy === null ? mean : 0.92 * S.emaEasy + 0.08 * mean;
			S.wastedEasy.push(wasted ? 1 : 0);
			if (S.wastedEasy.length > 60) S.wastedEasy.shift();
		}
		const frac = (arr: number[]) =>
			arr.length ? (100 * arr.reduce((x, y) => x + y, 0)) / arr.length : 0;
		S.easyCurve.push(S.emaEasy ?? 0);
		S.hardCurve.push(S.emaHard ?? 0);
		S.wasteEasyCurve.push(frac(S.wastedEasy));
		S.wasteHardCurve.push(frac(S.wastedHard));
		if (S.easyCurve.length > 2500) {
			S.easyCurve = S.easyCurve.filter((_, i) => i % 2 === 0);
			S.hardCurve = S.hardCurve.filter((_, i) => i % 2 === 0);
			S.wasteEasyCurve = S.wasteEasyCurve.filter((_, i) => i % 2 === 0);
			S.wasteHardCurve = S.wasteHardCurve.filter((_, i) => i % 2 === 0);
		}
		S.groups++;
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) doGroup();
			commit();
		},
		[doGroup],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const S = sim.current;
	const pi = softmax(S.z);
	const wasteAll = [...S.wastedEasy, ...S.wastedHard];
	const wastePct = wasteAll.length
		? (100 * wasteAll.reduce((x, y) => x + y, 0)) / wasteAll.length
		: 0;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	const BW = 260;
	const BH = 120;
	const bw = BW / 4;

	return (
		<SimShell
			title="GRPO, one group at a time"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "groups", value: String(S.groups) },
				{
					label: "π(CoT)",
					value: pi[0].toFixed(2),
					color: pi[0] > 0.7 ? "var(--viz-policy)" : undefined,
				},
				{
					label: "wasted groups (recent)",
					value: `${wastePct.toFixed(0)}%`,
					color: wastePct > 40 ? "var(--viz-danger)" : undefined,
				},
			]}
		>
			<div
				style={{
					display: "flex",
					gap: "1.2rem",
					flexWrap: "wrap",
					alignItems: "flex-start",
				}}
			>
				<div style={{ flex: "1 1 240px", minWidth: 230 }}>
					<svg
						viewBox={`0 0 ${BW} ${BH + 20}`}
						style={{ width: "100%", height: "auto" }}
						role="img"
						aria-label="Policy over strategies"
					>
						{STRATS.map((name, i) => (
							<g key={name}>
								<rect
									x={i * bw + 8}
									y={BH - pi[i] * (BH - 16)}
									width={bw - 16}
									height={pi[i] * (BH - 16)}
									fill="var(--viz-policy)"
									rx={3}
								/>
								<line
									x1={i * bw + 6}
									x2={i * bw + bw - 6}
									y1={BH - P_EASY[i] * (BH - 16)}
									y2={BH - P_EASY[i] * (BH - 16)}
									stroke="var(--viz-reward)"
									strokeWidth={2}
									strokeDasharray="3 2"
								/>
								<line
									x1={i * bw + 6}
									x2={i * bw + bw - 6}
									y1={BH - P_HARD[i] * (BH - 16)}
									y2={BH - P_HARD[i] * (BH - 16)}
									stroke="var(--viz-danger)"
									strokeWidth={2}
									strokeDasharray="3 2"
								/>
								<text
									x={i * bw + bw / 2}
									y={BH + 14}
									textAnchor="middle"
									fontSize={10.5}
									fill="var(--sl-color-gray-2)"
								>
									{name}
								</text>
							</g>
						))}
						<text
							x={4}
							y={11}
							fontSize={11}
							fontWeight={600}
							fill="var(--sl-color-gray-2)"
						>
							π over strategies (dashes: p(correct) easy/hard)
						</text>
					</svg>

					<Sparkline
						label="mean group reward (EMA)"
						series={[
							{ data: S.easyCurve, color: "var(--viz-reward)", width: 1.8 },
							{ data: S.hardCurve, color: "var(--viz-danger)", width: 1.8 },
						]}
						height={100}
						yInclude={[0, 1]}
						formatY={(v) => v.toFixed(2)}
					/>
					<Sparkline
						label="wasted groups % (σ=0, rolling window)"
						series={[
							{
								data: S.wasteEasyCurve,
								color: "var(--viz-reward)",
								width: 1.8,
							},
							{
								data: S.wasteHardCurve,
								color: "var(--viz-danger)",
								width: 1.8,
							},
						]}
						height={100}
						yInclude={[0, 100]}
						formatY={(v) => `${v.toFixed(0)}%`}
					/>
					<div
						style={{
							fontSize: "0.75rem",
							color: "var(--sl-color-gray-3)",
							marginTop: "0.2rem",
						}}
					>
						green = easy prompts, red = hard prompts
					</div>
				</div>

				<div style={{ flex: "1 1 250px", minWidth: 240 }}>
					{S.last === null ? (
						<div
							style={{
								fontSize: "0.85rem",
								color: "var(--sl-color-gray-3)",
								padding: "1rem 0.5rem",
							}}
						>
							Press <strong>Run</strong> (or Step) to sample the first group of{" "}
							{G} rollouts.
						</div>
					) : (
						<div key={S.groups} style={{ fontSize: "0.8rem" }}>
							<div
								className="viz-fade-in"
								style={{
									display: "inline-block",
									padding: "0.15rem 0.5rem",
									borderRadius: 4,
									fontWeight: 700,
									fontSize: "0.72rem",
									letterSpacing: "0.05em",
									background: S.last.hard
										? "rgba(239,68,68,0.15)"
										: "rgba(34,197,94,0.15)",
									color: S.last.hard
										? "var(--viz-danger)"
										: "var(--viz-reward)",
									marginBottom: "0.35rem",
								}}
							>
								{S.last.hard ? "HARD PROMPT" : "EASY PROMPT"}
							</div>
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								{S.last.rows.map((r, i) => (
									<div
										key={i}
										className="viz-fade-in"
										style={{
											animationDelay: `${i * 45}ms`,
											display: "flex",
											alignItems: "center",
											gap: "0.5rem",
											background: "var(--sl-color-gray-6)",
											borderRadius: 4,
											padding: "0.18rem 0.5rem",
											fontFamily: "var(--__sl-font-mono, monospace)",
											fontSize: "0.75rem",
										}}
									>
										<span
											style={{
												width: "3.4rem",
												color: "var(--sl-color-gray-2)",
											}}
										>
											{STRATS[r.strat]}
										</span>
										<span
											style={{
												color: r.ok ? "var(--viz-reward)" : "var(--viz-danger)",
												fontWeight: 700,
											}}
										>
											{r.ok ? "✓ 1" : "✗ 0"}
										</span>
										<span style={{ flex: 1 }} />
										<span
											style={{
												fontWeight: 600,
												color: S.last!.wasted
													? "var(--sl-color-gray-3)"
													: r.adv > 0
														? "var(--viz-reward)"
														: r.adv < 0
															? "var(--viz-danger)"
															: "var(--sl-color-gray-3)",
											}}
										>
											Â ={" "}
											{S.last!.wasted
												? "0.00"
												: (r.adv > 0 ? "+" : "") + r.adv.toFixed(2)}
										</span>
									</div>
								))}
							</div>
							<div
								className="viz-fade-in"
								style={{
									animationDelay: `${S.last.rows.length * 45 + 60}ms`,
									marginTop: "0.4rem",
									fontFamily: "var(--__sl-font-mono, monospace)",
									fontSize: "0.75rem",
									color: "var(--sl-color-gray-2)",
								}}
							>
								μ = {S.last.mean.toFixed(2)}, σ = {S.last.sd.toFixed(2)}
								{S.last.wasted && (
									<span style={{ color: "var(--viz-danger)", fontWeight: 700 }}>
										{" "}
										→ σ = 0: zero gradient, group wasted
									</span>
								)}
							</div>
						</div>
					)}

					<div
						style={{
							display: "flex",
							gap: "0.9rem",
							flexWrap: "wrap",
							alignItems: "flex-end",
							marginTop: "0.8rem",
						}}
					>
						<label className="viz-slider" style={{ flex: "1 1 110px" }}>
							<span>
								group size G = <span className="viz-slider-value">{G}</span>
							</span>
							<input
								type="range"
								min={2}
								max={16}
								step={1}
								value={G}
								onChange={(e) => setG(parseInt(e.target.value, 10))}
							/>
						</label>
						<label className="viz-slider" style={{ flex: "1 1 110px" }}>
							<span>
								learning rate ={" "}
								<span className="viz-slider-value">{lr.toFixed(1)}</span>
							</span>
							<input
								type="range"
								min={0.1}
								max={1.5}
								step={0.1}
								value={lr}
								onChange={(e) => setLr(parseFloat(e.target.value))}
							/>
						</label>
						<button
							type="button"
							className="viz-btn"
							onClick={() => setSigmaNorm(!sigmaNorm)}
							style={
								sigmaNorm
									? {
											borderColor: "var(--viz-policy)",
											color: "var(--viz-policy)",
											fontWeight: 600,
										}
									: undefined
							}
						>
							÷σ normalize: {sigmaNorm ? "ON" : "OFF"}
						</button>
					</div>
				</div>
			</div>
		</SimShell>
	);
}
