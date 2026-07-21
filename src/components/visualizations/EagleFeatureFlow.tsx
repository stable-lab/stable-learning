// Static architecture diagram: EAGLE-1's feature-level autoregression.
// The target runs once (left); the one-layer draft head then autoregresses
// in feature space (right), reusing the target's frozen LM head.

const INK = "var(--sl-color-gray-2)";
const MUT = "var(--sl-color-gray-3)";
const LINE = "var(--sl-color-gray-4)";

function Box({
	x,
	y,
	w,
	h,
	label,
	sub,
	color,
	dashed,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
	sub?: string;
	color: string;
	dashed?: boolean;
}) {
	return (
		<g>
			<rect
				x={x}
				y={y}
				width={w}
				height={h}
				rx={7}
				fill={color}
				opacity={0.13}
				stroke={color}
				strokeWidth={1.4}
				strokeDasharray={dashed ? "5 3" : undefined}
			/>
			<text
				x={x + w / 2}
				y={y + (sub ? h / 2 - 3 : h / 2 + 4)}
				textAnchor="middle"
				fontSize={12}
				fontWeight={650}
				fill={INK}
			>
				{label}
			</text>
			{sub && (
				<text
					x={x + w / 2}
					y={y + h / 2 + 13}
					textAnchor="middle"
					fontSize={9.5}
					fill={MUT}
				>
					{sub}
				</text>
			)}
		</g>
	);
}

function Arrow({
	d,
	label,
	lx,
	ly,
	color = LINE,
}: {
	d: string;
	label?: string;
	lx?: number;
	ly?: number;
	color?: string;
}) {
	return (
		<g>
			<path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth={1.6}
				markerEnd="url(#eagle-arr)"
			/>
			{label && (
				<text x={lx} y={ly} fontSize={9.5} fill={MUT} textAnchor="middle">
					{label}
				</text>
			)}
		</g>
	);
}

export default function EagleFeatureFlow() {
	return (
		<div className="viz-sim" style={{ padding: "0.9rem" }}>
			<svg
				viewBox="0 0 720 300"
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label="EAGLE feature-level drafting architecture"
			>
				<defs>
					<marker
						id="eagle-arr"
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"
					>
						<path d="M0,0 L7,3.5 L0,7 Z" fill={LINE} />
					</marker>
				</defs>

				<text
					x={125}
					y={22}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					TARGET MODEL — RUNS ONCE
				</text>
				<Box
					x={40}
					y={36}
					w={170}
					h={40}
					label="N transformer layers"
					sub="full context"
					color="var(--viz-ref)"
				/>
				<Arrow d="M125,76 L125,102" />
				<Box
					x={40}
					y={104}
					w={170}
					h={38}
					label="feature  f_t"
					sub="second-to-top hidden state"
					color="var(--viz-value)"
				/>
				<Arrow d="M125,142 L125,168" />
				<Box
					x={40}
					y={170}
					w={170}
					h={38}
					label="LM head (frozen)"
					color="var(--viz-ref)"
				/>
				<Arrow d="M125,208 L125,234" />
				<Box
					x={40}
					y={236}
					w={170}
					h={38}
					label="sample  x_{t+1}"
					color="var(--viz-reward)"
				/>

				<text
					x={520}
					y={22}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					DRAFT HEAD — ONE LAYER, AUTOREGRESSES γ TIMES
				</text>

				<Box
					x={400}
					y={104}
					w={240}
					h={40}
					label="[ f_t  ;  Emb(x_{t+1}) ]"
					sub="feature + the token actually sampled"
					color="var(--viz-policy)"
				/>
				<Arrow d="M520,144 L520,168" />
				<Box
					x={400}
					y={170}
					w={240}
					h={38}
					label="DraftLayer  →  f̂_{t+1}"
					sub="the only trained part"
					color="var(--viz-policy)"
				/>
				<Arrow d="M520,208 L520,234" />
				<Box
					x={400}
					y={236}
					w={240}
					h={38}
					label="frozen LM head  →  x̂_{t+2}"
					sub="reused from the target"
					color="var(--viz-reward)"
					dashed
				/>

				<Arrow
					d="M210,123 L396,123"
					label="feature handoff"
					lx={300}
					ly={116}
					color="var(--viz-value)"
				/>
				<Arrow
					d="M210,255 C300,255 300,140 396,132"
					label="sampled token resolves the uncertainty"
					lx={296}
					ly={215}
					color="var(--viz-reward)"
				/>

				<path
					d="M640,255 C700,255 700,124 644,124"
					fill="none"
					stroke="var(--viz-kl)"
					strokeWidth={1.6}
					strokeDasharray="5 3"
					markerEnd="url(#eagle-arr)"
				/>
				<text
					x={703}
					y={192}
					fontSize={9.5}
					fill="var(--viz-kl)"
					textAnchor="middle"
					transform="rotate(90 703 192)"
				>
					feed back, γ times
				</text>
			</svg>
			<div
				style={{
					fontSize: "0.78rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.4rem",
					lineHeight: 1.5,
				}}
			>
				One target pass produces f_t and the sampled token; the draft layer then
				loops in feature space — each extra draft token costs one layer, not one
				model.
			</div>
		</div>
	);
}
