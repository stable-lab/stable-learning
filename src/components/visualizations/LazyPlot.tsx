import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const Plot = lazy(async () => {
	const createPlotlyComponent = (await import("react-plotly.js")).default;
	return { default: createPlotlyComponent };
});

/** Re-render when the Starlight theme toggle flips data-theme. */
function useThemeVersion() {
	const [version, setVersion] = useState(0);
	useEffect(() => {
		const ob = new MutationObserver(() => setVersion((v) => v + 1));
		ob.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => ob.disconnect();
	}, []);
	return version;
}

function cssVar(name: string, fallback: string): string {
	if (typeof document === "undefined") return fallback;
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Deep-merge b over a (b wins); plain objects only, arrays replaced. */
function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = { ...a };
	for (const k of Object.keys(b)) {
		const av = out[k];
		const bv = b[k];
		out[k] = isObject(av) && isObject(bv) ? merge(av, bv) : bv;
	}
	return out;
}

/**
 * Plotly with site-wide theme defaults: inherits the UI font, follows the
 * light/dark theme for text and gridlines, uses the shared viz colorway,
 * and hides the mode bar. Anything the caller passes in `layout`/`config`
 * wins over these defaults.
 */
export default function LazyPlot(props: any) {
	const themeVersion = useThemeVersion();

	const themedLayout = useMemo(() => {
		const text = cssVar("--sl-color-gray-2", "#8f887b");
		const grid = cssVar("--sl-color-gray-5", "rgba(140,130,110,0.25)");
		const axis = {
			gridcolor: grid,
			zerolinecolor: grid,
			linecolor: grid,
			tickcolor: grid,
		};
		const defaults = {
			font: {
				family: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
				size: 12.5,
				color: text,
			},
			colorway: ["#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#a855f7", "#94a3b8"],
			paper_bgcolor: "rgba(0,0,0,0)",
			plot_bgcolor: "rgba(0,0,0,0)",
			margin: { t: 40, r: 12, b: 46, l: 52 },
			xaxis: axis,
			yaxis: axis,
			legend: { font: { size: 11.5 } },
		};
		return merge(defaults, props.layout ?? {});
		// themeVersion re-reads CSS vars after a theme toggle
	}, [props.layout, themeVersion]);

	const themedConfig = useMemo(
		() => merge({ displayModeBar: false, responsive: true }, props.config ?? {}),
		[props.config],
	);

	return (
		<Suspense
			fallback={
				<div
					style={{
						height: "350px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					Loading chart...
				</div>
			}
		>
			<Plot {...props} layout={themedLayout} config={themedConfig} />
		</Suspense>
	);
}
