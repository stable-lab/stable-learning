import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// A career of priority races. K labs push toward the same publishable
// result; progress advances stochastically, and each lab draws a per-race
// "luck" multiplier (idea fit, infrastructure, who happens to be free that
// semester). First to 100% publishes: everyone else's accumulated progress
// drains to nothing — that is what being scooped is — and the winner
// carries momentum (a head start) into the next race. Your lab is blue and
// you control its effort; rivals are fixed at 1.0×.

const TARGET = 100;
const MONTHS_PER_RACE = 6; // a full race ≈ 6 months of work
const TICKS_PER_MONTH = TARGET / MONTHS_PER_RACE; // ≈ 16.7 ticks
const PAUSE_TICKS = 17; // "a month off"
const HEAD_START = 12; // momentum the last winner carries into the next race
const DRAIN_TICKS = 24;
const DRAIN_DECAY = 0.85;
const LUCK_SIGMA = 0.2; // per-race lognormal luck spread

const IDEAS = [
	"adaptive KV-cache eviction",
	"self-correcting agent loops",
	"tool-use reward shaping",
	"speculative decoding for diffusion",
	"long-horizon memory compression",
	"multi-agent debate distillation",
	"test-time RL fine-tuning",
	"verifier-guided data curation",
];

function gauss(): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function rollLuck(): number {
	return Math.exp(LUCK_SIGMA * gauss());
}

interface Lab {
	p: number; // progress toward TARGET
	m: number; // per-race luck multiplier
}

interface Sim {
	you: Lab;
	rivals: Lab[];
	phase: "race" | "drain";
	drainLeft: number;
	raceTicks: number;
	winner: number; // -1 none, 0 you, k ≥ 1 → rivals[k-1]
	races: number;
	wins: number;
	scoops: number;
	evaporated: number; // months of YOUR work erased by scoops
	pauseLeft: number;
	headStartFor: number; // lab id carrying momentum into the next race
	youStart: number; // your progress at the start of the current race
	last: { won: boolean; name: string; months: number } | null;
}

function labName(id: number): string {
	return id === 0 ? "You" : `Lab ${String.fromCharCode(65 + id)}`;
}

function spawnRace(S: Sim) {
	S.phase = "race";
	S.winner = -1;
	S.raceTicks = 0;
	S.you.m = rollLuck();
	S.you.p = S.headStartFor === 0 ? HEAD_START : 0;
	S.rivals.forEach((r, i) => {
		r.m = rollLuck();
		r.p = S.headStartFor === i + 1 ? HEAD_START : 0;
	});
	S.youStart = S.you.p;
}

function freshSim(nRivals: number): Sim {
	const S: Sim = {
		you: { p: 0, m: 1 },
		rivals: Array.from({ length: nRivals }, () => ({ p: 0, m: 1 })),
		phase: "race",
		drainLeft: 0,
		raceTicks: 0,
		winner: -1,
		races: 0,
		wins: 0,
		scoops: 0,
		evaporated: 0,
		pauseLeft: 0,
		headStartFor: -1,
		youStart: 0,
		last: null,
	};
	spawnRace(S);
	return S;
}

const SPEEDS = [
	{ label: "1×", value: 30 },
	{ label: "3×", value: 90 },
	{ label: "10×", value: 300 },
];

// SVG layout (viewBox units; scales to container width)
const W = 560;
const H = 216;
const TOP = 20;
const BAR_X = 52;
const FIN_X = 492;
const BAR_W = FIN_X - BAR_X;

