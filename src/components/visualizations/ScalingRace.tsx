import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// The Bitter Lesson as a living chart. Two research programs race as the
// world's training compute doubles every N months. RED is clever and
// structure-first: encoded human insight pays immediately, so it starts
// clearly ahead — but it saturates at a hard ceiling because its core
// cannot absorb more compute. BLUE is general and scale-first: behind and
// noisy at small compute, but its capability is linear in log-compute, so
// it never stops climbing. The crossover is when "the field moves on":
// community attention (tick marks) drains off red, and any years the
// reader committed to red are stranded. Raising red's ceiling only DELAYS
// the crossover — it never prevents it while compute keeps doubling.

const X0 = 21; // log10 FLOP at year 0
const LOG2 = Math.log10(2);
const RED_BASE = 26; // red's head start: structure pays before scale does
const BLUE_BASE = 10;
const RED_TAU = 0.9; // decades of compute for red to close ~63% of its gap
const CROSS_CONFIRM = 3; // consecutive months blue must lead to confirm
const MAX_PTS = 1600;
const MAX_MARKS = 360;

const W = 720;
const H = 340;
const PADL = 40;
const PADR = 14;
const PADT = 18;
const PADB = 36;
const innerW = W - PADL - PADR;
const innerH = H - PADT - PADB;

const SPEEDS = [
	{ label: "1×", value: 4 }, // 4 sim-months per second
	{ label: "4×", value: 16 },
	{ label: "20×", value: 80 },
];

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function sup(n: number): string {
	return String(n)
		.split("")
		.map((c) => SUP[+c] ?? c)
		.join("");
}

function gauss(): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Pt {
	x: number; // log10 compute
	r: number; // red capability
	b: number; // blue capability
}

interface Mark {
	x: number;
	y: number;
	m: number; // month the paper landed
}

interface Sim {
	month: number;
	x: number;
	red: number;
	blueCore: number; // noiseless accumulated blue progress above BLUE_BASE
	blue: number;
	noise: number; // AR(1) noise on blue
	lead: number; // consecutive months blue has led
	cross: { x: number; month: number } | null;
	aRed: number; // share of community attention on red
	commitMonth: number | null;
	pts: Pt[];
	marksR: Mark[];
	marksB: Mark[];
}

function freshSim(): Sim {
	return {
		month: 0,
		x: X0,
		red: RED_BASE,
		blueCore: 0,
		blue: BLUE_BASE,
		noise: 0,
		lead: 0,
		cross: null,
		aRed: 0.85,
		commitMonth: null,
		pts: [{ x: X0, r: RED_BASE, b: BLUE_BASE }],
		marksR: [],
		marksB: [],
	};
}

