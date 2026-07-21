import { useState } from 'react';

// Step-through demo of the canonical coherence violation. Lets the user
// click "next" to advance the timeline. Without coherence, two cores
// observe different values for the same address.

type Step = {
  desc: string;
  core0_cache: number | null;
  core1_cache: number | null;
  memory: number;
  coherent: boolean;
};

const SEQ_NO_COHERENCE: Step[] = [
  { desc: 'initial', core0_cache: null, core1_cache: null, memory: 0, coherent: true },
  { desc: 'Core 0 reads A: miss, loads 0', core0_cache: 0, core1_cache: null, memory: 0, coherent: true },
  { desc: 'Core 1 reads A: miss, loads 0', core0_cache: 0, core1_cache: 0, memory: 0, coherent: true },
  { desc: 'Core 0 writes A=7 (write-back, dirty in C0 cache only)', core0_cache: 7, core1_cache: 0, memory: 0, coherent: false },
  { desc: 'Core 1 reads A: hits its own cache → sees STALE 0 ❌', core0_cache: 7, core1_cache: 0, memory: 0, coherent: false },
];

const SEQ_WITH_COHERENCE: Step[] = [
  { desc: 'initial', core0_cache: null, core1_cache: null, memory: 0, coherent: true },
  { desc: 'Core 0 reads A: miss, loads 0, state=S', core0_cache: 0, core1_cache: null, memory: 0, coherent: true },
  { desc: 'Core 1 reads A: miss, loads 0, both in S', core0_cache: 0, core1_cache: 0, memory: 0, coherent: true },
  { desc: 'Core 0 writes A=7: BusUpgr → Core 1 invalidated, C0 state=M', core0_cache: 7, core1_cache: null, memory: 0, coherent: true },
  { desc: 'Core 1 reads A: miss now (was invalidated) → BusRd → C0 supplies 7 ✓', core0_cache: 7, core1_cache: 7, memory: 7, coherent: true },
];

export default function CoherenceViolation() {
  const [mode, setMode] = useState<'none' | 'msi'>('none');
  const [step, setStep] = useState(0);
  const seq = mode === 'none' ? SEQ_NO_COHERENCE : SEQ_WITH_COHERENCE;
  const s = seq[Math.min(step, seq.length - 1)];

  function nextStep() { setStep((s) => Math.min(seq.length - 1, s + 1)); }
  function reset() { setStep(0); }

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.85rem' }}>Coherence:
          <select value={mode} onChange={(e) => { setMode(e.target.value as 'none' | 'msi'); setStep(0); }}
            style={{ marginLeft: 6, padding: 3, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            <option value="none">No protocol</option>
            <option value="msi">MSI protocol</option>
          </select>
        </label>
        <button onClick={nextStep} disabled={step >= seq.length - 1} style={btn}>Next step ▶</button>
        <button onClick={reset} style={btn}>Reset</button>
        <span style={{ fontSize: '0.85rem' }}>step {step}/{seq.length - 1}</span>
      </div>

      <div style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'var(--sl-color-gray-6)', borderRadius: 4, marginBottom: '0.5rem' }}>
        {s.desc}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Box title="Core 0 cache" content={s.core0_cache} />
        <Box title="Core 1 cache" content={s.core1_cache} />
        <Box title="Memory" content={s.memory} />
      </div>

      <div style={{ marginTop: '0.6rem', padding: '0.5rem', borderRadius: 4,
        background: s.coherent ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.18)' }}>
        {s.coherent
          ? <span>✓ Coherent — all valid copies agree.</span>
          : <span>✗ <strong>Coherence violation</strong>: Core 0 and Core 1 hold different values for the same address. Without a protocol like MSI, the next Core 1 read returns stale data.</span>}
      </div>
    </div>
  );
}

function Box({ title, content }: { title: string; content: number | null }) {
  return (
    <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.5rem', borderRadius: 4, textAlign: 'center' }}>
      <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace', marginTop: 4 }}>
        {content === null ? <span style={{ opacity: 0.4 }}>—</span> : `A = ${content}`}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { padding: '0.3rem 0.7rem', border: '1px solid var(--sl-color-gray-5)', borderRadius: 4, background: 'var(--sl-color-bg)', cursor: 'pointer', fontSize: '0.85rem', color: 'inherit' };
