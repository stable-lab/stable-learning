import { useCallback, useEffect, useRef, useState } from "react";

// How one forward pass verifies a whole draft TREE.
// Left: a fixed 8-node draft tree hanging off the context token "cat".
// Right: the tree-attention mask over the flattened sequence — each node
// may attend only to the context, its root-path ancestors, and itself.
// Siblings must NOT see each other, or every branch would corrupt the
// others' conditional distributions. "Run verification" walks the tree
// with per-node acceptance coins and animates the surviving path.

interface Node {
	id: number;
	token: string;
	conf: number;
	parent: number; // -1 = context root
	x: number;
	y: number;
}

const NODES: Node[] = [
	{ id: 0, token: "sat", conf: 0.6, parent: -1, x: 105, y: 55 },
	{ id: 1, token: "is", conf: 0.25, parent: -1, x: 105, y: 130 },
	{ id: 2, token: "ran", conf: 0.1, parent: -1, x: 105, y: 195 },
	{ id: 3, token: "on", conf: 0.7, parent: 0, x: 185, y: 35 },
	{ id: 4, token: "there", conf: 0.15, parent: 0, x: 185, y: 85 },
	{ id: 5, token: "black", conf: 0.55, parent: 1, x: 185, y: 130 },
	{ id: 6, token: "the", conf: 0.85, parent: 3, x: 265, y: 35 },
	{ id: 7, token: "mat", conf: 0.75, parent: 6, x: 340, y: 35 },
];
const ROOT = { token: "…cat", x: 30, y: 130 };

function ancestors(id: number): number[] {
	const out: number[] = [];
	let cur = NODES[id].parent;
	while (cur >= 0) {
		out.push(cur);
		cur = NODES[cur].parent;
	}
	return out;
}

function pathProduct(id: number): number {
	let p = NODES[id].conf;
	for (const a of ancestors(id)) p *= NODES[a].conf;
	return p;
}

const EXPECTED = NODES.reduce((s, n) => s + pathProduct(n.id), 0);

const childrenOf = (parent: number) =>
	NODES.filter((n) => n.parent === parent).sort((a, b) => b.conf - a.conf);

type Verdict = "accepted" | "rejected" | "dead";
interface Ev {
	id: number;
	verdict: Verdict;
}

function runWalk(): { events: Ev[]; accepted: number[]; sweep: boolean } {
	const events: Ev[] = [];
	const accepted: number[] = [];
	const killSubtree = (id: number) => {
		for (const c of childrenOf(id)) {
			events.push({ id: c.id, verdict: "dead" });
			killSubtree(c.id);
		}
	};
	let cur = -1;
	for (;;) {
		const kids = childrenOf(cur);
		if (kids.length === 0) break;
		let winner: Node | null = null;
		for (const k of kids) {
			if (!winner && Math.random() < k.conf) {
				winner = k;
				events.push({ id: k.id, verdict: "accepted" });
				accepted.push(k.id);
			} else {
				events.push({ id: k.id, verdict: "rejected" });
				killSubtree(k.id);
			}
		}
		if (!winner) break;
		cur = winner.id;
	}
	const sweep =
		accepted.length > 0 &&
		childrenOf(accepted[accepted.length - 1]).length === 0;
	return { events, accepted, sweep };
}

const SEQ = ["…cat", ...NODES.map((n) => n.token)];
const CELL = 24;
const GRID0 = 58;

