import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import Sparkline from "./lib/Sparkline";
import { useSimLoop } from "./lib/useSimLoop";

// The lossless acceptance rule, run live on a 6-word vocabulary.
// Draw x ~ q (draft). Accept with prob min(1, p(x)/q(x)); on rejection,
// resample from the residual max(0, p−q)/Z. The empirical histogram then
// converges to p EXACTLY, no matter how bad q is — q's quality only sets
// the acceptance rate (speed), never the output distribution (correctness).
// "Naive" mode keeps every draft sample instead, and the bias is visible.

const VOCAB = ["sun", "moon", "star", "rain", "wind", "snow"];
const P = [0.3, 0.22, 0.18, 0.14, 0.1, 0.06];
const Q_BAD = [0.05, 0.1, 0.08, 0.12, 0.35, 0.3];

function mixQ(s: number): number[] {
	return P.map((p, i) => (1 - s) * p + s * Q_BAD[i]);
}

function sampleFrom(dist: number[]): number {
	let u = Math.random();
	for (let i = 0; i < dist.length; i++) {
		u -= dist[i];
		if (u <= 0) return i;
	}
	return dist.length - 1;
}

interface Sim {
	counts: number[];
	n: number;
	accepted: number;
	resampled: number;
	tvCurve: number[];
	lastEvent: string;
}

function freshSim(): Sim {
	return {
		counts: new Array(VOCAB.length).fill(0),
		n: 0,
		accepted: 0,
		resampled: 0,
		tvCurve: [],
		lastEvent: "",
	};
}

const SPEEDS = [
	{ label: "1×", value: 4 },
	{ label: "25×", value: 100 },
	{ label: "500×", value: 2000 },
];

