import type { CSSProperties } from "react";
import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// The mean-field trap, live. A drafter proposes 2-token continuations of the
// prefix "x = ". The true joint is bimodal — (np, .array) and (torch, .tensor)
// each carry probability (1+ρ)/4, the mismatched pairs (1−ρ)/4 each — so both
// marginals are exactly {0.5, 0.5} at every ρ. Two drafting modes:
//   mean-field:    t₁ ~ marginal, t₂ ~ marginal, independently
//   + Markov head: t₁ ~ marginal, t₂ ~ p(t₂ | the t₁ actually sampled)
// Verification follows chapter 1: position 2 accepted w.p. min(1, p/q).
// A K-position strip runs the same experiment on a ρ-coupled mode chain
// (P(stay in mode) = (1+ρ)/2 per step; every within-block marginal is uniform
// by symmetry) so suffix decay emerges from measured counts. Counters only —
// memory is bounded no matter how long it runs.

const T1 = ["np", "torch"];
const T2 = [".array", ".tensor"];
const KMAX = 16;
const MONO = "var(--sl-font-system-mono, ui-monospace, monospace)";

const SPEEDS = [
	{ label: "1×", value: 4 },
	{ label: "8×", value: 32 },
	{ label: "64×", value: 256 },
];

type Mode = "mf" | "markov";

interface Cell {
	drafted: number;
	accepted: number;
	rejected: number;
	flash: number; // recent-rejection glow, decays per frame
}

interface Sim {
	rounds: number;
	cells: Cell[]; // index t1*2 + t2
	acc2: number; // position-2 accepts (two-token demo)
	mmDrafted: number; // off-diagonal pairs drafted
	mmShipped: number; // off-diagonal pairs that survived verification
	chainSurvive: number[]; // rounds surviving through position k
	chainAccept: number[]; // raw per-position accepts (whole block verified)
	chainLenSum: number; // Σ accepted prefix length
	last: { t1: number; t2: number; ok: boolean } | null;
}

function freshSim(): Sim {
	return {
		rounds: 0,
		cells: Array.from({ length: 4 }, () => ({
			drafted: 0,
			accepted: 0,
			rejected: 0,
			flash: 0,
		})),
		acc2: 0,
		mmDrafted: 0,
		mmShipped: 0,
		chainSurvive: new Array(KMAX).fill(0),
		chainAccept: new Array(KMAX).fill(0),
		chainLenSum: 0,
		last: null,
	};
}

