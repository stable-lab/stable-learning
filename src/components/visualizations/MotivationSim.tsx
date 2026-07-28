import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// Same luck, different fuel. Two students run a decade of monthly research
// bets side by side: the AMBER lane works for the degree, the BLUE lane for
// curiosity + skills. Each month ONE shared coin decides whether the
// experiment failed or progressed, and the identical outcome is applied to
// BOTH lanes — the luck is the same by construction. The only difference is
// what a failed month *means*: pure cost for amber (extra drain — nothing
// was learned that it wanted to know), mild recovery for blue (the same
// failure taught it something it came to learn). Low fuel degrades work
// quality, which slows progress, which delays the next paper — so amber's
// refills arrive later exactly as it sinks: a spiral, not a straight line.

const MONTHS = 120; // one decade
const M0 = 0.9; // starting motivation, both tanks
const COST = 3.2; // progress units per paper ⇒ ~13–16 months/paper at default
const KNEE = 0.45; // below this fuel level, work quality starts to degrade
const QMIN = 0.25; // quality floor — misery never quite reaches zero output
const BASE = 0.018; // baseline monthly drain, both lanes
const FAIL_AMBER = 0.03; // extra drain on a failed month, amber only: pure cost
const LEARN_BLUE = 0.012; // recovery on a failed month, blue only: it learned
const PROG_GAIN = 0.03; // small lift for both on a month that progresses
const REFILL_AMBER = 0.2; // large refill on shipping — all amber is here for
const REFILL_BLUE = 0.1; // moderate refill — blue's fuel comes from the work

// Calibrated so that, at the default 75% failure rate: the amber lane
// typically quits in years 2–4 while blue survives all ten years (blue's
// worst case is bounded above zero by construction); before amber sinks,
// papers ship on the SAME months in both lanes; raising brutality collapses
// amber sharply but only slows blue's papers.

function quality(m: number): number {
	// Concave: near-full quality until well below the knee, then it plummets.
	return QMIN + (1 - QMIN) * Math.sqrt(Math.min(1, m / KNEE));
}

interface Lane {
	m: number; // motivation tank in [0, 1]
	progress: number; // accumulated toward the next paper
	papers: number[]; // ship months
	hist: number[]; // tank curve, one entry per month — bounded by MONTHS + 1
	quitMonth: number; // -1 while still in the game
}

interface Sim {
	month: number;
	coins: number[]; // 1 = failed, 0 = progressed — bounded by MONTHS
	amber: Lane;
	blue: Lane;
	done: boolean;
}

function freshLane(): Lane {
	return { m: M0, progress: 0, papers: [], hist: [M0], quitMonth: -1 };
}

function freshSim(): Sim {
	return {
		month: 0,
		coins: [],
		amber: freshLane(),
		blue: freshLane(),
		done: false,
	};
}

function stepLane(L: Lane, fail: boolean, isAmber: boolean, month: number) {
	if (L.quitMonth >= 0) return; // quit lanes stay frozen
	const q = quality(L.m); // this month's work quality, set by current fuel
	L.m -= BASE;
	if (fail) {
		// The fork in the model: the SAME failed coin lands differently.
		L.m += isAmber ? -FAIL_AMBER : LEARN_BLUE;
	} else {
		L.m += PROG_GAIN;
		L.progress += q; // low fuel ⇒ low quality ⇒ slower progress: the spiral
	}
	if (L.progress >= COST) {
		L.progress -= COST;
		L.papers.push(month);
		L.m += isAmber ? REFILL_AMBER : REFILL_BLUE;
	}
	if (L.m >= 1) L.m = 1;
	if (L.m <= 0) {
		L.m = 0;
		L.quitMonth = month;
	}
	L.hist.push(L.m);
}

function stepSim(S: Sim, pFail: number) {
	if (S.month >= MONTHS) {
		S.done = true;
		return;
	}
	// ONE coin per month, applied to both lanes — identical luck by construction.
	const fail = Math.random() < pFail;
	S.coins.push(fail ? 1 : 0);
	stepLane(S.amber, fail, true, S.month);
	stepLane(S.blue, fail, false, S.month);
	S.month++;
	if (S.month >= MONTHS) S.done = true;
}

