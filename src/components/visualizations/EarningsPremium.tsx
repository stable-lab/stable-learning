// Static chart: earnings premium over people who could have gone to
// university but chose not to. Data: The Economist, "The disposable academic"
// (Dec 16, 2010), reporting Bernard Casey's analysis of British men ("The
// economic contribution of PhDs", J. Higher Educ. Policy & Mgmt., 2009) —
// bachelor's +14%, master's +23%, PhD +26%; in maths & computing the PhD's
// edge over the master's is ≈ 0.

const X0 = 96; // zero baseline
const PX_PER_PT = 12; // 560-wide viewBox, max ~30%
const BAR_H = 20;
const R = 4;

const x = (v: number): number => X0 + v * PX_PER_PT;

// Horizontal bar anchored at the zero baseline, 4px rounded on the value end only.
function barPath(
	x1: number,
	y: number,
	h: number = BAR_H,
	r: number = R,
): string {
	return `M ${X0} ${y} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y + r} V ${
		y + h - r
	} A ${r} ${r} 0 0 1 ${x1 - r} ${y + h} H ${X0} Z`;
}

const INK = "var(--sl-color-white)";
const INK_2 = "var(--sl-color-gray-2)";
const INK_3 = "var(--sl-color-gray-3)";
const HAIRLINE = "var(--sl-color-gray-5)";
const REF = "#94a3b8"; // reference series (master's)
const ACCENT = "#f59e0b"; // the track's "degree" amber (PhD)

export default function EarningsPremium() {
	return (
		<div className="plotly-viz">
			<div className="viz-sim-title" style={{ fontSize: 11, marginBottom: 8 }}>
				Earnings premium over non-graduates
			</div>
			<svg
				viewBox="0 0 560 102"
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Bar chart: over people who could have gone to university but chose not to, a bachelor's earns a 14% premium, a master's 23%, and a PhD 26% — a marginal edge of 3 points."
			>
				{/* zero baseline */}
				<line x1={X0 + 0.5} y1={4} x2={X0 + 0.5} y2={74} stroke={HAIRLINE} />

				{/* Bachelor's — gray reference */}
				<path d={barPath(x(14), 6)} fill={REF}>
					<title>
						A bachelor's holder earns about 14% more than someone who could
						have gone to university but chose not to — British men, Bernard
						Casey's analysis (J. Higher Educ. Policy &amp; Mgmt., 2009),
						reported in The Economist, "The disposable academic," 2010.
					</title>
				</path>
				<text x={X0 - 8} y={19.5} textAnchor="end" fontSize={11} fill={INK_2}>
					Bachelor's
				</text>
				<text
					x={x(14) + 8}
					y={19.5}
					fontSize={11}
					fontWeight={600}
					fill={INK}
					fillOpacity={0.9}
				>
					+14%
				</text>

				{/* Master's — gray reference */}
				<path d={barPath(x(23), 28)} fill={REF}>
					<title>
						A master's holder earns about 23% more than someone who could have
						gone to university but chose not to — British men, Bernard Casey's
						analysis (J. Higher Educ. Policy &amp; Mgmt., 2009), reported in
						The Economist, "The disposable academic," 2010.
					</title>
				</path>
				<text x={X0 - 8} y={41.5} textAnchor="end" fontSize={11} fill={INK_2}>
					Master's
				</text>
				<text
					x={x(23) + 8}
					y={41.5}
					fontSize={11}
					fontWeight={600}
					fill={INK}
					fillOpacity={0.9}
				>
					+23%
				</text>

				{/* PhD — amber accent */}
				<path d={barPath(x(26), 50)} fill={ACCENT}>
					<title>
						A PhD holder earns about 26% more than someone who could have gone
						to university but chose not to — just 3 points above the master's,
						and in maths and computing the edge is approximately zero. British
						men, Bernard Casey's analysis (J. Higher Educ. Policy &amp; Mgmt.,
						2009), reported in The Economist, "The disposable academic," 2010.
					</title>
				</path>
				{/* 2px surface notch marking where the master's premium already ends */}
				<line
					x1={x(23)}
					y1={50}
					x2={x(23)}
					y2={70}
					stroke="var(--card-bg)"
					strokeWidth={2}
				/>
				<text x={X0 - 8} y={63.5} textAnchor="end" fontSize={11} fill={INK_2}>
					PhD
				</text>
				<text
					x={x(26) + 8}
					y={63.5}
					fontSize={11}
					fontWeight={600}
					fill={INK}
					fillOpacity={0.9}
				>
					+26%
				</text>

				{/* bracket spanning the 23 → 26 gap on the PhD bar */}
				<path
					d={`M ${x(23)} 74 V 79 H ${x(26)} V 74`}
					fill="none"
					stroke={INK_2}
					strokeWidth={1}
				/>
				<text
					x={(x(23) + x(26)) / 2}
					y={93}
					textAnchor="middle"
					fontSize={10.5}
					fill={INK_2}
				>
					+3 pts — the doctorate's marginal edge
				</text>
			</svg>
			<div style={{ fontSize: 10.5, color: INK_3, marginTop: 6 }}>
				maths &amp; computing: the PhD's edge over the master's ≈ 0
			</div>
		</div>
	);
}
