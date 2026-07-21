import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// A controlled drafting race. Two drafters produce blocks for the same
// verifier; each cycle they draw the SAME acceptance coins, so the accepted
// tokens are identical — the only thing that differs is drafting time:
//   EAGLE-style: one token per draft pass  → K sequential ticks
//   DFlash-style: whole block per pass     → S refinement ticks (masked
//     cells commit in confidence order, not left to right)
// One tick ≈ one small-model pass; a target verify pass costs VER ticks.
// Speedup vs plain decoding: E·VER/(draftTicks + VER), E = (1−α^(K+1))/(1−α).

const TEXT =
	`speculation only pays when the guessing itself is cheap so the diffusion ` +
	`drafter proposes every position of the block at once and the verifier ` +
	`still gets the final word on all of them `;
const WORDS = TEXT.trim().split(/\s+/);
const DECOYS = [
	"banana",
	"quantum",
	"purple",
	"seventeen",
	"cheese",
	"gravity",
	"submarine",
];
const VER = 12; // target verify pass, in draft-pass ticks

type CellState =
	| "masked"
	| "pending"
	| "drafted"
	| "accepted"
	| "rejected"
	| "dead";
interface Cell {
	word: string;
	state: CellState;
}

interface CycleScript {
	ok: boolean[];
	words: string[];
	unmaskOrder: number[];
}

interface Lane {
	phase: "draft" | "verify";
	tick: number;
	cells: Cell[];
	cycle: number;
	pos: number; // position in the shared text
	tokens: number;
	curve: number[];
}

function freshLane(): Lane {
	return {
		phase: "draft",
		tick: 0,
		cells: [],
		cycle: 0,
		pos: 0,
		tokens: 0,
		curve: [0],
	};
}

interface Sim {
	t: number;
	ar: Lane;
	df: Lane;
	scripts: Map<number, CycleScript>;
	baseCurve: number[];
	nextSample: number;
	acceptedTotal: number;
	cyclesTotal: number;
}

function freshSim(): Sim {
	return {
		t: 0,
		ar: freshLane(),
		df: freshLane(),
		scripts: new Map(),
		baseCurve: [0],
		nextSample: 1,
		acceptedTotal: 0,
		cyclesTotal: 0,
	};
}

const SPEEDS = [
	{ label: "1×", value: 4 },
	{ label: "4×", value: 16 },
	{ label: "16×", value: 64 },
];

const word = (i: number) => WORDS[i % WORDS.length];

