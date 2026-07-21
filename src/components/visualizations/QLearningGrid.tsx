import { useEffect, useMemo, useRef, useState } from 'react';

// 4x4 gridworld with goal, trap, walls. We train tabular Q-learning live
// and visualize Q-values per cell (max-over-actions) plus the greedy arrow.
//
// Layout (row, col), zero-indexed from top-left:
//   . . . G       G = goal +10 (terminal)
//   . W . .       W = wall (can't enter)
//   . . T .       T = trap -10 (terminal)
//   S . . .       S = start, step cost -1

const ROWS = 4;
const COLS = 4;
const GOAL = { r: 0, c: 3 };
const TRAP = { r: 2, c: 2 };
const WALL = { r: 1, c: 1 };
const START = { r: 3, c: 0 };

type Action = 0 | 1 | 2 | 3; // 0=up 1=right 2=down 3=left
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const ARROWS = ['↑', '→', '↓', '←'];

function isWall(r: number, c: number) {
  return r === WALL.r && c === WALL.c;
}
function isTerminal(r: number, c: number) {
  return (r === GOAL.r && c === GOAL.c) || (r === TRAP.r && c === TRAP.c);
}
function rewardOf(r: number, c: number) {
  if (r === GOAL.r && c === GOAL.c) return 10;
  if (r === TRAP.r && c === TRAP.c) return -10;
  return -1;
}

function nextCell(r: number, c: number, a: Action) {
  const nr = r + DR[a];
  const nc = c + DC[a];
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return { r, c }; // bump wall
  if (isWall(nr, nc)) return { r, c };
  return { r: nr, c: nc };
}

function makeQ() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => [0, 0, 0, 0] as number[])
  );
}