export default function ScalingRace() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(16);
	const [doubling, setDoubling] = useState(9); // months per compute doubling
	const [ceilR, setCeilR] = useState(60); // red's hard ceiling
	const [slope, setSlope] = useState(13); // blue capability per 10× compute
	const [committed, setCommitted] = useState(false);

	const dbRef = useRef(doubling);
	dbRef.current = doubling;
	const ceilRef = useRef(ceilR);
	ceilRef.current = ceilR;
	const slopeRef = useRef(slope);
	slopeRef.current = slope;

	const step = useCallback(() => {
		const S = sim.current;
		const dx = LOG2 / Math.max(1, dbRef.current); // decades per month
		S.month++;
		S.x += dx;
		// Red: relaxes toward a saturating curve under its current ceiling.
		// Capability is a ratchet — lowering the ceiling never un-learns.
		const target =
			RED_BASE +
			(ceilRef.current - RED_BASE) * (1 - Math.exp(-(S.x - X0) / RED_TAU));
		if (target > S.red) S.red += (target - S.red) * 0.3 * (S.cross ? S.aRed : 1);
		// Blue: linear in log-compute, plus AR(1) noise (it looks worse than
		// it is on any given month — exactly why it is easy to dismiss early).
		S.blueCore += slopeRef.current * dx;
		S.noise = Math.max(-4, Math.min(4, S.noise * 0.88 + gauss() * 0.55));
		S.blue = Math.min(100, Math.max(0, BLUE_BASE + S.blueCore + S.noise));
		// Crossover: blue must hold the lead for a few months to count.
		if (!S.cross) {
			S.lead = S.blue > S.red ? S.lead + 1 : 0;
			if (S.lead >= CROSS_CONFIRM) S.cross = { x: S.x, month: S.month };
		}
		// Community attention: papers keep landing on red until the
		// crossover, then drain away with ~a year's half-life.
		if (S.cross) S.aRed = Math.max(0.03, S.aRed * 0.945);
		if (Math.random() < S.aRed * 0.45)
			S.marksR.push({ x: S.x, y: S.red, m: S.month });
		if (Math.random() < (1 - S.aRed) * 0.45)
			S.marksB.push({ x: S.x, y: S.blue, m: S.month });
		if (S.marksR.length > MAX_MARKS) S.marksR.splice(0, 40);
		if (S.marksB.length > MAX_MARKS) S.marksB.splice(0, 40);
		S.pts.push({ x: S.x, r: S.red, b: S.blue });
		if (S.pts.length > MAX_PTS) S.pts = S.pts.filter((_, i) => i % 2 === 0);
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
	const year = S.month / 12;
	const crossed = S.cross !== null;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		setCommitted(false);
		commit();
	};

	const commitToRed = () => {
		sim.current.commitMonth = sim.current.month;
		setCommitted(true);
	};

	// ---- scales (window expands as compute grows; never zero-width) ----
	const xMin = X0;
	const xMax = Math.max(X0 + 2.6, S.x + 0.35);
	const xs = (x: number) => PADL + ((x - xMin) / (xMax - xMin)) * innerW;
	const ys = (v: number) => PADT + (1 - v / 100) * innerH;

	// ---- trajectory paths (red split at the crossover) ----
	const crossX = S.cross ? S.cross.x : Infinity;
	const stride = Math.max(1, Math.floor(S.pts.length / 420));
	let redPre = "";
	let redPost = "";
	let bluePath = "";
	let lastPre: Pt | null = null;
	const addPt = (p: Pt) => {
		bluePath += `${bluePath ? "L" : "M"}${xs(p.x).toFixed(1)},${ys(p.b).toFixed(1)}`;
		if (p.x <= crossX) {
			redPre += `${redPre ? "L" : "M"}${xs(p.x).toFixed(1)},${ys(p.r).toFixed(1)}`;
			lastPre = p;
		} else {
			if (!redPost && lastPre)
				redPost = `M${xs(lastPre.x).toFixed(1)},${ys(lastPre.r).toFixed(1)}`;
			redPost += `${redPost ? "L" : "M"}${xs(p.x).toFixed(1)},${ys(p.r).toFixed(1)}`;
		}
	};
	for (let i = 0; i < S.pts.length; i += stride) addPt(S.pts[i]);
	if ((S.pts.length - 1) % stride !== 0) addPt(S.pts[S.pts.length - 1]);

	// ---- axis ticks (decades of compute; thin them on long runs) ----
	const decStep = Math.max(1, Math.ceil((xMax - xMin) / 8));
	const decades: number[] = [];
	for (let d = Math.ceil(xMin); d <= Math.floor(xMax); d += decStep)
		decades.push(d);

	// ---- readouts ----
	const leaderBlue = S.blue > S.red;
	let invested = "—";
	let investedColor: string | undefined;
	if (committed && S.commitMonth !== null) {
		if (crossed && S.cross && S.cross.month >= S.commitMonth) {
			invested = `${((S.cross.month - S.commitMonth) / 12).toFixed(1)} yr stranded`;
			investedColor = "var(--viz-danger)";
		} else {
			invested = `${((S.month - S.commitMonth) / 12).toFixed(1)} yr`;
			investedColor = "var(--viz-value)";
		}
	}
	const gap = Math.max(0, S.red - S.blue);
	const crossLabelX = S.cross ? xs(S.cross.x) : 0;
	const crossAnchorEnd = S.cross ? crossLabelX > PADL + innerW * 0.66 : false;

	return (
		<SimShell
			title="The Bitter Lesson, live: structure vs scale"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "year", value: year.toFixed(1) },
				{ label: "compute", value: `10^${S.x.toFixed(1)} FLOP` },
				{
					label: "leader",
					value: leaderBlue ? "general" : "clever",
					color: leaderBlue ? "var(--viz-policy)" : "var(--viz-danger)",
				},
				{ label: "invested in red", value: invested, color: investedColor },
			]}
		>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Capability vs log training compute: a clever structure-first program saturates at a ceiling while a general scale-first program keeps climbing and overtakes it"
			>
				<rect
					x={PADL}
					y={PADT}
					width={innerW}
					height={innerH}
					fill="var(--sl-color-gray-6)"
					rx={4}
				/>
				{/* horizontal gridlines + y labels */}
				{[0, 25, 50, 75, 100].map((v) => (
					<g key={v}>
						<line
							x1={PADL}
							x2={PADL + innerW}
							y1={ys(v)}
							y2={ys(v)}
							stroke="var(--sl-color-gray-5)"
							strokeWidth={v === 0 ? 0 : 1}
						/>
						{(v === 0 || v === 50 || v === 100) && (
							<text
								x={PADL - 5}
								y={ys(v) + 4}
								textAnchor="end"
								fontSize={10}
								fill="var(--sl-color-gray-3)"
							>
								{v}
							</text>
						)}
					</g>
				))}
				{/* compute decade ticks */}
				{decades.map((d) => (
					<g key={d}>
						<line
							x1={xs(d)}
							x2={xs(d)}
							y1={PADT + innerH}
							y2={PADT + innerH + 4}
							stroke="var(--sl-color-gray-4)"
						/>
						<text
							x={xs(d)}
							y={PADT + innerH + 16}
							textAnchor="middle"
							fontSize={10.5}
							fill="var(--sl-color-gray-3)"
						>
							10{sup(d)}
						</text>
					</g>
				))}
				<text
					x={PADL + innerW / 2}
					y={H - 4}
					textAnchor="middle"
					fontSize={10.5}
					fill="var(--sl-color-gray-3)"
				>
					world training compute (FLOP, log scale — doubling every {doubling}{" "}
					months)
				</text>
				<text
					x={12}
					y={PADT + innerH / 2}
					textAnchor="middle"
					fontSize={10.5}
					fill="var(--sl-color-gray-3)"
					transform={`rotate(-90 12 ${PADT + innerH / 2})`}
				>
					capability
				</text>
				{/* red's hard ceiling */}
				<line
					x1={PADL}
					x2={PADL + innerW}
					y1={ys(ceilR)}
					y2={ys(ceilR)}
					stroke="var(--viz-danger)"
					strokeDasharray="6 5"
					strokeWidth={1.1}
					opacity={0.5}
				/>
				<text
					x={PADL + innerW - 6}
					y={ys(ceilR) - 5}
					textAnchor="end"
					fontSize={10.5}
					fill="var(--viz-danger)"
					opacity={0.75}
				>
					red's ceiling — its fatal flaw
				</text>
				{/* paper tick marks: community attention on each program */}
				{S.marksR.map((mk) => {
					const o = Math.max(0, 1 - (S.month - mk.m) / 60) * 0.65;
					if (o < 0.04) return null;
					return (
						<line
							key={`r${mk.m}`}
							x1={xs(mk.x)}
							x2={xs(mk.x)}
							y1={ys(mk.y) - 12}
							y2={ys(mk.y) - 6}
							stroke="var(--viz-danger)"
							strokeWidth={1.4}
							opacity={o}
						/>
					);
				})}
				{S.marksB.map((mk) => {
					const o = Math.max(0, 1 - (S.month - mk.m) / 60) * 0.65;
					if (o < 0.04) return null;
					return (
						<line
							key={`b${mk.m}`}
							x1={xs(mk.x)}
							x2={xs(mk.x)}
							y1={ys(mk.y) + 6}
							y2={ys(mk.y) + 12}
							stroke="var(--viz-policy)"
							strokeWidth={1.4}
							opacity={o}
						/>
					);
				})}
				{/* trajectories */}
				<path
					d={bluePath}
					fill="none"
					stroke="var(--viz-policy)"
					strokeWidth={2.2}
					strokeLinejoin="round"
				/>
				<path
					d={redPre}
					fill="none"
					stroke="var(--viz-danger)"
					strokeWidth={2.2}
					strokeLinejoin="round"
					opacity={crossed ? 0.45 : 1}
				/>
				{redPost && (
					<path
						d={redPost}
						fill="none"
						stroke="var(--viz-ref)"
						strokeWidth={2}
						strokeLinejoin="round"
						opacity={0.6}
					/>
				)}
				{/* crossover: the field moves on */}
				{S.cross && (
					<g>
						<line
							x1={xs(S.cross.x)}
							x2={xs(S.cross.x)}
							y1={PADT}
							y2={PADT + innerH}
							stroke="var(--sl-color-gray-3)"
							strokeDasharray="5 4"
							strokeWidth={1.2}
						/>
						<text
							x={crossAnchorEnd ? crossLabelX - 6 : crossLabelX + 6}
							y={PADT + 13}
							textAnchor={crossAnchorEnd ? "end" : "start"}
							fontSize={11}
							fontWeight={600}
							fill="var(--sl-color-gray-2)"
						>
							yr {(S.cross.month / 12).toFixed(1)} — the field moves on
						</text>
					</g>
				)}
				{/* current positions */}
				<circle
					cx={xs(S.x)}
					cy={ys(S.red)}
					r={5}
					fill={crossed ? "var(--viz-ref)" : "var(--viz-danger)"}
					opacity={crossed ? 0.55 : 1}
				/>
				<circle cx={xs(S.x)} cy={ys(S.blue)} r={5} fill="var(--viz-policy)" />
				{committed && (
					<g>
						<circle
							cx={xs(S.x)}
							cy={ys(S.red)}
							r={9}
							fill="none"
							stroke={crossed ? "var(--viz-danger)" : "var(--viz-policy)"}
							strokeWidth={2}
						/>
						<text
							x={xs(S.x)}
							y={ys(S.red) - 14}
							textAnchor="middle"
							fontSize={10.5}
							fontWeight={700}
							fill={crossed ? "var(--viz-danger)" : "var(--viz-policy)"}
						>
							you
						</text>
					</g>
				)}
				{/* legend */}
				<g fontSize={11}>
					<line
						x1={PADL + 10}
						x2={PADL + 28}
						y1={PADT + 14}
						y2={PADT + 14}
						stroke="var(--viz-danger)"
						strokeWidth={2.2}
					/>
					<text x={PADL + 33} y={PADT + 18} fill="var(--sl-color-gray-2)">
						clever, structure-first
					</text>
					<line
						x1={PADL + 10}
						x2={PADL + 28}
						y1={PADT + 30}
						y2={PADT + 30}
						stroke="var(--viz-policy)"
						strokeWidth={2.2}
					/>
					<text x={PADL + 33} y={PADT + 34} fill="var(--sl-color-gray-2)">
						general, scale-first
					</text>
				</g>
			</svg>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					flexWrap: "wrap",
					gap: "0.6rem",
					marginTop: "0.7rem",
					minHeight: "1.9rem",
				}}
			>
				{!committed && !crossed && (
					<button
						type="button"
						className="viz-btn"
						style={{
							borderColor: "var(--viz-danger)",
							color: "var(--viz-danger)",
							fontWeight: 600,
						}}
						onClick={commitToRed}
					>
						★ Commit your next 3 years to red — it leads by +{gap.toFixed(1)}
					</button>
				)}
				{!committed && crossed && (
					<button type="button" className="viz-btn" disabled>
						too late — the field moved on
					</button>
				)}
				{committed && S.commitMonth !== null && (
					<span
						style={{
							fontSize: "0.8rem",
							color: crossed ? "var(--viz-danger)" : "var(--sl-color-gray-2)",
							fontWeight: 600,
						}}
					>
						{crossed
							? "your red years are stranded — blue's curve never noticed"
							: `committed at yr ${(S.commitMonth / 12).toFixed(1)} — red is your program now`}
					</span>
				)}
			</div>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: "1rem",
					marginTop: "0.6rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 170px" }}>
					<span>
						compute doubling time ={" "}
						<span className="viz-slider-value">{doubling} mo</span>
					</span>
					<input
						type="range"
						min={6}
						max={24}
						step={1}
						value={doubling}
						onChange={(e) => setDoubling(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 170px" }}>
					<span>
						red's ceiling = <span className="viz-slider-value">{ceilR}</span>
					</span>
					<input
						type="range"
						min={40}
						max={90}
						step={1}
						value={ceilR}
						onChange={(e) => setCeilR(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 170px" }}>
					<span>
						blue's slope ={" "}
						<span className="viz-slider-value">+{slope.toFixed(1)}</span> per
						10× compute
					</span>
					<input
						type="range"
						min={4}
						max={20}
						step={0.5}
						value={slope}
						onChange={(e) => setSlope(parseFloat(e.target.value))}
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
				red = clever, structure-first (ahead early, hard ceiling) · blue =
				general, scale-first (noisy, but linear in log-compute). Tick marks are
				papers landing on each program; after the crossover they drain off red.
			</div>
		</SimShell>
	);
}
