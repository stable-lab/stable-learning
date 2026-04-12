import { useState } from 'react';

type ConsistencyModel = 'SC' | 'TSO' | 'Relaxed';

interface Reordering {
  from: string;
  to: string;
  allowed: Record<ConsistencyModel, boolean>;
}

const REORDERINGS: Reordering[] = [
  { from: 'Load → Load', to: 'Load → Load', allowed: { SC: false, TSO: false, Relaxed: true } },
  { from: 'Load → Store', to: 'Load → Store', allowed: { SC: false, TSO: false, Relaxed: true } },
  { from: 'Store → Store', to: 'Store → Store', allowed: { SC: false, TSO: false, Relaxed: true } },
  { from: 'Store → Load', to: 'Store → Load', allowed: { SC: false, TSO: true, Relaxed: true } },
];

const MODEL_INFO: Record<ConsistencyModel, { name: string; arch: string; desc: string }> = {
  SC: {
    name: 'Sequential Consistency',
    arch: 'Theoretical ideal',
    desc: 'No reordering allowed. All operations appear to execute in program order. Simplest to reason about, but most restrictive for hardware optimization.',
  },
  TSO: {
    name: 'Total Store Order',
    arch: 'x86, SPARC TSO',
    desc: 'Store→Load reordering allowed (store buffer). Stores can be delayed, but loads always see the latest value. Most programs "just work" under TSO.',
  },
  Relaxed: {
    name: 'Relaxed Consistency',
    arch: 'ARM, RISC-V (RVWMO)',
    desc: 'All reorderings allowed by default. Programmers must use explicit memory fences/barriers to enforce ordering. Maximum hardware freedom.',
  },
};

export default function MemoryOrderViz() {
  const [model, setModel] = useState<ConsistencyModel>('SC');

  const info = MODEL_INFO[model];

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(Object.keys(MODEL_INFO) as ConsistencyModel[]).map((m) => (
          <button
            key={m}
            onClick={() => setModel(m)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '0.25rem',
              border: `2px solid ${model === m ? '#3b82f6' : 'var(--sl-color-gray-5)'}`,
              background: model === m ? '#3b82f620' : 'var(--sl-color-bg)',
              cursor: 'pointer',
              fontWeight: model === m ? 'bold' : 'normal',
              color: 'inherit',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{info.name}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--sl-color-gray-3)' }}>{info.arch}</div>
        <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{info.desc}</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--sl-color-gray-5)' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Reordering</th>
            <th style={{ textAlign: 'center', padding: '0.5rem' }}>Allowed?</th>
          </tr>
        </thead>
        <tbody>
          {REORDERINGS.map((r, i) => {
            const allowed = r.allowed[model];
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--sl-color-gray-6)' }}>
                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{r.from}</td>
                <td style={{
                  textAlign: 'center', padding: '0.5rem', fontWeight: 'bold',
                  color: allowed ? '#ef4444' : '#22c55e',
                }}>
                  {allowed ? 'Yes (can reorder)' : 'No (preserved)'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--sl-color-gray-6)', borderRadius: '0.25rem', fontSize: '0.85rem' }}>
        <strong>Example — Store Buffer (Store→Load reorder):</strong>
        <pre style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
{`Core 0:           Core 1:
  x = 1             y = 1
  r0 = y            r1 = x

SC:      r0=0, r1=0 is IMPOSSIBLE
TSO:     r0=0, r1=0 is POSSIBLE (both stores buffered)
Relaxed: r0=0, r1=0 is POSSIBLE`}
        </pre>
      </div>
    </div>
  );
}
