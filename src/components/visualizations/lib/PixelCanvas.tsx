import { useEffect, useRef } from "react";

/**
 * Canvas-backed renderer for the small images on the diffusion track.
 *
 * Everything else on this site draws with SVG, and for tens of marks that is
 * the right call. It is the wrong call here: a 24×24 frame is 576 cells, and
 * re-rendering that many React <rect>s every animation frame — across four
 * panels — spends the whole frame budget in reconciliation. One canvas and
 * one ImageData blit costs effectively nothing.
 *
 * Images render as grayscale in both themes rather than following the site's
 * ink/paper colors. Theme-inverting an image would mean the same sprite
 * appears as white-on-black in dark mode and black-on-white in light, which
 * reads as two different images. The frame around it is theme-aware instead.
 */

export interface PixelCanvasProps {
	/** Row-major pixel values, `cols * rows` of them. */
	data: Float32Array;
	cols: number;
	rows: number;
	/** Rendered size in CSS pixels (square unless `height` is given). */
	size?: number;
	height?: number;
	/** Value range mapped onto the ramp. DDPM convention by default. */
	domain?: [number, number];
	/** Override the ramp. Receives a 0–1 value, returns 8-bit RGB. */
	toRGB?: (v: number) => [number, number, number];
	/** Caption rendered under the frame. */
	label?: string;
	/** Highlight color for the frame, e.g. a `--viz-*` token. */
	accent?: string;
	title?: string;
}

function grayscale(v: number): [number, number, number] {
	const g = Math.round(v * 255);
	return [g, g, g];
}

export default function PixelCanvas({
	data,
	cols,
	rows,
	size = 132,
	height,
	domain = [-1, 1],
	toRGB = grayscale,
	label,
	accent,
	title,
}: PixelCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const bufferRef = useRef<HTMLCanvasElement | null>(null);

	// No dependency array: the sims reuse and mutate their Float32Arrays in
	// place to avoid per-frame allocation, so array identity is not a signal
	// that the pixels changed. Redraw on every commit instead — 576 pixels is
	// far cheaper than the bookkeeping needed to track it properly.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (!bufferRef.current) {
			bufferRef.current = document.createElement("canvas");
		}
		const buffer = bufferRef.current;
		if (buffer.width !== cols || buffer.height !== rows) {
			buffer.width = cols;
			buffer.height = rows;
		}
		const bufferCtx = buffer.getContext("2d");
		if (!bufferCtx) return;

		const image = bufferCtx.createImageData(cols, rows);
		const [lo, hi] = domain;
		const span = hi - lo || 1;
		const n = Math.min(data.length, cols * rows);
		for (let i = 0; i < n; i++) {
			const v = Math.min(1, Math.max(0, (data[i] - lo) / span));
			const [r, g, b] = toRGB(v);
			const o = i * 4;
			image.data[o] = r;
			image.data[o + 1] = g;
			image.data[o + 2] = b;
			image.data[o + 3] = 255;
		}
		bufferCtx.putImageData(image, 0, 0);

		const cssH = height ?? size;
		const dpr = window.devicePixelRatio || 1;
		const pxW = Math.round(size * dpr);
		const pxH = Math.round(cssH * dpr);
		if (canvas.width !== pxW || canvas.height !== pxH) {
			canvas.width = pxW;
			canvas.height = pxH;
		}
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, pxW, pxH);
		ctx.drawImage(buffer, 0, 0, pxW, pxH);
	});

	return (
		<figure className="viz-pixel">
			<canvas
				ref={canvasRef}
				className="viz-pixel-canvas"
				style={{
					width: `${size}px`,
					height: `${height ?? size}px`,
					borderColor: accent,
				}}
				role="img"
				aria-label={title ?? label ?? "image"}
			/>
			{label && <figcaption className="viz-pixel-label">{label}</figcaption>}
		</figure>
	);
}
