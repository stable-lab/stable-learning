// Static architecture diagram: the two ways to predict multiple future
// tokens. Left: Gloeckle/Medusa-style parallel heads — every head reads the
// prefix, none reads its neighbors. Right: DeepSeek-V3's sequential MTP
// module — the extra block consumes the token actually sampled, so the
// within-block chain rule stays intact.

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
				fontSize={sub ? 11.5 : 12}
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
				strokeWidth={1.5}
				markerEnd="url(#mtp-arr)"
			/>
			{label && (
				<text x={lx} y={ly} fontSize={9.5} fill={MUT} textAnchor="middle">
					{label}
				</text>
			)}
		</g>
	);
}

export default function MTPModules() {
	return (
		<div className="viz-sim" style={{ padding: "0.9rem" }}>
			<svg
				viewBox="0 0 780 290"
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label="Parallel MTP heads versus DeepSeek-V3's sequential MTP module"
			>
				<defs>
					<marker
						id="mtp-arr"
						markerWidth="7"
						markerHeight="7"
						refX="6"
						refY="3.5"
						orient="auto"
					>
						<path d="M0,0 L7,3.5 L0,7 Z" fill={LINE} />
					</marker>
				</defs>

				<line
					x1={385}
					y1={16}
					x2={385}
					y2={274}
					stroke={LINE}
					strokeWidth={1}
					strokeDasharray="3 4"
				/>

				{/* left: parallel heads */}
				<text
					x={195}
					y={24}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					GLOECKLE / MEDUSA — PARALLEL HEADS
				</text>
				<Box
					x={70}
					y={44}
					w={250}
					h={44}
					label="shared trunk"
					sub="sees the prefix t_{≤i} — and nothing else"
					color="var(--viz-ref)"
				/>
				<Arrow d="M120,88 L110,132" />
				<Arrow d="M195,88 L195,132" />
				<Arrow d="M270,88 L280,132" />
				<Box
					x={62}
					y={134}
					w={90}
					h={54}
					label="head +1"
					sub="p(t_{i+1} | t_{≤i})"
					color="var(--viz-policy)"
				/>
				<Box
					x={162}
					y={134}
					w={90}
					h={54}
					label="head +2"
					sub="p(t_{i+2} | t_{≤i})"
					color="var(--viz-policy)"
				/>
				<Box
					x={262}
					y={134}
					w={90}
					h={54}
					label="head +3"
					sub="p(t_{i+3} | t_{≤i})"
					color="var(--viz-policy)"
				/>
				<text x={195} y={222} textAnchor="middle" fontSize={10} fill={MUT}>
					every head reads the prefix; none reads its neighbors —
				</text>
				<text
					x={195}
					y={237}
					textAnchor="middle"
					fontSize={10}
					fontWeight={650}
					fill={INK}
				>
					sampling them together is a product of marginals
				</text>

				{/* right: sequential module */}
				<text
					x={585}
					y={24}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					DEEPSEEK-V3 — SEQUENTIAL MTP MODULE
				</text>
				<Box
					x={445}
					y={44}
					w={280}
					h={44}
					label="main model → h_i, sample t_{i+1}"
					sub="ordinary next-token path, unchanged"
					color="var(--viz-ref)"
				/>
				<Arrow
					d="M525,88 L525,132"
					label="h_i"
					lx={508}
					ly={114}
					color="var(--viz-value)"
				/>
				<Arrow
					d="M645,88 L645,132"
					label="Emb(t_{i+1}) — the sampled token"
					lx={660}
					ly={114}
					color="var(--viz-reward)"
				/>
				<Box
					x={445}
					y={134}
					w={280}
					h={54}
					label="MTP block (D = 1) → predict t_{i+2}"
					sub="one extra transformer block; shares Emb + LM head"
					color="var(--viz-policy)"
				/>
				<text x={585} y={222} textAnchor="middle" fontSize={10} fill={MUT}>
					the extra head conditions on what was actually sampled —
				</text>
				<text
					x={585}
					y={237}
					textAnchor="middle"
					fontSize={10}
					fontWeight={650}
					fill={INK}
				>
					the chain rule stays intact (and doubles as a self-drafter)
				</text>
			</svg>
		</div>
	);
}
