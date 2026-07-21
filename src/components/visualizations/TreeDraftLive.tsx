import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// EAGLE-2's dynamic draft trees. A draft model proposes a TREE of candidate
// continuations under a node budget N (verification cost scales with total
// nodes). The draft's confidence approximates each token's acceptance
// probability, so the value of a node is the PRODUCT of confidences along
// its root path — all ancestors must be accepted for it to matter. We race
// two ways to spend the same budget on the same confidence landscape:
//   STATIC  (EAGLE-1 style): a fixed tree shape, children picked by local
//           confidence, breadth-first.
//   DYNAMIC (EAGLE-2): grow best-first by path product. Because a child's
//           path product is strictly below its parent's, best-first
//           expansion yields exactly the global top-N nodes by path
//           product — EAGLE-2's "reranking" step is implicit here.
// Metric: E[accepted tokens] = Σ path products over tree nodes (root
// excluded). Math verified 1:1 against scratchpad/treedraft-test.mjs.

const FANOUT = 4;
// Not all probability mass is acceptable: scale confidences so they sum < 1.
const SURVIVAL = 0.92;
const MAXCOL = 6; // deeper nodes still count, but clamp to this column
const W = 360;
const H = 220;
const PAD = 16;
const NODE_W = 30;

const SPEEDS = [
	{ label: "1×", value: 2 },
	{ label: "4×", value: 8 },
	{ label: "15×", value: 30 },
];

