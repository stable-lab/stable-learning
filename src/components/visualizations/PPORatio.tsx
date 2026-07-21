import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// User picks π_old and π_new for a single action; we plot the probability
// ratio r = π_new / π_old as it sweeps along an axis. Visualizes when r
// enters the clip region.

export default function PPORatio() {
  const [piOld, setPiOld] = useState(0.2);
  const [piNew, setPiNew] = useState(0.24);
  const [eps, setEps] = useState(0.2);

  const r = piNew / Math.max(1e-9, piOld);

  const x = useMemo(() => Array.from({ length: 100 }, (_, i) => (i / 99) * 0.5), []);
  const yRatio = useMemo(() => x.map((p) => p / Math.max(1e-9, piOld)), [x, piOld]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          π_old = {piOld.toFixed(3)}
          <input type="range" min="0.02" max="0.5" step="0.01" value={piOld}
            onChange={(e) => setPiOld(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          π_new = {piNew.toFixed(3)}
          <input type="range" min="0.0" max="0.5" step="0.005" value={piNew}
            onChange={(e) => setPiNew(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          ε = {eps.toFixed(2)}
          <input type="range" min="0.05" max="0.5" step="0.05" value={eps}
            onChange={(e) => setEps(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.5rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.84rem', marginBottom: '0.5rem' }}>
        r = π_new / π_old = {piNew.toFixed(3)} / {piOld.toFixed(3)} = <strong>{r.toFixed(3)}</strong>
        {r > 1 + eps && <span style={{ color: '#ef4444' }}> &nbsp; (above 1+ε = {(1 + eps).toFixed(2)} — CLIPPED for A&gt;0)</span>}
        {r < 1 - eps && <span style={{ color: '#ef4444' }}> &nbsp; (below 1−ε = {(1 - eps).toFixed(2)} — CLIPPED for A&lt;0)</span>}
        {r >= 1 - eps && r <= 1 + eps && <span style={{ color: '#22c55e' }}> &nbsp; (inside trust region)</span>}
      </div>

      <Plot
        data={[
          { x, y: yRatio, type: 'scatter', mode: 'lines', name: 'r = π/π_old', line: { color: '#3b82f6' } },
          { x: [piNew], y: [r], mode: 'markers', name: 'current', marker: { color: '#ef4444', size: 11, symbol: 'star' } },
        ]}
        layout={{
          title: 'Probability ratio r(θ) as π changes',
          xaxis: { title: 'π_θ(a|s)' },
          yaxis: { title: 'r(θ)' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          shapes: [
            { type: 'rect', x0: 0, x1: 0.5, y0: 1 - eps, y1: 1 + eps, fillcolor: 'rgba(34,197,94,0.1)', line: { width: 0 } },
            { type: 'line', x0: 0, x1: 0.5, y0: 1, y1: 1, line: { color: '#94a3b8', width: 1, dash: 'dash' } },
          ],
        }}
        useResizeHandler
        style={{ width: '100%', height: 250 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.3rem', opacity: 0.85 }}>
        Green band = trust region [1−ε, 1+ε]. Slide π_new and watch the star cross the band edges —
        the moment it does, PPO's gradient on this sample goes to zero.
      </div>
    </div>
  );
}
