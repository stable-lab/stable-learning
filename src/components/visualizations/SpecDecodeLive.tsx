import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// Two lanes generate the same text. The autoregressive lane emits one token
// per target-model forward pass (1 time unit). The speculative lane drafts γ
// tokens with a cheap model (c time units each), then verifies them all in
// ONE target pass: the correct prefix is kept, the first wrong token is
// replaced by the target's own token, and if everything was right the verify
// pass yields a bonus token. Per-token draft accuracy is α.
// Expected tokens/cycle E = (1−α^(γ+1))/(1−α); wall-clock speedup E/(γc+1).

const TEXT =
	`the small draft model races ahead guessing tokens while the large target ` +
	`model checks the whole guess in a single forward pass so every accepted ` +
	`token costs almost nothing and every rejected token is replaced for free ` +
	`by the verifier which is why the output distribution never changes `;
const WORDS = TEXT.trim().split(/\s+/);
const DECOYS = [
	"banana",
	"quantum",
	"purple",
	"seventeen",
	"submarine",
	"yesterday",
	"cheese",
	"gravity",
];

const TICK = 0.1; // time units per sim tick

interface Chip {
	word: string;
	kind: "base" | "accepted" | "corrected" | "bonus" | "rejected";
}

interface Sim {
	t: number;
	// autoregressive lane
	basePos: number;
	baseAcc: number;
	baseChips: Chip[];
	// speculative lane
	specPos: number;
	phase: "draft" | "verify";
	progress: number;
	pending: { word: string; ok: boolean }[];
	gamma: number; // knobs latched at cycle start
	cost: number;
	specChips: Chip[];
	cycles: number;
	drafted: number;
	acceptedDraft: number;
	discarded: number;
	specTokens: number;
	// curves sampled once per time unit
	nextSample: number;
	baseCurve: number[];
	specCurve: number[];
}

function freshSim(): Sim {
	return {
		t: 0,
		basePos: 0,
		baseAcc: 0,
		baseChips: [],
		specPos: 0,
		phase: "draft",
		progress: 0,
		pending: [],
		gamma: 4,
		cost: 0.1,
		specChips: [],
		cycles: 0,
		drafted: 0,
		acceptedDraft: 0,
		discarded: 0,
		specTokens: 0,
		nextSample: 1,
		baseCurve: [0],
		specCurve: [0],
	};
}

const SPEEDS = [
	{ label: "1×", value: 20 },
	{ label: "4×", value: 80 },
	{ label: "16×", value: 320 },
];

const word = (i: number) => WORDS[i % WORDS.length];
const pushChip = (arr: Chip[], c: Chip) => {
	arr.push(c);
	if (arr.length > 16) arr.splice(0, arr.length - 16);
};