export default function QLearningGrid() {
  const [alpha, setAlpha] = useState(0.3);
  const [gamma, setGamma] = useState(0.9);
  const [epsilon, setEpsilon] = useState(0.2);
  const [Q, setQ] = useState(() => makeQ());
  const [agent, setAgent] = useState({ ...START });
  const [episode, setEpisode] = useState(0);
  const [stepInEp, setStepInEp] = useState(0);
  const [lastTD, setLastTD] = useState<{
    r: number; c: number; a: Action; target: number; old: number; updated: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(50); // ms per step
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rngSeed = useRef(12345);

  function rng() {
    rngSeed.current = (rngSeed.current * 1664525 + 1013904223) % 4294967296;
    return rngSeed.current / 4294967296;
  }

  function chooseAction(s: { r: number; c: number }, qTable: number[][][]): Action {
    if (rng() < epsilon) {
      return Math.floor(rng() * 4) as Action;
    }
    const qs = qTable[s.r][s.c];
    let best = 0;
    let bestQ = qs[0];
    for (let a = 1; a < 4; a++) {
      if (qs[a] > bestQ) { bestQ = qs[a]; best = a; }
    }
    return best as Action;
  }

  function takeOneStep() {
    setQ((qPrev) => {
      // operate on a single immutable snapshot
      const q = qPrev.map((row) => row.map((cell) => cell.slice())) as number[][][];
      const s = agent;
      const a = chooseAction(s, q);
      const ns = nextCell(s.r, s.c, a);
      const r = rewardOf(ns.r, ns.c);
      const terminal = isTerminal(ns.r, ns.c);
      const oldQ = q[s.r][s.c][a];
      const bootstrap = terminal ? 0 : Math.max(...q[ns.r][ns.c]);
      const target = r + gamma * bootstrap;
      const updated = oldQ + alpha * (target - oldQ);
      q[s.r][s.c][a] = updated;
      setLastTD({ r: s.r, c: s.c, a, target, old: oldQ, updated });
      if (terminal) {
        setAgent({ ...START });
        setEpisode((e) => e + 1);
        setStepInEp(0);
      } else {
        setAgent(ns);
        setStepInEp((n) => n + 1);
      }
      return q;
    });
  }

  useEffect(() => {
    if (!running) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => takeOneStep(), speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speed, alpha, gamma, epsilon, agent]);

  function reset() {
    setRunning(false);
    setQ(makeQ());
    setAgent({ ...START });
    setEpisode(0);
    setStepInEp(0);
    setLastTD(null);
    rngSeed.current = 12345;
  }

  function trainMany(n: number) {
    setRunning(false);
    // batch update synchronously to avoid React thrash
    const q = Q.map((row) => row.map((cell) => cell.slice())) as number[][][];
    let s = { ...agent };
    let ep = episode;
    let stepInEpLocal = stepInEp;
    let last = lastTD;
    for (let i = 0; i < n; i++) {
      const a = chooseAction(s, q);
      const ns = nextCell(s.r, s.c, a);
      const r = rewardOf(ns.r, ns.c);
      const terminal = isTerminal(ns.r, ns.c);
      const oldQ = q[s.r][s.c][a];
      const bootstrap = terminal ? 0 : Math.max(...q[ns.r][ns.c]);
      const target = r + gamma * bootstrap;
      const updated = oldQ + alpha * (target - oldQ);
      q[s.r][s.c][a] = updated;
      last = { r: s.r, c: s.c, a, target, old: oldQ, updated };
      if (terminal) {
        s = { ...START };
        ep += 1;
        stepInEpLocal = 0;
      } else {
        s = ns;
        stepInEpLocal += 1;
      }
    }
    setQ(q);
    setAgent(s);
    setEpisode(ep);
    setStepInEp(stepInEpLocal);
    setLastTD(last);
  }

  // Color heatmap: max-action Q
  const { vmin, vmax } = useMemo(() => {
    let lo = 0, hi = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (isWall(r, c)) continue;
      const v = Math.max(...Q[r][c]);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === hi) { lo -= 0.1; hi += 0.1; }
    return { vmin: lo, vmax: hi };
  }, [Q]);

  function colorFor(v: number): string {
    // map v ∈ [vmin, vmax] to a diverging palette around 0
    const span = Math.max(vmax - vmin, 1e-6);
    const t = (v - vmin) / span;
    // negative → red; positive → green; midpoint pale
    const r = Math.round(239 * (1 - t) + 34 * t);
    const g = Math.round(68 * (1 - t) + 197 * t);
    const b = Math.round(68 * (1 - t) + 94 * t);
    return `rgba(${r}, ${g}, ${b}, ${0.18 + 0.55 * Math.abs(t - 0.5) * 2})`;
  }

  function greedyArrow(r: number, c: number): string {
    const qs = Q[r][c];
    const all = qs.every((v) => v === qs[0]);
    if (all) return '·';
    let best = 0;
    for (let a = 1; a < 4; a++) if (qs[a] > qs[best]) best = a;
    return ARROWS[best];
  }

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <label style={{ flex: 1, minWidth: 160, fontSize: '0.85rem' }}>
          α (learning rate) = {alpha.toFixed(2)}
          <input type="range" min="0.05" max="1" step="0.05" value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1, minWidth: 160, fontSize: '0.85rem' }}>
          γ (discount) = {gamma.toFixed(2)}
          <input type="range" min="0" max="0.99" step="0.01" value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1, minWidth: 160, fontSize: '0.85rem' }}>
          ε (explore prob) = {epsilon.toFixed(2)}
          <input type="range" min="0" max="1" step="0.05" value={epsilon}
            onChange={(e) => setEpsilon(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button onClick={takeOneStep} disabled={running} style={btn}>Step</button>
        <button onClick={() => trainMany(100)} disabled={running} style={btn}>Train 100</button>
        <button onClick={() => trainMany(1000)} disabled={running} style={btn}>Train 1000</button>
        <button onClick={() => setRunning((r) => !r)} style={{ ...btn, background: running ? '#ef4444' : '#3b82f6', color: 'white', borderColor: 'transparent' }}>
          {running ? 'Pause' : 'Auto-run'}
        </button>
        <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          speed
          <input type="range" min="10" max="400" step="10" value={410 - speed}
            onChange={(e) => setSpeed(410 - parseInt(e.target.value))} />
        </label>
        <button onClick={reset} style={btn}>Reset</button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 76px)`, gap: 2 }}>
            {Array.from({ length: ROWS }, (_, r) =>
              Array.from({ length: COLS }, (_, c) => {
                const wall = isWall(r, c);
                const goal = r === GOAL.r && c === GOAL.c;
                const trap = r === TRAP.r && c === TRAP.c;
                const isAgent = agent.r === r && agent.c === c;
                const start = r === START.r && c === START.c;
                const v = Math.max(...Q[r][c]);
                const bg = wall
                  ? 'rgba(100,100,100,0.6)'
                  : goal
                  ? 'rgba(34,197,94,0.45)'
                  : trap
                  ? 'rgba(239,68,68,0.45)'
                  : colorFor(v);
                return (
                  <div key={`${r}-${c}`} style={{
                    width: 76, height: 76, position: 'relative',
                    border: '1px solid var(--sl-color-gray-5)',
                    borderRadius: 4,
                    background: bg,
                    fontSize: '0.7rem', lineHeight: 1.1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {wall ? (
                      <span>wall</span>
                    ) : goal ? (
                      <span><strong>G +10</strong></span>
                    ) : trap ? (
                      <span><strong>T −10</strong></span>
                    ) : (
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <div style={{ fontSize: '1.1rem' }}>{greedyArrow(r, c)}</div>
                        <div style={{ fontFamily: 'monospace' }}>
                          {v.toFixed(2)}
                        </div>
                        {start && (
                          <div style={{ position: 'absolute', top: 2, left: 4, fontSize: '0.6rem', opacity: 0.7 }}>S</div>
                        )}
                      </div>
                    )}
                    {isAgent && (
                      <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: '0.9rem' }}>🤖</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.8 }}>
            Cell color = max<sub>a</sub> Q(s, a). Arrow = greedy action.
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240, fontSize: '0.85rem' }}>
          <div><strong>Episode:</strong> {episode} &nbsp;|&nbsp; <strong>Steps in episode:</strong> {stepInEp}</div>
          <div style={{ marginTop: '0.5rem' }}>
            <strong>Last TD update</strong>
            <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.5rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.78rem', marginTop: '0.25rem' }}>
              {lastTD ? (
                <>
                  <div>state = ({lastTD.r},{lastTD.c}), action = {ARROWS[lastTD.a]}</div>
                  <div>target = r + γ·max Q(s′,·) = {lastTD.target.toFixed(3)}</div>
                  <div>Q(s,a): {lastTD.old.toFixed(3)} → {lastTD.updated.toFixed(3)}</div>
                  <div style={{ marginTop: 4, opacity: 0.8 }}>
                    Δ = α·(target − old) = {(alpha * (lastTD.target - lastTD.old)).toFixed(3)}
                  </div>
                </>
              ) : (
                <span style={{ opacity: 0.5 }}>Press Step or Auto-run to see updates…</span>
              )}
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', padding: '0.5rem', borderRadius: 4, background: 'rgba(59,130,246,0.08)' }}>
            <strong>Try:</strong>
            <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
              <li>Set ε = 0, Train 1000. Why does it stall?</li>
              <li>Set γ = 0.5 vs γ = 0.95 — watch how far values reach back.</li>
              <li>Set α = 1.0 — observe oscillation when targets are noisy.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  border: '1px solid var(--sl-color-gray-5)',
  borderRadius: 4,
  background: 'var(--sl-color-bg)',
  cursor: 'pointer',
  fontSize: '0.85rem',
  color: 'inherit',
};
