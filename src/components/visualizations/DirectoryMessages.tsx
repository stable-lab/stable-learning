import { useEffect, useRef, useState } from 'react';

// Walk through directory-protocol message flow for a read-miss and a
// write-miss with N sharers. User can step through messages.

type Msg = {
  from: number; to: number; label: string; phase: number; ack?: boolean;
};

type Scenario = 'readmiss' | 'writemiss';

const NUM_CORES = 4;
const HOME = 0; // directory lives at "node" 0 for simplicity (cores indexed 1..4)

function buildScenario(s: Scenario, sharers: number[]): { msgs: Msg[]; description: string } {
  if (s === 'readmiss') {
    // Core 2 reads while core 3 holds it Modified.
    return {
      description: 'Core 2 issues a read. Directory shows the line is Modified at Core 3 → intervention.',
      msgs: [
        { from: 2, to: HOME, label: 'GetS(A)', phase: 0 },
        { from: HOME, to: 3, label: 'FwdGetS(A)', phase: 1 },
        { from: 3, to: 2, label: 'Data(A)', phase: 2 },
        { from: 3, to: HOME, label: 'WB-Ack', phase: 3, ack: true },
      ],
    };
  } else {
    return {
      description: `Core 1 issues a write. Directory has ${sharers.length} sharers ${JSON.stringify(sharers)} → broadcast invalidates and wait for acks.`,
      msgs: [
        { from: 1, to: HOME, label: 'GetM(A)', phase: 0 },
        ...sharers.map((s, i) => ({ from: HOME, to: s, label: 'Inv(A)', phase: 1 } as Msg)),
        ...sharers.map((s, i) => ({ from: s, to: 1, label: 'Inv-Ack', phase: 2, ack: true } as Msg)),
        { from: HOME, to: 1, label: 'Data(A) + grant M', phase: 3 },
      ],
    };
  }
}

function corePos(i: number): { x: number; y: number } {
  // 0 = home directory in the middle; 1..4 cores around it
  if (i === HOME) return { x: 200, y: 130 };
  const angles = [0, -Math.PI / 2, Math.PI / 2, Math.PI];
  const a = angles[i - 1];
  return { x: 200 + 110 * Math.cos(a), y: 130 + 90 * Math.sin(a) };
}

export default function DirectoryMessages() {
  const [scenario, setScenario] = useState<Scenario>('writemiss');
  const [sharersStr, setSharersStr] = useState('2,3,4');
  const sharers = sharersStr.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
  const built = buildScenario(scenario, sharers);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStep(0);
  }, [scenario, sharersStr]);

  useEffect(() => {
    if (!running) { if (timer.current) clearInterval(timer.current); timer.current = null; return; }
    timer.current = setInterval(() => setStep((s) => {
      if (s + 1 >= built.msgs.length + 1) { setRunning(false); return s; }
      return s + 1;
    }), 600);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, built.msgs.length]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 180 }}>
          Scenario
          <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}
            style={{ width: '100%', padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            <option value="readmiss">Read miss (Modified by another core)</option>
            <option value="writemiss">Write miss (N sharers)</option>
          </select>
        </label>
        {scenario === 'writemiss' && (
          <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 180 }}>
            Sharer list (core ids 2-4)
            <input type="text" value={sharersStr}
              onChange={(e) => setSharersStr(e.target.value)}
              style={{ width: '100%', padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)', borderRadius: 3 }} />
          </label>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={running} style={btn}>◀ Prev</button>
          <button onClick={() => setStep((s) => Math.min(built.msgs.length, s + 1))} disabled={running} style={btn}>Next ▶</button>
          <button onClick={() => { setStep(0); setRunning(true); }} style={{ ...btn, background: '#3b82f6', color: 'white', border: 'none' }}>▶ Auto</button>
          <button onClick={() => { setStep(0); setRunning(false); }} style={btn}>Reset</button>
        </div>
      </div>

      <div style={{ fontSize: '0.82rem', opacity: 0.85, marginBottom: '0.4rem' }}>
        {built.description} &nbsp;|&nbsp; <strong>Step {step}/{built.msgs.length}</strong>
      </div>

      <svg width="100%" viewBox="0 0 400 260" style={{ background: 'var(--sl-color-gray-6)', borderRadius: 4 }}>
        {/* core/home nodes */}
        {[HOME, 1, 2, 3, 4].map((i) => {
          const p = corePos(i);
          const isHome = i === HOME;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={28} fill={isHome ? '#475569' : '#1e293b'} stroke="#94a3b8" strokeWidth={1.5} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>
                {isHome ? 'Home/Dir' : `Core ${i}`}
              </text>
            </g>
          );
        })}
        {/* messages 1..step */}
        {built.msgs.slice(0, step).map((m, i) => {
          const a = corePos(m.from);
          const b = corePos(m.to);
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / len, uy = dy / len;
          const x1 = a.x + 30 * ux, y1 = a.y + 30 * uy;
          const x2 = b.x - 30 * ux, y2 = b.y - 30 * uy;
          // offset duplicates slightly
          const sameIdx = built.msgs.slice(0, i).filter((mm) => mm.from === m.from && mm.to === m.to).length;
          const off = sameIdx * 6 - 6;
          const nx = -uy * off, ny = ux * off;
          const stroke = m.ack ? '#22c55e' : (m.phase === 0 ? '#3b82f6' : m.phase === 1 ? '#f59e0b' : '#ef4444');
          return (
            <g key={i}>
              <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} stroke={stroke} strokeWidth={2}
                markerEnd={`url(#arr-${i})`} />
              <defs>
                <marker id={`arr-${i}`} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto">
                  <path d="M0,0 L10,5 L0,10 Z" fill={stroke} />
                </marker>
              </defs>
              <text x={(x1 + x2) / 2 + nx} y={(y1 + y2) / 2 + ny - 4} fill="var(--sl-color-text)" fontSize={10}
                textAnchor="middle">{m.label}</text>
            </g>
          );
        })}
      </svg>

      <div style={{ fontSize: '0.82rem', marginTop: '0.4rem' }}>
        <strong>Critical-path round trip:</strong>{' '}
        {scenario === 'readmiss'
          ? 'Core→Home + Home→Owner + Owner→Core = 3 hops on the interconnect, regardless of sharer count.'
          : `Core→Home + max(Home→sharer + sharer→Core) over ${sharers.length} sharers; latency dominated by the slowest invalidation-ack.`}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '0.3rem 0.6rem',
  border: '1px solid var(--sl-color-gray-5)',
  borderRadius: 4,
  background: 'var(--sl-color-bg)',
  cursor: 'pointer',
  fontSize: '0.82rem',
  color: 'inherit',
};