// --- seeded landscape (identical to treedraft-test.mjs) ---

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randn(rng: () => number): number {
	let u1 = rng();
	while (u1 <= 1e-12) u1 = rng();
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

// Lazily-sampled virtual infinite tree: child confidences per node are
// memoized in a shared Map so BOTH policies read the identical landscape.
function childConfs(
	map: Map<string, number[]>,
	rng: () => number,
	key: string,
	s: number,
): number[] {
	let c = map.get(key);
	if (c) return c;
	const logits: number[] = [];
	for (let i = 0; i < FANOUT; i++) logits.push(s * randn(rng));
	const m = Math.max(...logits);
	const e = logits.map((x) => Math.exp(x - m));
	const Z = e.reduce((a, b) => a + b, 0);
	c = e.map((x) => (SURVIVAL * x) / Z);
	map.set(key, c);
	return c;
}

interface DraftNode {
	key: string;
	depth: number;
	parentIdx: number; // index in the same array; -1 = root
	conf: number; // local confidence
	pp: number; // path product = Π conf along root path
	x: number;
	y: number;
}

// --- the two policies (identical to treedraft-test.mjs) ---

// Fixed shape: root spawns 4, depth-1 nodes spawn 2, deeper nodes chain 1.
function staticBranch(parentDepth: number): number {
	return parentDepth === 0 ? 4 : parentDepth === 1 ? 2 : 1;
}

function buildStatic(
	map: Map<string, number[]>,
	rng: () => number,
	s: number,
	N: number,
): DraftNode[] {
	const nodes: DraftNode[] = [];
	let level = [{ key: "r", depth: 0, idx: -1, pp: 1 }];
	while (nodes.length < N) {
		const next: typeof level = [];
		for (const p of level) {
			const confs = childConfs(map, rng, p.key, s);
			const order = [0, 1, 2, 3].sort((a, b) => confs[b] - confs[a]);
			const k = staticBranch(p.depth);
			for (let j = 0; j < k && nodes.length < N; j++) {
				const ci = order[j];
				nodes.push({
					key: `${p.key}.${ci}`,
					depth: p.depth + 1,
					parentIdx: p.idx,
					conf: confs[ci],
					pp: p.pp * confs[ci],
					x: 0,
					y: 0,
				});
				next.push({
					key: `${p.key}.${ci}`,
					depth: p.depth + 1,
					idx: nodes.length - 1,
					pp: p.pp * confs[ci],
				});
			}
			if (nodes.length >= N) break;
		}
		level = next;
	}
	return nodes;
}

function buildDynamic(
	map: Map<string, number[]>,
	rng: () => number,
	s: number,
	N: number,
): DraftNode[] {
	const nodes: DraftNode[] = [];
	const frontier: DraftNode[] = [];
	const pushChildren = (
		key: string,
		depth: number,
		parentIdx: number,
		pp: number,
	) => {
		const confs = childConfs(map, rng, key, s);
		for (let i = 0; i < FANOUT; i++) {
			frontier.push({
				key: `${key}.${i}`,
				depth: depth + 1,
				parentIdx,
				conf: confs[i],
				pp: pp * confs[i],
				x: 0,
				y: 0,
			});
		}
	};
	pushChildren("r", 0, -1, 1);
	while (nodes.length < N) {
		let best = 0;
		for (let i = 1; i < frontier.length; i++) {
			if (frontier[i].pp > frontier[best].pp) best = i;
		}
		const node = frontier.splice(best, 1)[0];
		nodes.push(node);
		pushChildren(node.key, node.depth, nodes.length - 1, node.pp);
	}
	return nodes;
}

// --- layout: computed once for the FULL tree so reveal is stable ---

const colX = (depth: number) => 8 + Math.min(depth, MAXCOL) * 53;

function layoutTree(nodes: DraftNode[]): { rootY: number; nodeH: number } {
	const kids: number[][] = nodes.map(() => []);
	const rootKids: number[] = [];
	nodes.forEach((n, i) => {
		if (n.parentIdx === -1) rootKids.push(i);
		else kids[n.parentIdx].push(i);
	});
	const byConf = (a: number, b: number) => nodes[b].conf - nodes[a].conf;
	rootKids.sort(byConf);
	for (const k of kids) k.sort(byConf);

	// Leaves get sequential rows; internal nodes sit at their children's mean.
	let leaves = 0;
	const slot: number[] = new Array(nodes.length).fill(0);
	const assign = (i: number): number => {
		if (kids[i].length === 0) {
			slot[i] = leaves++;
			return slot[i];
		}
		let sum = 0;
		for (const c of kids[i]) sum += assign(c);
		slot[i] = sum / kids[i].length;
		return slot[i];
	};
	let rootSum = 0;
	for (const c of rootKids) rootSum += assign(c);
	const rootSlot = rootKids.length ? rootSum / rootKids.length : 0;

	const rowH = leaves > 1 ? (H - 2 * PAD) / (leaves - 1) : 0;
	const toY = (sl: number) => (leaves > 1 ? PAD + sl * rowH : H / 2);
	nodes.forEach((n, i) => {
		n.x = colX(n.depth);
		let y = toY(slot[i]);
		// Nodes past the last column keep counting but clamp x; fan them down
		// a little so a deep chain doesn't stack on one spot.
		if (n.depth > MAXCOL) y = Math.min(H - 10, y + (n.depth - MAXCOL) * 13);
		n.y = y;
	});
	const nodeH = leaves > 1 ? Math.max(7, Math.min(12, rowH - 1.5)) : 12;
	return { rootY: toY(rootSlot), nodeH };
}

interface Sim {
	statNodes: DraftNode[];
	dynNodes: DraftNode[];
	statRootY: number;
	dynRootY: number;
	statNodeH: number;
	dynNodeH: number;
	revealed: number;
}

function buildSim(seed: number, N: number, s: number): Sim {
	const rng = mulberry32(seed);
	const map = new Map<string, number[]>();
	// Same fill order as the test harness: static first, dynamic second,
	// both reading the shared memoized landscape.
	const statNodes = buildStatic(map, rng, s, N);
	const dynNodes = buildDynamic(map, rng, s, N);
	const stat = layoutTree(statNodes);
	const dyn = layoutTree(dynNodes);
	return {
		statNodes,
		dynNodes,
		statRootY: stat.rootY,
		dynRootY: dyn.rootY,
		statNodeH: stat.nodeH,
		dynNodeH: dyn.nodeH,
		revealed: 0,
	};
}

const fmtPct = (pp: number) => {
	const p = 100 * pp;
	return p >= 1 ? `${Math.round(p)}%` : "<1%";
};

function TreePanel({
	label,
	nodes,
	rootY,
	nodeH,
	revealed,
	tone,
}: {
	label: string;
	nodes: DraftNode[];
	rootY: number;
	nodeH: number;
	revealed: number;
	tone: string;
}) {
	return (
		<div style={{ flex: "1 1 300px", minWidth: 270 }}>
			<div
				style={{
					fontSize: "0.72rem",
					fontWeight: 600,
					color: tone,
					marginBottom: 2,
				}}
			>
				{label}
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label={label}
			>
				<rect
					x={8}
					y={rootY - nodeH / 2}
					width={NODE_W}
					height={nodeH}
					rx={3}
					fill="var(--sl-color-gray-5)"
				/>
				<text
					x={8 + NODE_W / 2}
					y={rootY}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={8}
					fill="var(--sl-color-gray-2)"
				>
					root
				</text>
				{nodes.slice(0, revealed).map((n) => {
					const px = n.parentIdx >= 0 ? nodes[n.parentIdx].x : 8;
					const py = n.parentIdx >= 0 ? nodes[n.parentIdx].y : rootY;
					return (
						<g key={n.key} className="viz-fade-in">
							<line
								x1={px + NODE_W}
								y1={py}
								x2={n.x}
								y2={n.y}
								stroke={tone}
								strokeWidth={0.6 + 2.6 * n.pp}
								strokeOpacity={0.3 + 0.5 * n.pp}
							/>
							<rect
								x={n.x}
								y={n.y - nodeH / 2}
								width={NODE_W}
								height={nodeH}
								rx={3}
								fill={tone}
								fillOpacity={0.14 + 0.72 * n.pp}
								stroke={tone}
								strokeOpacity={0.55}
							/>
							<text
								x={n.x + NODE_W / 2}
								y={n.y}
								textAnchor="middle"
								dominantBaseline="central"
								fontSize={8}
								fill="var(--sl-color-gray-1)"
							>
								{fmtPct(n.pp)}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

export default function TreeDraftLive() {
	const [N, setN] = useState(16);
	const [s, setS] = useState(1.6);
	const [speed, setSpeed] = useState(2);
	const seed = useRef(12345);
	const sim = useRef<Sim | null>(null);
	if (sim.current === null) sim.current = buildSim(seed.current, N, s);
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const pauseRef = useRef<(p: boolean) => void>(() => {});

	const onTick = useCallback((n: number) => {
		const S = sim.current;
		if (!S) return;
		S.revealed = Math.min(S.statNodes.length, S.revealed + n);
		if (S.revealed >= S.statNodes.length) pauseRef.current(false);
		commit();
	}, []);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	pauseRef.current = setPlaying;

	// New random landscape + restart both trees (also used by the knobs).
	const rebuild = useCallback(
		(n: number, sh: number) => {
			seed.current += 1;
			sim.current = buildSim(seed.current, n, sh);
			setPlaying(false);
			commit();
		},
		[setPlaying],
	);

	const S = sim.current;
	const total = S.statNodes.length;
	const eStat = S.statNodes.slice(0, S.revealed).reduce((a, n) => a + n.pp, 0);
	const eDyn = S.dynNodes.slice(0, S.revealed).reduce((a, n) => a + n.pp, 0);
	const gain = eStat > 0 ? (eDyn - eStat) / eStat : 0;

	const onToggle = () => {
		// Budget spent: Run replays the same landscape from the start.
		if (!playing && S.revealed >= total) {
			S.revealed = 0;
			commit();
		}
		toggle();
	};

	return (
		<SimShell
			title="Draft-tree budget, spent two ways"
			playing={playing}
			onToggle={onToggle}
			onStep={() => onTick(1)}
			onReset={() => rebuild(N, s)}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "nodes used", value: `${S.revealed}/${total}` },
				{
					label: "E[accepted] static",
					value: eStat.toFixed(2),
					color: "var(--viz-ref)",
				},
				{
					label: "E[accepted] EAGLE-2",
					value: eDyn.toFixed(2),
					color: "var(--viz-policy)",
				},
				{
					label: "gain",
					value:
						S.revealed > 0
							? `${gain > 0 ? "+" : ""}${(100 * gain).toFixed(0)}%`
							: "—",
					color: gain > 0.0005 ? "var(--viz-reward)" : undefined,
				},
			]}
		>
			<div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
				<TreePanel
					label="EAGLE-1-style static shape"
					nodes={S.statNodes}
					rootY={S.statRootY}
					nodeH={S.statNodeH}
					revealed={S.revealed}
					tone="var(--viz-ref)"
				/>
				<TreePanel
					label="EAGLE-2 dynamic expansion"
					nodes={S.dynNodes}
					rootY={S.dynRootY}
					nodeH={S.dynNodeH}
					revealed={S.revealed}
					tone="var(--viz-policy)"
				/>
			</div>
			<div
				style={{
					fontSize: "0.75rem",
					color: "var(--sl-color-gray-3)",
					marginTop: "0.3rem",
				}}
			>
				Each node shows its path product = P(every draft token on its root path
				is accepted); E[accepted] = sum over the tree. Each step spends one node
				of the budget in both trees.
			</div>
			<div
				style={{
					display: "flex",
					gap: "0.9rem",
					flexWrap: "wrap",
					marginTop: "0.6rem",
				}}
			>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						node budget N = <span className="viz-slider-value">{N}</span>
					</span>
					<input
						type="range"
						min={8}
						max={32}
						step={1}
						value={N}
						onChange={(e) => {
							const v = parseInt(e.target.value, 10);
							setN(v);
							rebuild(v, s);
						}}
					/>
				</label>
				<label className="viz-slider" style={{ flex: "1 1 150px" }}>
					<span>
						context sharpness s ={" "}
						<span className="viz-slider-value">{s.toFixed(1)}</span>
					</span>
					<input
						type="range"
						min={0.5}
						max={3}
						step={0.1}
						value={s}
						onChange={(e) => {
							const v = parseFloat(e.target.value);
							setS(v);
							rebuild(N, v);
						}}
					/>
				</label>
			</div>
		</SimShell>
	);
}
