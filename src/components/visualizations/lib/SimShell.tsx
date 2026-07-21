import type { ReactNode } from "react";

export interface SpeedOption {
	label: string;
	value: number;
}

interface SimShellProps {
	title: string;
	playing: boolean;
	onToggle: () => void;
	onReset: () => void;
	onStep?: () => void;
	speed?: number;
	speeds?: SpeedOption[];
	onSpeed?: (v: number) => void;
	/** Small live metrics shown in the header row, e.g. episode count. */
	readouts?: { label: string; value: string; color?: string }[];
	children: ReactNode;
}

/**
 * Shared chrome for live simulations: title, play/pause/step/reset,
 * speed selector, readout chips. Body goes in children.
 */
export default function SimShell({
	title,
	playing,
	onToggle,
	onReset,
	onStep,
	speed,
	speeds,
	onSpeed,
	readouts,
	children,
}: SimShellProps) {
	return (
		<div className="viz-sim">
			<div className="viz-sim-header">
				<span className="viz-sim-title">{title}</span>
				<span className="viz-sim-spacer" />
				{speeds && onSpeed && (
					<span
						className="viz-speed"
						role="group"
						aria-label="simulation speed"
					>
						{speeds.map((s) => (
							<button
								key={s.value}
								type="button"
								className={`viz-speed-btn${speed === s.value ? " active" : ""}`}
								onClick={() => onSpeed(s.value)}
							>
								{s.label}
							</button>
						))}
					</span>
				)}
				{onStep && (
					<button
						type="button"
						className="viz-btn"
						onClick={onStep}
						disabled={playing}
					>
						Step
					</button>
				)}
				<button
					type="button"
					className="viz-btn viz-btn-primary"
					onClick={onToggle}
				>
					{playing ? "❚❚ Pause" : "▶ Run"}
				</button>
				<button type="button" className="viz-btn" onClick={onReset}>
					↺ Reset
				</button>
			</div>
			{readouts && readouts.length > 0 && (
				<div className="viz-readouts">
					{readouts.map((r) => (
						<span key={r.label} className="viz-chip">
							<span className="viz-chip-label">{r.label}</span>
							<span
								className="viz-chip-value"
								style={r.color ? { color: r.color } : undefined}
							>
								{r.value}
							</span>
						</span>
					))}
				</div>
			)}
			{children}
		</div>
	);
}
