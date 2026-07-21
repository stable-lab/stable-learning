import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// Two identical REINFORCE learners race in lockstep on the same 5-armed
// bandit; the only difference is that learner B subtracts a running-average
// baseline before each update. Rewards carry a constant +3 floor so they are
// essentially always positive: without a baseline, every sampled arm gets
// pushed up, and learning is driven by noisy sampling-frequency imbalance —
// sometimes locking onto the wrong arm for good.

const R0 = 3; // constant reward floor — exactly the part a baseline removes
const MU = [0.2, 0.35, 0.5, 0.65, 0.8]; // arm quality on top of the floor
const K = 5;
const BEST = 4;
const B_RATE = 0.02; // baseline EMA rate (count-corrected at use time)
const TRACK_EVERY = 10;
const MAX_POINTS = 2500;

function gauss(): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function softmax(z: number[]): number[] {
	const m = Math.max(...z);
	const e = z.map((x) => Math.exp(x - m));
	const s = e.reduce((acc, v) => acc + v, 0);
	return e.map((v) => v / s);
}

function sampleFrom(pi: number[]): number {
	let u = Math.random();
	for (let i = 0; i < pi.length; i++) {
		u -= pi[i];
		if (u <= 0) return i;
	}
	return pi.length - 1;
}

interface Sim {
	pulls: number;
	zA: number[]; // logits, plain REINFORCE
	zB: number[]; // logits, REINFORCE + baseline
	bEma: number;
	gEmaA: number; // EMA of score-function gradient L2 norm (not scaled by lr)
	gEmaB: number;
	piCurveA: number[];
	piCurveB: number[];
	gCurveA: number[];
	gCurveB: number[];
}

function freshSim(): Sim {
	return {
		pulls: 0,
		zA: new Array<number>(K).fill(0),
		zB: new Array<number>(K).fill(0),
		bEma: 0,
		gEmaA: 0,
		gEmaB: 0,
		piCurveA: [],
		piCurveB: [],
		gCurveA: [],
		gCurveB: [],
	};
}

const SPEEDS = [
	{ label: "1×", value: 20 },
	{ label: "10×", value: 200 },
	{ label: "50×", value: 1000 },
];

const BAR_W = 34;
const BAR_H = 36;

function ArmBars({
	pi,
	tag,
	color,
}: {
	pi: number[];
	tag: string;
	color: string;
}) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
			<span style={{ width: 16, fontSize: "0.75rem", fontWeight: 700, color }}>
				{tag}
			</span>
			{pi.map((p, i) => (
				<div
					key={i}
					style={{
						width: BAR_W,
						height: BAR_H,
						background: "var(--sl-color-gray-6)",
						borderRadius: 4,
						position: "relative",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							bottom: 0,
							height: `${(100 * p).toFixed(1)}%`,
							background: color,
							opacity: 0.8,
						}}
					/>
				</div>
			))}
			<span style={{ fontSize: "0.72rem", color: "var(--sl-color-gray-3)" }}>
				π(a)
			</span>
		</div>
	);
}

