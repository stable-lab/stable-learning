import { useState, useMemo } from 'react';
import Plot from './LazyPlot';

export default function GRPOComparison() {
  const [numSamples, setNumSamples] = useState(8);
  const [seed, setSeed] = useState(42);

  // Deterministic pseudo-random for reproducibility
  function seededRandom(s: number) {
    let x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  }

  const data = useMemo(() => {
    // Generate group of rewards for one prompt
    const rewards = Array.from({ length: numSamples }, (_, i) =>
      seededRandom(seed + i * 7.3) * 10 - 2 // range roughly [-2, 8]
    );

    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const std = Math.sqrt(
      rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / rewards.length
    );

    // GRPO advantages: normalized within the group
    const grpoAdvantages = rewards.map((r) => (std > 0 ? (r - mean) / std : 0));

    // PPO-style: would need a learned value baseline (simulate as global mean)
    const globalBaseline = 3; // pretend V(s) ≈ 3
    const ppoAdvantages = rewards.map((r) => r - globalBaseline);

    return {
      indices: Array.from({ length: numSamples }, (_, i) => `Output ${i + 1}`),
      rewards,
      grpoAdvantages,
      ppoAdvantages,
      mean,
      std,
    };
  }, [numSamples, seed]);

  return (
    <div className="plotly-viz">
      <label>
        Group size (G): {numSamples}
        <input
          type="range"
          min="4"
          max="16"
          step="1"
          value={numSamples}
          onChange={(e) => setNumSamples(parseInt(e.target.value))}
        />
      </label>
      <label>
        Resample:
        <button
          onClick={() => setSeed((s) => s + 1)}
          style={{
            marginLeft: '0.5rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '0.25rem',
            border: '1px solid var(--sl-color-gray-5)',
            background: 'var(--sl-color-bg)',
            cursor: 'pointer',
          }}
        >
          New group
        </button>
      </label>
      <Plot
        data={[
          {
            x: data.indices,
            y: data.rewards,
            type: 'bar',
            name: 'Reward',
            marker: { color: '#94a3b8' },
            yaxis: 'y',
          },
          {
            x: data.indices,
            y: data.grpoAdvantages,
            type: 'scatter',
            mode: 'lines+markers',
            name: 'GRPO advantage (group-normalized)',
            marker: { color: '#3b82f6', size: 8 },
            line: { color: '#3b82f6', width: 2 },
            yaxis: 'y2',
          },
          {
            x: data.indices,
            y: data.ppoAdvantages,
            type: 'scatter',
            mode: 'lines+markers',
            name: 'PPO advantage (V baseline)',
            marker: { color: '#f59e0b', size: 8 },
            line: { color: '#f59e0b', width: 2, dash: 'dash' },
            yaxis: 'y2',
          },
        ]}
        layout={{
          title: 'GRPO: Group-Relative vs. Value Baseline',
          xaxis: { title: 'Sampled Outputs' },
          yaxis: { title: 'Reward', side: 'left' },
          yaxis2: {
            title: 'Advantage',
            side: 'right',
            overlaying: 'y',
          },
          autosize: true,
          margin: { t: 40, r: 60, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.2, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          barmode: 'overlay',
        }}
        useResizeHandler
        style={{ width: '100%', height: '420px' }}
        config={{ displayModeBar: false }}
      />
      <p style={{ fontSize: '0.85rem', color: 'var(--sl-color-gray-3)', marginTop: '0.5rem' }}>
        Group mean: {data.mean.toFixed(2)} | Group std: {data.std.toFixed(2)} |
        GRPO normalizes advantages within each group, eliminating the need for a learned critic.
      </p>
    </div>
  );
}