export default function MeanFieldSampler() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(4);
	const [mode, setMode] = useState<Mode>("mf");
	const [rho, setRho] = useState(1.0);
	const [K, setK] = useState(8);
	const knobs = useRef({ mode, rho, K });
	knobs.current = { mode, rho, K };

	const stepRound = useCallback(() => {
		const S = sim.current;
		const kb = knobs.current;
		const s = (1 + kb.rho) / 2; // P(same mode | previous token)

		// --- two-token demo: draft, then verify position 2 ---------------------
		const t1 = Math.random() < 0.5 ? 0 : 1; // q₁ = p₁ = the true marginal
		const t2 =
			kb.mode === "mf"
				? Math.random() < 0.5
					? 0
					: 1 // marginal at +2, sampled independently
				: Math.random() < s
					? t1
					: 1 - t1; // conditional given the sampled t1
		const p2 = t2 === t1 ? s : 1 - s;
		const q2 = kb.mode === "mf" ? 0.5 : p2;
		const ok = q2 > 0 && Math.random() < Math.min(1, p2 / q2);
		const cell = S.cells[t1 * 2 + t2];
		cell.drafted++;
		if (ok) {
			cell.accepted++;
			S.acc2++;
		} else {
			cell.rejected++;
			cell.flash = 1;
		}
		if (t1 !== t2) {
			S.mmDrafted++;
			if (ok) S.mmShipped++;
		}
		S.last = { t1, t2, ok };

		// --- K-position block: same world, longer chain ------------------------
		let prev = 0;
		let alive = true;
		let len = 0;
		for (let k = 0; k < kb.K; k++) {
			let d: number;
			if (k === 0 || kb.mode === "mf") d = Math.random() < 0.5 ? 0 : 1;
			else d = Math.random() < s ? prev : 1 - prev;
			const p = k === 0 ? 0.5 : d === prev ? s : 1 - s;
			const q = k === 0 ? 0.5 : kb.mode === "markov" ? p : 0.5;
			const a = q > 0 && Math.random() < Math.min(1, p / q);
			if (a) S.chainAccept[k]++;
			if (alive && a) {
				len++;
				S.chainSurvive[k]++;
			} else alive = false;
			prev = d;
		}
		S.chainLenSum += len;
		S.rounds++;
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) stepRound();
			for (const c of sim.current.cells) c.flash *= 0.72;
			commit();
		},
		[stepRound],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const S = sim.current;
	const R = S.rounds;

	const reset = useCallback(() => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	}, [setPlaying]);

	// Knob changes invalidate the accumulated counts — restart them, keep playing.
	const restat = () => {
		sim.current = freshSim();
		commit();
	};
	const pickMode = (m: Mode) => {
		setMode(m);
		restat();
	};
	const pickRho = (v: number) => {
		setRho(v);
		restat();
	};
	const pickK = (v: number) => {
		setK(v);
		restat();
	};

	const acc2 = R > 0 ? S.acc2 / R : null;
	const eLen = R > 0 ? S.chainLenSum / R : null;
	const trueP = (i: number, j: number) =>
		i === j ? (1 + rho) / 4 : (1 - rho) / 4;

	// --- 2×2 contingency table, drawn live -----------------------------------
	const cellBase: CSSProperties = {
		borderRadius: 6,
		padding: "0.35rem 0.4rem",
		textAlign: "center",
		border: "1px solid var(--sl-color-gray-5)",
	};
	const marginCell: CSSProperties = {
		...cellBase,
		border: "1px dashed var(--sl-color-gray-4)",
		background: "var(--sl-color-gray-6)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontFamily: MONO,
		fontSize: "0.8rem",
		color: "var(--sl-color-gray-2)",
	};
	const headStyle: CSSProperties = {
		fontFamily: MONO,
		fontSize: "0.78rem",
		color: "var(--sl-color-gray-2)",
		textAlign: "center",
		alignSelf: "end",
		paddingBottom: 2,
	};
	const marginHead: CSSProperties = {
		...headStyle,
		fontFamily: "inherit",
		fontSize: "0.68rem",
		color: "var(--sl-color-gray-3)",
		fontStyle: "italic",
	};

	const dataCell = (i: number, j: number) => {
		const c = S.cells[i * 2 + j];
		const sh = R > 0 ? c.drafted / R : 0;
		const heat = Math.min(0.55, sh * 1.5);
		const flash = c.flash > 0.04 ? c.flash : 0;
		return (
			<div
				key={`c${i}${j}`}
				style={{
					...cellBase,
					background: `rgba(59,130,246,${heat.toFixed(3)})`,
					outline:
						flash > 0
							? `1.5px solid rgba(239,68,68,${Math.min(1, 0.3 + flash).toFixed(2)})`
							: "none",
					outlineOffset: -1,
					boxShadow:
						flash > 0
							? `0 0 ${Math.round(9 * flash)}px rgba(239,68,68,0.55)`
							: "none",
				}}
				title={`${T1[i]} ${T2[j]} — drafted ${c.drafted}, accepted ${c.accepted}, rejected ${c.rejected}`}
			>
				<div
					style={{
						fontFamily: MONO,
						fontWeight: 650,
						fontSize: "0.92rem",
						fontVariantNumeric: "tabular-nums",
						color: "var(--sl-color-text)",
					}}
				>
					{R > 0 ? `${(100 * sh).toFixed(1)}%` : "—"}
				</div>
				<div style={{ fontSize: "0.64rem", color: "var(--sl-color-gray-3)" }}>
					true {trueP(i, j).toFixed(2)}
				</div>
				<div
					style={{
						fontSize: "0.64rem",
						fontFamily: MONO,
						minHeight: "0.95em",
						color: c.rejected > 0 ? "var(--viz-danger)" : "var(--sl-color-gray-4)",
					}}
				>
					{c.rejected > 0 ? `✗ ${c.rejected}` : " "}
				</div>
			</div>
		);
	};

	const rowMargin = (i: number) => {
		const m =
			R > 0 ? (S.cells[i * 2].drafted + S.cells[i * 2 + 1].drafted) / R : null;
		return (
			<div key={`rm${i}`} style={marginCell}>
				{m === null ? "—" : m.toFixed(2)}
			</div>
		);
	};
	const colMargin = (j: number) => {
		const m = R > 0 ? (S.cells[j].drafted + S.cells[2 + j].drafted) / R : null;
		return (
			<div key={`cm${j}`} style={marginCell}>
				{m === null ? "—" : m.toFixed(2)}
			</div>
		);
	};

	// --- K-block strip geometry ----------------------------------------------
	const CW = 300;
	const CH = 178;
	const left = 10;
	const right = 292;
	const base = 138;
	const scale = 108; // px per unit probability
	const slot = (right - left) / K;
	const barW = Math.min(20, Math.max(4, slot - 5));
	const surv = (k: number) => (R > 0 ? S.chainSurvive[k] / R : 0);
	const rawA = (k: number) => (R > 0 ? S.chainAccept[k] / R : 0);
	const showLabel = (k: number) => k === 1 || k === K || k % 4 === 0;

	return (
		<SimShell
			title="Sampling the block: marginals vs the joint"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "drafts", value: String(R) },
				{
					label: "pos-2 acceptance",
					value: acc2 === null ? "—" : `${(100 * acc2).toFixed(0)}%`,
					color:
						acc2 !== null && acc2 < 0.6
							? "var(--viz-danger)"
							: acc2 !== null && acc2 > 0.9
								? "var(--viz-reward)"
								: undefined,
				},
				{
					label: "mismatched drafted",
					value: R > 0 ? `${((100 * S.mmDrafted) / R).toFixed(0)}%` : "—",
					color:
						R > 0 && S.mmDrafted / R > 0.3 ? "var(--viz-danger)" : undefined,
				},
				{
					label: "mismatched shipped",
					value:
						R > 0 && S.mmDrafted > 0
							? `${((100 * S.mmShipped) / S.mmDrafted).toFixed(0)}% of drafted`
							: "—",
					color:
						R > 0 && S.mmShipped === 0 && rho > 0.95
							? "var(--viz-reward)"
							: undefined,
				},
				{
					label: `E[accepted] of K=${K}`,
					value: eLen === null ? "—" : eLen.toFixed(2),
				},
			]}
		>
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.82rem",
					marginBottom: "0.5rem",
					minHeight: 22,
					display: "flex",
					gap: 7,
					alignItems: "baseline",
					flexWrap: "wrap",
				}}
			>
				<span
					style={{ color: "var(--sl-color-gray-3)", fontFamily: "var(--sans)" }}
				>
					last draft:
				</span>
				{S.last ? (
					<>
						<span style={{ color: "var(--sl-color-gray-2)" }}>x =</span>
						<span style={{ color: "var(--viz-policy)", fontWeight: 650 }}>
							{T1[S.last.t1]}
						</span>
						<span
							style={{
								color: S.last.ok ? "var(--viz-reward)" : "var(--viz-danger)",
								fontWeight: 650,
								textDecoration: S.last.ok ? "none" : "line-through",
							}}
						>
							{T2[S.last.t2]}
						</span>
						<span
							style={{
								fontSize: "0.7rem",
								color: S.last.ok ? "var(--viz-reward)" : "var(--viz-danger)",
							}}
						>
							{S.last.ok ? "accepted" : "rejected → target resamples"}
						</span>
					</>
				) : (
					<span style={{ color: "var(--sl-color-gray-4)" }}>
						press ▶ Run to start drafting
					</span>
				)}
			</div>

			<div
				style={{
					display: "flex",
					gap: "1.1rem",
					flexWrap: "wrap",
					alignItems: "flex-start",
				}}
			>
				{/* live contingency table */}
				<div style={{ flex: "1 1 300px", minWidth: 270 }}>
					<div
						style={{
							fontSize: "0.72rem",
							fontWeight: 700,
							letterSpacing: "0.05em",
							textTransform: "uppercase",
							color: "var(--sl-color-gray-3)",
							marginBottom: 4,
						}}
					>
						where drafts land (share of all drafts)
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "3.4rem 1fr 1fr 3rem",
							gap: 4,
						}}
					>
						<div />
						<div style={headStyle}>.array</div>
						<div style={headStyle}>.tensor</div>
						<div style={marginHead}>margin</div>
						{[0, 1].map((i) => (
							<div key={`row${T1[i]}`} style={{ display: "contents" }}>
								<div
									style={{
										...headStyle,
										alignSelf: "center",
										textAlign: "right",
										paddingRight: 6,
									}}
								>
									{T1[i]}
								</div>
								{dataCell(i, 0)}
								{dataCell(i, 1)}
								{rowMargin(i)}
							</div>
						))}
						<div
							style={{
								...marginHead,
								alignSelf: "center",
								textAlign: "right",
								paddingRight: 6,
							}}
						>
							margin
						</div>
						{colMargin(0)}
						{colMargin(1)}
						<div />
					</div>
				</div>

				{/* K-position block strip */}
				<div style={{ flex: "1 1 260px", minWidth: 240 }}>
					<svg
						viewBox={`0 0 ${CW} ${CH}`}
						style={{ width: "100%", height: "auto", display: "block" }}
						role="img"
						aria-label="Measured survival probability per block position (bars) and raw per-position acceptance (amber dots) for the current drafting mode"
					>
						<text
							x={4}
							y={12}
							fontSize={10.5}
							fontWeight={600}
							fill="var(--sl-color-gray-2)"
						>
							K-token block: survival to position k
						</text>
						<text x={4} y={25} fontSize={9} fill="var(--viz-value)">
							●— raw per-position acceptance
						</text>
						<line
							x1={left}
							x2={right}
							y1={base - scale}
							y2={base - scale}
							stroke="var(--sl-color-gray-5)"
							strokeWidth={1}
							strokeDasharray="3 3"
						/>
						<text
							x={right}
							y={base - scale - 3}
							textAnchor="end"
							fontSize={8}
							fill="var(--sl-color-gray-3)"
						>
							1.0
						</text>
						{Array.from({ length: K }, (_, k) => {
							const h = Math.max(surv(k) * scale, R > 0 ? 1 : 0);
							const x = left + k * slot + (slot - barW) / 2;
							return (
								<rect
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length position axis; index k is the stable identity
									key={`b${k}`}
									x={x}
									y={base - h}
									width={barW}
									height={h}
									rx={2}
									fill="var(--viz-policy)"
									fillOpacity={0.85}
								/>
							);
						})}
						{R > 0 && (
							<polyline
								points={Array.from({ length: K }, (_, k) => {
									const x = left + k * slot + slot / 2;
									return `${x.toFixed(1)},${(base - rawA(k) * scale).toFixed(1)}`;
								}).join(" ")}
								fill="none"
								stroke="var(--viz-value)"
								strokeWidth={1.6}
								opacity={0.9}
							/>
						)}
						{R > 0 &&
							Array.from({ length: K }, (_, k) => (
								<circle
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length position axis; index k is the stable identity
									key={`a${k}`}
									cx={left + k * slot + slot / 2}
									cy={base - rawA(k) * scale}
									r={2.2}
									fill="var(--viz-value)"
								/>
							))}
						{Array.from({ length: K }, (_, k) => k + 1)
							.filter(showLabel)
							.map((k) => (
								<text
									key={`x${k}`}
									x={left + (k - 1) * slot + slot / 2}
									y={152}
									textAnchor="middle"
									fontSize={9}
									fill="var(--sl-color-gray-3)"
								>
									{k}
								</text>
							))}
						<text
							x={(left + right) / 2}
							y={168}
							textAnchor="middle"
							fontSize={9}
							fill="var(--sl-color-gray-3)"
						>
							block position k
						</text>
					</svg>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					gap: "1rem",
					flexWrap: "wrap",
					alignItems: "flex-end",
					marginTop: "0.7rem",
				}}
			>
				<div
					style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}
				>
					<span
						style={{ fontSize: "0.78rem", color: "var(--sl-color-gray-2)" }}
					>
						drafter
					</span>
					{/* biome-ignore lint/a11y/useSemanticElements: matches SimShell's viz-speed toggle group; fieldset breaks styling */}
					<span className="viz-speed" role="group" aria-label="drafting mode">
						<button
							type="button"
							className={`viz-speed-btn${mode === "mf" ? " active" : ""}`}
							onClick={() => pickMode("mf")}
						>
							mean-field
						</button>
						<button
							type="button"
							className={`viz-speed-btn${mode === "markov" ? " active" : ""}`}
							onClick={() => pickMode("markov")}
						>
							+ Markov head
						</button>
					</span>
				</div>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						coupling ρ ={" "}
						<span className="viz-slider-value">{rho.toFixed(2)}</span>
					</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={rho}
						onChange={(e) => pickRho(Number.parseFloat(e.target.value))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						block length K = <span className="viz-slider-value">{K}</span>
					</span>
					<input
						type="range"
						min={2}
						max={16}
						step={1}
						value={K}
						onChange={(e) => pickK(Number.parseInt(e.target.value, 10))}
					/>
				</label>
			</div>
			<div
				style={{
					fontSize: "0.78rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.55rem",
					lineHeight: 1.5,
				}}
			>
				Blue heat = draft mass; red flash = a rejection landing in that cell;
				the dashed margin cells are the <em>empirical marginals</em> — correct
				in every mode. The toy Markov head knows the true conditional, so its
				acceptance is 100%; a trained head only approaches this. Changing any
				knob restarts the counters.
			</div>
		</SimShell>
	);
}
