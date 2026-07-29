/**
 * Top-k principal components by power iteration with deflation.
 *
 * A linear autoencoder trained to convergence learns exactly the PCA
 * subspace, so this gives the latent-diffusion page a real encoder/decoder
 * pair — computed rather than gestured at — without shipping trained weights.
 * It understates what a real VAE achieves (that one is non-linear and
 * perceptually trained), and the page says so; what it gets right is the part
 * that matters: how few dimensions the interesting variation actually needs.
 */

export interface PCA {
	mean: Float32Array;
	/** `k` unit-norm components, each of length `dim`. */
	components: Float32Array[];
	/** Variance captured by each component. */
	eigenvalues: number[];
	totalVariance: number;
}

export function fitPCA(data: Float32Array[], k: number, iters = 60): PCA {
	const n = data.length;
	const dim = data[0].length;

	const mean = new Float32Array(dim);
	for (const d of data) for (let i = 0; i < dim; i++) mean[i] += d[i];
	for (let i = 0; i < dim; i++) mean[i] /= n;

	// Centred copy — deflation mutates it, so never touch the caller's arrays.
	const X: Float32Array[] = data.map((d) => {
		const r = new Float32Array(dim);
		for (let i = 0; i < dim; i++) r[i] = d[i] - mean[i];
		return r;
	});

	let totalVariance = 0;
	for (const r of X) for (let i = 0; i < dim; i++) totalVariance += r[i] * r[i];
	totalVariance /= n;

	const components: Float32Array[] = [];
	const eigenvalues: number[] = [];

	// Deterministic start vector: reproducible across reloads.
	let seed = 12345;
	const rand = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296 - 0.5;
	};

	for (let c = 0; c < Math.min(k, dim); c++) {
		let v = new Float32Array(dim);
		for (let i = 0; i < dim; i++) v[i] = rand();
		normalize(v);

		for (let it = 0; it < iters; it++) {
			// w = Xᵀ X v / n, without ever forming the dim×dim covariance.
			const w = new Float32Array(dim);
			for (const r of X) {
				let dot = 0;
				for (let i = 0; i < dim; i++) dot += r[i] * v[i];
				if (dot === 0) continue;
				for (let i = 0; i < dim; i++) w[i] += dot * r[i];
			}
			for (let i = 0; i < dim; i++) w[i] /= n;
			const norm = normalize(w);
			if (norm === 0) break;
			v = w;
		}

		// Rayleigh quotient gives the variance along v.
		let lambda = 0;
		for (const r of X) {
			let dot = 0;
			for (let i = 0; i < dim; i++) dot += r[i] * v[i];
			lambda += dot * dot;
		}
		lambda /= n;

		components.push(v);
		eigenvalues.push(lambda);

		// Deflate so the next iteration finds the next component.
		for (const r of X) {
			let dot = 0;
			for (let i = 0; i < dim; i++) dot += r[i] * v[i];
			for (let i = 0; i < dim; i++) r[i] -= dot * v[i];
		}
	}

	return { mean, components, eigenvalues, totalVariance };
}

function normalize(v: Float32Array): number {
	let s = 0;
	for (const x of v) s += x * x;
	const n = Math.sqrt(s);
	if (n > 1e-12) for (let i = 0; i < v.length; i++) v[i] /= n;
	return n;
}

/** Project onto the first `k` components — the encoder. */
export function encode(pca: PCA, x: Float32Array, k: number): Float64Array {
	const kk = Math.min(k, pca.components.length);
	const z = new Float64Array(kk);
	for (let c = 0; c < kk; c++) {
		let dot = 0;
		const comp = pca.components[c];
		for (let i = 0; i < x.length; i++) dot += (x[i] - pca.mean[i]) * comp[i];
		z[c] = dot;
	}
	return z;
}

/** Rebuild from the code — the decoder. */
export function decode(pca: PCA, z: Float64Array, out?: Float32Array): Float32Array {
	const dim = pca.mean.length;
	const dst = out ?? new Float32Array(dim);
	dst.set(pca.mean);
	for (let c = 0; c < z.length; c++) {
		const comp = pca.components[c];
		const zc = z[c];
		for (let i = 0; i < dim; i++) dst[i] += zc * comp[i];
	}
	return dst;
}
