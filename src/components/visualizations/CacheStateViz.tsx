import { useState, useCallback } from 'react';

type CacheState = 'I' | 'S' | 'M' | 'E' | 'O';

interface CoreState {
  state: CacheState;
  value: number | null;
}

const STATE_COLORS: Record<CacheState, string> = {
  I: '#94a3b8',
  S: '#3b82f6',
  M: '#ef4444',
  E: '#22c55e',
  O: '#f59e0b',
};

const STATE_NAMES: Record<CacheState, string> = {
  I: 'Invalid',
  S: 'Shared',
  M: 'Modified',
  E: 'Exclusive',
  O: 'Owned',
};

type Protocol = 'MSI' | 'MESI';

export default function CacheStateViz() {
  const [protocol, setProtocol] = useState<Protocol>('MSI');
  const [cores, setCores] = useState<CoreState[]>([
    { state: 'I', value: null },
    { state: 'I', value: null },
  ]);
  const [memory, setMemory] = useState(42);
  const [log, setLog] = useState<string[]>(['System initialized. Memory[A] = 42']);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-9), msg]);
  }, []);

  const handleRead = useCallback((coreIdx: number) => {
    setCores((prev) => {
      const next = [...prev.map((c) => ({ ...c }))];
      const other = 1 - coreIdx;
      const core = next[coreIdx];
      const otherCore = next[other];

      if (core.state === 'I') {
        if (otherCore.state === 'M') {
          // Other has modified: flush to memory, both go Shared
          setMemory(otherCore.value!);
          core.value = otherCore.value;
          core.state = 'S';
          otherCore.state = 'S';
          addLog(`Core${coreIdx} READ miss → Core${other} flushes M→S, Core${coreIdx} I→S (val=${core.value})`);
        } else if (otherCore.state === 'E') {
          otherCore.state = 'S';
          core.value = otherCore.value;
          core.state = 'S';
          addLog(`Core${coreIdx} READ miss → Core${other} E→S, Core${coreIdx} I→S (val=${core.value})`);
        } else if (otherCore.state === 'S') {
          core.state = 'S';
          core.value = otherCore.value;
          addLog(`Core${coreIdx} READ miss → Core${coreIdx} I→S (val=${core.value})`);
        } else {
          // Other is Invalid — read from memory
          if (protocol === 'MESI') {
            core.state = 'E';
            addLog(`Core${coreIdx} READ miss → I→E (exclusive, val=${memory})`);
          } else {
            core.state = 'S';
            addLog(`Core${coreIdx} READ miss → I→S (val=${memory})`);
          }
          core.value = memory;
        }
      } else {
        addLog(`Core${coreIdx} READ hit in ${core.state} (val=${core.value})`);
      }
      return next;
    });
  }, [protocol, memory, addLog]);

  const handleWrite = useCallback((coreIdx: number) => {
    setCores((prev) => {
      const next = [...prev.map((c) => ({ ...c }))];
      const other = 1 - coreIdx;
      const core = next[coreIdx];
      const otherCore = next[other];
      const newVal = (core.value ?? memory) + 1;

      if (core.state === 'M') {
        core.value = newVal;
        addLog(`Core${coreIdx} WRITE hit M→M (val=${newVal})`);
      } else if (core.state === 'E') {
        core.state = 'M';
        core.value = newVal;
        addLog(`Core${coreIdx} WRITE hit E→M (val=${newVal})`);
      } else if (core.state === 'S') {
        core.state = 'M';
        core.value = newVal;
        otherCore.state = 'I';
        otherCore.value = null;
        addLog(`Core${coreIdx} WRITE → S→M (val=${newVal}), Core${other} S→I (invalidated)`);
      } else {
        // Invalid — write miss
        core.state = 'M';
        core.value = newVal;
        if (otherCore.state !== 'I') {
          addLog(`Core${coreIdx} WRITE miss → I→M (val=${newVal}), Core${other} ${otherCore.state}→I`);
          otherCore.state = 'I';
          otherCore.value = null;
        } else {
          addLog(`Core${coreIdx} WRITE miss → I→M (val=${newVal})`);
        }
      }
      return next;
    });
  }, [memory, addLog]);

  const handleReset = () => {
    setCores([{ state: 'I', value: null }, { state: 'I', value: null }]);
    setMemory(42);
    setLog(['System reset. Memory[A] = 42']);
  };

  const availableStates = protocol === 'MSI' ? ['M', 'S', 'I'] : ['M', 'E', 'S', 'I'];

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label>
          Protocol:
          <select value={protocol} onChange={(e) => { setProtocol(e.target.value as Protocol); handleReset(); }} style={{ marginLeft: '0.5rem' }}>
            <option value="MSI">MSI</option>
            <option value="MESI">MESI</option>
          </select>
        </label>
        <button onClick={handleReset} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: '1px solid var(--sl-color-gray-5)', background: 'var(--sl-color-bg)', cursor: 'pointer' }}>
          Reset
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', margin: '1.5rem 0' }}>
        {cores.map((core, i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: '160px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Core {i}</div>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 0.75rem',
              background: STATE_COLORS[core.state], display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 'bold', fontSize: '1.5rem',
            }}>
              {core.state}
            </div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              {STATE_NAMES[core.state]} {core.value !== null ? `(val=${core.value})` : ''}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button onClick={() => handleRead(i)} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: '1px solid #3b82f6', background: '#3b82f620', cursor: 'pointer', color: 'inherit' }}>
                Read
              </button>
              <button onClick={() => handleWrite(i)} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: '1px solid #ef4444', background: '#ef444420', cursor: 'pointer', color: 'inherit' }}>
                Write
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', margin: '1rem 0', fontSize: '0.9rem' }}>
        Memory[A] = {memory}
      </div>

      <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>States: {availableStates.map((s) => `${s}=${STATE_NAMES[s as CacheState]}`).join(', ')}</div>

      <div style={{ background: 'var(--sl-color-gray-6)', borderRadius: '0.25rem', padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace', maxHeight: '180px', overflowY: 'auto' }}>
        {log.map((entry, i) => (
          <div key={i} style={{ opacity: i === log.length - 1 ? 1 : 0.7 }}>{entry}</div>
        ))}
      </div>
    </div>
  );
}
