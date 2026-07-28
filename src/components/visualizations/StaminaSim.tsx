import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// The 80-hour week as a dynamical system, one week per tick. Capacity
// C ∈ [0,1] is the body's account: weekly strain grows superlinearly with
// hours above ~45, recovery is a baseline plus whatever training (exercise)
// adds, and capacity integrates the difference. Output per week is
// hours × q(C), where the quality factor q collapses as capacity sags —
// tired hours are attended, not worked. If C falls below the floor:
// BURNOUT — forced multi-week downtime at zero output, partial recovery,
// counter increments.
//
// Calibrated (see the page caption) so that, over ~2 sim years:
//   80 h / 0 training   → sawtooth burnout cycles, cumulative ≈ 3.1k —
//                         BELOW a steady 60 h with 3 h training (≈ 6.2k);
//   80 h / 5–6 training → sustainable (capacity settles ≈ 0.66–0.70) and
//                         ≈ 7.9–8.0k beats every lower-hours setting at any
//                         training level (best rival: 75 h / 7 ≈ 7.7k);
//   100 h / any training → the capacity equilibrium sits below the burnout
//                         floor, so it burns out no matter what (≈ 8+
//                         burnouts, ≈ 2.8k). No knob makes it sustainable.

const START_C = 0.85;
const FLOOR = 0.25; // capacity below this → burnout
const DOWNTIME = 6; // forced weeks at zero output
const REST_TARGET = 0.62; // downtime pulls capacity toward this…
const REST_RATE = 0.3; // …at this rate: recovery is partial, not full
const NOISE = 0.018; // weekly capacity noise (σ)
const HISTORY = 156; // ~3 sim years visible in the charts

// Strain per week: zero up to ~45 h, then superlinear (exponent 2.5).
// 60 h → 0.007, 80 h → 0.060, 100 h → 0.185.
const strainOf = (h: number) => 0.06 * (Math.max(0, h - 45) / 35) ** 2.5;

// Recovery pull per week, scaled by (1 − C): baseline plus training with
// mild diminishing returns. 0 h → 0.040, 5 h → 0.178, 7 h → 0.220.
const recoveryOf = (t: number) => 0.04 + 0.18 * (t / 7) ** 0.8;

// Quality factor: ≈1 while capacity is high, collapses below ~0.5.
const qOf = (c: number) => 1 / (1 + Math.exp(-(c - 0.4) / 0.09));

function gauss(): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Sim {
	week: number;
	C: number; // capacity ∈ [0,1]
	cum: number; // cumulative quality-adjusted output
	lastOut: number; // this week's output
	lastHours: number; // hours the last tick actually used
	downLeft: number; // burnout downtime weeks remaining
	burnouts: number;
	lastBurnWeek: number; // -1 = none yet
	flash: number; // red-flash countdown after a burnout
	capHist: number[]; // capacity, in %
	cumHist: number[]; // cumulative output
}

function freshSim(): Sim {
	return {
		week: 0,
		C: START_C,
		cum: 0,
		lastOut: 0,
		lastHours: 0,
		downLeft: 0,
		burnouts: 0,
		lastBurnWeek: -1,
		flash: 0,
		capHist: [100 * START_C],
		cumHist: [0],
	};
}

const SPEEDS = [
	{ label: "1×", value: 4 },
	{ label: "3×", value: 12 },
	{ label: "10×", value: 40 },
];

const fmtOut = (v: number) =>
	v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);

// This-week output bar (viewBox units; scales to container width)
const BW = 560;
const BH = 46;
const BX0 = 8;
const BX1 = 442;
const BAR_Y = 22;
const BAR_H = 14;
const xOf = (v: number) =>
	BX0 + (Math.max(0, Math.min(100, v)) / 100) * (BX1 - BX0);

