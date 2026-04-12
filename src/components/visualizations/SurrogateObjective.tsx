import { useState, useMemo } from 'react';
import Plot from './LazyPlot';

export default function SurrogateObjective() {
  const [epsilon, setEpsilon] = useState(0.2);
  const [advantage, setAdvantage] = useState(1);

  const data = useMemo(() => {
    const ratios = Array.from({ length: 200 }, (_, i) => 0 + (i * 3) / 199);

    const unclipped = ratios.map((r) => r * advantage);
    const clipped = ratios.map((r) => {
      const clippedR = Math.min(Math.max(r, 1 - epsilon), 1 + epsilon);
      return Math.min(r * advantage, clippedR * advantage);
    });

    return { ratios, unclipped, clipped };
  }, [epsilon, advantage]);

  return (
    <div className="plotly-viz">
      <label>
        ε (clip range) = {epsilon.toFixed(2)}
        <input
          type="range"
          min="0.05"
          max="0.5"
          step="0.05"
          value={epsilon}
          onChange={(e) => setEpsilon(parseFloat(e.target.value))}
        />
      </label>
      <label>
        Advantage sign:
        <select
          value={advantage}
          onChange={(e) => setAdvantage(parseFloat(e.target.value))}
          style={{ marginLeft: '0.5rem' }}
        >
          <option value={1}>Positive (A &gt; 0)</option>
          <option value={-1}>Negative (A &lt; 0)</option>
        </select>
      </label>
      <Plot
        data={[
          {
            x: data.ratios,
            y: data.unclipped,
            type: 'scatter',
            mode: 'lines',
            name: 'Unclipped: r(θ)·A',
            line: { color: '#94a3b8', width: 2, dash: 'dash' },
          },
          {
            x: data.ratios,
            y: data.clipped,
            type: 'scatter',
            mode: 'lines',
            name: 'PPO clipped objective',
            line: { color: '#3b82f6', width: 3 },
          },
          {
            x: [1 - epsilon, 1 - epsilon],
            y: [Math.min(...data.clipped) - 0.3, Math.max(...data.clipped) + 0.3],
            type: 'scatter',
            mode: 'lines',
            name: `1-ε = ${(1 - epsilon).toFixed(2)}`,
            line: { color: '#ef4444', width: 1, dash: 'dot' },
            showlegend: false,
          },
          {
            x: [1 + epsilon, 1 + epsilon],
            y: [Math.min(...data.clipped) - 0.3, Math.max(...data.clipped) + 0.3],
            type: 'scatter',
            mode: 'lines',
            name: `1+ε = ${(1 + epsilon).toFixed(2)}`,
            line: { color: '#ef4444', width: 1, dash: 'dot' },
            showlegend: false,
          },
        ]}
        layout={{
          title: `PPO Clipped Objective (A ${advantage > 0 ? '> 0' : '< 0'})`,
          xaxis: { title: 'Probability Ratio r(θ)', range: [0, 3] },
          yaxis: { title: 'Objective' },
          autosize: true,
          margin: { t: 40, r: 20, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          shapes: [
            {
              type: 'rect',
              x0: 1 - epsilon,
              x1: 1 + epsilon,
              y0: Math.min(...data.clipped) - 0.5,
              y1: Math.max(...data.clipped) + 0.5,
              fillcolor: 'rgba(59,130,246,0.08)',
              line: { width: 0 },
            },
          ],
        }}
        useResizeHandler
        style={{ width: '100%', height: '400px' }}
        config={{ displayModeBar: false }}
      />
    </div>
  );
}