export default function BlockDiffusionViz() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(4);
	const [K, setK] = useState(8);
	const [S, setS] = useState(2);
	const [alpha, setAlpha] = useState(0.75);
	const knobs = useRef({ K, S, alpha });
	knobs.current = { K, S, alpha };

	// Both lanes share the script for cycle n: same words, same coins.
	const scriptFor = useCallback((n: number, pos: number): CycleScript => {
		const St = sim.current;
		let sc = St.scripts.get(n);
		if (!sc) {
			const { K: k, alpha: a } = knobs.current;
			const ok: boolean[] = [];
			const words: string[] = [];
			for (let i = 0; i < k; i++) {
				const good = Math.random() < a;
				ok.push(good);
				words.push(
					good
						? word(pos + i)
						: DECOYS[Math.floor(Math.random() * DECOYS.length)],
				);
			}
			const order = Array.from({ length: k }, (_, i) => i);
			for (let i = order.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[order[i], order[j]] = [order[j], order[i]];
			}
			sc = { ok, words, unmaskOrder: order };
			St.scripts.set(n, sc);
			// Evict only cycles BOTH lanes have finished — the slower lane may
			// trail the faster one by many cycles and still needs its script.
			const floor = Math.min(St.ar.cycle, St.df.cycle);
			for (const key of St.scripts.keys()) {
				if (key < floor) St.scripts.delete(key);
			}
		}
		return sc;
	}, []);

	const startCycle = useCallback(
		(lane: Lane, diffusion: boolean) => {
			const sc = scriptFor(lane.cycle, lane.pos);
			lane.phase = "draft";
			lane.tick = 0;
			lane.cells = sc.words.map((w) => ({
				word: w,
				state: diffusion ? "masked" : "pending",
			}));
		},
		[scriptFor],
	);

	const resolveVerify = useCallback((lane: Lane) => {
		const sc = sim.current.scripts.get(lane.cycle);
		if (!sc) return;
		let m = 0;
		while (m < lane.cells.length && sc.ok[m]) m++;
		for (let i = 0; i < lane.cells.length; i++) {
			lane.cells[i].state = i < m ? "accepted" : i === m ? "rejected" : "dead";
		}
		return m;
	}, []);

	const laneTick = useCallback(
		(lane: Lane, diffusion: boolean) => {
			const { S: s } = knobs.current;
			if (lane.cells.length === 0) startCycle(lane, diffusion);
			lane.tick++;
			if (lane.phase === "draft") {
				const sc = sim.current.scripts.get(lane.cycle);
				if (!sc) return;
				if (diffusion) {
					// each refinement pass commits the next chunk in confidence order
					const per = Math.ceil(sc.words.length / s);
					const upto = Math.min(sc.words.length, lane.tick * per);
					for (let i = 0; i < upto; i++) {
						const c = lane.cells[sc.unmaskOrder[i]];
						if (c.state === "masked") c.state = "drafted";
					}
					if (lane.tick >= s) {
						lane.phase = "verify";
						lane.tick = 0;
						resolveVerify(lane);
					}
				} else {
					if (lane.tick <= sc.words.length) {
						lane.cells[lane.tick - 1].state = "drafted";
					}
					if (lane.tick >= sc.words.length) {
						lane.phase = "verify";
						lane.tick = 0;
						resolveVerify(lane);
					}
				}
			} else if (lane.tick >= VER) {
				// verify pass done: bank tokens, next cycle
				const accepted = lane.cells.filter(
					(c) => c.state === "accepted",
				).length;
				lane.tokens += accepted + 1;
				lane.pos += accepted + 1;
				if (diffusion) {
					sim.current.acceptedTotal += accepted;
					sim.current.cyclesTotal++;
				}
				lane.cycle++;
				lane.cells = [];
				startCycle(lane, diffusion);
			}
		},
		[startCycle, resolveVerify],
	);

	const stepTick = useCallback(() => {
		const St = sim.current;
		St.t++;
		laneTick(St.ar, false);
		laneTick(St.df, true);
		while (St.t >= St.nextSample) {
			St.ar.curve.push(St.ar.tokens);
			St.df.curve.push(St.df.tokens);
			St.baseCurve.push(Math.floor(St.t / VER));
			St.nextSample += 4;
			if (St.baseCurve.length > 1500) {
				St.ar.curve = St.ar.curve.filter((_, i) => i % 2 === 0);
				St.df.curve = St.df.curve.filter((_, i) => i % 2 === 0);
				St.baseCurve = St.baseCurve.filter((_, i) => i % 2 === 0);
			}
		}
	}, [laneTick]);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) stepTick();
			commit();
		},
		[stepTick],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const St = sim.current;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	const E = (1 - alpha ** (K + 1)) / (1 - alpha);
	const thAr = (E * VER) / (K + VER);
	const thDf = (E * VER) / (S + VER);
	const base = St.t / VER;
	const empAr = base > 3 ? St.ar.tokens / base : null;
	const empDf = base > 3 ? St.df.tokens / base : null;
	const avgAcc = St.cyclesTotal > 2 ? St.acceptedTotal / St.cyclesTotal : null;

	const cellStyle = (c: Cell): React.CSSProperties => {
		const baseStyle: React.CSSProperties = {
			minWidth: 46,
			textAlign: "center",
			padding: "0.16rem 0.3rem",
			borderRadius: 4,
			fontSize: "0.74rem",
			fontFamily: "var(--sl-font-system-mono, monospace)",
			whiteSpace: "nowrap",
			border: "1px solid transparent",
		};
		switch (c.state) {
			case "masked":
				return {
					...baseStyle,
					background: "var(--sl-color-gray-5)",
					color: "var(--sl-color-gray-3)",
				};
			case "pending":
				return {
					...baseStyle,
					border: "1px dashed var(--sl-color-gray-5)",
					color: "var(--sl-color-gray-4)",
				};
			case "drafted":
				return {
					...baseStyle,
					background: "rgba(59,130,246,0.14)",
					color: "var(--sl-color-text)",
				};
			case "accepted":
				return {
					...baseStyle,
					background: "rgba(34,197,94,0.18)",
					color: "var(--viz-reward)",
				};
			case "rejected":
				return {
					...baseStyle,
					background: "rgba(239,68,68,0.14)",
					color: "var(--viz-danger)",
					textDecoration: "line-through",
				};
			case "dead":
				return {
					...baseStyle,
					background: "var(--sl-color-gray-6)",
					color: "var(--sl-color-gray-4)",
					opacity: 0.55,
				};
		}
	};

	const laneRow = (
		label: string,
		lane: Lane,
		diffusion: boolean,
		color: string,
	) => (
		<div style={{ marginBottom: "0.6rem" }}>
			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					gap: "0.5rem",
					marginBottom: 3,
					flexWrap: "wrap",
				}}
			>
				<span
					style={{
						fontSize: "0.72rem",
						fontWeight: 700,
						letterSpacing: "0.05em",
						textTransform: "uppercase",
						color,
					}}
				>
					{label}
				</span>
				<span style={{ fontSize: "0.7rem", color: "var(--sl-color-gray-3)" }}>
					{lane.phase === "draft"
						? diffusion
							? `refining… pass ${Math.min(lane.tick + 1, S)}/${S}`
							: `drafting token ${Math.min(lane.tick + 1, lane.cells.length)}/${lane.cells.length}`
						: `verifying (1 target pass)…`}
				</span>
				{diffusion && (
					<span style={{ fontSize: "0.7rem", color: "var(--viz-kl)" }}>
						⟵ target context via KV injection
					</span>
				)}
			</div>
			<div style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 26 }}>
				{lane.cells.map((c, i) => (
					<span
						key={`${lane.cycle}-${i}`}
						className={c.state === "masked" ? "viz-pulse" : undefined}
						style={cellStyle(c)}
					>
						{c.state === "masked" ? "▒▒▒" : c.word}
					</span>
				))}
			</div>
		</div>
	);

	return (
		<SimShell
			title="Two ways to draft the same block"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{
					label: "accepted/cycle (same coins)",
					value: avgAcc === null ? "—" : avgAcc.toFixed(2),
				},
				{
					label: "AR drafter speedup",
					value:
						empAr === null
							? `theory ${thAr.toFixed(2)}×`
							: `${empAr.toFixed(2)}× (th ${thAr.toFixed(2)})`,
					color: "var(--viz-value)",
				},
				{
					label: "DFlash speedup",
					value:
						empDf === null
							? `theory ${thDf.toFixed(2)}×`
							: `${empDf.toFixed(2)}× (th ${thDf.toFixed(2)})`,
					color: "var(--viz-policy)",
				},
				{
					label: "gap",
					value: `${((K + VER) / (S + VER)).toFixed(2)}×`,
					color: "var(--viz-reward)",
				},
			]}
		>
			{laneRow(`EAGLE-style: 1 token / pass`, St.ar, false, "var(--viz-value)")}
			{laneRow(`DFlash: whole block / pass`, St.df, true, "var(--viz-policy)")}

			<Sparkline
				label="tokens generated vs time (gray = no speculation)"
				series={[
					{ data: St.baseCurve, color: "var(--viz-ref)", width: 1.6 },
					{ data: St.ar.curve, color: "var(--viz-value)", width: 1.9 },
					{ data: St.df.curve, color: "var(--viz-policy)", width: 2.2 },
				]}
				height={120}
				formatY={(v) => v.toFixed(0)}
			/>

			<div
				style={{
					display: "flex",
					gap: "1rem",
					flexWrap: "wrap",
					marginTop: "0.7rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 130px" }}>
					<span>
						block size K = <span className="viz-slider-value">{K}</span>
					</span>
					<input
						type="range"
						min={4}
						max={16}
						step={4}
						value={K}
						onChange={(e) => setK(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 130px" }}>
					<span>
						refinement passes S = <span className="viz-slider-value">{S}</span>
					</span>
					<input
						type="range"
						min={1}
						max={4}
						step={1}
						value={S}
						onChange={(e) => setS(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 130px" }}>
					<span>
						draft quality α ={" "}
						<span className="viz-slider-value">{alpha.toFixed(2)}</span>
					</span>
					<input
						type="range"
						min={0.3}
						max={0.95}
						step={0.05}
						value={alpha}
						onChange={(e) => setAlpha(parseFloat(e.target.value))}
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
				One tick = one small-model pass; a target verify pass costs {VER} ticks.
				Each cycle both drafters draw the same acceptance coins, so accepted
				tokens are identical — only drafting time differs. Knob changes apply
				from the next cycle.
			</div>
		</SimShell>
	);
}
