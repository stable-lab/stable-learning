import { useState } from 'react';
import Plot from './LazyPlot';

export default function RewardCurve({ gamma = 0.99 }: { gamma?: number }) {
  const [discountFactor, setDiscountFactor] = useState(gamma);

  const steps = Array.from({ length: 50 }, (_, i) => i);
  const weights = steps.map((t) => Math.pow(discountFactor, t));
  const cumReturn = steps.map((_, i) =>
    weights.slice(0, i + 1).reduce((a, b) => a + b, 0)
  );

  return (
    <div className="plotly-viz">
      <label>
        γ = {discountFactor.toFixed(2)}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={discountFactor}
          onChange={(e) => setDiscountFactor(parseFloat(e.target.value))}
        />
      </label>
      <Plot
        data={[
          {
            x: steps,
            y: weights,
            type: 'scatter',
            mode: 'lines',
            name: 'γ^t (discount weight)',
            line: { color: '#3b82f6', width: 2 },
          },
          {
            x: steps,
            y: cumReturn,
            type: 'scatter',
            mode: 'lines',
            name: 'Cumulative return (r=1)',
            line: { color: '#f59e0b', width: 2, dash: 'dash' },
          },
        ]}
        layout={{
          title: 'Discount Factor Effect on Return',
          xaxis: { title: 'Time Step t' },
          yaxis: { title: 'Value' },
          autosize: true,
          margin: { t: 40, r: 20, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.15, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: '350px' }}
        config={{ displayModeBar: false }}
      />
    </div>
  );
}