export default function PriorityRace() {
	const [nRivals, setNRivals] = useState(5);
	const sim = useRef<Sim>(freshSim(5));
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(30);
	const [effort, setEffort] = useState(1.0);
	const effortRef = useRef(effort);
	effortRef.current = effort;

	const step = useCallback(() => {
		const S = sim.current;
		if (S.phase === "drain") {
			S.drainLeft--;
			if (S.winner !== 0) S.you.p *= DRAIN_DECAY;
			S.rivals.forEach((r, i) => {
				if (S.winner !== i + 1) r.p *= DRAIN_DECAY;
			});
			if (S.drainLeft <= 0) spawnRace(S);
			return;
		}
		S.raceTicks++;
		if (S.pauseLeft > 0) {
			S.pauseLeft--; // your bar is frozen; the world keeps moving
		} else {
			S.you.p += effortRef.current * S.you.m * (0.7 + 0.6 * Math.random());
		}
		for (const r of S.rivals) {
			r.p += r.m * (0.7 + 0.6 * Math.random());
		}
		// First across the line publishes (furthest past it wins ties).
		let w = -1;
		let best = TARGET - 1e-9;
		if (S.you.p > best) {
			best = S.you.p;
			w = 0;
		}
		S.rivals.forEach((r, i) => {
			if (r.p > best) {
				best = r.p;
				w = i + 1;
			}
		});
		if (w < 0) return;
		S.races++;
		S.winner = w;
		S.headStartFor = w;
		S.phase = "drain";
		S.drainLeft = DRAIN_TICKS;
		if (w === 0) {
			S.wins++;
			S.you.p = TARGET;
			S.last = { won: true, name: "You", months: 0 };
		} else {
			S.scoops++;
			const lost =
				(Math.max(0, Math.min(S.you.p, TARGET) - S.youStart) / TARGET) *
				MONTHS_PER_RACE;
			S.evaporated += lost;
			S.rivals[w - 1].p = TARGET;
			S.last = { won: false, name: labName(w), months: lost };
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

	const reset = () => {
		sim.current = freshSim(nRivals);
		setPlaying(false);
		commit();
	};

	const setRivalCount = (n: number) => {
		const cur = sim.current;
		while (cur.rivals.length < n) cur.rivals.push({ p: 0, m: rollLuck() });
		if (cur.rivals.length > n) {
			cur.rivals.length = n;
			if (cur.winner > n) cur.winner = -1;
			if (cur.headStartFor > n) cur.headStartFor = -1;
		}
		setNRivals(n);
		commit();
	};

	const takeMonthOff = () => {
		sim.current.pauseLeft += PAUSE_TICKS;
		commit();
	};

	const winRate =
		S.races > 0 ? `${((100 * S.wins) / S.races).toFixed(0)}%` : "—";
	const paused = S.pauseLeft > 0;
	const raceIdea = IDEAS[S.races % IDEAS.length];
	const doneIdea = IDEAS[(S.races + IDEAS.length - 1) % IDEAS.length];

	const labs = [
		{ id: 0, name: "You", p: S.you.p, isYou: true },
		...S.rivals.map((r, i) => ({
			id: i + 1,
			name: labName(i + 1),
			p: r.p,
			isYou: false,
		})),
	];
	const rowH = (H - TOP - 6) / labs.length;
	const barH = Math.min(16, Math.max(8, rowH - 8));

	return (
		<SimShell
			title="The priority race — first to publish takes the idea"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "races", value: String(S.races) },
				{
					label: "first place",
					value: String(S.wins),
					color: "var(--viz-reward)",
				},
				{
					label: "scooped",
					value: String(S.scoops),
					color: "var(--viz-danger)",
				},
				{ label: "win rate", value: winRate, color: "var(--viz-policy)" },
				{
					label: "months evaporated",
					value: `${S.evaporated.toFixed(1)} mo`,
					color: "var(--viz-danger)",
				},
			]}
		>
			<div
				style={{
					height: "2.7rem",
					overflow: "hidden",
					fontSize: "0.78rem",
					lineHeight: "1.35rem",
					marginBottom: "0.3rem",
				}}
			>
				<div style={{ color: "var(--sl-color-gray-2)" }}>
					{S.phase === "drain"
						? `“${doneIdea}” is published — the field moves on to the next idea…`
						: `Race #${S.races + 1} — “${raceIdea}” · clock: ${(
								S.raceTicks / TICKS_PER_MONTH
							).toFixed(1)} mo`}
				</div>
				<div
					style={{
						color: S.last
							? S.last.won
								? "var(--viz-reward)"
								: "var(--viz-danger)"
							: "var(--sl-color-gray-3)",
						fontWeight: 500,
					}}
				>
					{S.last
						? S.last.won
							? `Last race: you published first — momentum gives you a ${HEAD_START}% head start on the next idea.`
							: `Last race: scooped by ${S.last.name} — ${S.last.months.toFixed(
									1,
								)} months of your work evaporated (salvage: +ε citations).`
						: "No races finished yet. Press Run."}
				</div>
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Progress bars for competing labs racing to publish"
			>
				<text
					x={FIN_X}
					y={12}
					textAnchor="middle"
					fontSize={10}
					fill="var(--sl-color-gray-3)"
				>
					publish
				</text>
				<line
					x1={FIN_X}
					x2={FIN_X}
					y1={TOP - 4}
					y2={H - 4}
					stroke="var(--sl-color-gray-4)"
					strokeDasharray="4 4"
					strokeWidth={1.2}
				/>
				{labs.map((lab, i) => {
					const y = TOP + i * rowH + (rowH - barH) / 2;
					const midY = y + barH / 2;
					const frac = Math.max(0, Math.min(1, lab.p / TARGET));
					const isWinner = S.phase === "drain" && S.winner === lab.id;
					const fill = lab.isYou ? "var(--viz-policy)" : "var(--viz-ref)";
					const flagColor = lab.isYou
						? "var(--viz-reward)"
						: "var(--viz-danger)";
					return (
						<g key={lab.id}>
							<text
								x={BAR_X - 6}
								y={midY + 3.5}
								textAnchor="end"
								fontSize={10.5}
								fontWeight={lab.isYou ? 700 : 400}
								fill={
									lab.isYou ? "var(--viz-policy)" : "var(--sl-color-gray-3)"
								}
							>
								{lab.name}
							</text>
							<rect
								x={BAR_X}
								y={y}
								width={BAR_W}
								height={barH}
								rx={3}
								fill="var(--sl-color-gray-6)"
								stroke={lab.isYou && paused ? "var(--viz-value)" : "none"}
								strokeWidth={1.5}
							/>
							{frac > 0 && (
								<rect
									x={BAR_X}
									y={y}
									width={frac * BAR_W}
									height={barH}
									rx={3}
									fill={fill}
									opacity={lab.isYou ? (paused ? 0.45 : 0.9) : 0.65}
								/>
							)}
							{isWinner && (
								<g>
									<line
										x1={FIN_X + 3}
										x2={FIN_X + 3}
										y1={midY - 11}
										y2={midY + 6}
										stroke={flagColor}
										strokeWidth={1.6}
									/>
									<polygon
										points={`${FIN_X + 3},${midY - 11} ${FIN_X + 21},${
											midY - 6.5
										} ${FIN_X + 3},${midY - 2}`}
										fill={flagColor}
									/>
								</g>
							)}
							{!isWinner && (
								<text
									x={FIN_X + 8}
									y={midY + 3.5}
									fontSize={9.5}
									fill={
										lab.isYou && paused
											? "var(--viz-value)"
											: "var(--sl-color-gray-3)"
									}
									fontWeight={lab.isYou && paused ? 700 : 400}
								>
									{lab.isYou && paused
										? `away ${(S.pauseLeft / TICKS_PER_MONTH).toFixed(1)} mo`
										: `${Math.min(100, lab.p).toFixed(0)}%`}
								</text>
							)}
						</g>
					);
				})}
			</svg>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "flex-end",
					gap: "1rem",
					marginTop: "0.7rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 170px" }}>
					<span>
						your effort ={" "}
						<span className="viz-slider-value">{effort.toFixed(2)}×</span>{" "}
						(rivals 1.00×)
					</span>
					<input
						type="range"
						min={0.5}
						max={2.0}
						step={0.05}
						value={effort}
						onChange={(e) => setEffort(parseFloat(e.target.value))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 140px" }}>
					<span>
						rival labs = <span className="viz-slider-value">{nRivals}</span>
					</span>
					<input
						type="range"
						min={1}
						max={9}
						step={1}
						value={nRivals}
						onChange={(e) => setRivalCount(parseInt(e.target.value, 10))}
					/>
				</label>
				<button
					type="button"
					className="viz-btn"
					onClick={takeMonthOff}
					style={
						paused
							? {
									color: "var(--viz-value)",
									borderColor: "var(--viz-value)",
									fontWeight: 600,
								}
							: undefined
					}
				>
					{paused
						? `away — ${(S.pauseLeft / TICKS_PER_MONTH).toFixed(1)} mo left`
						: "Take a month off"}
				</button>
			</div>
			<div
				style={{
					fontSize: "0.78rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.5rem",
					lineHeight: 1.5,
				}}
			>
				Blue = your lab, gray = rivals. Each lab rerolls per-race luck; the
				winner of a race starts the next one {HEAD_START}% ahead (momentum
				compounds). “Take a month off” freezes only your bar — the field keeps
				moving, and pressing it again stacks.
			</div>
		</SimShell>
	);
}
