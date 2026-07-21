import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// A worked-numbers demo: a 2-action bandit with rewards r ~ N(μ_a, σ²).
// Compare REINFORCE gradient variance with and without a baseline = V(s)
// across N samples. Show actual numerical gradient samples and their std.

function gaussian(rand: () => number, mu: number, sigma: number) {
  // Box-Muller
  const u = Math.max(1e-12, rand());
  const v = rand();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export default function BaselineVariance() {
  const [mu0, setMu0] = useState(8);
  const [mu1, setMu1] = useState(10);
  const [sigma, setSigma] = useState(2);
  const [N, setN] = useState(200);

  const data = useMemo(() => {
    let seed = 1234;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    // policy: π(a=1) = 0.6, π(a=0) = 0.4
    const p1 = 0.6;
    // V(s) under this policy = 0.6*mu1 + 0.4*mu0
    const V = p1 * mu1 + (1 - p1) * mu0;
    // score function for softmax over 2 actions with logit θ ∈ ℝ giving p1 = σ(θ)
    // ∇θ log π(a=1) = (1 - p1)  ;  ∇θ log π(a=0) = -p1
    const score = (a: number) => (a === 1 ? 1 - p1 : -p1);

    const grad_raw: number[] = [];
    const grad_base: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = rand() < p1 ? 1 : 0;
      const r = gaussian(rand, a === 1 ? mu1 : mu0, sigma);
      const s = score(a);
      grad_raw.push(s * r);
      grad_base.push(s * (r - V));
    }
    function mean(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
    function std(xs: number[]) {
      const m = mean(xs);
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    }
    return {
      V,
      grad_raw, grad_base,
      raw_mean: mean(grad_raw), raw_std: std(grad_raw),
      base_mean: mean(grad_base), base_std: std(grad_base),
    };
  }, [mu0, mu1, sigma, N]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          μ₀ (action 0) = {mu0}
          <input type="range" min="-5" max="15" step="0.5" value={mu0}
            onChange={(e) => setMu0(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          μ₁ (action 1) = {mu1}
          <input type="range" min="-5" max="15" step="0.5" value={mu1}
            onChange={(e) => setMu1(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          σ (noise) = {sigma.toFixed(1)}
          <input type="range" min="0" max="6" step="0.1" value={sigma}
            onChange={(e) => setSigma(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          samples N = {N}
          <input type="range" min="20" max="2000" step="20" value={N}
            onChange={(e) => setN(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'var(--sl-color-gray-6)', borderRadius: 4, marginBottom: '0.5rem', fontFamily: 'monospace' }}>
        Policy π(a=1) = 0.6, V(s) = 0.6·μ₁ + 0.4·μ₀ = {data.V.toFixed(2)}
        <br />
        ∇θ J est (no baseline): mean = {data.raw_mean.toFixed(3)}, std = {data.raw_std.toFixed(3)}
        <br />
        ∇θ J est (with V baseline): mean = {data.base_mean.toFixed(3)}, std = {data.base_std.toFixed(3)}
        <br />
        <strong>Variance reduction: {(data.raw_std / Math.max(1e-9, data.base_std)).toFixed(2)}×</strong>
      </div>

      <Plot
        data={[
          { x: data.grad_raw, type: 'histogram', name: 'No baseline', opacity: 0.6, marker: { color: '#ef4444' } },
          { x: data.grad_base, type: 'histogram', name: 'With V(s) baseline', opacity: 0.6, marker: { color: '#3b82f6' } },
        ]}
        layout={{
          title: 'Distribution of single-sample gradient estimates',
          barmode: 'overlay',
          xaxis: { title: '∇θ log π(a|s) · advantage' },
          yaxis: { title: 'count' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.15, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 280 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.4rem', opacity: 0.85 }}>
        Both histograms have the same mean (unbiasedness — verify with the readout above), but the blue
        one is tighter. Pull σ to 0 and the no-baseline gradient still has spread because the *return*
        differs between actions; the baseline absorbs that and isolates the action-specific signal.
      </div>
    </div>
  );
}
