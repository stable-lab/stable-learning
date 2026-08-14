import { useCallback, useEffect, useRef, useState } from "react";
import SimShell from "./lib/SimShell";
import { gaussian, makeRng } from "./lib/diffusionMath";
import { useSimLoop } from "./lib/useSimLoop";

// Ink in water and dye in corn syrup, as one simulation with one knob.
//
// Both fluids get the SAME advection: Taylor–Couette flow between two
// cylinders, whose angular velocity profile is a closed form
//
//   ω(r) = Ω · (r_in² / (r_out² - r_in²)) · (r_out²/r² - 1)
//
// so the shear is exact rather than eyeballed, and cranking backwards undoes
// it exactly. The only difference between the two media is the molecular
// jitter added each tick, scaled √dt like real Brownian motion.
//
// That single knob is the whole argument of the page. At jitter = 0 the
// dye smears into spirals, looks thoroughly mixed, and then reassembles
// perfectly when you crank back — nothing was destroyed, only rearranged.
// Turn the jitter up and the advection still reverses but the jitter does
// not, so the blobs never come back. "Looks mixed" and "is mixed" are
// different claims, and only one of them is reversible.

const R_IN = 0.26;
const R_OUT = 0.97;
const N_PER_BLOB = 340;
const BLOBS = [
	{ color: "#3b82f6", angle: -Math.PI / 2 },
	{ color: "#f59e0b", angle: -Math.PI / 2 + (2 * Math.PI) / 3 },
	{ color: "#22c55e", angle: -Math.PI / 2 + (4 * Math.PI) / 3 },
];
const TURN_STEP = 0.014;
const MAX_TURNS = 4;
const SPEEDS = [
	{ label: "1×", value: 60 },
	{ label: "3×", value: 180 },
	{ label: "8×", value: 480 },
];

interface Particles {
	x: Float32Array;
	y: Float32Array;
	x0: Float32Array;
	y0: Float32Array;
	blob: Uint8Array;
}

function seedParticles(): Particles {
	const n = BLOBS.length * N_PER_BLOB;
	const p: Particles = {
		x: new Float32Array(n),
		y: new Float32Array(n),
		x0: new Float32Array(n),
		y0: new Float32Array(n),
		blob: new Uint8Array(n),
	};
	const rng = makeRng(20260728);
	let i = 0;
	BLOBS.forEach((b, bi) => {
		// A compact radial blob partway out from the inner cylinder.
		const cr = (R_IN + R_OUT) / 2;
		for (let k = 0; k < N_PER_BLOB; k++) {
			const rr = cr + gaussian(rng) * 0.075;
			const aa = b.angle + gaussian(rng) * 0.11;
			const r = Math.min(R_OUT - 0.01, Math.max(R_IN + 0.01, rr));
			p.x[i] = r * Math.cos(aa);
			p.y[i] = r * Math.sin(aa);
			p.x0[i] = p.x[i];
			p.y0[i] = p.y[i];
			p.blob[i] = bi;
			i++;
		}
	});
	return p;
}

/** Exact Couette angular velocity, normalized to 1 at the inner wall. */
function omega(r: number): number {
	const rr = Math.min(R_OUT, Math.max(R_IN, r));
	const k = (R_IN * R_IN) / (R_OUT * R_OUT - R_IN * R_IN);
	return k * ((R_OUT * R_OUT) / (rr * rr) - 1);
}

