/**
 * The diffusion math shared by every widget on the track. One source of
 * truth, so a schedule change cannot make two figures disagree.
 *
 * Everything here is exact, not illustrative. `expectedX0` is the *optimal*
 * denoiser for the sprite training set, not an approximation of one: with a
 * finite training set the posterior over clean images is a softmax, and its
 * mean is a closed form. That is what lets the sampler run real DDPM
 * ancestral sampling in a browser with no trained network anywhere.
 *
 * Its one limitation is a teaching asset rather than a defect — an exact
 * empirical posterior can only ever reproduce training images. That is
 * memorization, and it is precisely why real systems need a network that
 * generalizes. The `temperature` knob on `posteriorWeights` widens the
 * kernel to show generalization being bought.
 */

/* ------------------------------------------------------------------ *
 * Randomness — seeded, so Reset reproduces a run exactly.
 * ------------------------------------------------------------------ */

/** mulberry32: small, fast, good enough for visuals, and seedable. */
export function makeRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Standard normal via Box–Muller. Discards the second variate; fine here. */
export function gaussian(rng: () => number): number {
	// u must be strictly positive for the log.
	const u = Math.max(rng(), 1e-12);
	const v = rng();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ------------------------------------------------------------------ *
 * Noise schedule
 * ------------------------------------------------------------------ */

const COSINE_S = 0.008;
const COSINE_F0 = Math.cos((COSINE_S / (1 + COSINE_S)) * (Math.PI / 2)) ** 2;

/**
 * Cosine schedule (Nichol & Dhariwal 2021) as a *continuous* function of
 * u = t/T in [0, 1]. Continuous matters: `StepBudget` slides T from 1 to
 * 1000, and a continuous ᾱ means every step count reads off the same curve
 * instead of needing its own recomputed product.
 *
 * ᾱ(0) = 1 (clean) and ᾱ(1) = 0 (pure noise), clamped away from both ends so
 * the divisions downstream stay finite.
 */
export function alphaBar(u: number): number {
	const c = Math.min(1, Math.max(0, u));
	const f = Math.cos(((c + COSINE_S) / (1 + COSINE_S)) * (Math.PI / 2)) ** 2;
	return Math.min(1 - 1e-5, Math.max(1e-5, f / COSINE_F0));
}

/** Signal-to-noise ratio at a given ᾱ — the honest x-axis for "how far gone". */
export function snr(ab: number): number {
	return ab / (1 - ab);
}

/* ------------------------------------------------------------------ *
 * Forward process
 * ------------------------------------------------------------------ */

/**
 * One closed-form jump to any noise level: x_t = √ᾱ·x₀ + √(1-ᾱ)·ε.
 * No stepwise simulation — that closure under addition is the whole reason
 * the forward process is Gaussian.
 *
 * Writes the noise it drew into `eps` when given, since the training target
 * is that noise.
 */
export function forwardSample(
	x0: Float32Array,
	ab: number,
	rng: () => number,
	out?: Float32Array,
	eps?: Float32Array,
): Float32Array {
	const dst = out ?? new Float32Array(x0.length);
	const sa = Math.sqrt(ab);
	const sn = Math.sqrt(1 - ab);
	for (let i = 0; i < x0.length; i++) {
		const e = gaussian(rng);
		if (eps) eps[i] = e;
		dst[i] = sa * x0[i] + sn * e;
	}
	return dst;
}

/* ------------------------------------------------------------------ *
 * The exact denoiser
 * ------------------------------------------------------------------ */

/**
 * Posterior over which training image produced x_t.
 *
 *   w_i ∝ exp( -‖x_t - √ᾱ·x⁽ⁱ⁾‖² / (2(1-ᾱ)·temperature) )
 *
 * `temperature` > 1 widens the kernel: the model stops being certain which
 * training image it is looking at and starts blending them, which is a crude
 * but honest stand-in for a network that generalizes instead of memorizing.
 *
 * Computed in log space with the max subtracted — at low noise the exponents
 * reach the thousands and a naive exp() would be all zeros or all infinities.
 */
export function posteriorWeights(
	xt: Float32Array,
	dataset: Float32Array[],
	ab: number,
	temperature = 1,
	out?: Float32Array,
): Float32Array {
	const w = out ?? new Float32Array(dataset.length);
	const sa = Math.sqrt(ab);
	const denom = 2 * (1 - ab) * Math.max(temperature, 1e-6);

	let max = Number.NEGATIVE_INFINITY;
	for (let k = 0; k < dataset.length; k++) {
		const ref = dataset[k];
		let sq = 0;
		for (let i = 0; i < xt.length; i++) {
			const d = xt[i] - sa * ref[i];
			sq += d * d;
		}
		w[k] = -sq / denom;
		if (w[k] > max) max = w[k];
	}

	let sum = 0;
	for (let k = 0; k < w.length; k++) {
		w[k] = Math.exp(w[k] - max);
		sum += w[k];
	}
	for (let k = 0; k < w.length; k++) w[k] /= sum;
	return w;
}

/** E[x₀ | x_t] — the posterior-weighted average of the training images. */
export function expectedX0(
	dataset: Float32Array[],
	weights: Float32Array,
	out?: Float32Array,
): Float32Array {
	const n = dataset[0].length;
	const dst = out ?? new Float32Array(n);
	dst.fill(0);
	for (let k = 0; k < dataset.length; k++) {
		const w = weights[k];
		if (w < 1e-9) continue;
		const ref = dataset[k];
		for (let i = 0; i < n; i++) dst[i] += w * ref[i];
	}
	return dst;
}

/**
 * The same object, three ways. ε-prediction, x₀-prediction and the score are
 * one quantity reparameterized (Tweedie), which is the payoff of
 * `predict-the-noise`:
 *
 *   ε̂     = (x_t - √ᾱ·x̂₀) / √(1-ᾱ)
 *   score = -ε̂ / √(1-ᾱ)
 */
export function epsFromX0(
	xt: Float32Array,
	x0hat: Float32Array,
	ab: number,
	out?: Float32Array,
): Float32Array {
	const dst = out ?? new Float32Array(xt.length);
	const sa = Math.sqrt(ab);
	const sn = Math.sqrt(1 - ab);
	for (let i = 0; i < xt.length; i++) dst[i] = (xt[i] - sa * x0hat[i]) / sn;
	return dst;
}

export function scoreFromEps(
	eps: Float32Array,
	ab: number,
	out?: Float32Array,
): Float32Array {
	const dst = out ?? new Float32Array(eps.length);
	const sn = Math.sqrt(1 - ab);
	for (let i = 0; i < eps.length; i++) dst[i] = -eps[i] / sn;
	return dst;
}

/* ------------------------------------------------------------------ *
 * Reverse process
 * ------------------------------------------------------------------ */

/**
 * One reverse step, in the DDIM parameterization that covers both samplers
 * (Song et al. 2020, eq. 12):
 *
 *   x_{t-1} = √ᾱ_prev·x̂₀ + √(1 - ᾱ_prev - σ²)·ε̂ + σ·z
 *   σ = η·√((1-ᾱ_prev)/(1-ᾱ_t))·√(1 - ᾱ_t/ᾱ_prev)
 *
 * η = 1 is ancestral DDPM sampling; η = 0 is deterministic DDIM. Exposing η
 * as a knob costs nothing and makes "where did the randomness go?" a thing
 * the reader can test rather than take on faith.
 */
export function reverseStep(
	xt: Float32Array,
	x0hat: Float32Array,
	epsHat: Float32Array,
	abT: number,
	abPrev: number,
	eta: number,
	rng: () => number,
	out?: Float32Array,
): Float32Array {
	const dst = out ?? new Float32Array(xt.length);
	const ratio = Math.min(1, abT / abPrev);
	const sigma =
		eta * Math.sqrt((1 - abPrev) / (1 - abT)) * Math.sqrt(Math.max(0, 1 - ratio));
	const dirCoef = Math.sqrt(Math.max(0, 1 - abPrev - sigma * sigma));
	const sa = Math.sqrt(abPrev);
	for (let i = 0; i < xt.length; i++) {
		const z = sigma > 0 ? gaussian(rng) : 0;
		dst[i] = sa * x0hat[i] + dirCoef * epsHat[i] + sigma * z;
	}
	return dst;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Root-mean-square error, for "how far is this from the true image". */
export function rmse(a: Float32Array, b: Float32Array): number {
	let sq = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sq += d * d;
	}
	return Math.sqrt(sq / a.length);
}

/** Shannon entropy of the posterior, in bits — "how sure is it, really". */
export function entropyBits(weights: Float32Array): number {
	let h = 0;
	for (let k = 0; k < weights.length; k++) {
		const p = weights[k];
		if (p > 1e-12) h -= p * Math.log2(p);
	}
	return h;
}
