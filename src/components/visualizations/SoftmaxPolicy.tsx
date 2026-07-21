import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// Interactive softmax policy: user sets logits and temperature, watches the
// resulting distribution. Teaches what a parameterized stochastic policy
// looks like in practice (especially for LLM-style action spaces).

export default function SoftmaxPolicy() {
  const [logits, setLogits] = useState<number[]>([0.5, 1.2, -0.3, 0.8, 0.0]);
  const [tau, setTau] = useState(1.0);

  function setLogit(i: number, v: number) {
    setLogits((p) => p.map((x, j) => j === i ? v : x));
  }

  const probs = useMemo(() => {
    const scaled = logits.map((z) => z / Math.max(0.01, tau));
    const m = Math.max(...scaled);
    const exps = scaled.map((z) => Math.exp(z - m));
    const Z = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / Z);
  }, [logits, tau]);

  const entropy = useMemo(() => -probs.reduce((s, p) => s + (p > 0 ? p * Math.log(p) : 0), 0), [probs]);
  const labels = ['a₀', 'a₁', 'a₂', 'a₃', 'a₄'];

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <label>
          Temperature τ = {tau.toFixed(2)}
          <input type="range" min="0.1" max="3" step="0.05" value={tau}
            onChange={(e) => setTau(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: '0.5rem' }}>
        {logits.map((v, i) => (
          <label key={i} style={{ fontSize: '0.78rem' }}>
            logit {labels[i]} = {v.toFixed(2)}
            <input type="range" min="-2" max="2" step="0.05" value={v}
              onChange={(e) => setLogit(i, parseFloat(e.target.value))} style={{ width: '100%' }} />
          </label>
        ))}
      </div>

      <Plot
        data={[
          { x: labels, y: probs, type: 'bar', marker: { color: '#3b82f6' }, text: probs.map((p) => p.toFixed(3)), textposition: 'auto' },
        ]}
        layout={{
          title: `π(a|s) = softmax(z/τ);  H(π) = ${entropy.toFixed(3)} nats`,
          yaxis: { range: [0, 1], title: 'probability' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 240 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.3rem', opacity: 0.85 }}>
        Push τ → 0 to collapse to a deterministic argmax; push τ → ∞ to recover a uniform random policy.
        The entropy H(π) goes to 0 and ln 5 ≈ 1.609 at those extremes.
      </div>
    </div>
  );
}
