import { useMemo, useState } from "react";
import PixelCanvas from "./lib/PixelCanvas";
import SimShell from "./lib/SimShell";
import { gaussian, makeRng, rmse } from "./lib/diffusionMath";
import { makeDataset, poseSprite, SHAPE_NAMES, SPRITE_N, SPRITE_SIZE } from "./lib/sprites";

// Two routes between the same pair of images.
//
// The top strip walks a straight line through the 576 pixel values. The
// bottom strip walks a straight line through the four pose numbers the images
// were actually drawn from — a genuine latent space, not a stand-in, because
// these sprites really are generated from those parameters.
//
// Both paths start and end at identical images. Only one stays on the set of
// things that are images.

const STEPS = 7;
const REF = makeDataset(256, 3);

const POSE_A = { dx: -0.16, dy: 0.1, scale: 0.85, rot: -0.3 };
const POSE_B = { dx: 0.18, dy: -0.12, scale: 1.12, rot: 0.35 };

function midtone(x: Float32Array): number {
	let n = 0;
	for (const v of x) if (Math.abs(v) < 0.5) n++;
	return n / x.length;
}

function nearestReal(x: Float32Array): number {
	let best = Number.POSITIVE_INFINITY;
	for (const d of REF) best = Math.min(best, rmse(x, d));
	return best;
}

export default function ManifoldSlice() {
	const [shapeA, setShapeA] = useState(0);
	const [shapeB, setShapeB] = useState(3);
	const [lambda, setLambda] = useState(0.5);

	const endA = useMemo(() => poseSprite(shapeA, POSE_A), [shapeA]);
	const endB = useMemo(() => poseSprite(shapeB, POSE_B), [shapeB]);

	// Straight line through pixel space.
	const pixelPath = useMemo(() => {
		const out: Float32Array[] = [];
		for (let i = 0; i < STEPS; i++) {
			const l = i / (STEPS - 1);
			const f = new Float32Array(SPRITE_N);
			for (let k = 0; k < SPRITE_N; k++) f[k] = (1 - l) * endA[k] + l * endB[k];
			out.push(f);
		}
		return out;
	}, [endA, endB]);

	// Straight line through the pose parameters, re-rendered at every step.
	const posePath = useMemo(() => {
		const out: Float32Array[] = [];
		for (let i = 0; i < STEPS; i++) {
			const l = i / (STEPS - 1);
			// Below the halfway point the shape identity is A, above it is B —
			// shape is categorical, so it is the one coordinate that cannot be
			// blended without leaving the set of real images.
			const shape = l < 0.5 ? shapeA : shapeB;
			out.push(
				poseSprite(shape, {
					dx: (1 - l) * POSE_A.dx + l * POSE_B.dx,
					dy: (1 - l) * POSE_A.dy + l * POSE_B.dy,
					scale: (1 - l) * POSE_A.scale + l * POSE_B.scale,
					rot: (1 - l) * POSE_A.rot + l * POSE_B.rot,
				}),
			);
		}
		return out;
	}, [shapeA, shapeB]);

	const li = Math.round(lambda * (STEPS - 1));
	const pixMid = pixelPath[li];
	const poseMid = posePath[li];

	// What a point drawn uniformly from pixel space looks like.
	const randomImages = useMemo(() => {
		const rng = makeRng(7);
		return [0, 1, 2].map(() => {
			const f = new Float32Array(SPRITE_N);
			for (let i = 0; i < SPRITE_N; i++) f[i] = Math.tanh(gaussian(rng));
			return f;
		});
	}, []);

	return (
		<SimShell
			title="Two straight lines between the same two images"
			playing={false}
			onToggle={() => {}}
			onReset={() => {
				setShapeA(0);
				setShapeB(3);
				setLambda(0.5);
			}}
			readouts={[
				{ label: "λ", value: lambda.toFixed(2) },
				{
					label: "pixel path — dist. to nearest real",
					value: nearestReal(pixMid).toFixed(3),
					color: "var(--viz-danger)",
				},
				{
					label: "pose path — dist. to nearest real",
					value: nearestReal(poseMid).toFixed(3),
					color: "var(--viz-reward)",
				},
			]}
		>
			<div className="viz-panel-title">straight line through the 576 pixels</div>
			<div className="viz-strip">
				{pixelPath.map((f, i) => (
					<PixelCanvas
						key={`pix-${i}`}
						data={f}
						cols={SPRITE_SIZE}
						rows={SPRITE_SIZE}
						size={62}
						accent={i === li ? "var(--viz-danger)" : undefined}
						label={i === 0 || i === STEPS - 1 ? "real" : `${midtone(f) > 0.25 ? "ghost" : ""}`}
					/>
				))}
			</div>

			<div className="viz-panel-title" style={{ marginTop: "0.7rem" }}>
				straight line through the four pose parameters
			</div>
			<div className="viz-strip">
				{posePath.map((f, i) => (
					<PixelCanvas
						key={`pose-${i}`}
						data={f}
						cols={SPRITE_SIZE}
						rows={SPRITE_SIZE}
						size={62}
						accent={i === li ? "var(--viz-reward)" : undefined}
						label={i === 0 || i === STEPS - 1 ? "real" : ""}
					/>
				))}
			</div>

			<label className="viz-slider" style={{ marginTop: "0.7rem" }}>
				<span>
					position along the path λ ={" "}
					<span className="viz-slider-value">{lambda.toFixed(2)}</span>
				</span>
				<input
					type="range"
					min={0}
					max={1}
					step={1 / (STEPS - 1)}
					value={lambda}
					onChange={(e) => setLambda(Number(e.target.value))}
				/>
			</label>

			<div className="viz-controls-row">
				<div className="viz-slider" style={{ flex: "1 1 12rem" }}>
					<span>start shape</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem", flexWrap: "wrap" }}>
						{SHAPE_NAMES.map((n, i) => (
							<button
								key={n}
								type="button"
								className={`viz-speed-btn${i === shapeA ? " active" : ""}`}
								onClick={() => setShapeA(i)}
							>
								{n}
							</button>
						))}
					</span>
				</div>
				<div className="viz-slider" style={{ flex: "1 1 12rem" }}>
					<span>end shape</span>
					<span className="viz-speed" style={{ marginTop: "0.15rem", flexWrap: "wrap" }}>
						{SHAPE_NAMES.map((n, i) => (
							<button
								key={n}
								type="button"
								className={`viz-speed-btn${i === shapeB ? " active" : ""}`}
								onClick={() => setShapeB(i)}
							>
								{n}
							</button>
						))}
					</span>
				</div>
			</div>

			<div className="viz-panel-title" style={{ marginTop: "0.8rem" }}>
				for scale: three points drawn uniformly at random from pixel space
			</div>
			<div className="viz-strip">
				{randomImages.map((f, i) => (
					<PixelCanvas
						key={`rnd-${i}`}
						data={f}
						cols={SPRITE_SIZE}
						rows={SPRITE_SIZE}
						size={62}
					/>
				))}
				<span
					style={{
						fontSize: "0.78rem",
						color: "var(--sl-color-gray-3)",
						alignSelf: "center",
						maxWidth: "16rem",
						lineHeight: 1.45,
					}}
				>
					Sample pixel space at random for the rest of your life and you will
					never once hit an image.
				</span>
			</div>
		</SimShell>
	);
}