function statusOf(L: Lane, done: boolean): { text: string; danger: boolean } {
	if (L.quitMonth >= 0)
		return {
			text: `quit — year ${(L.quitMonth / 12).toFixed(1)}`,
			danger: true,
		};
	if (done) return { text: "made it through the decade", danger: false };
	if (L.m < 0.2) return { text: "running on fumes", danger: true };
	if (L.m < KNEE) return { text: "sinking — work degrading", danger: true };
	if (L.m < 0.7) return { text: "wearing down", danger: false };
	return { text: "fueled", danger: false };
}

const SPEEDS = [
	{ label: "1×", value: 2 }, // 2 months/s — a decade in a minute
	{ label: "4×", value: 8 },
	{ label: "12×", value: 24 },
];

const W = 560;
const PADX = 8;
const INNER_W = W - 2 * PADX;
const xAt = (t: number) => PADX + (t / MONTHS) * INNER_W;

function CoinStrip({ coins }: { coins: number[] }) {
	const H = 18;
	const slotW = INNER_W / MONTHS;
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			style={{ width: "100%", height: "auto", display: "block" }}
			role="img"
			aria-label="shared monthly experiment outcomes"
		>
			<rect
				x={PADX}
				y={3}
				width={INNER_W}
				height={H - 6}
				fill="var(--sl-color-gray-6)"
				rx={3}
			/>
			{coins.map((c, t) => {
				const latest = t === coins.length - 1;
				return (
					<rect
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only month timeline; index t IS the month
						key={t}
						x={xAt(t) + 0.4}
						y={latest ? 1 : 4}
						width={Math.max(1, slotW - 0.8)}
						height={latest ? H - 2 : H - 8}
						fill={c === 1 ? "var(--viz-danger)" : "var(--viz-reward)"}
						opacity={latest ? 1 : c === 1 ? 0.55 : 0.85}
					/>
				);
			})}
		</svg>
	);
}

function LaneChart({
	lane,
	color,
	showGuides,
}: {
	lane: Lane;
	color: string;
	showGuides: boolean;
}) {
	const H = 96;
	const PADT = 16; // room for the paper shelf
	const PADB = 5;
	const innerH = H - PADT - PADB;
	const yAt = (v: number) => PADT + (1 - v) * innerH;
	const quit = lane.quitMonth >= 0;
	const stroke = quit ? "var(--viz-ref)" : color;

	let d = "";
	for (let i = 0; i < lane.hist.length; i++) {
		d += `${d ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(lane.hist[i]).toFixed(1)}`;
	}
	const tipX = xAt(lane.hist.length - 1);
	const tipY = yAt(lane.m);
	const quitLabelLeft = quit && lane.quitMonth > MONTHS * 0.55;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			style={{ width: "100%", height: "auto", display: "block" }}
			role="img"
			aria-label="motivation tank over ten years"
		>
			<rect
				x={PADX}
				y={2}
				width={INNER_W}
				height={H - 4}
				fill="var(--sl-color-gray-6)"
				rx={4}
			/>
			{/* year gridlines */}
			{[2, 4, 6, 8].map((yr) => (
				<line
					key={yr}
					x1={xAt(yr * 12)}
					x2={xAt(yr * 12)}
					y1={4}
					y2={H - 4}
					stroke="var(--sl-color-gray-5)"
					strokeWidth={1}
				/>
			))}
			{/* quality knee: below this, work degrades and papers slow down */}
			<line
				x1={PADX}
				x2={PADX + INNER_W}
				y1={yAt(KNEE)}
				y2={yAt(KNEE)}
				stroke="var(--sl-color-gray-3)"
				strokeDasharray="2 4"
				strokeWidth={1}
			/>
			{/* the zero line — hit it and you quit */}
			<line
				x1={PADX}
				x2={PADX + INNER_W}
				y1={yAt(0)}
				y2={yAt(0)}
				stroke="var(--viz-danger)"
				strokeDasharray="5 4"
				strokeWidth={1.2}
				opacity={0.65}
			/>
			{showGuides && (
				<>
					<text
						x={PADX + INNER_W - 4}
						y={yAt(KNEE) - 4}
						textAnchor="end"
						fontSize={10}
						fill="var(--sl-color-gray-3)"
					>
						work degrades below here
					</text>
					<text
						x={PADX + INNER_W - 4}
						y={yAt(0) - 4}
						textAnchor="end"
						fontSize={10}
						fill="var(--viz-danger)"
						opacity={0.85}
					>
						fuel 0 = quit
					</text>
				</>
			)}
			{/* paper shelf: a green flag on each ship month */}
			{lane.papers.map((p) => (
				<g key={p}>
					<line
						x1={xAt(p)}
						x2={xAt(p)}
						y1={4}
						y2={14}
						stroke="var(--viz-reward)"
						strokeWidth={1.6}
					/>
					<path
						d={`M${xAt(p).toFixed(1)},4 l7,2.8 l-7,2.8 Z`}
						fill="var(--viz-reward)"
					/>
				</g>
			))}
			{/* the tank curve — frozen gray once the lane quits */}
			{d && (
				<path
					d={d}
					fill="none"
					stroke={stroke}
					strokeWidth={2.2}
					strokeLinejoin="round"
				/>
			)}
			{!quit && lane.hist.length > 1 && (
				<circle cx={tipX} cy={tipY} r={3} fill={color} />
			)}
			{quit && (
				<g>
					<line
						x1={tipX - 4}
						y1={yAt(0) - 4}
						x2={tipX + 4}
						y2={yAt(0) + 4}
						stroke="var(--viz-danger)"
						strokeWidth={2}
					/>
					<line
						x1={tipX - 4}
						y1={yAt(0) + 4}
						x2={tipX + 4}
						y2={yAt(0) - 4}
						stroke="var(--viz-danger)"
						strokeWidth={2}
					/>
					<text
						x={quitLabelLeft ? tipX - 9 : tipX + 9}
						y={yAt(0) - 6}
						textAnchor={quitLabelLeft ? "end" : "start"}
						fontSize={11}
						fontWeight={700}
						fill="var(--viz-danger)"
					>
						quit — year {(lane.quitMonth / 12).toFixed(1)}
					</text>
				</g>
			)}
		</svg>
	);
}

