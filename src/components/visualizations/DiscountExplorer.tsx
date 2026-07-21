import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// Pure return-of-rewards explorer. User edits a reward sequence; we show
// G_t under three γ values and the "effective horizon" 1/(1−γ).

export default function DiscountExplorer() {
  const [gamma, setGamma] = useState(0.9);
  const [rewards, setRewards] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

  function setR(i: number, v: number) {
    setRewards((prev) => prev.map((x, j) => j === i ? v : x));
  }
  function addStep() { setRewards((prev) => [...prev, 0]); }
  function removeStep() { setRewards((prev) => prev.length > 1 ? prev.slice(0, -1) : prev); }

  const series = useMemo(() => {
    const gs = [0.5, gamma, 0.99];
    return gs.map((g) => {
      const G: number[] = [];
      for (let t = 0; t < rewards.length; t++) {
        let s = 0;
        for (let k = t; k < rewards.length; k++) s += Math.pow(g, k - t) * rewards[k];
        G.push(s);
      }
      return { gamma: g, G };
    });
  }, [rewards, gamma]);

  const horizon = 1 / Math.max(1e-9, 1 - gamma);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 200 }}>
          γ (middle curve) = {gamma.toFixed(2)} &nbsp; (effective horizon ≈ {horizon.toFixed(1)} steps)
          <input type="range" min="0" max="0.99" step="0.01" value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <button onClick={addStep} style={btn}>+ step</button>
        <button onClick={removeStep} style={btn}>− step</button>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 6 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--sl-color-gray-6)' }}>
              <th style={th}>t</th>
              {rewards.map((_, i) => <th key={i} style={th}>{i}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><strong>r<sub>t</sub></strong></td>
              {rewards.map((v, i) => (
                <td key={i} style={td}>
                  <input type="number" step="0.5" value={v}
                    onChange={(e) => setR(i, parseFloat(e.target.value) || 0)}
                    style={inp} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <Plot
        data={series.map((s, i) => ({
          x: rewards.map((_, k) => k),
          y: s.G,
          type: 'scatter',
          mode: 'lines+markers',
          name: `G_t @ γ=${s.gamma}`,
          line: { color: ['#ef4444', '#3b82f6', '#22c55e'][i], width: i === 1 ? 3 : 2 },
        }))}
        layout={{
          title: 'Discounted return G_t along the trajectory',
          xaxis: { title: 't' },
          yaxis: { title: 'G_t' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 240 }}
        config={{ displayModeBar: false }}
      />
    </div>
  );
}

const th: React.CSSProperties = { padding: '3px 6px', textAlign: 'center' };
const td: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid var(--sl-color-gray-5)', fontFamily: 'monospace' };
const inp: React.CSSProperties = { width: 55, padding: '1px 2px', background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)', borderRadius: 3, textAlign: 'center' };
const btn: React.CSSProperties = { padding: '0.3rem 0.6rem', border: '1px solid var(--sl-color-gray-5)', borderRadius: 4, background: 'var(--sl-color-bg)', cursor: 'pointer', fontSize: '0.82rem', color: 'inherit' };
