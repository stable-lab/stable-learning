/**
 * A very small MLP with hand-written backprop and Adam, sized for the 2D toy
 * problems on the diffusion track.
 *
 * This exists so the GAN page can train an *actual* adversarial pair in the
 * browser rather than animate a scripted impression of one. The networks are
 * 2→16→16→k, so a batch of 64 is a few tens of thousands of multiplies —
 * cheap enough to run several optimizer steps per animation frame.
 *
 * Adam defaults to β₁ = 0.5, the DCGAN setting, because the whole point of
 * the page is to reproduce GAN training dynamics faithfully, including the
 * ones that go wrong.
 */

export type Activation = "tanh" | "lrelu" | "none";

function actFwd(kind: Activation, v: number): number {
	if (kind === "tanh") return Math.tanh(v);
	if (kind === "lrelu") return v > 0 ? v : 0.2 * v;
	return v;
}

/** Derivative expressed in terms of the *output* of the activation. */
function actBwd(kind: Activation, y: number): number {
	if (kind === "tanh") return 1 - y * y;
	if (kind === "lrelu") return y > 0 ? 1 : 0.2;
	return 1;
}

interface Layer {
	nIn: number;
	nOut: number;
	w: Float64Array;
	b: Float64Array;
	gw: Float64Array;
	gb: Float64Array;
	mw: Float64Array;
	vw: Float64Array;
	mb: Float64Array;
	vb: Float64Array;
	act: Activation;
	/** Per-sample caches from the last forward pass. */
	inputs: Float64Array[];
	outputs: Float64Array[];
}

export class MLP {
	layers: Layer[] = [];
	private t = 0;

	constructor(sizes: number[], acts: Activation[], rng: () => number) {
		for (let i = 0; i < sizes.length - 1; i++) {
			const nIn = sizes[i];
			const nOut = sizes[i + 1];
			const w = new Float64Array(nIn * nOut);
			// He-ish init; the exact constant does not matter at this size.
			const scale = Math.sqrt(2 / nIn);
			for (let k = 0; k < w.length; k++) {
				// Box–Muller from the supplied rng keeps runs reproducible.
				const u = Math.max(rng(), 1e-12);
				const v = rng();
				w[k] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * scale;
			}
			this.layers.push({
				nIn,
				nOut,
				w,
				b: new Float64Array(nOut),
				gw: new Float64Array(nIn * nOut),
				gb: new Float64Array(nOut),
				mw: new Float64Array(nIn * nOut),
				vw: new Float64Array(nIn * nOut),
				mb: new Float64Array(nOut),
				vb: new Float64Array(nOut),
				act: acts[i],
				inputs: [],
				outputs: [],
			});
		}
	}

	/** Forward a whole batch, caching activations for the backward pass. */
	forward(batch: Float64Array[]): Float64Array[] {
		let cur = batch;
		for (const L of this.layers) {
			L.inputs = cur;
			const out: Float64Array[] = [];
			for (const x of cur) {
				const y = new Float64Array(L.nOut);
				for (let o = 0; o < L.nOut; o++) {
					let s = L.b[o];
					for (let i = 0; i < L.nIn; i++) s += x[i] * L.w[i * L.nOut + o];
					y[o] = actFwd(L.act, s);
				}
				out.push(y);
			}
			L.outputs = out;
			cur = out;
		}
		return cur;
	}

	/**
	 * Backprop a batch of output gradients. Accumulates parameter gradients and
	 * returns the gradient with respect to the batch input — which is what the
	 * generator needs from the discriminator.
	 */
	backward(gradOut: Float64Array[]): Float64Array[] {
		let g = gradOut;
		for (let li = this.layers.length - 1; li >= 0; li--) {
			const L = this.layers[li];
			const gIn: Float64Array[] = [];
			for (let s = 0; s < g.length; s++) {
				const gy = g[s];
				const y = L.outputs[s];
				const x = L.inputs[s];
				// Fold the activation derivative in first.
				const gz = new Float64Array(L.nOut);
				for (let o = 0; o < L.nOut; o++) gz[o] = gy[o] * actBwd(L.act, y[o]);
				for (let o = 0; o < L.nOut; o++) L.gb[o] += gz[o];
				const gx = new Float64Array(L.nIn);
				for (let i = 0; i < L.nIn; i++) {
					const xi = x[i];
					let acc = 0;
					for (let o = 0; o < L.nOut; o++) {
						L.gw[i * L.nOut + o] += xi * gz[o];
						acc += L.w[i * L.nOut + o] * gz[o];
					}
					gx[i] = acc;
				}
				gIn.push(gx);
			}
			g = gIn;
		}
		return g;
	}

	zeroGrad(): void {
		for (const L of this.layers) {
			L.gw.fill(0);
			L.gb.fill(0);
		}
	}

	/** Adam. `scale` divides the accumulated gradients (i.e. the batch size). */
	step(lr: number, scale = 1, b1 = 0.5, b2 = 0.999): void {
		this.t++;
		const c1 = 1 - b1 ** this.t;
		const c2 = 1 - b2 ** this.t;
		for (const L of this.layers) {
			const upd = (
				p: Float64Array,
				g: Float64Array,
				m: Float64Array,
				v: Float64Array,
			) => {
				for (let k = 0; k < p.length; k++) {
					const gk = g[k] / scale;
					m[k] = b1 * m[k] + (1 - b1) * gk;
					v[k] = b2 * v[k] + (1 - b2) * gk * gk;
					p[k] -= (lr * (m[k] / c1)) / (Math.sqrt(v[k] / c2) + 1e-8);
				}
			};
			upd(L.w, L.gw, L.mw, L.vw);
			upd(L.b, L.gb, L.mb, L.vb);
		}
	}
}

export function sigmoid(v: number): number {
	return v >= 0 ? 1 / (1 + Math.exp(-v)) : Math.exp(v) / (1 + Math.exp(v));
}