function LaneHeader({
	name,
	color,
	lane,
	done,
}: {
	name: string;
	color: string;
	lane: Lane;
	done: boolean;
}) {
	const st = statusOf(lane, done);
	const quit = lane.quitMonth >= 0;
	const pct = Math.min(100, (100 * lane.progress) / COST);
	return (
		<div
			style={{
				display: "flex",
				alignItems: "baseline",
				gap: 8,
			}}
		>
			<span style={{ fontSize: "0.78rem", fontWeight: 700, color }}>
				{name}
			</span>
			{/* Truncate rather than wrap: status text swings in width mid-run,
			    and a wrap would vertically shift both lane charts. */}
			<span
				style={{
					fontSize: "0.72rem",
					color: st.danger ? "var(--viz-danger)" : "var(--sl-color-gray-3)",
					flex: "1 1 auto",
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{st.text}
			</span>
			<span
				style={{
					fontSize: "0.72rem",
					color: "var(--sl-color-gray-3)",
					whiteSpace: "nowrap",
				}}
			>
				next paper: {quit ? "—" : `${pct.toFixed(0)}%`}
			</span>
		</div>
	);
}

export default function MotivationSim() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(2);
	const [failPct, setFailPct] = useState(75); // "how brutal the field is"
	const pFailRef = useRef(failPct / 100);
	pFailRef.current = failPct / 100;

	// Reset-while-playing guard: useSimLoop cancels its RAF in a passive-effect
	// cleanup that runs after the next paint, so one already-queued frame can
	// fire after reset() and tick the fresh sim. reset() raises this flag and
	// Run/Step lower it, so that stale frame becomes a no-op.
	const halted = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: setPlaying is a stable setState fn from useSimLoop, which consumes this callback via a ref
	const onTick = useCallback((n: number) => {
		if (halted.current) return;
		const S = sim.current;
		for (let i = 0; i < n && !S.done; i++) stepSim(S, pFailRef.current);
		if (S.done) setPlaying(false);
		commit();
	}, []);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const S = sim.current;
	const lastCoin = S.coins.length > 0 ? S.coins[S.coins.length - 1] : -1;

	const reset = () => {
		halted.current = true;
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	// After the decade completes, Run starts a fresh one with new coins.
	const onToggle = () => {
		halted.current = false;
		if (sim.current.done) {
			sim.current = freshSim();
			commit();
			setPlaying(true);
			return;
		}
		toggle();
	};

	// Step mirrors Run's done-handling: after a finished decade it starts a
	// fresh one instead of being a silent no-op.
	const onStep = () => {
		halted.current = false;
		if (sim.current.done) sim.current = freshSim();
		onTick(1);
	};

	return (
		<SimShell
			title="Same luck, different fuel — a decade, month by month"
			playing={playing}
			onToggle={onToggle}
			onStep={onStep}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "year", value: (S.month / 12).toFixed(1) },
				{
					label: "papers · degree",
					value: String(S.amber.papers.length),
					color: "var(--viz-value)",
				},
				{
					label: "papers · curiosity",
					value: String(S.blue.papers.length),
					color: "var(--viz-policy)",
				},
				{
					label: "fuel · degree",
					value:
						S.amber.quitMonth >= 0 ? "quit" : `${Math.round(100 * S.amber.m)}%`,
					color:
						S.amber.quitMonth >= 0 ? "var(--viz-danger)" : "var(--viz-value)",
				},
				{
					label: "fuel · curiosity",
					value: `${Math.round(100 * S.blue.m)}%`,
					color: "var(--viz-policy)",
				},
				{ label: "luck", value: "shared", color: "var(--viz-ref)" },
			]}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<div
					style={{
						display: "flex",
						alignItems: "baseline",
						gap: 8,
						flexWrap: "wrap",
					}}
				>
					<span
						style={{
							fontSize: "0.72rem",
							fontWeight: 600,
							color: "var(--sl-color-gray-2)",
						}}
					>
						the shared coin — one draw per month, applied to both lanes
					</span>
					<span style={{ flex: 1 }} />
					<span
						style={{
							fontSize: "0.72rem",
							fontWeight: 700,
							color:
								lastCoin === 1
									? "var(--viz-danger)"
									: lastCoin === 0
										? "var(--viz-reward)"
										: "var(--sl-color-gray-3)",
						}}
					>
						{lastCoin === 1
							? "this month: experiment failed"
							: lastCoin === 0
								? "this month: progress"
								: "press Run"}
					</span>
				</div>
				<CoinStrip coins={S.coins} />
				<LaneHeader
					name="working for the degree"
					color="var(--viz-value)"
					lane={S.amber}
					done={S.done}
				/>
				<LaneChart lane={S.amber} color="var(--viz-value)" showGuides />
				<LaneHeader
					name="working for curiosity + skills"
					color="var(--viz-policy)"
					lane={S.blue}
					done={S.done}
				/>
				<LaneChart lane={S.blue} color="var(--viz-policy)" showGuides={false} />
				<svg
					viewBox={`0 0 ${W} 14`}
					style={{ width: "100%", height: "auto", display: "block" }}
					aria-hidden="true"
				>
					{[0, 2, 4, 6, 8, 10].map((yr) => (
						<text
							key={yr}
							// End-anchor the last label so "10 yr" isn't clipped at the edge.
							x={yr === 10 ? W - 2 : xAt(yr * 12)}
							y={10}
							textAnchor={yr === 10 ? "end" : "middle"}
							fontSize={9.5}
							fill="var(--sl-color-gray-3)"
						>
							{yr === 10 ? "10 yr" : yr}
						</text>
					))}
				</svg>
			</div>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: "1rem",
					marginTop: "0.6rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 240px" }}>
					<span>
						how brutal the field is — experiments that fail:{" "}
						<span className="viz-slider-value">{failPct}%</span>
					</span>
					<input
						type="range"
						min={70}
						max={90}
						step={1}
						value={failPct}
						onChange={(e) => setFailPct(parseInt(e.target.value, 10))}
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
				amber = in it for the degree, blue = in it for curiosity + skills. The
				coins are identical by construction — the lanes differ only in what a
				failed month means. Green flags are shipped papers; below the dotted
				line, low fuel degrades the work and papers slow down.
			</div>
		</SimShell>
	);
}
