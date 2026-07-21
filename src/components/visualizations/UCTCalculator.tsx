import { useMemo, useState } from 'react';

// User defines three child arms by (N, W). The widget computes UCT for each
// at a chosen parent visit count and exploration constant, and shows which
// arm gets picked. This lets readers play with the trade-off interactively.

type Arm = { N: number; W: number };
const initial: Arm[] = [
  { N: 6, W: 4.0 },
  { N: 3, W: 1.2 },
  { N: 1, W: 0.8 },
];

export default function UCTCalculator() {
  const [arms, setArms] = useState<Arm[]>(initial);
  const [c, setC] = useState(1.41);

  const parentN = useMemo(() => arms.reduce((s, a) => s + a.N, 0), [arms]);
  const scores = useMemo(() => arms.map((a) => {
    if (a.N === 0) return { mean: 0, explore: Infinity, total: Infinity };
    const mean = a.W / a.N;
    const explore = c * Math.sqrt(Math.log(Math.max(1, parentN)) / a.N);
    return { mean, explore, total: mean + explore };
  }), [arms, c, parentN]);

  const best = useMemo(() => {
    let bi = 0, bv = -Infinity;
    scores.forEach((s, i) => { if (s.total > bv) { bv = s.total; bi = i; } });
    return bi;
  }, [scores]);

  function setArm(i: number, field: 'N' | 'W', v: string) {
    const parsed = field === 'N' ? parseInt(v) : parseFloat(v);
    if (isNaN(parsed)) return;
    setArms((prev) => prev.map((a, j) => j === i ? { ...a, [field]: parsed } : a));
  }

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 200 }}>
          c (exploration constant) = {c.toFixed(2)}
          <input type="range" min="0" max="3" step="0.05" value={c}
            onChange={(e) => setC(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <div style={{ fontSize: '0.85rem' }}><strong>Parent N</strong> = {parentN} &nbsp; (sum of children visits)</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: 'var(--sl-color-gray-6)' }}>
            <th style={th}>Child</th>
            <th style={th}>Visits N</th>
            <th style={th}>Total reward W</th>
            <th style={th}>W/N (exploit)</th>
            <th style={th}>c·√(ln Nₚ/N) (explore)</th>
            <th style={th}>UCT</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((a, i) => (
            <tr key={i} style={{ background: i === best ? 'rgba(59,130,246,0.12)' : undefined }}>
              <td style={td}>{['A', 'B', 'C'][i]}{i === best && <strong> ← picked</strong>}</td>
              <td style={td}>
                <input type="number" min={0} step={1} value={a.N}
                  onChange={(e) => setArm(i, 'N', e.target.value)}
                  style={numInput} />
              </td>
              <td style={td}>
                <input type="number" step={0.1} value={a.W}
                  onChange={(e) => setArm(i, 'W', e.target.value)}
                  style={numInput} />
              </td>
              <td style={td}>{a.N > 0 ? scores[i].mean.toFixed(3) : '—'}</td>
              <td style={td}>{isFinite(scores[i].explore) ? scores[i].explore.toFixed(3) : '∞'}</td>
              <td style={{ ...td, fontWeight: 600 }}>{isFinite(scores[i].total) ? scores[i].total.toFixed(3) : '∞'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', padding: '0.5rem', borderRadius: 4, background: 'rgba(59,130,246,0.08)' }}>
        Edit N and W to match a scenario you care about. A child with N = 0 always has UCT = ∞ (forced first
        visit). Move c toward 0 to see the search collapse onto the highest mean; raise it past ~2 to see
        the under-sampled child take over.
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--sl-color-gray-5)' };
const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--sl-color-gray-5)' };
const numInput: React.CSSProperties = { width: 70, padding: '2px 4px', background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)', borderRadius: 3 };
