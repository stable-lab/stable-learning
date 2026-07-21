import { useMemo, useState } from 'react';

// Apply MSI transitions to 3 cores' state for a chosen line. User picks
// operations from a dropdown; we show the resulting state vector and the
// bus message issued.

type State = 'I' | 'S' | 'M';

type Op = { kind: 'PrRd' | 'PrWr'; core: number };

function applyOp(states: State[], op: Op): { next: State[]; bus: string[] } {
  const next = states.slice();
  const bus: string[] = [];
  const c = op.core;
  const cur = next[c];
  if (op.kind === 'PrRd') {
    if (cur === 'M' || cur === 'S') {
      bus.push(`Core ${c} read hit (${cur})`);
    } else {
      // I → issue BusRd
      bus.push(`Core ${c} BusRd`);
      // any other core in M flushes
      let othersHaveCopy = false;
      for (let i = 0; i < next.length; i++) {
        if (i === c) continue;
        if (next[i] === 'M') {
          next[i] = 'S';
          bus.push(`Core ${i} flush (M→S)`);
          othersHaveCopy = true;
        } else if (next[i] === 'S') {
          othersHaveCopy = true;
        }
      }
      next[c] = 'S';
    }
  } else {
    // PrWr
    if (cur === 'M') {
      bus.push(`Core ${c} write hit (M)`);
    } else if (cur === 'S') {
      bus.push(`Core ${c} BusUpgr → invalidate others`);
      for (let i = 0; i < next.length; i++) {
        if (i === c) continue;
        if (next[i] === 'S') { next[i] = 'I'; bus.push(`Core ${i}: S→I`); }
      }
      next[c] = 'M';
    } else {
      // I → BusRdX
      bus.push(`Core ${c} BusRdX → invalidate others`);
      for (let i = 0; i < next.length; i++) {
        if (i === c) continue;
        if (next[i] === 'M') { next[i] = 'I'; bus.push(`Core ${i} flush + I`); }
        else if (next[i] === 'S') { next[i] = 'I'; bus.push(`Core ${i}: S→I`); }
      }
      next[c] = 'M';
    }
  }
  return { next, bus };
}

export default function MSIWalker() {
  const [states, setStates] = useState<State[]>(['I', 'I', 'I']);
  const [history, setHistory] = useState<{ op: Op; bus: string[] }[]>([]);
  const [op, setOp] = useState<Op>({ kind: 'PrRd', core: 0 });

  function doOp() {
    const { next, bus } = applyOp(states, op);
    setStates(next);
    setHistory((h) => [...h, { op, bus }]);
  }
  function reset() { setStates(['I', 'I', 'I']); setHistory([]); }

  // sanity: count Ms
  const numM = states.filter((s) => s === 'M').length;
  const invariantOK = numM <= 1 && (numM === 0 || !states.includes('S'));

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
        <select value={op.kind} onChange={(e) => setOp({ ...op, kind: e.target.value as 'PrRd' | 'PrWr' })}
          style={{ padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
          <option value="PrRd">PrRd (read)</option>
          <option value="PrWr">PrWr (write)</option>
        </select>
        <span>by</span>
        <select value={op.core} onChange={(e) => setOp({ ...op, core: parseInt(e.target.value) })}
          style={{ padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
          {[0, 1, 2].map((c) => <option key={c} value={c}>Core {c}</option>)}
        </select>
        <button onClick={doOp} style={{ ...btn, background: '#3b82f6', color: 'white', border: 'none' }}>Apply ▶</button>
        <button onClick={reset} style={btn}>Reset</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '0.5rem' }}>
        {states.map((s, i) => (
          <div key={i} style={{
            padding: '0.6rem', textAlign: 'center', borderRadius: 4,
            background: s === 'M' ? 'rgba(239,68,68,0.2)' : s === 'S' ? 'rgba(59,130,246,0.2)' : 'var(--sl-color-gray-6)',
            border: '1px solid var(--sl-color-gray-5)',
          }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>Core {i}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'monospace' }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0.4rem 0.6rem', borderRadius: 4, fontSize: '0.82rem',
        background: invariantOK ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.18)' }}>
        Invariant: at most one M, and if any M then no S elsewhere. <strong>{invariantOK ? 'holds ✓' : 'VIOLATED ✗ (bug in the model — please report)'}</strong>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Bus history</div>
        <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.4rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.76rem', maxHeight: 150, overflowY: 'auto' }}>
          {history.length === 0 ? <span style={{ opacity: 0.5 }}>Apply operations to populate the log.</span>
            : history.map((h, i) => (
              <div key={i}>
                {String(i + 1).padStart(2, ' ')}. {h.op.kind}(Core {h.op.core}): {h.bus.join(' | ')}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { padding: '0.3rem 0.7rem', border: '1px solid var(--sl-color-gray-5)', borderRadius: 4, background: 'var(--sl-color-bg)', cursor: 'pointer', fontSize: '0.84rem', color: 'inherit' };
