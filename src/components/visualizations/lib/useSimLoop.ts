import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fixed-rate simulation loop. While playing, calls `onTick(n)` once per
 * animation frame with the number of sim ticks elapsed at `ticksPerSecond`
 * (batched, so high rates don't spam React renders — do all n steps inside
 * onTick, then commit state once).
 */
export function useSimLoop(
	onTick: (ticks: number) => void,
	ticksPerSecond: number,
) {
	const [playing, setPlaying] = useState(false);
	const rafId = useRef(0);
	const lastT = useRef(0);
	const acc = useRef(0);
	const tickCb = useRef(onTick);
	tickCb.current = onTick;
	const rate = useRef(ticksPerSecond);
	rate.current = ticksPerSecond;

	useEffect(() => {
		if (!playing) return;
		lastT.current = performance.now();
		acc.current = 0;
		const frame = (now: number) => {
			// Cap dt so a background tab doesn't fast-forward the sim on return.
			const dt = Math.min(0.25, (now - lastT.current) / 1000);
			lastT.current = now;
			acc.current += dt * rate.current;
			const n = Math.floor(acc.current);
			if (n > 0) {
				acc.current -= n;
				tickCb.current(Math.min(n, 2048));
			}
			rafId.current = requestAnimationFrame(frame);
		};
		rafId.current = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(rafId.current);
	}, [playing]);

	const toggle = useCallback(() => setPlaying((p) => !p), []);
	return { playing, setPlaying, toggle };
}
