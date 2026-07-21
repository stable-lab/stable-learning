import { useMemo, useState } from 'react';

// Enumerate all interleavings of two 2-instruction threads and report
// which final-register outcomes are reachable under SC. Lets students *see*
// that r0=r1=0 is impossible under SC for the canonical "store buffering" test.

type Op = { thread: 0 | 1; kind: 'st' | 'ld'; addr: 'x' | 'y'; val?: number; reg?: 'r0' | 'r1' };

const TESTS: Record<string, { name: string; thread0: Op[]; thread1: Op[]; description: string }> = {
  sb: {
    name: 'Store Buffering (SB)',
    description: 'Both threads write then read. SC forbids r0=r1=0.',
    thread0: [{ thread: 0, kind: 'st', addr: 'x', val: 1 }, { thread: 0, kind: 'ld', addr: 'y', reg: 'r0' }],
    thread1: [{ thread: 1, kind: 'st', addr: 'y', val: 1 }, { thread: 1, kind: 'ld', addr: 'x', reg: 'r1' }],
  },
  mp: {
    name: 'Message Passing (MP)',
    description: 'Thread 0 writes data then flag. Thread 1 reads flag then data. SC forbids r0=1, r1=0.',
    thread0: [{ thread: 0, kind: 'st', addr: 'x', val: 1 }, { thread: 0, kind: 'st', addr: 'y', val: 1 }],
    thread1: [{ thread: 1, kind: 'ld', addr: 'y', reg: 'r0' }, { thread: 1, kind: 'ld', addr: 'x', reg: 'r1' }],
  },
};

type State = { x: number; y: number; r0: number; r1: number };

function interleavings(a: Op[], b: Op[]): Op[][] {
  if (a.length === 0) return [b];
  if (b.length === 0) return [a];
  const left = interleavings(a.slice(1), b).map((rest) => [a[0], ...rest]);
  const right = interleavings(a, b.slice(1)).map((rest) => [b[0], ...rest]);
  return [...left, ...right];
}

function runInterleaving(ops: Op[]): State {
  const s: State = { x: 0, y: 0, r0: 0, r1: 0 };
  for (const op of ops) {
    if (op.kind === 'st') {
      if (op.addr === 'x') s.x = op.val!; else s.y = op.val!;
    } else {
      const v = op.addr === 'x' ? s.x : s.y;
      if (op.reg === 'r0') s.r0 = v; else s.r1 = v;
    }
  }
  return s;
}

export default function LitmusRunner() {
  const [test, setTest] = useState<keyof typeof TESTS>('sb');
  const t = TESTS[test];

  const result = useMemo(() => {
    const allInter = interleavings(t.thread0, t.thread1);
    const outcomes = new Map<string, number>();
    for (const inter of allInter) {
      const s = runInterleaving(inter);
      const key = `r0=${s.r0}, r1=${s.r1}`;
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    }
    return { interleavings: allInter.length, outcomes };
  }, [t]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        Test:
        <select value={test} onChange={(e) => setTest(e.target.value as keyof typeof TESTS)}
          style={{ marginLeft: 6, padding: 3, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
          {Object.entries(TESTS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
      </div>
      <div style={{ fontSize: '0.82rem', opacity: 0.85, marginBottom: '0.5rem' }}>{t.description}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Code title="Thread 0" code={t.thread0.map(opStr).join('\n')} />
        <Code title="Thread 1" code={t.thread1.map(opStr).join('\n')} />
      </div>

      <div style={{ marginTop: '0.6rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
          {result.interleavings} possible interleavings under SC — observable final states:
        </div>
        <table style={{ fontSize: '0.82rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--sl-color-gray-6)' }}>
              <th style={th}>final regs</th>
              <th style={th}># interleavings reaching it</th>
              <th style={th}>reachable under SC?</th>
            </tr>
          </thead>
          <tbody>
            {[...result.outcomes.entries()].map(([k, v]) => (
              <tr key={k}>
                <td style={td}><code>{k}</code></td>
                <td style={td}>{v}</td>
                <td style={td}>✓ yes</td>
              </tr>
            ))}
            {test === 'sb' && !result.outcomes.has('r0=0, r1=0') && (
              <tr style={{ background: 'rgba(239,68,68,0.12)' }}>
                <td style={td}><code>r0=0, r1=0</code></td>
                <td style={td}>0</td>
                <td style={td}>✗ <strong>forbidden under SC</strong> (allowed under TSO!)</td>
              </tr>
            )}
            {test === 'mp' && !result.outcomes.has('r0=1, r1=0') && (
              <tr style={{ background: 'rgba(239,68,68,0.12)' }}>
                <td style={td}><code>r0=1, r1=0</code></td>
                <td style={td}>0</td>
                <td style={td}>✗ <strong>forbidden under SC</strong> (allowed under ARM!)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(59,130,246,0.08)', borderRadius: 4 }}>
        We enumerate every interleaving of the two threads as if the hardware
        were strictly sequential. The bottom-row outcome shows what relaxed models can produce that SC cannot.
      </div>
    </div>
  );
}

function opStr(op: Op): string {
  if (op.kind === 'st') return `${op.addr} = ${op.val}`;
  return `${op.reg} = ${op.addr}`;
}

function Code({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>{title}</div>
      <pre style={{
        margin: 0, padding: '0.4rem 0.6rem', background: 'var(--sl-color-gray-6)', borderRadius: 4,
        fontSize: '0.85rem', fontFamily: 'monospace',
      }}>{code}</pre>
    </div>
  );
}

const th: React.CSSProperties = { padding: '3px 8px', textAlign: 'left' };
const td: React.CSSProperties = { padding: '3px 8px', borderBottom: '1px solid var(--sl-color-gray-5)' };
