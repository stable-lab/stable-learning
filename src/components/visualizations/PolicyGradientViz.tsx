import { useState, useMemo } from 'react';
import Plot from './LazyPlot';

// Non-convex objective with multiple optima and a saddle region
// J(θ1, θ2) = mixture of Gaussians + sinusoidal ripples
function objective(x: number, y: number): number {
  // Global optimum near (2.5, 1.5)
  const g1 = 3.0 * Math.exp(-0.3 * ((x - 2.5) ** 2 + (y - 1.5) ** 2));
  // Local optimum near (-1, -1)
  const g2 = 2.0 * Math.exp(-0.5 * ((x + 1) ** 2 + (y + 1) ** 2));
  // Local optimum near (-1.5, 2)
  const g3 = 1.5 * Math.exp(-0.4 * ((x + 1.5) ** 2 + (y - 2) ** 2));
  // Sinusoidal ripples to create saddle-like regions
  const ripple = 0.3 * Math.sin(1.5 * x) * Math.cos(1.5 * y);
  return g1 + g2 + g3 + ripple;
}

// Numerical gradient via finite differences
function gradient(x: number, y: number): [number, number] {
  const h = 1e-4;
  const dx = (objective(x + h, y) - objective(x - h, y)) / (2 * h);
  const dy = (objective(x, y + h) - objective(x, y - h)) / (2 * h);
  return [dx, dy];
}

const STARTS: Record<string, { x: number; y: number; label: string }> = {
  A: { x: -2.5, y: -2, label: 'Bottom-left (near local optimum)' },
  B: { x: 0, y: 0, label: 'Center (saddle region)' },
  C: { x: 3.5, y: -1.5, label: 'Bottom-right (near global optimum)' },
};

export default function PolicyGradientViz() {
  const [lr, setLr] = useState(0.8);
  const [step, setStep] = useState(0);
  const [startKey, setStartKey] = useState<keyof typeof STARTS>('A');
  const [noisy, setNoisy] = useState(false);

  const landscape = useMemo(() => {
    const n = 60;
    const x = Array.from({ length: n }, (_, i) => -3.5 + (i * 7) / (n - 1));
    const y = Array.from({ length: n }, (_, i) => -3 + (i * 6) / (n - 1));
    const z = y.map((yi) => x.map((xi) => objective(xi, yi)));
    return { x, y, z };
  }, []);

  // Simulate gradient ascent with optional stochastic noise
  const trajectory = useMemo(() => {
    // Use a seeded pseudo-random for reproducible noise
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed / 2147483647) * 2 - 1; // uniform in [-1, 1]
    };

    const start = STARTS[startKey];
    const path = [{ x: start.x, y: start.y }];
    const effectiveLr = lr * 0.15;

    for (let i = 0; i < 30; i++) {
      const last = path[path.length - 1];
      const [gx, gy] = gradient(last.x, last.y);

      // Add noise to simulate stochastic gradient estimation
      const noiseScale = noisy ? 0.6 : 0;
      const nx = gx + noiseScale * rand();
      const ny = gy + noiseScale * rand();

      path.push({
        x: Math.max(-3.5, Math.min(3.5, last.x + effectiveLr * nx)),
        y: Math.max(-3, Math.min(3, last.y + effectiveLr * ny)),
      });
    }
    return path;
  }, [lr, startKey, noisy]);

  const visiblePath = trajectory.slice(0, step + 1);
  const current = visiblePath[visiblePath.length - 1];
  const currentJ = objective(current.x, current.y);

  return (
    <div className="plotly-viz">
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ flex: '1', minWidth: '200px' }}>
          Learning rate: {(lr * 0.15).toFixed(3)}
          <input type="range" min="0.2" max="3" step="0.1" value={lr}
            onChange={(e) => { setLr(parseFloat(e.target.value)); setStep(0); }} />
        </label>
        <label style={{ flex: '1', minWidth: '200px' }}>
          Step: {step} / 30
          <input type="range" min="0" max="30" step="1" value={step}
            onChange={(e) => setStep(parseInt(e.target.value))} />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <span style={{ fontWeight: 'bold' }}>Starting point:</span>
        {Object.entries(STARTS).map(([key, { label }]) => (
          <label key={key} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input type="radio" name="start" value={key} checked={startKey === key}
              onChange={() => { setStartKey(key as keyof typeof STARTS); setStep(0); }}
              style={{ marginRight: '0.5rem' }} />
            {key}: {label}
          </label>
        ))}
      </div>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <label style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={noisy}
            onChange={(e) => { setNoisy(e.target.checked); setStep(0); }}
            style={{ marginRight: '0.25rem' }} />
          Stochastic gradient (add noise to simulate sampling variance)
        </label>
      </div>
      <Plot
        data={[
          {
            ...landscape,
            type: 'contour',
            colorscale: 'Viridis',
            showscale: false,
            contours: { coloring: 'heatmap' },
            opacity: 0.7,
          },
          {
            x: visiblePath.map((p) => p.x),
            y: visiblePath.map((p) => p.y),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Gradient path',
            marker: { color: '#ef4444', size: 5 },
            line: { color: '#ef4444', width: 2 },
          },
          {
            x: [current.x],
            y: [current.y],
            type: 'scatter',
            mode: 'markers',
            name: `Current θ (J=${currentJ.toFixed(2)})`,
            marker: { color: '#ffffff', size: 12, line: { color: '#ef4444', width: 2 } },
          },
          {
            x: [2.5],
            y: [1.5],
            type: 'scatter',
            mode: 'markers',
            name: 'Global optimum',
            marker: { color: '#22c55e', size: 14, symbol: 'star' },
          },
        ]}
        layout={{
          title: 'Policy Gradient on Non-Convex J(θ)',
          xaxis: { title: 'θ₁', range: [-3.5, 3.5] },
          yaxis: { title: 'θ₂', range: [-3, 3] },
          autosize: true,
          margin: { t: 40, r: 20, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: '420px' }}
        config={{ displayModeBar: false }}
      />
    </div>
  );
}