export default function SpecDecodeLive() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(20);
	const [alpha, setAlpha] = useState(0.75);
	const [gamma, setGamma] = useState(4);
	const [cost, setCost] = useState(0.1);
	const knobs = useRef({ alpha, gamma, cost });
	knobs.current = { alpha, gamma, cost };

	const stepTick = useCallback(() => {
		const S = sim.current;
		S.t += TICK;
		// Autoregressive lane: one true token per 1.0 time units.
		S.baseAcc += TICK;
		while (S.baseAcc >= 1) {
			S.baseAcc -= 1;
			pushChip(S.baseChips, { word: word(S.basePos), kind: "base" });
			S.basePos++;
		}
		// Speculative lane state machine.
		if (S.phase === "draft") {
			S.progress += TICK;
			// pending tokens materialize one per `cost` time units
			while (
				S.pending.length < S.gamma &&
				S.progress >= (S.pending.length + 1) * S.cost
			) {
				const ok = Math.random() < knobs.current.alpha;
				const w = ok
					? word(S.specPos + S.pending.length)
					: DECOYS[Math.floor(Math.random() * DECOYS.length)];
				S.pending.push({ word: w, ok });
			}
			if (S.progress >= S.gamma * S.cost && S.pending.length >= S.gamma) {
				S.phase = "verify";
				S.progress = 0;
			}
		} else {
			S.progress += TICK;
			if (S.progress >= 1) {
				// One target pass resolves the whole draft.
				let m = 0;
				while (m < S.pending.length && S.pending[m].ok) m++;
				for (let i = 0; i < m; i++) {
					pushChip(S.specChips, { word: S.pending[i].word, kind: "accepted" });
				}
				S.drafted += S.pending.length;
				S.acceptedDraft += m;
				S.specPos += m;
				if (m < S.pending.length) {
					S.discarded += S.pending.length - m;
					pushChip(S.specChips, { word: S.pending[m].word, kind: "rejected" });
					pushChip(S.specChips, { word: word(S.specPos), kind: "corrected" });
				} else {
					pushChip(S.specChips, { word: word(S.specPos), kind: "bonus" });
				}
				S.specPos++; // corrected or bonus token from the verify pass
				S.specTokens = S.specPos;
				S.cycles++;
				S.pending = [];
				S.phase = "draft";
				S.progress = 0;
				S.gamma = knobs.current.gamma;
				S.cost = knobs.current.cost;
			}
		}
		while (S.t >= S.nextSample) {
			S.baseCurve.push(S.basePos);
			S.specCurve.push(S.specPos);
			S.nextSample += 1;
			if (S.baseCurve.length > 2000) {
				S.baseCurve = S.baseCurve.filter((_, i) => i % 2 === 0);
				S.specCurve = S.specCurve.filter((_, i) => i % 2 === 0);
			}
		}
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) stepTick();
			commit();
		},
		[stepTick],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const S = sim.current;

	const reset = () => {
		const g = knobs.current.gamma;
		const c = knobs.current.cost;
		sim.current = freshSim();
		sim.current.gamma = g;
		sim.current.cost = c;
		setPlaying(false);
		commit();
	};

	const empSpeedup = S.basePos > 3 ? S.specPos / S.basePos : null;
	const empAccept = S.drafted > 0 ? S.acceptedDraft / S.drafted : null;
	const E = (1 - alpha ** (gamma + 1)) / (1 - alpha);
	const theory = E / (gamma * cost + 1);

	const chipStyle = (kind: Chip["kind"]): React.CSSProperties => {
		const base: React.CSSProperties = {
			padding: "0.12rem 0.4rem",
			borderRadius: 4,
			fontSize: "0.78rem",
			fontFamily: "var(--sl-font-system-mono, monospace)",
			whiteSpace: "nowrap",
		};
		switch (kind) {
			case "base":
				return {
					...base,
					background: "var(--sl-color-gray-6)",
					color: "var(--sl-color-gray-2)",
				};
			case "accepted":
				return {
					...base,
					background: "rgba(34,197,94,0.16)",
					color: "var(--viz-reward)",
				};
			case "corrected":
			case "bonus":
				return {
					...base,
					background: "rgba(245,158,11,0.16)",
					color: "var(--viz-value)",
				};
			case "rejected":
				return {
					...base,
					background: "rgba(239,68,68,0.12)",
					color: "var(--viz-danger)",
					textDecoration: "line-through",
					opacity: 0.75,
				};
		}
	};

	const lane = (
		label: string,
		chips: Chip[],
		pending?: { word: string; ok: boolean }[],
		verifying?: boolean,
	) => (
		<div style={{ marginBottom: "0.55rem" }}>
			<div
				style={{
					fontSize: "0.72rem",
					fontWeight: 700,
					letterSpacing: "0.05em",
					textTransform: "uppercase",
					color: "var(--sl-color-gray-3)",
					marginBottom: 3,
				}}
			>
				{label}
			</div>
			<div
				style={{
					display: "flex",
					gap: 4,
					flexWrap: "nowrap",
					overflow: "hidden",
					alignItems: "center",
					minHeight: 26,
					justifyContent: "flex-end",
				}}
			>
				{chips.map((c, i) => (
					<span key={`${i}-${c.word}`} style={chipStyle(c.kind)}>
						{c.word}
					</span>
				))}
				{pending?.map((p, i) => (
					<span
						key={`p-${i}`}
						style={{
							padding: "0.12rem 0.4rem",
							borderRadius: 4,
							fontSize: "0.78rem",
							fontFamily: "var(--sl-font-system-mono, monospace)",
							whiteSpace: "nowrap",
							border: `1px dashed ${verifying ? "var(--viz-kl)" : "var(--sl-color-gray-4)"}`,
							color: "var(--sl-color-gray-3)",
						}}
					>
						{p.word}
					</span>
				))}
				{verifying && (
					<span
						style={{
							fontSize: "0.7rem",
							color: "var(--viz-kl)",
							fontWeight: 700,
						}}
					>
						verify…
					</span>
				)}
			</div>
		</div>
	);

	return (
		<SimShell
			title="Draft, then verify — live"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(10)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{
					label: "target passes (spec vs AR)",
					value: `${S.cycles} vs ${S.basePos}`,
				},
				{
					label: "speedup",
					value: empSpeedup === null ? "—" : `${empSpeedup.toFixed(2)}×`,
					color:
						empSpeedup !== null && empSpeedup > 1.05
							? "var(--viz-reward)"
							: empSpeedup !== null && empSpeedup < 0.95
								? "var(--viz-danger)"
								: undefined,
				},
				{
					label: "theory",
					value: `${theory.toFixed(2)}×`,
					color: theory < 1 ? "var(--viz-danger)" : undefined,
				},
				{
					label: "drafts kept",
					value: empAccept === null ? "—" : empAccept.toFixed(2),
				},
				{
					label: "drafts wasted",
					value:
						S.drafted > 0
							? `${((100 * S.discarded) / S.drafted).toFixed(0)}%`
							: "—",
				},
			]}
		>
			{lane("autoregressive (1 token / target pass)", S.baseChips)}
			{lane(
				`speculative (γ = ${S.gamma} drafts / target pass)`,
				S.specChips,
				S.pending,
				S.phase === "verify",
			)}

			<Sparkline
				label="tokens generated vs time (speculative in blue)"
				series={[
					{ data: S.baseCurve, color: "var(--viz-ref)", width: 1.8 },
					{ data: S.specCurve, color: "var(--viz-policy)", width: 2.2 },
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
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						draft accuracy α ={" "}
						<span className="viz-slider-value">{alpha.toFixed(2)}</span>
					</span>
					<input
						type="range"
						min={0.1}
						max={0.98}
						step={0.01}
						value={alpha}
						onChange={(e) => setAlpha(parseFloat(e.target.value))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						draft length γ = <span className="viz-slider-value">{gamma}</span>
					</span>
					<input
						type="range"
						min={1}
						max={12}
						step={1}
						value={gamma}
						onChange={(e) => setGamma(parseInt(e.target.value, 10))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						draft cost c ={" "}
						<span className="viz-slider-value">{cost.toFixed(2)}</span> per
						token
					</span>
					<input
						type="range"
						min={0.02}
						max={0.5}
						step={0.02}
						value={cost}
						onChange={(e) => setCost(parseFloat(e.target.value))}
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
				Green = accepted draft, struck-through red = rejected draft (discarded),
				amber = token the verify pass itself produced (correction or bonus).
				Knob changes apply at the next cycle.
			</div>
		</SimShell>
	);
}
