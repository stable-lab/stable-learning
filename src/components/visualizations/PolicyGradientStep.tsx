import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// 2-action policy parameterized by a single logit θ giving π(a=1)=σ(θ).
// User sets θ_old and a sample (a, R). We show the gradient step direction
// and magnitude, and re-plot the resulting policy distribution before/after.

function sigmoid(z: number) { return 1 / (1 + Math.exp(-z)); }

export default function PolicyGradientStep() {
  const [theta, setTheta] = useState(0.0);
  const [lr, setLr] = useState(0.5);
  const [action, setAction] = useState<0 | 1>(1);
  const [reward, setReward] = useState(2.0);

  const p1 = sigmoid(theta);
  const score = action === 1 ? (1 - p1) : -p1;
  const grad = score * reward;
  const thetaNew = theta + lr * grad;
  const p1New = sigmoid(thetaNew);

  const data = useMemo(() => ({
    pre: [1 - p1, p1],
    post: [1 - p1New, p1New],
  }), [p1, p1New]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          θ (logit) = {theta.toFixed(2)} &nbsp; → π(a=1) = {p1.toFixed(3)}
          <input type="range" min="-3" max="3" step="0.05" value={theta}
            onChange={(e) => setTheta(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          α (lr) = {lr.toFixed(2)}
          <input type="range" min="0.05" max="2" step="0.05" value={lr}
            onChange={(e) => setLr(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem' }}>action a
          <select value={action} onChange={(e) => setAction(parseInt(e.target.value) as 0 | 1)}
            style={{ marginLeft: 6, padding: 3, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            <option value={0}>0</option>
            <option value={1}>1</option>
          </select>
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          R (return) = {reward.toFixed(2)}
          <input type="range" min="-5" max="5" step="0.1" value={reward}
            onChange={(e) => setReward(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.5rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
        score = ∇θ log π(a={action}|s) = {score.toFixed(3)}<br />
        gradient ≈ score · R = {grad.toFixed(3)}<br />
        θ_new = θ + α·grad = {theta.toFixed(2)} + {lr.toFixed(2)}·{grad.toFixed(2)} = <strong>{thetaNew.toFixed(3)}</strong>
      </div>

      <Plot
        data={[
          { x: ['a=0', 'a=1'], y: data.pre, type: 'bar', name: 'π_old', marker: { color: '#94a3b8' } },
          { x: ['a=0', 'a=1'], y: data.post, type: 'bar', name: 'π_new', marker: { color: '#3b82f6' } },
        ]}
        layout={{
          barmode: 'group',
          title: 'Policy before vs after one REINFORCE update',
          yaxis: { range: [0, 1], title: 'probability' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 220 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.3rem', opacity: 0.85 }}>
        Pick action 1 with R &gt; 0 — π_new shifts probability *toward* action 1. Flip R to negative —
        it shifts away. This is the whole content of "increase the log-prob of actions weighted by their return."
      </div>
    </div>
  );
}
