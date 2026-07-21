import { useMemo, useState } from "react";

// DSpark (arXiv 2607.05147): a parallel block drafter guesses K tokens at
// once, but per-position acceptance decays along the block — later positions
// are conditioned on nothing, so almost none of the suffix survives
// verification ("suffix decay"). Two fixes, both shown here:
//   1. a lightweight semi-autoregressive module restores intra-block
//      dependencies, so later positions stop guessing blind (slower decay);
//   2. a confidence-scheduled, load-aware VARIABLE-LENGTH verify window
//      prunes the low-confidence suffix, so batch capacity is not spent
//      verifying tokens that will die anyway.
// This is a pure calculator — every number below is closed-form and is
// recomputed on each knob change. No simulation loop.

const K = 16; // block size
const A1 = 0.9; // acceptance at position 1
const D_PARALLEL = 0.8; // heavy per-position decay (parallel drafter)
const D_SEMIAR = 0.98; // semi-AR module: much slower decay
const T0 = 1.0; // fixed per-verify-step overhead
const KAPPA = 0.004; // marginal cost per (batch row × verified position)
const TAU_MAX = 0.7;
const SWEEP_N = 200;
const BATCHES = [1, 2, 4, 8, 16, 32, 48, 64];

/** Survival S_i = Π_{j≤i} α_j with α_j = a1·d^(j−1). */
function survival(d: number): number[] {
	const S: number[] = [];
	let s = 1;
	for (let i = 1; i <= K; i++) {
		s *= A1 * d ** (i - 1);
		S.push(s);
	}
	return S;
}

// S is monotone decreasing, so max{ i : S_i ≥ τ } = #{ i : S_i ≥ τ }.
const windowFor = (S: number[], tau: number) =>
	S.filter((x) => x >= tau).length;
const expected = (S: number[], L: number) =>
	S.slice(0, L).reduce((a, b) => a + b, 0);
const stepCost = (B: number, L: number) => T0 + KAPPA * B * (L + 1);
// Emitted per cycle = E(L) + 1 (the verifier's correction/bonus token).
const throughput = (S: number[], B: number, tau: number) => {
	const L = windowFor(S, tau);
	return (B * (expected(S, L) + 1)) / stepCost(B, L);
};

