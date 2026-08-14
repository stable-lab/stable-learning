import { useCallback, useMemo, useRef, useState } from "react";
import PixelCanvas from "./lib/PixelCanvas";
import SimShell from "./lib/SimShell";
import { alphaBar, gaussian, makeRng } from "./lib/diffusionMath";
import { useSimLoop } from "./lib/useSimLoop";
import { SPRITES, SPRITE_N, SPRITE_SIZE } from "./lib/sprites";

// Three ways to parameterize the same prediction, and why the choice matters.
//
// x̂₀, ε̂ and the score are algebraically interchangeable — given any one of
// them plus x_t you can compute the other two. So the choice cannot change
// what the model *knows*. What it changes is how a prediction error of fixed
// size propagates into the thing we actually care about, the clean image:
//
//   predict x₀ : error in x̂₀ = δ                       (flat, 1.0 everywhere)
//   predict ε  : error in x̂₀ = δ·√(1-ᾱ)/√ᾱ            (→ 0 as t → 0)
//   predict s  : error in x̂₀ = δ·(1-ᾱ)/√ᾱ             (→ 0 faster, but the
//                                                       target itself blows up)
//
// The ε row is the free skip connection everyone talks about, made numeric:
// at low noise a mistake in the predicted noise is multiplied by something
// near zero before it reaches the image. And low noise is exactly where the
// final quality of a sample is decided.

const T = 1000;

function rms(a: Float32Array): number {
	let s = 0;
	for (const v of a) s += v * v;
	return Math.sqrt(s / a.length);
}