export default function StaminaSim() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(4);
	const [hours, setHours] = useState(80);
	const [training, setTraining] = useState(0);
	const hoursRef = useRef(hours);
	hoursRef.current = hours;
	const trainRef = useRef(training);
	trainRef.current = training;

	const step = useCallback(() => {
		const S = sim.current;
		S.week++;
		if (S.flash > 0) S.flash--;
		if (S.downLeft > 0) {
			// Forced downtime: zero output, partial recovery toward REST_TARGET.
			S.downLeft--;
			S.C += (REST_TARGET - S.C) * REST_RATE;
			S.lastOut = 0;
		} else {
			const h = hoursRef.current;
			S.lastHours = h;
			S.lastOut = h * qOf(S.C);
			S.cum += S.lastOut;
			const dC =
				recoveryOf(trainRef.current) * (1 - S.C) -
				strainOf(h) +
				NOISE * gauss();
			S.C = Math.min(1, Math.max(0.02, S.C + dC));
			if (S.C < FLOOR) {
				S.burnouts++;
				S.downLeft = DOWNTIME;
				S.flash = 5;
				S.lastBurnWeek = S.week;
			}
		}
		S.capHist.push(100 * S.C);
		S.cumHist.push(S.cum);
		if (S.capHist.length > HISTORY) {
			S.capHist.shift();
			S.cumHist.shift();
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
	const down = S.downLeft > 0;
	const avg = S.week > 0 ? S.cum / S.week : 0;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	return (
		<SimShell
			title="The long week — output is hours × capacity, and capacity keeps score"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{
					label: "week",
					value: `${S.week} · yr ${(S.week / 52).toFixed(1)}`,
				},
				{
					label: "capacity",
					value: `${(100 * S.C).toFixed(0)}%`,
					color: down ? "var(--viz-danger)" : "var(--viz-value)",
				},
				{
					label: "cumulative output",
					value: fmtOut(S.cum),
					color: "var(--viz-reward)",
				},
				{
					label: "avg / wk",
					value: avg > 0 ? avg.toFixed(1) : "—",
					color: "var(--viz-reward)",
				},
				{
					label: "burnouts",
					value: String(S.burnouts),
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
				<div
					style={{
						color: down ? "var(--viz-danger)" : "var(--sl-color-gray-2)",
						fontWeight: down ? 700 : 400,
					}}
				>
					{down
						? `BURNOUT — forced downtime, ${S.downLeft} wk left. Output: zero.`
						: `Week ${S.week} — working ${hours} h/wk, training ${training} h/wk.`}
				</div>
				<div
					style={{
						color:
							S.burnouts > 0 ? "var(--viz-danger)" : "var(--sl-color-gray-3)",
						fontWeight: S.burnouts > 0 ? 500 : 400,
					}}
				>
					{S.burnouts > 0
						? `Burnout #${S.burnouts} at week ${S.lastBurnWeek} — ${DOWNTIME} weeks gone, and you come back at ~60% capacity, not 100%.`
						: "No burnout yet. Watch where the amber line settles — or slides."}
				</div>
			</div>
			<div style={{ position: "relative" }}>
				<Sparkline
					series={[
						{
							data: S.capHist,
							color: "var(--viz-value)",
							width: 2,
							fill: true,
						},
					]}
					height={116}
					xMax={HISTORY}
					yInclude={[0, 100]}
					refLine={{
						value: 100 * FLOOR,
						label: "burnout floor",
						color: "var(--viz-danger)",
					}}
					label="capacity"
					formatY={(v) => `${v.toFixed(0)}%`}
				/>
				{(S.flash > 0 || down) && (
					<div
						style={{
							position: "absolute",
							inset: 0,
							background: "var(--viz-danger)",
							opacity: S.flash > 0 ? 0.16 : 0.07,
							borderRadius: 4,
							pointerEvents: "none",
						}}
					/>
				)}
			</div>
			<Sparkline
				series={[
					{
						data: S.cumHist,
						color: "var(--viz-reward)",
						width: 2,
						fill: true,
					},
				]}
				height={92}
				xMax={HISTORY}
				label="cumulative output — the only line a career is scored on"
				formatY={fmtOut}
			/>
			<svg
				viewBox={`0 0 ${BW} ${BH}`}
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="This week's quality-adjusted output versus hours worked"
			>
				<text x={BX0} y={14} fontSize={10.5} fill="var(--sl-color-gray-3)">
					this week
				</text>
				<rect
					x={BX0}
					y={BAR_Y}
					width={BX1 - BX0}
					height={BAR_H}
					rx={3}
					fill="var(--sl-color-gray-6)"
				/>
				{!down && (
					<g>
						{/* hours attended */}
						<rect
							x={BX0}
							y={BAR_Y}
							width={xOf(S.lastHours) - BX0}
							height={BAR_H}
							rx={3}
							fill="var(--viz-ref)"
							opacity={0.25}
						/>
						{/* the quality gap: attended but not worked */}
						{S.lastHours > S.lastOut && (
							<rect
								x={xOf(S.lastOut)}
								y={BAR_Y}
								width={Math.max(0, xOf(S.lastHours) - xOf(S.lastOut))}
								height={BAR_H}
								fill="var(--viz-danger)"
								opacity={0.3}
							/>
						)}
						{/* quality-adjusted output */}
						<rect
							x={BX0}
							y={BAR_Y}
							width={Math.max(0, xOf(S.lastOut) - BX0)}
							height={BAR_H}
							rx={3}
							fill="var(--viz-policy)"
							opacity={0.9}
						/>
					</g>
				)}
				<text
					x={BX1 + 8}
					y={BAR_Y + BAR_H - 3}
					fontSize={10.5}
					fontWeight={600}
					fill={down ? "var(--viz-danger)" : "var(--viz-policy)"}
				>
					{down ? "downtime — 0" : `${S.lastOut.toFixed(0)} of ${S.lastHours} h`}
				</text>
			</svg>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "flex-end",
					gap: "1rem",
					marginTop: "0.6rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 190px" }}>
					<span>
						hours worked ={" "}
						<span className="viz-slider-value">{hours} h/wk</span>
					</span>
					<input
						type="range"
						min={40}
						max={100}
						step={5}
						value={hours}
						onChange={(e) => setHours(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 190px" }}>
					<span>
						training = <span className="viz-slider-value">{training} h/wk</span>{" "}
						exercise
					</span>
					<input
						type="range"
						min={0}
						max={7}
						step={1}
						value={training}
						onChange={(e) => setTraining(parseInt(e.target.value, 10))}
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
				Amber = capacity; below the dashed floor is burnout — {DOWNTIME} forced
				weeks at zero output, and you return at ~60%, not 100%. Blue = this
				week&apos;s quality-adjusted output; the red band is hours your body
				attended but your brain did not. Green = cumulative output. Strain rises
				superlinearly above ~45 h; training raises weekly recovery.
			</div>
		</SimShell>
	);
}
