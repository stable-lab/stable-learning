/**
 * Radially-averaged power spectrum of a small square image.
 *
 * This exists to make one specific claim checkable on screen: natural images
 * have roughly 1/f power — most of their energy sits at low spatial
 * frequencies — while Gaussian noise is flat across all frequencies. Adding
 * noise therefore does not degrade an image uniformly. It drowns the high
 * frequencies first and the coarse structure last, which is why denoising
 * runs coarse-to-fine and why the reverse process *looks* like an image
 * coming into focus.
 *
 * Images here are 24×24, so a naive separable DFT is a few tens of thousands
 * of multiplies — far cheaper than the frame it is drawn into, and worth
 * more than an FFT's complexity.
 */

interface Twiddle {
	cos: Float64Array;
	sin: Float64Array;
}

const twiddleCache = new Map<number, Twiddle>();

function twiddles(n: number): Twiddle {
	const hit = twiddleCache.get(n);
	if (hit) return hit;
	const cos = new Float64Array(n * n);
	const sin = new Float64Array(n * n);
	for (let k = 0; k < n; k++) {
		for (let x = 0; x < n; x++) {
			const angle = (-2 * Math.PI * k * x) / n;
			cos[k * n + x] = Math.cos(angle);
			sin[k * n + x] = Math.sin(angle);
		}
	}
	const t = { cos, sin };
	twiddleCache.set(n, t);
	return t;
}

/** 2D DFT by two passes of 1D DFTs (rows, then columns). */
function dft2(data: Float32Array, n: number): { re: Float64Array; im: Float64Array } {
	const { cos, sin } = twiddles(n);
	const rowRe = new Float64Array(n * n);
	const rowIm = new Float64Array(n * n);

	for (let r = 0; r < n; r++) {
		for (let kx = 0; kx < n; kx++) {
			let re = 0;
			let im = 0;
			for (let c = 0; c < n; c++) {
				const v = data[r * n + c];
				re += v * cos[kx * n + c];
				im += v * sin[kx * n + c];
			}
			rowRe[r * n + kx] = re;
			rowIm[r * n + kx] = im;
		}
	}

	const re = new Float64Array(n * n);
	const im = new Float64Array(n * n);
	for (let kx = 0; kx < n; kx++) {
		for (let ky = 0; ky < n; ky++) {
			let sre = 0;
			let sim = 0;
			for (let r = 0; r < n; r++) {
				const ar = rowRe[r * n + kx];
				const ai = rowIm[r * n + kx];
				const c = cos[ky * n + r];
				const s = sin[ky * n + r];
				// (ar + i·ai)(c + i·s)
				sre += ar * c - ai * s;
				sim += ar * s + ai * c;
			}
			re[ky * n + kx] = sre;
			im[ky * n + kx] = sim;
		}
	}
	return { re, im };
}

export interface RadialSpectrum {
	/** Spatial frequency in cycles per image, starting at 1 (DC excluded). */
	k: number[];
	/** Mean power in each frequency ring. */
	power: number[];
}

/**
 * Mean power per frequency ring. DC (k = 0) is dropped: it is just the mean
 * brightness, it dwarfs everything else, and it says nothing about detail.
 */
export function radialPowerSpectrum(data: Float32Array, n: number): RadialSpectrum {
	const { re, im } = dft2(data, n);
	const maxK = Math.floor(n / 2);
	const sums = new Float64Array(maxK + 1);
	const counts = new Float64Array(maxK + 1);

	for (let ky = 0; ky < n; ky++) {
		// Fold the upper half of each axis onto negative frequencies.
		const fy = ky <= n / 2 ? ky : ky - n;
		for (let kx = 0; kx < n; kx++) {
			const fx = kx <= n / 2 ? kx : kx - n;
			const ring = Math.round(Math.hypot(fx, fy));
			if (ring < 1 || ring > maxK) continue;
			const p = re[ky * n + kx] ** 2 + im[ky * n + kx] ** 2;
			sums[ring] += p;
			counts[ring] += 1;
		}
	}

	const k: number[] = [];
	const power: number[] = [];
	for (let ring = 1; ring <= maxK; ring++) {
		if (counts[ring] === 0) continue;
		k.push(ring);
		power.push(sums[ring] / counts[ring]);
	}
	return { k, power };
}
