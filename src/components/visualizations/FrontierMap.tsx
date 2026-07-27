import { useCallback, useReducer, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { useSimLoop } from "./lib/useSimLoop";

// Matt Might's "Illustrated Guide to a Ph.D.", made alive. The gray blob is
// the boundary of what is known in your field. Other groups' papers keep
// landing on the edge and permanently pushing it outward — the frontier moves
// whether you move or not. You (blue dot) start in the interior. One knob
// decides where your months go: grinding tricks on familiar ground (1.0) or
// reading + working at the edge (0.0). Papers you write in the interior land
// inside the disk and are absorbed — busy, contribution zero. Papers written
// AT the edge dent the boundary outward: the only work that changes the map.

const K = 120; // boundary sectors
const TICK = 0.05; // months per sim tick
const MAX_SPEED = 0.09; // units/month you can move outward at full edge-work
const OTHERS_RATE = 4; // other groups' papers per month
const OTHERS_BUMP = 0.03; // how far one outside paper pushes the boundary
const YOUR_BUMP = 0.07; // your dent (rarer, so make it visible)
const SIGMA = 2.0; // bump falloff in sectors
const EDGE_EPS = 0.05; // "at the edge" tolerance, model units
const THETA_YOU = -Math.PI / 3; // your fixed heading (up-right)
const HIST_CAP = 240; // distance samples (0.25 mo each → 60-month window)

interface Pulse {
	id: number;
	th: number;
	r: number;
	age: number; // months
	kind: "others" | "inside" | "dent";
}

interface Speck {
	id: number;
	th: number;
	r: number;
	age: number; // months — fades blue → gray as it is absorbed
}

let nextParticleId = 0;

interface Sim {
	t: number;
	R: number[]; // boundary radius per sector
	yours: number[]; // portion of the boundary you pushed
	rYou: number;
	paperAcc: number;
	inside: number; // papers that landed inside the known
	dents: number; // papers that pushed the boundary
	specks: Speck[];
	pulses: Pulse[];
	distHist: number[]; // distance to frontier, in months of work
	nextSample: number;
}

const thOf = (k: number) => (2 * Math.PI * k) / K;
const youK = ((Math.round((THETA_YOU / (2 * Math.PI)) * K) % K) + K) % K;

function bumpAt(arr: number[], k: number, amp: number) {
	for (let o = -6; o <= 6; o++) {
		arr[(k + o + K) % K] += amp * Math.exp(-(o * o) / (2 * SIGMA * SIGMA));
	}
}

function freshSim(): Sim {
	const p1 = Math.random() * Math.PI * 2;
	const p2 = Math.random() * Math.PI * 2;
	const p3 = Math.random() * Math.PI * 2;
	const R: number[] = [];
	for (let k = 0; k < K; k++) {
		const th = thOf(k);
		R.push(
			1 +
				0.05 * Math.sin(3 * th + p1) +
				0.035 * Math.sin(5 * th + p2) +
				0.02 * Math.sin(9 * th + p3),
		);
	}
	return {
		t: 0,
		R,
		yours: new Array(K).fill(0),
		rYou: 0.34,
		paperAcc: 0,
		inside: 0,
		dents: 0,
		specks: [],
		pulses: [],
		distHist: [],
		nextSample: 0,
	};
}

const SPEEDS = [
	{ label: "1×", value: 20 },
	{ label: "4×", value: 80 },
	{ label: "16×", value: 320 },
];

export default function FrontierMap() {
	const sim = useRef<Sim>(freshSim());
	const [, commit] = useReducer((x: number) => x + 1, 0);
	const [speed, setSpeed] = useState(20);
	// 1.0 = grinding tricks on familiar ground, 0.0 = reading + working at the edge.
	const [grind, setGrind] = useState(1.0);
	const knobs = useRef(grind);
	knobs.current = grind;

	const stepTick = useCallback(() => {
		const S = sim.current;
		const g = knobs.current;
		S.t += TICK;

		// Other groups publish at the boundary — the frontier moves without you.
		if (Math.random() < OTHERS_RATE * TICK) {
			const k = Math.floor(Math.random() * K);
			S.pulses.push({
				id: nextParticleId++,
				th: thOf(k),
				r: S.R[k],
				age: 0,
				kind: "others",
			});
			bumpAt(S.R, k, OTHERS_BUMP);
		}

		// You drift outward at a rate set by where your months go.
		S.rYou = Math.min(S.rYou + MAX_SPEED * (1 - g) * TICK, S.R[youK]);

		// You emit papers steadily — grinding is FASTER at producing them.
		S.paperAcc += (0.25 + 0.6 * g) * TICK;
		if (S.paperAcc >= 1) {
			S.paperAcc -= 1;
			if (S.R[youK] - S.rYou <= EDGE_EPS && Math.random() < 1 - g) {
				// At the boundary: your paper dents it outward. This is the map changing.
				bumpAt(S.R, youK, YOUR_BUMP);
				bumpAt(S.yours, youK, YOUR_BUMP);
				S.rYou = S.R[youK]; // ride your own dent
				S.dents++;
				S.pulses.push({
					id: nextParticleId++,
					th: THETA_YOU,
					r: S.rYou,
					age: 0,
					kind: "dent",
				});
			} else {
				// In the interior: the paper lands inside the known and is absorbed.
				S.inside++;
				const th = THETA_YOU + (Math.random() - 0.5) * 0.22;
				const r = Math.max(
					0.08,
					Math.min(S.rYou + (Math.random() - 0.5) * 0.14, S.R[youK] - 0.07),
				);
				S.specks.push({ id: nextParticleId++, th, r, age: 0 });
				if (S.specks.length > 70) S.specks.splice(0, S.specks.length - 70);
				S.pulses.push({ id: nextParticleId++, th, r, age: 0, kind: "inside" });
			}
		}

		for (const p of S.pulses) p.age += TICK;
		S.pulses = S.pulses.filter((p) => p.age < 0.9);
		for (const s of S.specks) s.age += TICK;

		while (S.t >= S.nextSample) {
			S.distHist.push(Math.max(0, S.R[youK] - S.rYou) / MAX_SPEED);
			S.nextSample += 0.25;
			if (S.distHist.length > HIST_CAP) S.distHist.shift();
		}
	}, []);

	const onTick = useCallback(
		(n: number) => {
			for (let i = 0; i < n; i++) stepTick();
			commit();
		},
		[stepTick],
	);

	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);
	const S = sim.current;

	const reset = () => {
		sim.current = freshSim();
		setPlaying(false);
		commit();
	};

	// ---- derived readouts ----------------------------------------------------
	const distUnits = Math.max(0, S.R[youK] - S.rYou);
	const distMonths = distUnits / MAX_SPEED;
	const pinned = distUnits <= EDGE_EPS + 0.005;
	const h = S.distHist;
	const delta = h.length >= 13 ? distMonths - h[h.length - 13] : 0; // vs ~3 mo ago
	const distColor = pinned
		? "var(--viz-policy)"
		: delta > 0.01
			? "var(--viz-danger)"
			: delta < -0.01
				? "var(--viz-reward)"
				: undefined;
	const distValue = pinned
		? "at the edge"
		: `${distMonths.toFixed(1)} mo${delta > 0.01 ? " ↑" : delta < -0.01 ? " ↓" : ""}`;

	// ---- geometry ------------------------------------------------------------
	const W = 560;
	const H = 214;
	const cx = 135;
	const cy = 102;
	let maxR = 0;
	for (const r of S.R) if (r > maxR) maxR = r;
	const s = 88 / Math.max(1.4, maxR + 0.1); // auto-zoom as knowledge grows
	const px = (r: number, th: number) => cx + r * s * Math.cos(th);
	const py = (r: number, th: number) => cy + r * s * Math.sin(th);

	let blob = "";
	for (let k = 0; k < K; k++) {
		const th = thOf(k);
		blob += `${k ? "L" : "M"}${px(S.R[k], th).toFixed(1)},${py(S.R[k], th).toFixed(1)}`;
	}
	blob += "Z";

	// Boundary arcs you pushed, as runs of consecutive sectors.
	const yourArcs: string[] = [];
	let run = "";
	for (let k = 0; k <= K; k++) {
		const kk = k % K;
		if (k < K && S.yours[kk] > 0.012) {
			const th = thOf(kk);
			run += `${run ? "L" : "M"}${px(S.R[kk], th).toFixed(1)},${py(S.R[kk], th).toFixed(1)}`;
		} else if (run) {
			yourArcs.push(run);
			run = "";
		}
	}

	// Distance-to-frontier strip chart (right panel).
	const gx0 = 300;
	const gx1 = 548;
	const gy0 = 24;
	const gy1 = 168;
	let yMax = 4;
	for (const v of h) if (v > yMax) yMax = v;
	yMax *= 1.15;
	const gy = (v: number) => gy1 - (v / yMax) * (gy1 - gy0);
	let distPath = "";
	if (h.length >= 2) {
		for (let i = 0; i < h.length; i++) {
			const x = gx0 + (i / (HIST_CAP - 1)) * (gx1 - gx0);
			distPath += `${i ? "L" : "M"}${x.toFixed(1)},${gy(h[i]).toFixed(1)}`;
		}
	}
	const lineColor = pinned
		? "var(--viz-policy)"
		: delta > 0.01
			? "var(--viz-danger)"
			: delta < -0.01
				? "var(--viz-reward)"
				: "var(--viz-ref)";

	const regime =
		grind >= 0.7
			? "grinding tricks on familiar ground"
			: grind <= 0.3
				? "reading + working at the edge"
				: "split between both";

	return (
		<SimShell
			title="The frontier map — live"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(20)}
			onReset={reset}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "months", value: `${Math.floor(S.t)}` },
				{
					label: "papers inside the known",
					value: `${S.inside}`,
					color: S.inside > 0 ? "var(--viz-value)" : undefined,
				},
				{
					label: "distance to frontier",
					value: distValue,
					color: distColor,
				},
				{
					label: "frontier pushed",
					value:
						S.dents === 0 ? "0" : `${S.dents} dent${S.dents > 1 ? "s" : ""}`,
					color: S.dents > 0 ? "var(--viz-reward)" : undefined,
				},
			]}
		>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: "100%", height: "auto", display: "block" }}
				role="img"
				aria-label="Map of known territory in a field; your position relative to its moving boundary"
			>
				{/* the known */}
				<path
					d={blob}
					fill="var(--sl-color-gray-6)"
					stroke="var(--sl-color-gray-4)"
					strokeWidth={1.5}
				/>
				{yourArcs.map((d) => (
					<path
						key={d}
						d={d}
						fill="none"
						stroke="var(--viz-policy)"
						strokeWidth={3}
						strokeLinecap="round"
					/>
				))}
				<text
					x={cx}
					y={cy + 24}
					textAnchor="middle"
					fontSize={10}
					fill="var(--sl-color-gray-3)"
				>
					everything already known
				</text>

				{/* your absorbed papers */}
				{S.specks.map((sp) => {
					const f = Math.min(1, sp.age / 2);
					return (
						<g key={sp.id}>
							<circle
								cx={px(sp.r, sp.th)}
								cy={py(sp.r, sp.th)}
								r={2}
								fill="var(--viz-policy)"
								opacity={(1 - f) * 0.9}
							/>
							<circle
								cx={px(sp.r, sp.th)}
								cy={py(sp.r, sp.th)}
								r={2}
								fill="var(--viz-ref)"
								opacity={f * 0.55}
							/>
						</g>
					);
				})}

				{/* landing pulses */}
				{S.pulses.map((p) => {
					const f = p.age / 0.9;
					const col =
						p.kind === "others" ? "var(--viz-ref)" : "var(--viz-policy)";
					return (
						<circle
							key={p.id}
							cx={px(p.r, p.th)}
							cy={py(p.r, p.th)}
							r={3 + f * (p.kind === "dent" ? 26 : 18)}
							fill="none"
							stroke={col}
							strokeWidth={p.kind === "dent" ? 2 : 1.3}
							opacity={(1 - f) * (p.kind === "inside" ? 0.45 : 0.65)}
						/>
					);
				})}

				{/* you */}
				<circle
					cx={px(S.rYou, THETA_YOU)}
					cy={py(S.rYou, THETA_YOU)}
					r={5}
					fill="var(--viz-policy)"
					stroke="var(--sl-color-gray-6)"
					strokeWidth={1.5}
				/>
				<text
					x={px(S.rYou, THETA_YOU) + 9}
					y={py(S.rYou, THETA_YOU) + 4}
					fontSize={10.5}
					fontWeight={700}
					fill="var(--viz-policy)"
				>
					you
				</text>

				{/* distance strip chart */}
				<text x={gx0} y={14} fontSize={10.5} fill="var(--sl-color-gray-3)">
					distance to the frontier (months of full-time work)
				</text>
				<rect
					x={gx0}
					y={gy0}
					width={gx1 - gx0}
					height={gy1 - gy0}
					fill="var(--sl-color-gray-6)"
					rx={4}
				/>
				<line
					x1={gx0}
					x2={gx1}
					y1={gy1}
					y2={gy1}
					stroke="var(--sl-color-gray-4)"
					strokeDasharray="5 4"
					strokeWidth={1.2}
				/>
				<text
					x={gx1 - 4}
					y={gy1 - 5}
					textAnchor="end"
					fontSize={9}
					fill="var(--sl-color-gray-3)"
				>
					at the frontier
				</text>
				{distPath && (
					<path d={distPath} fill="none" stroke={lineColor} strokeWidth={2} />
				)}
				{h.length >= 2 && (
					<text
						x={Math.min(
							gx1,
							gx0 + ((h.length - 1) / (HIST_CAP - 1)) * (gx1 - gx0) + 4,
						)}
						y={gy(h[h.length - 1]) + 4}
						fontSize={10.5}
						fontWeight={600}
						fill={lineColor}
					>
						{pinned ? "0" : distMonths.toFixed(1)}
					</text>
				)}

				{/* legend */}
				<g fontSize={9.5} fill="var(--sl-color-gray-3)">
					<circle cx={22} cy={202} r={3.5} fill="var(--viz-policy)" />
					<text x={30} y={205}>
						you
					</text>
					<line
						x1={62}
						x2={78}
						y1={202}
						y2={202}
						stroke="var(--viz-policy)"
						strokeWidth={3}
						strokeLinecap="round"
					/>
					<text x={84} y={205}>
						boundary you pushed
					</text>
					<circle
						cx={248}
						cy={202}
						r={4}
						fill="none"
						stroke="var(--viz-ref)"
						strokeWidth={1.3}
					/>
					<text x={257} y={205}>
						others&apos; results (push the edge)
					</text>
					<circle cx={432} cy={202} r={2} fill="var(--viz-ref)" opacity={0.6} />
					<text x={440} y={205}>
						your papers, absorbed
					</text>
				</g>
			</svg>

			<div style={{ marginTop: "0.7rem" }}>
				<label className="viz-slider">
					<span>
						where your months go:{" "}
						<span className="viz-slider-value">
							{grind.toFixed(2)} — {regime}
						</span>
					</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={grind}
						onChange={(e) => setGrind(parseFloat(e.target.value))}
					/>
					<span
						style={{
							display: "flex",
							justifyContent: "space-between",
							fontSize: "0.72rem",
							color: "var(--sl-color-gray-3)",
						}}
					>
						<span>0.0 — reading + working at the edge</span>
						<span>1.0 — grinding tricks on familiar ground</span>
					</span>
				</label>
			</div>
		</SimShell>
	);
}