export default function BaselineRace() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(200);
	const [lrSlider, setLrSlider] = useState(18); // 0..100 log scale, 0.02 → 1; 18 ⇒ α ≈ 0.04
	const [sigma, setSigma] = useState(0.5);
	const lr = 0.02 * 50 ** (lrSlider / 100);
	const lrRef = useRef(lr);
	lrRef.current = lr;
	const sigmaRef = useRef(sigma);
	sigmaRef.current = sigma;

	const step = useCallback(() => {
		const S = sim.current;
		const al = lrRef.current;
		const sg = sigmaRef.current;
		// Learner A: plain REINFORCE on the raw (essentially always positive) reward.
		{
			const pi = softmax(S.zA);
			const a = sampleFrom(pi);
			const r = R0 + MU[a] + sg * gauss();
			let n2 = 0;
			for (let b = 0; b < K; b++) {
				const g = r * ((b === a ? 1 : 0) - pi[b]);
				S.zA[b] += al * g;
				n2 += g * g;
			}
			S.gEmaA = 0.98 * S.gEmaA + 0.02 * Math.sqrt(n2);
		}
		// Learner B: identical update on (r − b), b = count-corrected running average.
		{
			const pi = softmax(S.zB);
			const a = sampleFrom(pi);
			const r = R0 + MU[a] + sg * gauss();
			const denom = 1 - (1 - B_RATE) ** S.pulls; // bEma holds `pulls` rewards so far
			const bl = denom > 0 ? S.bEma / denom : 0;
			let n2 = 0;
			for (let b = 0; b < K; b++) {
				const g = (r - bl) * ((b === a ? 1 : 0) - pi[b]);
				S.zB[b] += al * g;
				n2 += g * g;
			}
			S.gEmaB = 0.98 * S.gEmaB + 0.02 * Math.sqrt(n2);
			S.bEma += B_RATE * (r - S.bEma);
		}
		S.pulls++;
		if (S.pulls % TRACK_EVERY === 0) {
			S.piCurveA.push(softmax(S.zA)[BEST]);
			S.piCurveB.push(softmax(S.zB)[BEST]);
			S.gCurveA.push(S.gEmaA);
			S.gCurveB.push(S.gEmaB);
			if (S.piCurveA.length > MAX_POINTS) {
				const thin = (xs: number[]) => xs.filter((_, i) => i % 2 === 0);
				S.piCurveA = thin(S.piCurveA);
				S.piCurveB = thin(S.piCurveB);
				S.gCurveA = thin(S.gCurveA);
				S.gCurveB = thin(S.gCurveB);
			}
		}
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) step();
			commit();
		},
		[step],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const S = sim.current;
	const piA = softmax(S.zA);
	const piB = softmax(S.zB);

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	return (
		<SimShell
			title="REINFORCE vs REINFORCE + baseline"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "pulls", value: String(S.pulls) },
				{
					label: "π(best) A",
					value: piA[BEST].toFixed(2),
					color: "var(--viz-ref)",
				},
				{
					label: "π(best) B",
					value: piB[BEST].toFixed(2),
					color: "var(--viz-policy)",
				},
				{
					label: "‖ĝ‖ A",
					value: S.gEmaA.toFixed(2),
					color: "var(--viz-danger)",
				},
				{
					label: "‖ĝ‖ B",
					value: S.gEmaB.toFixed(2),
					color: "var(--viz-value)",
				},
			]}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 5,
					marginBottom: "0.7rem",
				}}
			>
				<ArmBars pi={piA} tag="A" color="var(--viz-ref)" />
				<ArmBars pi={piB} tag="B" color="var(--viz-policy)" />
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						marginLeft: 22,
					}}
				>
					{MU.map((mu, i) => (
						<span
							key={i}
							style={{
								width: BAR_W,
								textAlign: "center",
								fontSize: "0.68rem",
								fontWeight: i === BEST ? 700 : 400,
								color:
									i === BEST ? "var(--viz-reward)" : "var(--sl-color-gray-3)",
							}}
						>
							{i === BEST ? "▲" : ""}
							{String(+(R0 + mu).toFixed(2))}
						</span>
					))}
					<span
						style={{ fontSize: "0.68rem", color: "var(--sl-color-gray-3)" }}
					>
						true mean reward
					</span>
				</div>
			</div>
			<Sparkline
				label="π(best arm)"
				series={[
					{ data: S.piCurveA, color: "var(--viz-ref)", width: 1.8 },
					{ data: S.piCurveB, color: "var(--viz-policy)", width: 2.2 },
				]}
				height={130}
				refLine={{ value: 1, label: "π=1" }}
				yInclude={[0, 1]}
				formatY={(v) => v.toFixed(2)}
			/>
			<div style={{ marginTop: "0.4rem" }}>
				<Sparkline
					label="gradient magnitude ‖ĝ‖ (EMA)"
					series={[
						{
							data: S.gCurveA,
							color: "var(--viz-danger)",
							width: 1.8,
							opacity: 0.9,
						},
						{ data: S.gCurveB, color: "var(--viz-value)", width: 2.2 },
					]}
					height={110}
					yInclude={[0]}
					formatY={(v) => v.toFixed(2)}
				/>
			</div>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: "1rem",
					marginTop: "0.7rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 180px" }}>
					<span>
						learning rate α ={" "}
						<span className="viz-slider-value">{lr.toFixed(2)}</span> (shared)
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
				<label className="viz-slider" style={{ flex: "1 1 180px" }}>
					<span>
						reward noise σ ={" "}
						<span className="viz-slider-value">{sigma.toFixed(1)}</span>
					</span>
					<input
						type="range"
						min={0}
						max={1.5}
						step={0.1}
						value={sigma}
						onChange={(e) => setSigma(parseFloat(e.target.value))}
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
				gray/red = plain REINFORCE, blue/amber = with baseline b = running avg
				reward. Same bandit, same learning rate — only the baseline differs.
			</div>
		</SimShell>
	);
}
