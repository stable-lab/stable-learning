/**
 * The training set for every diffusion widget on the track: eight 24×24
 * grayscale glyphs, generated procedurally so there are no image assets to
 * host and every reader sees byte-identical data.
 *
 * Stored in the DDPM convention — values in [-1, 1], background -1, ink +1 —
 * so the forward process can add unit-variance noise without rescaling.
 *
 * The shapes are chosen to overlap heavily in the middle of the frame. That
 * is deliberate: their pixelwise mean is a centred blur, which is exactly
 * what a one-step denoiser returns, and that blur is the point of
 * `one-step-vs-many`.
 */

export const SPRITE_SIZE = 24;
export const SPRITE_N = SPRITE_SIZE * SPRITE_SIZE;

/** Coverage test in normalized coords, both axes spanning [-1, 1]. */
type Inside = (x: number, y: number) => boolean;

/** Subpixel samples per axis — cheap antialiasing so edges survive noising. */
const SUPERSAMPLE = 4;

const SHAPES: { name: string; inside: Inside }[] = [
	{
		name: "disc",
		inside: (x, y) => Math.hypot(x, y) < 0.62,
	},
	{
		name: "ring",
		inside: (x, y) => {
			const r = Math.hypot(x, y);
			return r > 0.38 && r < 0.68;
		},
	},
	{
		name: "cross",
		inside: (x, y) =>
			Math.max(Math.abs(x), Math.abs(y)) < 0.72 &&
			(Math.abs(x) < 0.19 || Math.abs(y) < 0.19),
	},
	{
		name: "triangle",
		inside: (x, y) => y > -0.6 && y < 0.68 - 1.75 * Math.abs(x),
	},
	{
		name: "frame",
		inside: (x, y) => {
			const m = Math.max(Math.abs(x), Math.abs(y));
			return m > 0.42 && m < 0.68;
		},
	},
	{
		name: "slash",
		inside: (x, y) =>
			Math.abs(x + y) < 0.26 && Math.abs(x) < 0.78 && Math.abs(y) < 0.78,
	},
	{
		name: "chevron",
		inside: (x, y) => {
			const arm = Math.abs(Math.abs(x) - (y + 0.42)) < 0.24;
			return arm && Math.abs(x) < 0.72 && y > -0.62 && y < 0.62;
		},
	},
	{
		name: "bars",
		inside: (x, y) => {
			if (Math.abs(x) > 0.7) return false;
			const band = Math.abs((((y + 1) * 3) % 1) - 0.5);
			return band < 0.22 && Math.abs(y) < 0.78;
		},
	},
];

/** Rigid placement of a shape inside the frame. */
export interface Pose {
	dx?: number;
	dy?: number;
	scale?: number;
	rot?: number;
}

function rasterize(inside: Inside, pose: Pose = {}): Float32Array {
	const { dx = 0, dy = 0, scale = 1, rot = 0 } = pose;
	const cos = Math.cos(-rot);
	const sin = Math.sin(-rot);
	const out = new Float32Array(SPRITE_N);
	const step = 2 / SPRITE_SIZE;
	const sub = step / SUPERSAMPLE;
	for (let row = 0; row < SPRITE_SIZE; row++) {
		for (let col = 0; col < SPRITE_SIZE; col++) {
			let hits = 0;
			for (let sy = 0; sy < SUPERSAMPLE; sy++) {
				for (let sx = 0; sx < SUPERSAMPLE; sx++) {
					// Pixel centre in [-1,1], then walk the subpixel grid.
					const px = -1 + col * step + sub * (sx + 0.5);
					const py = 1 - row * step - sub * (sy + 0.5);
					// Undo the pose, then test against the canonical shape.
					const tx = (px - dx) / scale;
					const ty = (py - dy) / scale;
					if (inside(tx * cos - ty * sin, tx * sin + ty * cos)) hits++;
				}
			}
			const cover = hits / (SUPERSAMPLE * SUPERSAMPLE);
			out[row * SPRITE_SIZE + col] = cover * 2 - 1;
		}
	}
	return out;
}

export interface Sprite {
	name: string;
	data: Float32Array;
}

/** The eight-glyph training set. Built once at module load. */
export const SPRITES: Sprite[] = SHAPES.map(({ name, inside }) => ({
	name,
	data: rasterize(inside),
}));

export const SHAPE_NAMES: string[] = SHAPES.map((s) => s.name);

/**
 * Render one shape at an arbitrary pose.
 *
 * This is the honest "latent space" for the interpolation demo: the four pose
 * numbers are the actual generative parameters these images were drawn from,
 * so walking a straight line through them produces valid images at every
 * point by construction. Walking a straight line through the 576 *pixels*
 * between the same two endpoints does not, and the gap between those two
 * paths is what a manifold is.
 */
export function poseSprite(shapeIdx: number, pose: Pose): Float32Array {
	return rasterize(SHAPES[shapeIdx % SHAPES.length].inside, pose);
}

/**
 * A *rich* training set: every shape at many positions, sizes and angles.
 *
 * This is not decoration. With only the eight canonical glyphs, the exact
 * posterior collapses onto the right one within about four reverse steps —
 * measured, not assumed — so a step-count demo built on them would show
 * nothing between 4 and 1000 and any caption claiming otherwise would be
 * false. Eight discrete points is simply not a hard distribution.
 *
 * Posing each shape continuously makes neighbouring training images genuinely
 * close together, so a coarse step lands *between* them and produces a
 * visible blend rather than a clean sample. That blend is the phenomenon the
 * whole step-count argument is about, and it only exists if the distribution
 * is dense enough to fall between.
 */
export function makeDataset(count: number, seed = 1): Float32Array[] {
	// Local LCG — keeps this module free of imports and reproducible.
	let s = (seed * 2654435761) >>> 0;
	const rand = () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
	const out: Float32Array[] = [];
	for (let i = 0; i < count; i++) {
		const shape = SHAPES[i % SHAPES.length];
		out.push(
			rasterize(shape.inside, {
				dx: (rand() - 0.5) * 0.44,
				dy: (rand() - 0.5) * 0.44,
				scale: 0.78 + rand() * 0.42,
				rot: (rand() - 0.5) * 0.9,
			}),
		);
	}
	return out;
}

/** The same dataset, carrying the shape each image was drawn from — the
 *  "prompt" for the class-conditional and guidance widgets. */
export function makeLabeledDataset(
	count: number,
	seed = 1,
): { data: Float32Array[]; labels: Uint8Array } {
	const data = makeDataset(count, seed);
	const labels = new Uint8Array(count);
	for (let i = 0; i < count; i++) labels[i] = i % SHAPES.length;
	return { data, labels };
}

/** Pixelwise mean of a set — what a denoiser returns when everything is
 *  equally plausible, i.e. the output of one giant reverse step. */
export function meanImage(set: Float32Array[]): Float32Array {
	const mean = new Float32Array(SPRITE_N);
	for (const d of set) {
		for (let i = 0; i < SPRITE_N; i++) mean[i] += d[i];
	}
	for (let i = 0; i < SPRITE_N; i++) mean[i] /= set.length;
	return mean;
}

export const SPRITE_MEAN: Float32Array = meanImage(SPRITES.map((s) => s.data));