export default function ThreeTargets() {
	const [t, setT] = useState(620);
	const [spriteIdx, setSpriteIdx] = useState(3);
	const dir = useRef(-1);

	// Run sweeps the noise level rather than sitting dead: the whole point of
	// the chart is how the three curves separate as t moves, so the default
	// animation is a tour of that separation.
	const onTick = useCallback((ticks: number) => {
		setT((prev) => {
			let next = prev + dir.current * ticks;
			if (next >= T - 1) {
				next = T - 1;
				dir.current = -1;
			} else if (next <= 1) {
				next = 1;
				dir.current = 1;
			}
			return next;
		});
	}, []);
	const { playing, setPlaying, toggle } = useSimLoop(onTick, 110);

	const x0 = SPRITES[spriteIdx].data;
	const ab = alphaBar(t / T);

	const eps = useMemo(() => {
		const rng = makeRng(4242);
		const e = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) e[i] = gaussian(rng);
		return e;
	}, []);

	const { xt, score } = useMemo(() => {
		const sa = Math.sqrt(ab);
		const sn = Math.sqrt(1 - ab);
		const xt = new Float32Array(SPRITE_N);
		const score = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) {
			xt[i] = sa * x0[i] + sn * eps[i];
			// s = ∇ log q(x_t) = -ε / √(1-ᾱ)
			score[i] = -eps[i] / sn;
		}
		return { xt, score };
	}, [ab, x0, eps]);

	// Error amplification: a unit prediction error in each target, expressed as
	// the error it causes in the reconstructed clean image.
	const amp = {
		x0: 1,
		eps: Math.sqrt(1 - ab) / Math.sqrt(ab),
		score: (1 - ab) / Math.sqrt(ab),
	};

	const scoreRms = rms(score);

	return (
		<SimShell
			title="Three targets, one prediction"
			playing={playing}
			onToggle={toggle}
			onStep={() => onTick(25)}
			onReset={() => {
				setPlaying(false);
				dir.current = -1;
				setT(620);
				setSpriteIdx(3);
			}}
			readouts={[
				{ label: "t", value: `${t}` },
				{ label: "ᾱ", value: ab.toFixed(3), color: "var(--viz-policy)" },
				{ label: "RMS ε", value: "1.00", color: "var(--viz-reward)" },
				{
					label: "RMS score",
					value: scoreRms > 99 ? scoreRms.toExponential(1) : scoreRms.toFixed(2),
					color: scoreRms > 8 ? "var(--viz-danger)" : "var(--viz-kl)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<div className="viz-panel-title">what the network could be asked for</div>
					<div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
						<PixelCanvas
							data={xt}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={78}
							label="input xₜ"
						/>
						<PixelCanvas
							data={x0}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={78}
							label="x₀ — the image"
							accent="var(--viz-value)"
						/>
						<PixelCanvas
							data={eps}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={78}
							domain={[-3, 3]}
							label="ε — the noise"
							accent="var(--viz-reward)"
						/>
						<PixelCanvas
							data={score}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							// Score is displayed on its own stretched scale precisely
							// because its true range explodes as t → 0.
							domain={[-3 * scoreRms, 3 * scoreRms]}
							size={78}
							label="score ∇log q"
							accent="var(--viz-kl)"
						/>
					</div>
					<div className="viz-sprite-row">
						{SPRITES.map((s, i) => (
							<button
								key={s.name}
								type="button"
								className={`viz-sprite-btn${i === spriteIdx ? " active" : ""}`}
								onClick={() => setSpriteIdx(i)}
								aria-label={s.name}
								aria-pressed={i === spriteIdx}
							>
								<PixelCanvas data={s.data} cols={SPRITE_SIZE} rows={SPRITE_SIZE} size={20} />
							</button>
						))}
					</div>
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">
						how a unit prediction error lands on the image
					</div>
					<AmpChart t={t} />
					<div className="viz-legend">
						<span>
							<i style={{ borderColor: "var(--viz-value)" }} />
							predict x₀
						</span>
						<span>
							<i style={{ borderColor: "var(--viz-reward)" }} />
							predict ε
						</span>
						<span>
							<i style={{ borderColor: "var(--viz-kl)" }} />
							predict score
						</span>
					</div>
					<div className="viz-readouts" style={{ marginTop: "0.45rem" }}>
						<span className="viz-chip">
							<span className="viz-chip-label">x₀-pred</span>
							<span className="viz-chip-value" style={{ color: "var(--viz-value)" }}>
								×{amp.x0.toFixed(2)}
							</span>
						</span>
						<span className="viz-chip">
							<span className="viz-chip-label">ε-pred</span>
							<span className="viz-chip-value" style={{ color: "var(--viz-reward)" }}>
								×{amp.eps < 0.01 ? amp.eps.toExponential(1) : amp.eps.toFixed(2)}
							</span>
						</span>
						<span className="viz-chip">
							<span className="viz-chip-label">score-pred</span>
							<span className="viz-chip-value" style={{ color: "var(--viz-kl)" }}>
								×{amp.score < 0.01 ? amp.score.toExponential(1) : amp.score.toFixed(2)}
							</span>
						</span>
					</div>
				</div>
			</div>

			<label className="viz-slider" style={{ marginTop: "0.7rem" }}>
				<span>
					noise level t = <span className="viz-slider-value">{t}</span>
				</span>
				<input
					type="range"
					min={1}
					max={T - 1}
					step={1}
					value={t}
					onChange={(e) => {
						setPlaying(false);
						setT(Number(e.target.value));
					}}
				/>
			</label>
		</SimShell>
	);
}

/* ------------------------------------------------------------------ */

function AmpChart({ t }: { t: number }) {
	const W = 300;
	const H = 150;
	const PAD = { l: 34, r: 8, t: 8, b: 20 };
	const pw = W - PAD.l - PAD.r;
	const ph = H - PAD.t - PAD.b;

	const yLo = -3;
	const yHi = 1.5;
	const xOf = (tt: number) => PAD.l + (tt / T) * pw;
	const yOf = (v: number) =>
		PAD.t + ph - ((Math.log10(Math.max(v, 10 ** yLo)) - yLo) / (yHi - yLo)) * ph;

	const path = (f: (ab: number) => number) => {
		const pts: string[] = [];
		for (let i = 0; i <= 120; i++) {
			const tt = 1 + (i / 120) * (T - 2);
			const ab = alphaBar(tt / T);
			pts.push(`${i === 0 ? "M" : "L"}${xOf(tt).toFixed(1)},${yOf(f(ab)).toFixed(1)}`);
		}
		return pts.join(" ");
	};

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="viz-panel-chart"
			role="img"
			aria-label="error amplification of each parameterization against noise level"
		>
			<title>Error amplification by parameterization</title>
			{[-3, -2, -1, 0, 1].map((e) => (
				<g key={e}>
					<line
						x1={PAD.l}
						y1={yOf(10 ** e)}
						x2={W - PAD.r}
						y2={yOf(10 ** e)}
						stroke="var(--sl-color-gray-5)"
						strokeWidth={e === 0 ? 1.1 : 0.6}
					/>
					<text
						x={PAD.l - 4}
						y={yOf(10 ** e) + 3}
						fontSize={8}
						textAnchor="end"
						fill="var(--sl-color-gray-3)"
					>
						{e === 0 ? "1×" : `10${e < 0 ? "⁻" : ""}${"¹²³".charAt(Math.abs(e) - 1)}`}
					</text>
				</g>
			))}

			<path d={path(() => 1)} fill="none" stroke="var(--viz-value)" strokeWidth={1.8} />
			<path
				d={path((ab) => Math.sqrt(1 - ab) / Math.sqrt(ab))}
				fill="none"
				stroke="var(--viz-reward)"
				strokeWidth={1.8}
			/>
			<path
				d={path((ab) => (1 - ab) / Math.sqrt(ab))}
				fill="none"
				stroke="var(--viz-kl)"
				strokeWidth={1.8}
			/>

			<line
				x1={xOf(t)}
				y1={PAD.t}
				x2={xOf(t)}
				y2={PAD.t + ph}
				stroke="var(--sl-color-gray-3)"
				strokeWidth={1}
				strokeDasharray="2 2"
			/>

			<line x1={PAD.l} y1={PAD.t + ph} x2={W - PAD.r} y2={PAD.t + ph} stroke="var(--sl-color-gray-5)" />
			<text x={PAD.l} y={H - 5} fontSize={8.5} fill="var(--sl-color-gray-3)">
				t = 0 (clean)
			</text>
			<text x={W - PAD.r} y={H - 5} fontSize={8.5} textAnchor="end" fill="var(--sl-color-gray-3)">
				t = T (noise)
			</text>
		</svg>
	);
}