export default function SuffixDecayViz() {
	const [semiAR, setSemiAR] = useState(false);
	const [tau, setTau] = useState(0);
	const [bIdx, setBIdx] = useState(3); // BATCHES[3] = 8
	const B = BATCHES[bIdx];
	const d = semiAR ? D_SEMIAR : D_PARALLEL;

	const S = useMemo(() => survival(d), [d]);
	// Per-position rows for rendering; pos (1-based) is the stable identity.
	const block = useMemo(
		() => S.map((s, i) => ({ pos: i + 1, s, a: A1 * d ** i })),
		[S, d],
	);
	const L = windowFor(S, tau);
	const E = expected(S, L);
	const wasted = L - E;
	const tpFull = throughput(S, B, 0);
	const gain = (throughput(S, B, tau) / tpFull - 1) * 100;

	// Sweep τ′ = 0 → 0.7, normalized so the full-block point (τ′=0) is 1.0.
	const sweep = useMemo(() => {
		const pts: { tau: number; rel: number }[] = [];
		const full = throughput(S, B, 0);
		let bestIdx = 0;
		for (let k = 0; k < SWEEP_N; k++) {
			const t = (TAU_MAX * k) / (SWEEP_N - 1);
			const rel = throughput(S, B, t) / full;
			pts.push({ tau: t, rel });
			if (rel > pts[bestIdx].rel) bestIdx = k;
		}
		return { pts, bestIdx };
	}, [S, B]);

	const chips: { label: string; value: string; color?: string }[] = [
		{ label: "verify window L(τ)", value: `${L} / ${K}` },
		{
			label: "E[accepted] / cycle",
			value: E.toFixed(2),
			color: "var(--viz-reward)",
		},
		{
			label: "wasted verify slots",
			value: wasted.toFixed(1),
			color: wasted > 3 ? "var(--viz-danger)" : undefined,
		},
		{
			label: "throughput vs full block",
			value: `${gain > 0 ? "+" : ""}${gain.toFixed(1)}%`,
			color: gain > 0 ? "var(--viz-reward)" : undefined,
		},
	];

	// --- bars panel geometry -------------------------------------------------
	const BW = 560;
	const BH = 170;
	const bLeft = 10;
	const slot = (550 - bLeft) / K;
	const bBase = 146;
	const bScale = 118; // px per unit probability
	const xCut = bLeft + L * slot;
	const cutAnchorEnd = xCut > 455;

	// --- throughput curve geometry ------------------------------------------
	const CW = 560;
	const CH = 150;
	const cl = 36;
	const cr = 550;
	const ct = 22;
	const cb = 126;
	const yMax = Math.max(1.12, Math.max(...sweep.pts.map((p) => p.rel)) * 1.1);
	const xFor = (t: number) => cl + (t / TAU_MAX) * (cr - cl);
	const yFor = (v: number) => cb - (v / yMax) * (cb - ct);
	const curvePts: string[] = [];
	sweep.pts.forEach((p, i) => {
		const x = xFor(p.tau);
		if (i > 0 && Math.abs(sweep.pts[i - 1].rel - p.rel) > 1e-9) {
			curvePts.push(`${x.toFixed(1)},${yFor(sweep.pts[i - 1].rel).toFixed(1)}`);
		}
		curvePts.push(`${x.toFixed(1)},${yFor(p.rel).toFixed(1)}`);
	});
	const best = sweep.pts[sweep.bestIdx];
	const bx = xFor(best.tau);
	const by = yFor(best.rel);
	const curX = xFor(tau);
	const curY = yFor(sweep.pts.length ? throughput(S, B, tau) / tpFull : 1);

	return (
		<div className="viz-sim">
			<div className="viz-sim-header">
				<span className="viz-sim-title">
					DSpark: suffix decay &amp; the variable-length verify window
				</span>
			</div>
			<div className="viz-readouts">
				{chips.map((r) => (
					<span key={r.label} className="viz-chip">
						<span className="viz-chip-label">{r.label}</span>
						<span
							className="viz-chip-value"
							style={r.color ? { color: r.color } : undefined}
						>
							{r.value}
						</span>
					</span>
				))}
			</div>

			<svg
				viewBox={`0 0 ${BW} ${BH}`}
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Per-position survival probability across the draft block, with the verify-window cut line"
			>
				<text
					x={4}
					y={12}
					fontSize={11}
					fontWeight={600}
					fill="var(--sl-color-gray-2)"
				>
					survival Sᵢ = Π αⱼ — what actually gets accepted
				</text>
				<text
					x={550}
					y={12}
					textAnchor="end"
					fontSize={10}
					fill="var(--viz-value)"
				>
					●— αᵢ per-position acceptance
				</text>
				{block.map((b) => {
					const h = Math.max(b.s * bScale, 1);
					const inWin = b.pos <= L;
					return (
						<rect
							key={`bar-${b.pos}`}
							x={bLeft + (b.pos - 1) * slot + (slot - 24) / 2}
							y={bBase - h}
							width={24}
							height={h}
							rx={2}
							fill={inWin ? "var(--viz-policy)" : "var(--sl-color-gray-5)"}
							fillOpacity={inWin ? 1 : 0.3}
							stroke={inWin ? "none" : "var(--sl-color-gray-4)"}
							strokeWidth={inWin ? 0 : 1}
							strokeDasharray={inWin ? undefined : "3 2"}
						/>
					);
				})}
				<polyline
					points={block
						.map(
							(b) =>
								`${(bLeft + (b.pos - 1) * slot + slot / 2).toFixed(1)},${(bBase - b.a * bScale).toFixed(1)}`,
						)
						.join(" ")}
					fill="none"
					stroke="var(--viz-value)"
					strokeWidth={1.6}
					opacity={0.9}
				/>
				{block.map((b) => (
					<circle
						key={`a-${b.pos}`}
						cx={bLeft + (b.pos - 1) * slot + slot / 2}
						cy={bBase - b.a * bScale}
						r={2.3}
						fill="var(--viz-value)"
					/>
				))}
				<g key={`cut-${L}-${d}`} className="viz-fade-in">
					<line
						x1={xCut}
						x2={xCut}
						y1={20}
						y2={152}
						stroke="var(--viz-danger)"
						strokeWidth={1.5}
						strokeDasharray="5 3"
					/>
					<text
						x={cutAnchorEnd ? xCut - 5 : xCut + 5}
						y={28}
						textAnchor={cutAnchorEnd ? "end" : "start"}
						fontSize={9}
						fill="var(--viz-danger)"
					>
						verify window
					</text>
				</g>
				{block
					.filter((b) => b.pos % 2 === 1)
					.map((b) => (
						<text
							key={`x-${b.pos}`}
							x={bLeft + (b.pos - 1) * slot + slot / 2}
							y={162}
							textAnchor="middle"
							fontSize={9.5}
							fill="var(--sl-color-gray-3)"
						>
							{b.pos}
						</text>
					))}
			</svg>

			<svg
				viewBox={`0 0 ${CW} ${CH}`}
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Relative throughput as the confidence threshold sweeps from 0 to 0.7"
			>
				<text
					x={4}
					y={11}
					fontSize={11}
					fontWeight={600}
					fill="var(--sl-color-gray-2)"
				>
					relative throughput at B = {B}
				</text>
				<line
					x1={cl}
					x2={cr}
					y1={yFor(1)}
					y2={yFor(1)}
					stroke="var(--sl-color-gray-5)"
					strokeWidth={1}
					strokeDasharray="4 3"
				/>
				<text
					x={cr}
					y={yFor(1) - 4}
					textAnchor="end"
					fontSize={8.5}
					fill="var(--sl-color-gray-3)"
				>
					1.0 = verify full block (τ = 0)
				</text>
				<polyline
					points={curvePts.join(" ")}
					fill="none"
					stroke="var(--viz-policy)"
					strokeWidth={2}
				/>
				<polygon
					points={`${bx - 4.5},${by + 12} ${bx + 4.5},${by + 12} ${bx},${by + 4}`}
					fill="var(--viz-reward)"
				/>
				<text
					x={bx > 470 ? bx - 8 : bx + 8}
					y={by + 13}
					textAnchor={bx > 470 ? "end" : "start"}
					fontSize={9}
					fill="var(--viz-reward)"
				>
					optimal cut
				</text>
				<circle
					cx={curX}
					cy={curY}
					r={4}
					fill="var(--viz-policy)"
					stroke="var(--card-bg)"
					strokeWidth={1.5}
				/>
				<text
					x={cl}
					y={140}
					textAnchor="middle"
					fontSize={9}
					fill="var(--sl-color-gray-3)"
				>
					0
				</text>
				<text
					x={cr}
					y={140}
					textAnchor="middle"
					fontSize={9}
					fill="var(--sl-color-gray-3)"
				>
					{TAU_MAX}
				</text>
				<text
					x={(cl + cr) / 2}
					y={140}
					textAnchor="middle"
					fontSize={9}
					fill="var(--sl-color-gray-3)"
				>
					confidence threshold τ′
				</text>
			</svg>

			<div
				style={{
					display: "flex",
					gap: "0.9rem",
					flexWrap: "wrap",
					alignItems: "flex-end",
					marginTop: "0.65rem",
				}}
			>
				<button
					type="button"
					className="viz-btn"
					onClick={() => setSemiAR(!semiAR)}
					style={
						semiAR
							? {
									borderColor: "var(--viz-policy)",
									color: "var(--viz-policy)",
									fontWeight: 600,
								}
							: undefined
					}
				>
					{semiAR ? "semi-AR module: ON" : "parallel drafter (heavy decay)"}
				</button>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						confidence threshold τ ={" "}
						<span className="viz-slider-value">{tau.toFixed(2)}</span>
					</span>
					<input
						type="range"
						min={0}
						max={TAU_MAX}
						step={0.01}
						value={tau}
						onChange={(e) => setTau(Number.parseFloat(e.target.value))}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						batch size B = <span className="viz-slider-value">{B}</span>
					</span>
					<input
						type="range"
						min={0}
						max={BATCHES.length - 1}
						step={1}
						value={bIdx}
						onChange={(e) => setBIdx(Number.parseInt(e.target.value, 10))}
					/>
				</label>
			</div>
			<div
				style={{
					fontSize: "0.78rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.55rem",
				}}
			>
				t₀ + κ·B·(L+1) step-cost model; numbers are illustrative, shaped to
				match the paper&rsquo;s regime.
			</div>
		</div>
	);
}
