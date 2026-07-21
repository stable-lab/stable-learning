import { useId } from "react";

export interface SparkSeries {
	data: number[];
	color: string;
	width?: number;
	opacity?: number;
	fill?: boolean;
}

interface SparklineProps {
	series: SparkSeries[];
	height?: number;
	/** Horizontal reference line, e.g. an optimal return. */
	refLine?: { value: number; label?: string; color?: string };
	/** Force these values inside the y-range even before data reaches them. */
	yInclude?: number[];
	/** Label drawn top-left inside the plot area. */
	label?: string;
	/** How many points the x-axis represents (defaults to longest series). */
	xMax?: number;
	formatY?: (v: number) => string;
}

const PAD = { top: 6, right: 34, bottom: 4, left: 6 };

/**
 * Dependency-free SVG line chart for live curves. Autoscales y, downsamples
 * long series by striding, and renders at width 100% of its container.
 */
export default function Sparkline({
	series,
	height = 120,
	refLine,
	yInclude = [],
	label,
	xMax,
	formatY = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)),
}: SparklineProps) {
	// useId can emit characters (e.g. «») that are risky inside url(#…) refs.
	const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const W = 560; // viewBox width; SVG scales to container
	const H = height;
	const innerW = W - PAD.left - PAD.right;
	const innerH = H - PAD.top - PAD.bottom;

	const n = xMax ?? Math.max(2, ...series.map((s) => s.data.length));
	let lo = Infinity;
	let hi = -Infinity;
	for (const s of series) {
		for (const v of s.data) {
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
	}
	for (const v of yInclude) {
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	if (refLine) {
		if (refLine.value < lo) lo = refLine.value;
		if (refLine.value > hi) hi = refLine.value;
	}
	if (!Number.isFinite(lo)) {
		lo = 0;
		hi = 1;
	}
	if (hi - lo < 1e-9) {
		hi += 1;
		lo -= 1;
	}
	const span = hi - lo;
	lo -= span * 0.08;
	hi += span * 0.08;

	const x = (i: number) => PAD.left + (i / Math.max(1, n - 1)) * innerW;
	const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

	const path = (data: number[]) => {
		if (data.length === 0) return "";
		const stride = Math.max(1, Math.floor(data.length / 300));
		let d = "";
		for (let i = 0; i < data.length; i += stride) {
			d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(data[i]).toFixed(1)}`;
		}
		const last = data.length - 1;
		if (last % stride !== 0)
			d += `L${x(last).toFixed(1)},${y(data[last]).toFixed(1)}`;
		return d;
	};

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			style={{ width: "100%", height: "auto", display: "block" }}
			role="img"
			aria-label={label}
		>
			<rect
				x={PAD.left}
				y={PAD.top}
				width={innerW}
				height={innerH}
				fill="var(--sl-color-gray-6)"
				rx={4}
			/>
			{refLine && (
				<g>
					<line
						x1={PAD.left}
						x2={PAD.left + innerW}
						y1={y(refLine.value)}
						y2={y(refLine.value)}
						stroke={refLine.color ?? "var(--sl-color-gray-3)"}
						strokeDasharray="5 4"
						strokeWidth={1.2}
					/>
					{refLine.label && (
						<text
							x={PAD.left + innerW - 4}
							y={y(refLine.value) - 4}
							textAnchor="end"
							fontSize={11}
							fill="var(--sl-color-gray-3)"
						>
							{refLine.label}
						</text>
					)}
				</g>
			)}
			{series.map((s, si) => {
				const d = path(s.data);
				if (!d) return null;
				const lastV = s.data[s.data.length - 1];
				return (
					<g key={si}>
						{s.fill && (
							<path
								d={`${d}L${x(s.data.length - 1).toFixed(1)},${y(lo).toFixed(1)}L${x(0).toFixed(1)},${y(lo).toFixed(1)}Z`}
								fill={s.color}
								opacity={0.08}
							/>
						)}
						<path
							d={d}
							fill="none"
							stroke={s.color}
							strokeWidth={s.width ?? 2}
							opacity={s.opacity ?? 1}
							strokeLinejoin="round"
							clipPath={`url(#clip-${uid})`}
						/>
						{si === series.length - 1 && Number.isFinite(lastV) && (
							<text
								x={PAD.left + innerW + 3}
								y={y(lastV) + 4}
								fontSize={11}
								fontWeight={600}
								fill={s.color}
							>
								{formatY(lastV)}
							</text>
						)}
					</g>
				);
			})}
			<clipPath id={`clip-${uid}`}>
				<rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
			</clipPath>
			{label && (
				<text
					x={PAD.left + 8}
					y={PAD.top + 15}
					fontSize={11.5}
					fontWeight={600}
					fill="var(--sl-color-gray-2)"
				>
					{label}
				</text>
			)}
		</svg>
	);
}