export default function TreeVerifyViz() {
	const [sel, setSel] = useState(7);
	const [events, setEvents] = useState<Ev[] | null>(null);
	const [reveal, setReveal] = useState(0);
	const [result, setResult] = useState<{
		accepted: number[];
		sweep: boolean;
	} | null>(null);
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);

	const stop = () => {
		if (timer.current) clearInterval(timer.current);
		timer.current = null;
	};
	useEffect(() => stop, []);

	const verify = useCallback(() => {
		stop();
		const walk = runWalk();
		setEvents(walk.events);
		setResult({ accepted: walk.accepted, sweep: walk.sweep });
		setReveal(0);
		timer.current = setInterval(() => {
			setReveal((r) => {
				if (r + 1 >= walk.events.length) stop();
				return r + 1;
			});
		}, 380);
	}, []);

	const resetRun = () => {
		stop();
		setEvents(null);
		setResult(null);
		setReveal(0);
	};

	const verdictOf = (id: number): Verdict | null => {
		if (!events) return null;
		const idx = events.findIndex((e) => e.id === id);
		return idx >= 0 && idx <= reveal ? events[idx].verdict : null;
	};

	const done = events !== null && reveal >= events.length - 1;
	const selAnc = new Set(ancestors(sel));

	const nodeFill = (id: number): string => {
		const v = verdictOf(id);
		if (v === "accepted") return "rgba(34,197,94,0.30)";
		if (v === "rejected") return "rgba(239,68,68,0.28)";
		if (v === "dead") return "var(--sl-color-gray-6)";
		return "rgba(59,130,246,0.14)";
	};
	const nodeStroke = (id: number): string => {
		const v = verdictOf(id);
		if (v === "accepted") return "var(--viz-reward)";
		if (v === "rejected") return "var(--viz-danger)";
		if (v === "dead") return "var(--sl-color-gray-5)";
		return id === sel ? "var(--viz-policy)" : "var(--sl-color-gray-4)";
	};

	const emitted = result ? result.accepted.length + 1 : null;

	return (
		<div className="viz-sim">
			<div className="viz-sim-header">
				<span className="viz-sim-title">One pass, whole tree</span>
				<span className="viz-sim-spacer" />
				<button
					type="button"
					className="viz-btn viz-btn-primary"
					onClick={verify}
				>
					▶ Run verification
				</button>
				<button type="button" className="viz-btn" onClick={resetRun}>
					↺ Reset
				</button>
			</div>
			<div className="viz-readouts">
				<span className="viz-chip">
					<span className="viz-chip-label">positions verified</span>
					<span className="viz-chip-value">{NODES.length} in 1 pass</span>
				</span>
				<span className="viz-chip">
					<span className="viz-chip-label">E[tokens/pass]</span>
					<span className="viz-chip-value">{(EXPECTED + 1).toFixed(2)}</span>
				</span>
				{done && result && (
					<span className="viz-chip">
						<span className="viz-chip-label">this run</span>
						<span
							className="viz-chip-value"
							style={{ color: "var(--viz-reward)" }}
						>
							{result.accepted.length} accepted + 1{" "}
							{result.sweep ? "bonus" : "correction"} = {emitted} tokens
						</span>
					</span>
				)}
			</div>

			<div
				style={{
					display: "flex",
					gap: "1.2rem",
					flexWrap: "wrap",
					alignItems: "flex-start",
				}}
			>
				<svg
					viewBox="0 0 395 235"
					style={{ flex: "1 1 300px", minWidth: 280, height: "auto" }}
					role="img"
					aria-label="Draft tree with per-node confidences"
				>
					{NODES.map((n) => {
						const p = n.parent >= 0 ? NODES[n.parent] : ROOT;
						const onSelPath = n.id === sel || selAnc.has(n.id);
						return (
							<line
								key={`e${n.id}`}
								x1={p.x + 24}
								y1={p.y}
								x2={n.x - 26}
								y2={n.y}
								stroke={
									onSelPath ? "var(--viz-policy)" : "var(--sl-color-gray-5)"
								}
								strokeWidth={onSelPath ? 2.2 : 1.2 + 2.5 * pathProduct(n.id)}
								opacity={onSelPath ? 1 : 0.75}
							/>
						);
					})}
					<g>
						<rect
							x={ROOT.x - 26}
							y={ROOT.y - 14}
							width={52}
							height={28}
							rx={6}
							fill="var(--sl-color-gray-6)"
							stroke="var(--sl-color-gray-4)"
						/>
						<text
							x={ROOT.x}
							y={ROOT.y + 4}
							textAnchor="middle"
							fontSize={11}
							fill="var(--sl-color-gray-2)"
							fontWeight={600}
						>
							{ROOT.token}
						</text>
					</g>
					{NODES.map((n) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: SVG hover target
						<g
							key={n.id}
							onMouseEnter={() => setSel(n.id)}
							style={{ cursor: "pointer" }}
						>
							<rect
								x={n.x - 26}
								y={n.y - 16}
								width={52}
								height={32}
								rx={6}
								fill={nodeFill(n.id)}
								stroke={nodeStroke(n.id)}
								strokeWidth={n.id === sel ? 2 : 1.3}
							/>
							<text
								x={n.x}
								y={n.y - 2}
								textAnchor="middle"
								fontSize={11}
								fontWeight={650}
								fill="var(--sl-color-text)"
								fontFamily="var(--sl-font-system-mono, monospace)"
							>
								{n.token}
							</text>
							<text
								x={n.x}
								y={n.y + 11}
								textAnchor="middle"
								fontSize={8.5}
								fill="var(--sl-color-gray-3)"
							>
								q={n.conf.toFixed(2)}
							</text>
						</g>
					))}
				</svg>

				<svg
					viewBox={`0 0 ${GRID0 + SEQ.length * CELL + 6} ${GRID0 + SEQ.length * CELL + 6}`}
					style={{
						flex: "1 1 260px",
						minWidth: 250,
						height: "auto",
						maxWidth: 330,
					}}
					role="img"
					aria-label="Tree attention mask"
				>
					{SEQ.map((tok, j) => (
						<text
							key={`c${tok}-${j}`}
							x={GRID0 + j * CELL + CELL / 2}
							y={GRID0 - 8}
							textAnchor="start"
							fontSize={9}
							fill={
								j > 0 && (j - 1 === sel || selAnc.has(j - 1))
									? "var(--viz-policy)"
									: "var(--sl-color-gray-3)"
							}
							fontFamily="var(--sl-font-system-mono, monospace)"
							transform={`rotate(-52 ${GRID0 + j * CELL + CELL / 2} ${GRID0 - 8})`}
						>
							{tok}
						</text>
					))}
					{SEQ.map((tok, i) => {
						const isSelRow = i > 0 && i - 1 === sel;
						return (
							<g key={`r${tok}-${i}`}>
								<text
									x={GRID0 - 6}
									y={GRID0 + i * CELL + CELL / 2 + 3.5}
									textAnchor="end"
									fontSize={9.5}
									fontWeight={isSelRow ? 700 : 400}
									fill={
										isSelRow ? "var(--viz-policy)" : "var(--sl-color-gray-3)"
									}
									fontFamily="var(--sl-font-system-mono, monospace)"
								>
									{tok}
								</text>
								{SEQ.map((_, j) => {
									// row i attends col j? i=0 is the context token (sees itself).
									let allowed = false;
									if (j === 0) allowed = true;
									else if (i > 0) {
										const ri = i - 1;
										const ci = j - 1;
										allowed = ci === ri || ancestors(ri).includes(ci);
									}
									const hot = isSelRow && allowed;
									return (
										// biome-ignore lint/a11y/noStaticElementInteractions: SVG hover target
										<rect
											key={`x${i}-${j}`}
											x={GRID0 + j * CELL + 1.5}
											y={GRID0 + i * CELL + 1.5}
											width={CELL - 3}
											height={CELL - 3}
											rx={3}
											fill={
												allowed
													? j === 0
														? "var(--sl-color-gray-4)"
														: "var(--viz-policy)"
													: "var(--sl-color-gray-6)"
											}
											opacity={allowed ? (hot ? 1 : 0.55) : 0.5}
											stroke={hot ? "var(--viz-policy)" : "none"}
											strokeWidth={1.5}
											onMouseEnter={() => i > 0 && setSel(i - 1)}
										/>
									);
								})}
							</g>
						);
					})}
				</svg>
			</div>

			<div
				style={{
					fontSize: "0.78rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.45rem",
					lineHeight: 1.55,
				}}
			>
				Hover a node (or a mask row): row = what that position may attend to —
				context, its root-path ancestors, itself. Blank cells between siblings
				are the entire trick: "sat" and "is" coexist in one sequence but never
				see each other, so each row computes an honest p(· | context, its own
				branch). E[tokens/pass] = Σ path-products + 1.
			</div>
		</div>
	);
}
