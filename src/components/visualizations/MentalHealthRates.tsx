// Static chart: mental-health base rates of graduate research.
// Upper panel — Evans et al., Nature Biotechnology 2018 (GAD-7 / PHQ-9,
// moderate to severe; 2,279 graduate students, 26 countries): anxiety 41% vs 6%
// general population, depression 39% vs 6%.
// Lower panel — Levecque et al., Research Policy 2017 (GHQ-12, GHQ4+ threshold;
// 3,659 PhD students in Flanders): 31.84% ≈ 32% at risk of a common psychiatric
// disorder vs 14.00% of the highly educated general population (Table 4, RR 2.43).

const X0 = 112; // zero baseline
const PX_PER_PCT = 9.2; // 560-wide viewBox, max ~45%
const BAR_H = 18;
const R = 4;

const x = (v: number): number => X0 + v * PX_PER_PCT;

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
const REF = "#94a3b8"; // general population (reference)
const DANGER = "#ef4444"; // hazard rates (graduate / PhD students)

function ValueLabel({ v, cx, cy }: { v: number; cx: number; cy: number }) {
	return (
		<text
			x={cx}
			y={cy}
			fontSize={11}
			fontWeight={600}
			fill={INK}
			fillOpacity={0.9}
		>
			{v}%
		</text>
	);
}

export default function MentalHealthRates() {
	return (
		<div className="plotly-viz">
			<div
				style={{
					display: "flex",
					alignItems: "center",
					flexWrap: "wrap",
					gap: 12,
					marginBottom: 8,
				}}
			>
				<div className="viz-sim-title" style={{ fontSize: 11 }}>
					Anxiety &amp; depression, moderate to severe
				</div>
				<div style={{ flex: 1 }} />
				{(
					[
						[DANGER, "graduate students"],
						[REF, "general population"],
					] as const
				).map(([color, label]) => (
					<span
						key={label}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 5,
							fontSize: 10.5,
							color: INK_2,
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: 2,
								background: color,
								display: "inline-block",
							}}
						/>
						{label}
					</span>
				))}
			</div>
			<svg
				viewBox="0 0 560 164"
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Grouped bar chart: moderate-to-severe anxiety 41% and depression 39% among graduate students versus 6% in the general population; separately, 32% of PhD students at risk of a common psychiatric disorder versus 14% of the highly educated general population."
			>
				{/* zero baseline */}
				<line x1={X0 + 0.5} y1={2} x2={X0 + 0.5} y2={160} stroke={HAIRLINE} />

				{/* Anxiety — Evans et al. 2018 */}
				<text x={X0 - 8} y={26.5} textAnchor="end" fontSize={11} fill={INK_2}>
					Anxiety
				</text>
				<path d={barPath(x(41), 4)} fill={DANGER}>
					<title>
						41% of 2,279 graduate students surveyed across 26 countries scored
						moderate to severe for anxiety on the GAD-7 — Evans et al., Nature
						Biotechnology, 2018.
					</title>
				</path>
				<ValueLabel v={41} cx={x(41) + 8} cy={16.5} />
				<path d={barPath(x(6), 24)} fill={REF}>
					<title>
						About 6% of the general population scores moderate to severe for
						anxiety — the comparison rate reported by Evans et al., Nature
						Biotechnology, 2018.
					</title>
				</path>
				<ValueLabel v={6} cx={x(6) + 8} cy={36.5} />

				{/* Depression — Evans et al. 2018 */}
				<text x={X0 - 8} y={74.5} textAnchor="end" fontSize={11} fill={INK_2}>
					Depression
				</text>
				<path d={barPath(x(39), 52)} fill={DANGER}>
					<title>
						39% of 2,279 graduate students surveyed across 26 countries scored
						moderate to severe for depression on the PHQ-9 — Evans et al.,
						Nature Biotechnology, 2018.
					</title>
				</path>
				<ValueLabel v={39} cx={x(39) + 8} cy={64.5} />
				<path d={barPath(x(6), 72)} fill={REF}>
					<title>
						About 6% of the general population scores moderate to severe for
						depression — the comparison rate reported by Evans et al., Nature
						Biotechnology, 2018.
					</title>
				</path>
				<ValueLabel v={6} cx={x(6) + 8} cy={84.5} />

				{/* Levecque et al. 2017 — different instrument, separated panel */}
				<line x1={8} y1={100.5} x2={552} y2={100.5} stroke={HAIRLINE} />
				<text
					x={8}
					y={112}
					fontSize={9}
					letterSpacing="0.05em"
					fill={INK_3}
					style={{ textTransform: "uppercase" }}
				>
					AT RISK OF A COMMON PSYCHIATRIC DISORDER — GHQ-12 (LEVECQUE ET AL.
					2017)
				</text>
				<text x={X0 - 8} y={132.5} textAnchor="end" fontSize={10.5} fill={INK_2}>
					PhD students
				</text>
				<path d={barPath(x(32), 120)} fill={DANGER}>
					<title>
						32% (31.84%) of 3,659 PhD students in Flanders reported four or more
						GHQ-12 symptoms — at risk of having or developing a common
						psychiatric disorder, depression above all — Levecque et al.,
						Research Policy, 2017.
					</title>
				</path>
				<text x={x(32) + 8} y={132.5}>
					<tspan fontSize={11} fontWeight={600} fill={INK} fillOpacity={0.9}>
						32%
					</tspan>
					<tspan dx={6} fontSize={10.5} fill={INK_2}>
						— one in three
					</tspan>
				</text>
				<text x={X0 - 8} y={152.5} textAnchor="end" fontSize={10.5} fill={INK_2}>
					educated gen. pop.
				</text>
				<path d={barPath(x(14), 140)} fill={REF}>
					<title>
						14% (14.00%) of the highly educated general population (N=769) met
						the same GHQ4+ threshold — age- and gender-adjusted risk ratio 2.43
						versus PhD students — Levecque et al., Research Policy, 2017, Table
						4.
					</title>
				</path>
				<ValueLabel v={14} cx={x(14) + 8} cy={152.5} />
			</svg>
		</div>
	);
}
