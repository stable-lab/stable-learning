import { useState, useCallback } from 'react';

interface Step {
  state: string;
  action: string;
  reward: number;
  nextState: string;
}

const GRID_SIZE = 4;
const GOAL = { r: 0, c: 3 };
const TRAP = { r: 1, c: 2 };

const ACTIONS = [
  { label: '↑', dr: -1, dc: 0, name: 'up' },
  { label: '↓', dr: 1, dc: 0, name: 'down' },
  { label: '←', dr: 0, dc: -1, name: 'left' },
  { label: '→', dr: 0, dc: 1, name: 'right' },
];

function cellLabel(r: number, c: number) {
  return `(${r},${c})`;
}

function getReward(r: number, c: number) {
  if (r === GOAL.r && c === GOAL.c) return 10;
  if (r === TRAP.r && c === TRAP.c) return -5;
  return -1; // step cost
}

export default function ActionChainDemo() {
  const [pos, setPos] = useState({ r: 3, c: 0 });
  const [history, setHistory] = useState<Step[]>([]);
  const [done, setDone] = useState(false);
  const gamma = 0.9;

  const handleAction = useCallback((dr: number, dc: number, actionName: string) => {
    if (done) return;
    const nr = Math.max(0, Math.min(GRID_SIZE - 1, pos.r + dr));
    const nc = Math.max(0, Math.min(GRID_SIZE - 1, pos.c + dc));
    const reward = getReward(nr, nc);
    const step: Step = {
      state: cellLabel(pos.r, pos.c),
      action: actionName,
      reward,
      nextState: cellLabel(nr, nc),
    };
    setHistory((prev) => [...prev, step]);
    setPos({ r: nr, c: nc });
    if (nr === GOAL.r && nc === GOAL.c) setDone(true);
  }, [pos, done]);

  const handleReset = () => {
    setPos({ r: 3, c: 0 });
    setHistory([]);
    setDone(false);
  };

  // Compute discounted return
  const totalReturn = history.reduce(
    (sum, step, i) => sum + Math.pow(gamma, i) * step.reward, 0
  );

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {/* Grid */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 48px)`, gap: '2px' }}>
            {Array.from({ length: GRID_SIZE }, (_, r) =>
              Array.from({ length: GRID_SIZE }, (_, c) => {
                const isAgent = r === pos.r && c === pos.c;
                const isGoal = r === GOAL.r && c === GOAL.c;
                const isTrap = r === TRAP.r && c === TRAP.c;
                return (
                  <div key={`${r}-${c}`} style={{
                    width: 48, height: 48,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--sl-color-gray-5)',
                    borderRadius: '4px',
                    fontSize: isAgent ? '1.2rem' : isGoal || isTrap ? '0.65rem' : '0.7rem',
                    lineHeight: 1,
                    background: isGoal ? '#22c55e30' : isTrap ? '#ef444430' : isAgent ? '#3b82f620' : 'var(--sl-color-bg)',
                    fontWeight: isAgent ? 'bold' : 'normal',
                  }}>
                    {isAgent ? '🤖' : isGoal ? 'Goal +10' : isTrap ? 'Trap −5' : cellLabel(r, c)}
                  </div>
                );
              })
            )}
          </div>
          {/* Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 48px)', gap: '2px', marginTop: '0.5rem', justifyContent: 'center' }}>
            <div />
            <button onClick={() => handleAction(-1, 0, 'up')} disabled={done} style={btnStyle}>↑</button>
            <div />
            <button onClick={() => handleAction(0, -1, 'left')} disabled={done} style={btnStyle}>←</button>
            <button onClick={() => handleAction(1, 0, 'down')} disabled={done} style={btnStyle}>↓</button>
            <button onClick={() => handleAction(0, 1, 'right')} disabled={done} style={btnStyle}>→</button>
          </div>
          <button onClick={handleReset} style={{ ...btnStyle, width: '100%', marginTop: '0.5rem' }}>Reset</button>
        </div>

        {/* Trajectory log */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
            Trajectory τ = (s, a, r, s', ...)
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: '0.8rem',
            background: 'var(--sl-color-gray-6)', borderRadius: '0.25rem',
            padding: '0.5rem', maxHeight: '200px', overflowY: 'auto',
          }}>
            {history.length === 0 ? (
              <span style={{ opacity: 0.5 }}>Navigate to ⭐ to build a trajectory...</span>
            ) : (
              history.map((step, i) => (
                <div key={i}>
                  t={i}: {step.state} →<strong>{step.action}</strong>→ {step.nextState} (r={step.reward})
                </div>
              ))
            )}
          </div>
          {history.length > 0 && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <div><strong>Return (γ={gamma}):</strong></div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                G₀ = {history.map((step, i) =>
                  `${i > 0 ? ' + ' : ''}${gamma.toFixed(1)}${i > 0 ? `^${i}` : '⁰'}·(${step.reward})`
                ).join('')}
              </div>
              <div style={{ fontFamily: 'monospace', fontWeight: 'bold', marginTop: '0.25rem' }}>
                G₀ = {totalReturn.toFixed(2)}
              </div>
            </div>
          )}
          {done && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#22c55e20', borderRadius: '0.25rem', fontSize: '0.85rem' }}>
              Goal reached in {history.length} steps!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 48, height: 36,
  border: '1px solid var(--sl-color-gray-5)',
  borderRadius: '4px',
  background: 'var(--sl-color-bg)',
  cursor: 'pointer',
  fontSize: '1.1rem',
  color: 'inherit',
};
