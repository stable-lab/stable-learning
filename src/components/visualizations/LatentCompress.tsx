import { useMemo, useState } from "react";
import PixelCanvas from "./lib/PixelCanvas";
import SimShell from "./lib/SimShell";
import { rmse } from "./lib/diffusionMath";
import { decode, encode, fitPCA } from "./lib/pca";
import { makeDataset, SPRITE_N, SPRITE_SIZE } from "./lib/sprites";

// How much of a 576-pixel image is actually load-bearing.
//
// The encoder/decoder here is PCA, fitted on the same 256-image dataset the
// samplers use. A linear autoencoder trained to convergence learns exactly
// this subspace, so it is a real bottleneck rather than a mock-up — it just
// understates a real VAE, which is non-linear and perceptually trained.
//
// The point stands either way: the reconstruction is visually indistinguishable
// long before k reaches 576, and every dimension you drop is a dimension the
// diffusion model no longer has to denoise, at every one of its steps.

const DATA = makeDataset(256, 3);
const MAX_K = 64;
const K_CHOICES = [1, 2, 4, 8, 16, 32, 64];

export default function LatentCompress() {
	const [k, setK] = useState(8);
	const [idx, setIdx] = useState(5);

	const pca = useMemo(() => fitPCA(DATA, MAX_K), []);

	const source = DATA[idx];
	const recon = useMemo(
		() => decode(pca, encode(pca, source, k)),
		[pca, source, k],
	);
	const residual = useMemo(() => {
		const r = new Float32Array(SPRITE_N);
		for (let i = 0; i < SPRITE_N; i++) r[i] = source[i] - recon[i];
		return r;
	}, [source, recon]);

	const explained = useMemo(() => {
		let acc = 0;
		for (let i = 0; i < k; i++) acc += pca.eigenvalues[i] ?? 0;
		return acc / pca.totalVariance;
	}, [pca, k]);

	const err = rmse(source, recon);
	const compression = SPRITE_N / k;

	return (
		<SimShell
			title="How many numbers is an image, really?"
			playing={false}
			onToggle={() => {}}
			onReset={() => {
				setK(8);
				setIdx(5);
			}}
			readouts={[
				{ label: "latent dims", value: `${k} / ${SPRITE_N}`, color: "var(--viz-policy)" },
				{
					label: "variance kept",
					value: `${(explained * 100).toFixed(1)}%`,
					color: "var(--viz-reward)",
				},
				{ label: "reconstruction error", value: err.toFixed(3) },
				{
					label: "work per denoise step",
					value: `÷${compression.toFixed(0)}`,
					color: "var(--viz-value)",
				},
			]}
		>
			<div className="viz-panels">
				<div className="viz-panel" style={{ flex: "0 0 auto" }}>
					<div className="viz-panel-title">encode → decode</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<PixelCanvas
							data={source}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={90}
							label="original (576 numbers)"
						/>
						<PixelCanvas
							data={recon}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							size={90}
							label={`from ${k} numbers`}
							accent="var(--viz-policy)"
						/>
						<PixelCanvas
							data={residual}
							cols={SPRITE_SIZE}
							rows={SPRITE_SIZE}
							domain={[-0.6, 0.6]}
							size={90}
							label="what was thrown away"
							accent="var(--viz-danger)"
						/>
					</div>
					<div className="viz-sprite-row">
						{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
							<button
								key={i}
								type="button"
								className={`viz-sprite-btn${i === idx ? " active" : ""}`}
								onClick={() => setIdx(i)}
								aria-label={`image ${i + 1}`}
								aria-pressed={i === idx}
							>
								<PixelCanvas data={DATA[i]} cols={SPRITE_SIZE} rows={SPRITE_SIZE} size={22} />
							</button>
						))}
					</div>
				</div>

				<div className="viz-panel">
					<div className="viz-panel-title">variance captured by the first k components</div>
					<Scree eigen={pca.eigenvalues} total={pca.totalVariance} k={k} />
				</div>
			</div>

			<div className="viz-slider" style={{ marginTop: "0.7rem" }}>
				<span>
					latent dimensions k = <span className="viz-slider-value">{k}</span>
				</span>
				<span className="viz-speed" style={{ marginTop: "0.15rem" }}>
					{K_CHOICES.map((n) => (
						<button
							key={n}
							type="button"
							className={`viz-speed-btn${n === k ? " active" : ""}`}
							onClick={() => setK(n)}
						>
							{n}
						</button>
					))}
				</span>
			</div>
		</SimShell>
	);
}

function Scree({ eigen, total, k }: { eigen: number[]; total: number; k: number }) {
	const W = 300;
	const H = 160;
	const PAD = { l: 30, r: 8, t: 10, b: 20 };
	const pw = W - PAD.l - PAD.r;
	const ph = H - PAD.t - PAD.b;
	const n = eigen.length;

	const cum: number[] = [];
	let acc = 0;
	for (let i = 0; i < n; i++) {
		acc += eigen[i];
		cum.push(acc / total);
	}

	const X = (i: number) => PAD.l + (i / (n - 1)) * pw;
	const Y = (v: number) => PAD.t + ph - v * ph;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="viz-panel-chart"
			role="img"
			aria-label="cumulative variance explained against number of components"
		>
			<title>Cumulative variance explained</title>
			{[0.25, 0.5, 0.75, 0.9, 1].map((g) => (
				<g key={g}>
					<line x1={PAD.l} y1={Y(g)} x2={W - PAD.r} y2={Y(g)} stroke="var(--sl-color-gray-5)" strokeWidth={0.6} />
					<text x={PAD.l - 4} y={Y(g) + 3} fontSize={8} textAnchor="end" fill="var(--sl-color-gray-3)">
						{Math.round(g * 100)}%
					</text>
				</g>
			))}
			<path
				d={cum.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}
				fill="none"
				stroke="var(--viz-reward)"
				strokeWidth={2}
			/>
			<line x1={X(k - 1)} y1={PAD.t} x2={X(k - 1)} y2={PAD.t + ph} stroke="var(--viz-policy)" strokeWidth={1.2} strokeDasharray="3 2" />
			<line x1={PAD.l} y1={PAD.t + ph} x2={W - PAD.r} y2={PAD.t + ph} stroke="var(--sl-color-gray-5)" />
			<text x={PAD.l} y={H - 5} fontSize={8.5} fill="var(--sl-color-gray-3)">
				1 component
			</text>
			<text x={W - PAD.r} y={H - 5} fontSize={8.5} textAnchor="end" fill="var(--sl-color-gray-3)">
				{n}
			</text>
		</svg>
	);
}
