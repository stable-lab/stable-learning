import { useMemo, useState } from "react";
import Plot from "./LazyPlot";

// Closed-form speedup of speculative decoding:
//   E[tokens/cycle] = (1 − α^(γ+1)) / (1 − α)
//   speedup S(γ) = E / (γ·c + 1)
// where α = per-token draft acceptance, γ = draft length, c = draft cost
// relative to one target forward pass.

const ALPHAS = [0.5, 0.7, 0.85, 0.95];
const COLORS = ["#94a3b8", "#f59e0b", "#3b82f6", "#22c55e"];
const GAMMAS = Array.from({ length: 14 }, (_, i) => i + 1);

export default function SpeedupExplorer() {
	const [cost, setCost] = useState(0.1);

	const traces = useMemo(
		() =>
			ALPHAS.map((a, idx) => ({
				x: GAMMAS,
				y: GAMMAS.map((g) => (1 - a ** (g + 1)) / (1 - a) / (g * cost + 1)),
				type: "scatter" as const,
				mode: "lines+markers" as const,
				name: `α = ${a}`,
				line: { color: COLORS[idx], width: 2 },
				marker: { size: 5 },
			})),
		[cost],
	);

	const bestNote = useMemo(
		() =>
			ALPHAS.map((a) => {
				let bestG = 1;
				let bestS = 0;
				for (const g of GAMMAS) {
					const s = (1 - a ** (g + 1)) / (1 - a) / (g * cost + 1);
					if (s > bestS) {
						bestS = s;
						bestG = g;
					}
				}
				return { a, bestG, bestS };
			}),
		[cost],
	);

	return (
		<div className="plotly-viz">
			<label
				className="viz-slider"
				style={{ maxWidth: 300, marginBottom: "0.4rem" }}
			>
				<span>
					draft cost c ={" "}
					<span className="viz-slider-value">{cost.toFixed(2)}</span> × target
					pass
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
			<Plot
				data={traces}
				layout={{
					xaxis: { title: { text: "draft length γ" }, dtick: 1 },
					yaxis: { title: { text: "wall-clock speedup" }, rangemode: "tozero" },
					shapes: [
						{
							type: "line",
							x0: 1,
							x1: 14,
							y0: 1,
							y1: 1,
							line: { color: "#ef4444", width: 1.5, dash: "dash" },
						},
					],
					annotations: [
						{
							x: 13.2,
							y: 1,
							text: "break-even",
							showarrow: false,
							yshift: 9,
							font: { size: 11, color: "#ef4444" },
						},
					],
					legend: { orientation: "h", y: 1.12 },
					height: 320,
					margin: { t: 10 },
				}}
				useResizeHandler
				style={{ width: "100%" }}
			/>
			<div
				style={{
					fontSize: "0.8rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.3rem",
					lineHeight: 1.5,
				}}
			>
				Optimal γ at c = {cost.toFixed(2)}:{" "}
				{bestNote
					.map(
						({ a, bestG, bestS }) =>
							`α=${a} → γ*=${bestG} (${bestS.toFixed(1)}×)`,
					)
					.join(" · ")}
				. Note how a weak drafter (α = 0.5) barely clears break-even, and only
				for short drafts.
			</div>
		</div>
	);
}