export default function RejectionSampler() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(4);
	const [mismatch, setMismatch] = useState(0.6);
	const [naive, setNaive] = useState(false);
	const q = useMemo(() => mixQ(mismatch), [mismatch]);
	const knobs = useRef({ q, naive });
	knobs.current = { q, naive };

	const overlap = q.reduce((acc, qi, i) => acc + Math.min(P[i], qi), 0);
	const residual = useMemo(() => {
		const raw = P.map((p, i) => Math.max(0, p - q[i]));
		const Z = raw.reduce((a, b) => a + b, 0);
		return Z > 1e-12 ? raw.map((r) => r / Z) : P.slice();
	}, [q]);
	const residualRef = useRef(residual);
	residualRef.current = residual;

	const drawOne = useCallback(() => {
		const S = sim.current;
		const { q: qq, naive: nv } = knobs.current;
		const x = sampleFrom(qq);
		if (nv) {
			S.counts[x]++;
			S.lastEvent = `drew “${VOCAB[x]}” from q → kept (naive)`;
		} else {
			const ratio = P[x] / Math.max(1e-12, qq[x]);
			if (Math.random() < Math.min(1, ratio)) {
				S.counts[x]++;
				S.accepted++;
				S.lastEvent = `drew “${VOCAB[x]}” — p/q = ${ratio.toFixed(2)} → accepted`;
			} else {
				const y = sampleFrom(residualRef.current);
				S.counts[y]++;
				S.resampled++;
				S.lastEvent = `drew “${VOCAB[x]}” — p/q = ${ratio.toFixed(2)} → rejected, resampled “${VOCAB[y]}” from residual`;
			}
		}
		S.n++;
		if (S.n % 10 === 0) {
			let tv = 0;
			for (let i = 0; i < VOCAB.length; i++)
				tv += Math.abs(S.counts[i] / S.n - P[i]);
			S.tvCurve.push(tv / 2);
			if (S.tvCurve.length > 2000)
				S.tvCurve = S.tvCurve.filter((_, i) => i % 2 === 0);
		}
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) drawOne();
			commit();
		},
		[drawOne],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const S = sim.current;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	const empAccept =
		S.accepted + S.resampled > 0
			? S.accepted / (S.accepted + S.resampled)
			: null;
	const tvNow = S.tvCurve.length ? S.tvCurve[S.tvCurve.length - 1] : null;

	const W = 560;
	const H = 190;
	const groupW = W / VOCAB.length;
	const barW = 14;
	const maxV = 0.42;
	const y = (v: number) => H - 22 - (v / maxV) * (H - 46);

	return (
		<SimShell
			title="The acceptance rule, empirically"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(1)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "samples", value: String(S.n) },
				{
					label: "acceptance",
					value: empAccept === null ? "—" : empAccept.toFixed(2),
					color: "var(--viz-kl)",
				},
				{ label: "theory Σmin(p,q)", value: overlap.toFixed(2) },
				{
					label: "TV(empirical, p)",
					value: tvNow === null ? "—" : tvNow.toFixed(3),
					color:
						tvNow !== null && S.n > 500
							? tvNow < 0.03
								? "var(--viz-reward)"
								: "var(--viz-danger)"
							: undefined,
				},
			]}
		>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label="Target, draft and empirical distributions per word"
			>
				{VOCAB.map((wrd, i) => {
					const cx = i * groupW + groupW / 2;
					const emp = S.n > 0 ? S.counts[i] / S.n : 0;
					return (
						<g key={wrd}>
							<rect
								x={cx - barW * 1.5 - 3}
								y={y(P[i])}
								width={barW}
								height={y(0) - y(P[i])}
								fill="var(--viz-reward)"
								opacity={0.85}
								rx={2}
							/>
							<rect
								x={cx - barW / 2}
								y={y(q[i])}
								width={barW}
								height={y(0) - y(q[i])}
								fill="var(--sl-color-gray-4)"
								opacity={0.8}
								rx={2}
							/>
							<rect
								x={cx + barW / 2 + 3}
								y={y(emp)}
								width={barW}
								height={y(0) - y(emp)}
								fill="var(--viz-policy)"
								opacity={0.9}
								rx={2}
							/>
							<text
								x={cx}
								y={H - 8}
								textAnchor="middle"
								fontSize={11}
								fill="var(--sl-color-gray-2)"
								fontFamily="var(--sl-font-system-mono, monospace)"
							>
								{wrd}
							</text>
						</g>
					);
				})}
				<g fontSize={10.5}>
					<rect
						x={8}
						y={6}
						width={9}
						height={9}
						fill="var(--viz-reward)"
						rx={2}
					/>
					<text x={20} y={14} fill="var(--sl-color-gray-2)">
						target p
					</text>
					<rect
						x={78}
						y={6}
						width={9}
						height={9}
						fill="var(--sl-color-gray-4)"
						rx={2}
					/>
					<text x={90} y={14} fill="var(--sl-color-gray-2)">
						draft q
					</text>
					<rect
						x={140}
						y={6}
						width={9}
						height={9}
						fill="var(--viz-policy)"
						rx={2}
					/>
					<text x={152} y={14} fill="var(--sl-color-gray-2)">
						empirical output
					</text>
				</g>
			</svg>

			<div
				style={{
					fontFamily: "var(--sl-font-system-mono, monospace)",
					fontSize: "0.75rem",
					color: "var(--sl-color-gray-2)",
					background: "var(--sl-color-gray-6)",
					borderRadius: 4,
					padding: "0.3rem 0.55rem",
					minHeight: "1.6rem",
					marginTop: "0.3rem",
				}}
			>
				{S.lastEvent || "Press Run — at 1× each draw is narrated here."}
			</div>

			<Sparkline
				label="total-variation distance to p (lower = exact)"
				series={[
					{
						data: S.tvCurve,
						color: naive ? "var(--viz-danger)" : "var(--viz-reward)",
						width: 2,
					},
				]}
				height={90}
				yInclude={[0, 0.3]}
				formatY={(v) => v.toFixed(3)}
			/>

			<div
				style={{
					display: "flex",
					gap: "1rem",
					flexWrap: "wrap",
					alignItems: "flex-end",
					marginTop: "0.6rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 200px" }}>
					<span>
						draft mismatch ={" "}
						<span className="viz-slider-value">{mismatch.toFixed(2)}</span> (0 ⇒
						q = p)
					</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={mismatch}
						onChange={(e) => setMismatch(parseFloat(e.target.value))}
					/>
				</label>
				<button
					type="button"
					className="viz-btn"
					onClick={() => {
						setNaive(!naive);
						reset();
					}}
					style={
						naive
							? {
									background: "var(--viz-danger)",
									borderColor: "var(--viz-danger)",
									color: "#fff",
									fontWeight: 700,
								}
							: {
									borderColor: "var(--viz-reward)",
									color: "var(--viz-reward)",
									fontWeight: 600,
								}
					}
				>
					{naive ? "naive: keep every draft ⚠" : "rejection rule: ON"}
				</button>
			</div>
		</SimShell>
	);
}
