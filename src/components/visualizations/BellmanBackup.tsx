import { useMemo, useState } from 'react';

// Tiny 5-state chain MDP, demonstrating value iteration:
//   s0 - s1 - s2 - s3 - s4(terminal, reward = +1)
// Actions: left/right. Step cost = 0. γ adjustable.
// We show V_k(s) for k = 0..n as the user advances "iteration k".

const N = 5;
const TERMINAL = N - 1;

function bellmanBackup(V: number[], gamma: number): number[] {
  const next = V.slice();
  for (let s = 0; s < N; s++) {
    if (s === TERMINAL) {
      next[s] = 0; // by convention V(terminal) = 0
      continue;
    }
    // r(s, a, s') = 1 if s' == TERMINAL else 0
    const left = s === 0 ? V[s] : V[s - 1];
    const right = s + 1 === TERMINAL ? 1 + gamma * 0 : 0 + gamma * V[s + 1];
    const leftVal = 0 + gamma * left;
    next[s] = Math.max(leftVal, right);
  }
  return next;
}

export default function BellmanBackup() {
  const [gamma, setGamma] = useState(0.9);
  const [k, setK] = useState(0);

  const trajectory = useMemo(() => {
    const out: number[][] = [Array(N).fill(0)];
    for (let i = 0; i < 12; i++) out.push(bellmanBackup(out[out.length - 1], gamma));
    return out;
  }, [gamma]);

  const V = trajectory[Math.min(k, trajectory.length - 1)];

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <label style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}>
          γ = {gamma.toFixed(2)}
          <input type="range" min="0" max="0.99" step="0.01" value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}>
          Iteration k = {k}
          <input type="range" min="0" max="12" step="1" value={k}
            onChange={(e) => setK(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)`, gap: 4 }}>
        {V.map((v, s) => {
          const terminal = s === TERMINAL;
          const intensity = Math.min(1, v / 1);
          const bg = terminal
            ? 'rgba(34,197,94,0.4)'
            : `rgba(59,130,246,${0.08 + 0.5 * intensity})`;
          return (
            <div key={s} style={{
              padding: '0.6rem 0.3rem', textAlign: 'center',
              border: '1px solid var(--sl-color-gray-5)', borderRadius: 4,
              background: bg, fontFamily: 'monospace',
            }}>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>s{s}{terminal ? ' (term, +1)' : ''}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{v.toFixed(3)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '0.82rem', marginTop: '0.6rem', opacity: 0.85 }}>
        Each backup applies <code>V<sub>k+1</sub>(s) = max<sub>a</sub> Σ P(s′|s,a)[r + γ V<sub>k</sub>(s′)]</code>.
        Watch the reward at s4 propagate one cell per iteration — that's how far information travels per pass.
      </div>
    </div>
  );
}
