import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// GAE-(γ,λ) calculator. Fixed 5-step episode with editable rewards / V.
// User slides λ and sees A_t curves morph between TD(0) and MC.

const T = 5;

export default function GAELambda() {
  const [gamma, setGamma] = useState(0.9);
  const [lambda, setLambda] = useState(0.95);
  const [rewards, setRewards] = useState<number[]>([1, 0, 0, 0, 2]);
  const [values, setValues] = useState<number[]>([0.8, 0.6, 0.4, 0.4, 1.0, 0]);  // includes V(s_T)=0

  const delta = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t < T; t++) {
      out.push(rewards[t] + gamma * values[t + 1] - values[t]);
    }
    return out;
  }, [rewards, values, gamma]);

  const gae = useMemo(() => {
    const out: number[] = Array(T).fill(0);
    for (let t = T - 1; t >= 0; t--) {
      out[t] = delta[t] + gamma * lambda * (out[t + 1] ?? 0);
    }
    return out;
  }, [delta, gamma, lambda]);

  const td0 = useMemo(() => delta.slice(), [delta]);
  const mc = useMemo(() => {
    const out: number[] = Array(T).fill(0);
    for (let t = T - 1; t >= 0; t--) {
      out[t] = delta[t] + gamma * 1 * (out[t + 1] ?? 0);
    }
    return out;
  }, [delta, gamma]);

  function setR(i: number, v: number) {
    setRewards((prev) => prev.map((x, j) => j === i ? v : x));
  }
  function setV(i: number, v: number) {
    setValues((prev) => prev.map((x, j) => j === i ? v : x));
  }

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          γ = {gamma.toFixed(2)}
          <input type="range" min="0.5" max="0.99" step="0.01" value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 130 }}>
          λ = {lambda.toFixed(2)}
          <input type="range" min="0" max="1" step="0.05" value={lambda}
            onChange={(e) => setLambda(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', marginBottom: 6 }}>
        <thead>
          <tr style={{ background: 'var(--sl-color-gray-6)' }}>
            <th style={th}>t</th>
            {Array.from({ length: T }, (_, i) => <th key={i} style={th}>t={i}</th>)}
            <th style={th}>terminal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}><strong>r<sub>t</sub></strong></td>
            {rewards.map((v, i) => (
              <td key={i} style={td}>
                <input type="number" step="0.1" value={v} onChange={(e) => setR(i, parseFloat(e.target.value) || 0)} style={inp} />
              </td>
            ))}
            <td style={td}>—</td>
          </tr>
          <tr>
            <td style={td}><strong>V(s<sub>t</sub>)</strong></td>
            {values.map((v, i) => (
              <td key={i} style={td}>
                <input type="number" step="0.1" value={v} onChange={(e) => setV(i, parseFloat(e.target.value) || 0)} style={inp} />
              </td>
            ))}
          </tr>
          <tr>
            <td style={td}><strong>δ<sub>t</sub></strong></td>
            {delta.map((d, i) => <td key={i} style={td}>{d.toFixed(3)}</td>)}
            <td style={td}>—</td>
          </tr>
          <tr>
            <td style={td}><strong>Â<sub>t</sub></strong> @ λ</td>
            {gae.map((a, i) => <td key={i} style={{ ...td, fontWeight: 600 }}>{a.toFixed(3)}</td>)}
            <td style={td}>—</td>
          </tr>
        </tbody>
      </table>

      <Plot
        data={[
          { x: [0, 1, 2, 3, 4], y: td0, type: 'scatter', mode: 'lines+markers', name: 'λ = 0 (TD(0))', line: { color: '#ef4444' } },
          { x: [0, 1, 2, 3, 4], y: gae, type: 'scatter', mode: 'lines+markers', name: `λ = ${lambda.toFixed(2)} (current)`, line: { color: '#3b82f6', width: 3 } },
          { x: [0, 1, 2, 3, 4], y: mc, type: 'scatter', mode: 'lines+markers', name: 'λ = 1 (MC)', line: { color: '#22c55e' } },
        ]}
        layout={{
          title: 'Â_t under three values of λ',
          xaxis: { title: 't' },
          yaxis: { title: 'Â_t' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 260 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.3rem', opacity: 0.85 }}>
        Edit any reward or value to see the three curves recompute. Set V to be very wrong (e.g. all
        zeros) and notice how TD(0) propagates the bias while MC ignores V entirely.
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '3px 6px', textAlign: 'left' };
const td: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid var(--sl-color-gray-5)', fontFamily: 'monospace' };
const inp: React.CSSProperties = { width: 55, padding: '1px 2px', background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)', borderRadius: 3 };
