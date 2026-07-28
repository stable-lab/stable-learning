// Static architecture diagram: DFlash's block-diffusion drafting cycle.
// The target prefills the context once (left); its per-layer hidden states are
// injected into the draft diffusion model's KV cache (middle); the drafter
// resolves a fully masked K-token block in S parallel refinement passes
// (right); one target pass verifies the whole block (bottom).

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
				markerEnd="url(#dflash-arr)"
			/>
			{label && (
				<text x={lx} y={ly} fontSize={9.5} fill={MUT} textAnchor="middle">
					{label}
				</text>
			)}
		</g>
	);
}

export default function DFlashArchitecture() {
	return (
		<div className="viz-sim" style={{ padding: "0.9rem" }}>
			<svg
				viewBox="0 0 790 330"
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label="DFlash block-diffusion drafting architecture"
			>
				<defs>
					<marker
						id="dflash-arr"
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
					x={135}
					y={22}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					TARGET MODEL
				</text>
				<Box
					x={40}
					y={36}
					w={190}
					h={36}
					label="context  t_{≤i}"
					color="var(--viz-ref)"
				/>
				<Arrow d="M135,72 L135,94" />
				<Box
					x={40}
					y={96}
					w={190}
					h={46}
					label="N transformer layers"
					sub="hidden states at every layer"
					color="var(--viz-ref)"
				/>
				<Box
					x={40}
					y={256}
					w={190}
					h={42}
					label="target verify — accept prefix"
					sub="lossless, chapter-1 rule"
					color="var(--viz-reward)"
				/>

				{/* KV injection: one arrow per draft layer */}
				<text
					x={350}
					y={88}
					textAnchor="middle"
					fontSize={10}
					fontWeight={700}
					letterSpacing="0.05em"
					fill="var(--viz-value)"
				>
					KV INJECTION
				</text>
				<Arrow d="M230,104 L466,104" color="var(--viz-value)" />
				<Arrow d="M230,118 L466,118" color="var(--viz-value)" />
				<Arrow d="M230,132 L466,132" color="var(--viz-value)" />
				<text x={350} y={152} fontSize={9.5} fill={MUT} textAnchor="middle">
					target hiddens → draft KV projections
				</text>
				<text x={350} y={165} fontSize={9.5} fill={MUT} textAnchor="middle">
					→ draft KV cache, every draft layer
				</text>

				<text
					x={585}
					y={22}
					textAnchor="middle"
					fontSize={11}
					fontWeight={700}
					letterSpacing="0.05em"
					fill={MUT}
				>
					DRAFT DIFFUSION MODEL — ONE PARALLEL PASS
				</text>
				<Box
					x={470}
					y={36}
					w={230}
					h={36}
					label="▒▒▒▒▒▒▒▒   masked block, K positions"
					color="var(--viz-policy)"
					dashed
				/>
				<Arrow d="M585,72 L585,94" />
				<Box
					x={470}
					y={96}
					w={230}
					h={46}
					label="n draft layers — K positions at once"
					sub="context read from injected KV"
					color="var(--viz-policy)"
				/>
				{/* refinement loop */}
				<Arrow
					d="M700,120 C762,120 762,54 704,54"
					color="var(--viz-policy)"
				/>
				<text x={753} y={82} fontSize={9} fill={MUT} textAnchor="middle">
					× S passes
				</text>
				<text x={753} y={94} fontSize={9} fill={MUT} textAnchor="middle">
					(S = 1–2)
				</text>
				<text x={753} y={106} fontSize={9} fill={MUT} textAnchor="middle">
					commit by
				</text>
				<text x={753} y={118} fontSize={9} fill={MUT} textAnchor="middle">
					confidence
				</text>
				<Arrow d="M585,142 L585,168" />
				<Box
					x={470}
					y={170}
					w={230}
					h={40}
					label="draft block  t̂_{i+1} … t̂_{i+K}"
					sub="no token-by-token loop anywhere"
					color="var(--viz-policy)"
				/>
				<Arrow
					d="M470,196 C350,196 320,277 234,277"
					label="one verify pass over all K"
					lx={352}
					ly={234}
					color="var(--viz-reward)"
				/>
			</svg>
		</div>
	);
}
