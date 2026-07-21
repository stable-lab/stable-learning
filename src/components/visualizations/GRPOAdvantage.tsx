import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// User edits a list of rewards within a group; the widget shows the
// resulting GRPO advantages (mean-normalized + std-normalized) in real time.

const DEFAULT = [0.9, 0.4, 0.7, 0.2, 0.6];

export default function GRPOAdvantage() {
  const [rewards, setRewards] = useState<number[]>(DEFAULT);

  function setR(i: number, v: number) { setRewards((p) => p.map((x, j) => j === i ? v : x)); }
  function addOutput() { setRewards((p) => [...p, 0.5]); }
  function removeOutput() { setRewards((p) => p.length > 2 ? p.slice(0, -1) : p); }

  const { mu, sigma, adv } = useMemo(() => {
    const G = rewards.length;
    const mu = rewards.reduce((a, b) => a + b, 0) / G;
    const variance = rewards.reduce((s, r) => s + (r - mu) ** 2, 0) / G;
    const sigma = Math.sqrt(Math.max(1e-9, variance));
    const adv = rewards.map((r) => (r - mu) / sigma);
    return { mu, sigma, adv };
  }, [rewards]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <strong>Group rewards</strong> &nbsp;
        <button onClick={addOutput} style={btn}>+ output</button>{' '}
        <button onClick={removeOutput} style={btn}>− output</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--sl-color-gray-6)' }}>
              <th style={th}>i</th>
              {rewards.map((_, i) => <th key={i} style={th}>y{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><strong>r<sub>i</sub></strong></td>
              {rewards.map((v, i) => (
                <td key={i} style={td}>
                  <input type="number" min={0} max={1} step={0.05} value={v}
                    onChange={(e) => setR(i, parseFloat(e.target.value) || 0)} style={inp} />
                </td>
              ))}
            </tr>
            <tr>
              <td style={td}><strong>Â<sub>i</sub></strong></td>
              {adv.map((a, i) => (
                <td key={i} style={{ ...td, color: a > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{a.toFixed(2)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', fontFamily: 'monospace' }}>
        μ = {mu.toFixed(3)}, σ = {sigma.toFixed(3)} &nbsp;|&nbsp; <strong>Σ Â<sub>i</sub> = 0</strong> (always)
      </div>
      <Plot
        data={[
          { x: rewards.map((_, i) => `y${i + 1}`), y: adv, type: 'bar', marker: { color: adv.map((a) => a > 0 ? '#22c55e' : '#ef4444') }, text: adv.map((a) => a.toFixed(2)), textposition: 'auto' },
        ]}
        layout={{
          title: 'Group-relative advantages',
          yaxis: { title: 'Â_i', zeroline: true },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 230 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.3rem', opacity: 0.85 }}>
        Set all rewards equal — Â collapses to 0 (no signal). Set one reward dramatically higher than
        the rest — its Â approaches √(G−1)/√G; the others share the negative budget proportionally.
        The std normalization is what keeps advantage magnitudes comparable across easy vs hard prompts.
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '3px 6px', textAlign: 'center' };
const td: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid var(--sl-color-gray-5)', fontFamily: 'monospace', textAlign: 'center' };
const inp: React.CSSProperties = { width: 60, padding: '1px 2px', background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)', borderRadius: 3, textAlign: 'center' };
const btn: React.CSSProperties = { padding: '0.2rem 0.6rem', border: '1px solid var(--sl-color-gray-5)', borderRadius: 4, background: 'var(--sl-color-bg)', cursor: 'pointer', fontSize: '0.82rem', color: 'inherit' };
