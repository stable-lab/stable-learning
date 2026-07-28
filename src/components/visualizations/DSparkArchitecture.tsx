// Static architecture diagram: DSpark's semi-autoregressive drafter plus
// confidence-scheduled verification. Top: a parallel backbone emits base
// logits for all K positions in one pass; a first-order Markov head threads
// through the block with K tiny bias-adds. Bottom: a confidence head predicts
// each position's survival and a load-aware scheduler cuts the verify window.

const INK = "var(--sl-color-gray-2)";
const MUT = "var(--sl-color-gray-3)";
const LINE = "var(--sl-color-gray-4)";
const CUT = "#ef4444";

const K = 6;
const SLOT_X0 = 300;
const SLOT_STEP = 76;
const SLOT_W = 62;

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

function Slot({
	x,
	y,
	label,
	color,
	faded,
}: {
	x: number;
	y: number;
	label: string;
	color: string;
	faded?: boolean;
}) {
	return (
		<g opacity={faded ? 0.35 : 1}>
			<rect
				x={x}
				y={y}
				width={SLOT_W}
				height={30}
				rx={5}
				fill={color}
				opacity={0.13}
				stroke={color}
				strokeWidth={1.3}
			/>
			<text
				x={x + SLOT_W / 2}
				y={y + 19}
				textAnchor="middle"
				fontSize={11}
				fontWeight={650}
				fill={INK}
			>
				{label}
			</text>
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
				strokeWidth={1.5}
				markerEnd="url(#dspark-arr)"
			/>
			{label && (
				<text x={lx} y={ly} fontSize={9.5} fill={MUT} textAnchor="middle">
					{label}
				</text>
			)}
		</g>
	);
}

const SUBS = ["₁", "₂", "₃", "₄", "₅", "₆"];

export default function DSparkArchitecture() {
	const slotXs = Array.from({ length: K }, (_, k) => SLOT_X0 + k * SLOT_STEP);
	const cutX = slotXs[4] - 7; // verify window W = 4: positions 5,6 never sent

	return (
		<div className="viz-sim" style={{ padding: "0.9rem" }}>
			<svg
				viewBox="0 0 790 372"
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label="DSpark semi-autoregressive drafting and confidence-scheduled verification architecture"
			>
				<defs>
					<marker
						id="dspark-arr"
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
					x={395}
					y={18}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					DRAFT SIDE — ONE BACKBONE PASS + K TINY STEPS
				</text>

				<Box
					x={30}
					y={34}
					w={200}
					h={46}
					label="parallel backbone"
					sub="DFlash-style block draft, one pass"
					color="var(--viz-policy)"
				/>
				<Arrow d="M230,57 L294,57" />
				{slotXs.map((x, k) => (
					<Slot
						key={`z${k}`}
						x={x}
						y={42}
						label={`z${SUBS[k]}`}
						color="var(--viz-policy)"
					/>
				))}
				<text x={SLOT_X0 + 2} y={90} fontSize={9.5} fill={MUT}>
					base logits — all K positions from the same pass, none sees its neighbors
				</text>

				{/* sample arrows z_k -> t̂_k */}
				{slotXs.map((x, k) => (
					<Arrow
						key={`s${k}`}
						d={`M${x + SLOT_W / 2},98 L${x + SLOT_W / 2},126`}
						label={k === 0 ? "sample" : undefined}
						lx={x + SLOT_W / 2 - 24}
						ly={116}
					/>
				))}
				{/* Markov bias arrows t̂_k -> z_{k+1} sampling step */}
				{slotXs.slice(0, K - 1).map((x, k) => (
					<Arrow
						key={`b${k}`}
						d={`M${x + SLOT_W - 4},128 C${x + SLOT_W + 22},112 ${
							x + SLOT_STEP + 4
						},116 ${x + SLOT_STEP + SLOT_W / 2 - 6},99`}
						color="var(--viz-value)"
					/>
				))}
				<text
					x={640}
					y={122}
					fontSize={9.5}
					fill="var(--viz-value)"
					textAnchor="middle"
				>
					+ B(t̂ₖ, ·) = W₁[t̂ₖ] W₂
				</text>
				{slotXs.map((x, k) => (
					<Slot
						key={`t${k}`}
						x={x}
						y={128}
						label={`t̂${SUBS[k]}`}
						color="var(--viz-reward)"
						faded={k >= 4}
					/>
				))}

				<Box
					x={30}
					y={120}
					w={200}
					h={46}
					label="first-order Markov head"
					sub="K bias-adds — the only serial part"
					color="var(--viz-value)"
				/>

				{/* confidence + scheduler band */}
				<text
					x={135}
					y={214}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					SERVE SIDE
				</text>
				<Arrow d="M130,80 L130,116" />
				<Arrow d="M130,166 L130,224" />
				<Box
					x={30}
					y={226}
					w={200}
					h={46}
					label="confidence head"
					sub="ŝₖ = P(survive to k), STS-calibrated"
					color="var(--viz-value)"
				/>
				<Arrow d="M230,249 L294,249" />
				<Box
					x={300}
					y={226}
					w={236}
					h={46}
					label="load-aware scheduler"
					sub="T(B,K) = t₀ + α(B) + θ(M)"
					color="var(--viz-ref)"
				/>
				{/* the cut */}
				<line
					x1={cutX}
					y1={116}
					x2={cutX}
					y2={172}
					stroke={CUT}
					strokeWidth={2}
					strokeDasharray="4 3"
				/>
				<Arrow
					d={`M470,224 C500,196 540,186 ${cutX - 6},166`}
					color={CUT}
				/>
				<text x={608} y={196} fontSize={9.5} fill={CUT} textAnchor="middle">
					verify window W — per request, per step
				</text>
				<text x={608} y={209} fontSize={9.5} fill={MUT} textAnchor="middle">
					positions past the cut are never sent
				</text>
				<Arrow
					d={`M${slotXs[1] + SLOT_W / 2},160 C${slotXs[1] + SLOT_W / 2},310 ${
						slotXs[1] + SLOT_W
					},322 556,322`}
					color="var(--viz-reward)"
				/>
				<Box
					x={560}
					y={300}
					w={210}
					h={46}
					label="target verifies W positions"
					sub="window sets how long, never whether"
					color="var(--viz-reward)"
				/>
			</svg>
		</div>
	);
}