export default function MixingReversibility() {
	const [jitter, setJitter] = useState(0);
	const [speed, setSpeed] = useState(SPEEDS[0].value);
	const [turns, setTurns] = useState(0);
	const [phase, setPhase] = useState<"forward" | "back">("forward");
	const [seed, setSeed] = useState(1);

	const partsRef = useRef<Particles>(seedParticles());
	const rngRef = useRef<() => number>(makeRng(99));
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [, forceRender] = useState(0);

	const crank = useCallback(
		(dTurns: number) => {
			const p = partsRef.current;
			const rng = rngRef.current;
			// Brownian displacement grows as √time, so the jitter per tick scales
			// with the square root of the step — not linearly with it.
			const sigma = jitter * Math.sqrt(Math.abs(dTurns)) * 0.055;
			for (let i = 0; i < p.x.length; i++) {
				let x = p.x[i];
				let y = p.y[i];
				const r = Math.hypot(x, y);
				const a = omega(r) * dTurns * 2 * Math.PI;
				const c = Math.cos(a);
				const s = Math.sin(a);
				const nx = x * c - y * s;
				const ny = x * s + y * c;
				x = nx;
				y = ny;
				if (sigma > 0) {
					x += sigma * gaussian(rng);
					y += sigma * gaussian(rng);
					// Keep the dye inside the vessel.
					const rr = Math.hypot(x, y);
					if (rr > R_OUT || rr < R_IN) {
						const clamped = Math.min(R_OUT - 0.004, Math.max(R_IN + 0.004, rr));
						x = (x / rr) * clamped;
						y = (y / rr) * clamped;
					}
				}
				p.x[i] = x;
				p.y[i] = y;
			}
		},
		[jitter],
	);

	const onTick = useCallback(
		(ticks: number) => {
			for (let i = 0; i < ticks; i++) {
				if (phase === "forward") {
					if (turns + TURN_STEP >= MAX_TURNS) {
						crank(MAX_TURNS - turns);
						setTurns(MAX_TURNS);
						setPhase("back");
						break;
					}
					crank(TURN_STEP);
					setTurns((t) => t + TURN_STEP);
				} else {
					if (turns - TURN_STEP <= 0) {
						crank(-turns);
						setTurns(0);
						setPhase("forward");
						break;
					}
					crank(-TURN_STEP);
					setTurns((t) => t - TURN_STEP);
				}
			}
			forceRender((v) => v + 1);
		},
		[crank, phase, turns],
	);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, speed);

	const reset = useCallback(() => {
		setPlaying(false);
		partsRef.current = seedParticles();
		rngRef.current = makeRng(seed * 7717 + 3);
		setSeed((s) => s + 1);
		setTurns(0);
		setPhase("forward");
		forceRender((v) => v + 1);
	}, [seed, setPlaying]);

	/* --------------------------- drawing --------------------------- */

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const css = 250;
		const px = Math.round(css * dpr);
		if (canvas.width !== px) {
			canvas.width = px;
			canvas.height = px;
		}
		ctx.clearRect(0, 0, px, px);
		const mid = px / 2;
		const scale = mid * 0.97;
		const toPx = (v: number) => mid + v * scale;

		// Vessel walls.
		ctx.strokeStyle = "rgba(140,130,110,0.55)";
		ctx.lineWidth = 1 * dpr;
		ctx.beginPath();
		ctx.arc(mid, mid, R_OUT * scale, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(mid, mid, R_IN * scale, 0, 2 * Math.PI);
		ctx.stroke();

		const p = partsRef.current;
		const size = Math.max(1.4 * dpr, 1);
		for (let i = 0; i < p.x.length; i++) {
			ctx.fillStyle = BLOBS[p.blob[i]].color;
			ctx.fillRect(toPx(p.x[i]) - size / 2, toPx(p.y[i]) - size / 2, size, size);
		}
	});

	/** Mean distance from each particle's starting point, in vessel radii. */
	const displacement = (() => {
		const p = partsRef.current;
		let sum = 0;
		for (let i = 0; i < p.x.length; i++) {
			sum += Math.hypot(p.x[i] - p.x0[i], p.y[i] - p.y0[i]);
		}
		return sum / p.x.length;
	})();

	const backHome = turns < 0.02;
	const medium =
		jitter === 0 ? "corn syrup" : jitter < 0.45 ? "glycerine" : "water";

	return (
		<SimShell
			title="Mixed, or only rearranged?"
			playing={playing}
			onToggle={toggle}
			onReset={reset}
			onStep={() => onTick(12)}
			speed={speed}
			speeds={SPEEDS}
			onSpeed={setSpeed}
			readouts={[
				{ label: "medium", value: medium },
				{ label: "turns", value: turns.toFixed(2) },
				{
					label: "phase",
					value: phase === "forward" ? "cranking in →" : "← cranking back",
				},
				{
					label: "displacement",
					value: displacement.toFixed(3),
					color:
						backHome && displacement > 0.05
							? "var(--viz-danger)"
							: "var(--viz-reward)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<canvas
						ref={canvasRef}
						style={{ width: "250px", height: "250px", display: "block" }}
						role="img"
						aria-label="dye blobs in a rotating annular vessel"
					/>
				</div>
				<div className="viz-panel" style={{ maxWidth: "20rem" }}>
					<div className="viz-panel-title">what to watch</div>
					<p style={{ fontSize: "0.82rem", lineHeight: 1.5, margin: "0 0 0.5rem" }}>
						{jitter === 0 ? (
							<>
								Every particle is following a <strong>reversible</strong> path.
								The dye looks thoroughly mixed at 4 turns, but no information
								has been destroyed — crank back and it returns to three clean
								blobs, displacement ≈ 0.
							</>
						) : (
							<>
								The shear is identical, but each particle now also takes a
								random walk that <strong>does not reverse</strong>. Crank back
								and the spirals unwind while the jitter stays. The blobs never
								return, and the displacement readout never comes home.
							</>
						)}
					</p>
					{backHome && turns === 0 && displacement > 0.001 && (
						<p
							style={{
								fontSize: "0.82rem",
								lineHeight: 1.5,
								margin: 0,
								color:
									displacement > 0.05
										? "var(--viz-danger)"
										: "var(--viz-reward)",
							}}
						>
							{displacement > 0.05
								? `Back at zero turns, and the dye is ${displacement.toFixed(2)} radii from where it started. That gap is genuinely destroyed information.`
								: "Back at zero turns, and the dye is home. Nothing was destroyed."}
						</p>
					)}
				</div>
			</div>

			<label className="viz-slider" style={{ marginTop: "0.7rem" }}>
				<span>
					molecular jitter ={" "}
					<span className="viz-slider-value">{jitter.toFixed(2)}</span>
					{jitter === 0
						? " — pure laminar flow, no diffusion"
						: " — real diffusion on top of the same shear"}
				</span>
				<input
					type="range"
					min={0}
					max={1}
					step={0.05}
					value={jitter}
					onChange={(e) => {
						setPlaying(false);
						setJitter(Number(e.target.value));
					}}
				/>
			</label>
		</SimShell>
	);
}
