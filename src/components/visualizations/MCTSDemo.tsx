import { useEffect, useMemo, useRef, useState } from 'react';

// A self-contained 1-player toy game:
// Number-pick: at depth 0 you choose action in {0,1,2}; the game has depth 3.
// Reward at terminal = sum of chosen actions normalized into [0,1].
// This makes the optimal play 2,2,2 with reward 1.0, but rollouts are noisy
// because we sample uniformly. MCTS should converge to picking 2 at the root.
//
// We expose the four MCTS phases as discrete clickable steps so users can
// inspect the tree's evolution.

const DEPTH = 3;
const BRANCH = 3;

type GameState = { path: number[] };
const initial: GameState = { path: [] };

function isTerminal(s: GameState) { return s.path.length >= DEPTH; }
function legal(s: GameState): number[] { return isTerminal(s) ? [] : [0, 1, 2]; }
function apply(s: GameState, a: number): GameState { return { path: [...s.path, a] }; }
function reward(s: GameState): number {
  // sum of path normalized to [0,1]; only defined for terminal
  return s.path.reduce((a, b) => a + b, 0) / (DEPTH * (BRANCH - 1));
}

type Node = {
  id: number;
  state: GameState;
  parent: number | null;
  action: number | null;
  children: Record<number, number>;   // action -> child id
  untried: number[];
  N: number;
  W: number;
};

type Tree = Record<number, Node>;

let nextId = 1;
function makeNode(state: GameState, parent: number | null, action: number | null): Node {
  return {
    id: nextId++,
    state,
    parent,
    action,
    children: {},
    untried: legal(state),
    N: 0,
    W: 0,
  };
}

type Phase = 'idle' | 'selection' | 'expansion' | 'simulation' | 'backprop' | 'done';

function uctScore(parentN: number, child: Node, c: number): number {
  if (child.N === 0) return Infinity;
  return child.W / child.N + c * Math.sqrt(Math.log(Math.max(1, parentN)) / child.N);
}

export default function MCTSDemo() {
  const [c, setC] = useState(1.41);
  const [tree, setTree] = useState<Tree>(() => {
    nextId = 1;
    const root = makeNode(initial, null, null);
    return { [root.id]: root };
  });
  const [rootId] = useState(1);
  const [highlight, setHighlight] = useState<number[]>([]); // path of node ids
  const [phase, setPhase] = useState<Phase>('idle');
  const [phaseLog, setPhaseLog] = useState<string[]>([]);
  const [iterCount, setIterCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [pendingZ, setPendingZ] = useState<number | null>(null);
  const [pendingLeaf, setPendingLeaf] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rngSeed = useRef(31);

  function rng() {
    rngSeed.current = (rngSeed.current * 1664525 + 1013904223) % 4294967296;
    return rngSeed.current / 4294967296;
  }

  function fullIteration(t: Tree): { tree: Tree; path: number[]; z: number; leafId: number } {
    let cur = rootId;
    const path = [cur];
    // Selection
    while (true) {
      const node = t[cur];
      if (node.untried.length > 0 || isTerminal(node.state)) break;
      const childIds = Object.values(node.children);
      let bestId = childIds[0];
      let bestScore = -Infinity;
      for (const cid of childIds) {
        const sc = uctScore(node.N, t[cid], c);
        if (sc > bestScore) { bestScore = sc; bestId = cid; }
      }
      cur = bestId;
      path.push(cur);
    }
    // Expansion
    let leafNode = t[cur];
    if (!isTerminal(leafNode.state) && leafNode.untried.length > 0) {
      const idx = Math.floor(rng() * leafNode.untried.length);
      const a = leafNode.untried[idx];
      leafNode.untried = leafNode.untried.filter((x) => x !== a);
      const ns = apply(leafNode.state, a);
      const child = makeNode(ns, leafNode.id, a);
      t[child.id] = child;
      leafNode.children[a] = child.id;
      cur = child.id;
      path.push(cur);
    }
    // Simulation: random rollout
    let s = t[cur].state;
    while (!isTerminal(s)) {
      const acts = legal(s);
      const a = acts[Math.floor(rng() * acts.length)];
      s = apply(s, a);
    }
    const z = reward(s);
    // Backprop
    for (const nid of path) {
      t[nid].N += 1;
      t[nid].W += z;
    }
    return { tree: t, path, z, leafId: cur };
  }

  function stepPhase() {
    setTree((prev) => {
      const t = JSON.parse(JSON.stringify(prev)) as Tree;
      let nextPhase: Phase = phase;
      let nextHighlight = highlight;
      let log = phaseLog.slice();
      let leaf = pendingLeaf;
      let z = pendingZ;

      const startIteration = () => {
        // 1. Selection (might immediately be the root if root has untried)
        let cur = rootId;
        const path = [cur];
        while (true) {
          const node = t[cur];
          if (node.untried.length > 0 || isTerminal(node.state)) break;
          const childIds = Object.values(node.children);
          let bestId = childIds[0];
          let bestScore = -Infinity;
          for (const cid of childIds) {
            const sc = uctScore(node.N, t[cid], c);
            if (sc > bestScore) { bestScore = sc; bestId = cid; }
          }
          cur = bestId;
          path.push(cur);
        }
        nextHighlight = path;
        log = [`Selection: descended ${path.length} node(s) via UCT (c=${c.toFixed(2)})`];
        nextPhase = 'expansion';
      };

      if (phase === 'idle' || phase === 'done') {
        startIteration();
      } else if (phase === 'expansion') {
        // expand a child
        const tail = nextHighlight[nextHighlight.length - 1];
        const node = t[tail];
        if (!isTerminal(node.state) && node.untried.length > 0) {
          const idx = Math.floor(rng() * node.untried.length);
          const a = node.untried[idx];
          node.untried = node.untried.filter((x) => x !== a);
          const ns = apply(node.state, a);
          const child = makeNode(ns, node.id, a);
          t[child.id] = child;
          node.children[a] = child.id;
          nextHighlight = [...nextHighlight, child.id];
          log = [...log, `Expansion: added child for action a=${a}`];
        } else {
          log = [...log, 'Expansion: leaf is terminal — skipped'];
        }
        nextPhase = 'simulation';
      } else if (phase === 'simulation') {
        const tail = nextHighlight[nextHighlight.length - 1];
        let s = t[tail].state;
        const rollout: number[] = [];
        while (!isTerminal(s)) {
          const acts = legal(s);
          const a = acts[Math.floor(rng() * acts.length)];
          rollout.push(a);
          s = apply(s, a);
        }
        z = reward(s);
        leaf = tail;
        log = [...log, `Simulation: random rollout ${rollout.length ? '['+rollout.join(',')+']' : '(none)'} → z = ${z.toFixed(3)}`];
        nextPhase = 'backprop';
      } else if (phase === 'backprop') {
        for (const nid of nextHighlight) {
          t[nid].N += 1;
          t[nid].W += (z as number);
        }
        log = [...log, `Backprop: incremented N and added z=${(z as number).toFixed(3)} to ${nextHighlight.length} node(s)`];
        leaf = null;
        z = null;
        setIterCount((k) => k + 1);
        nextPhase = 'done';
      }

      setPhase(nextPhase);
      setHighlight(nextHighlight);
      setPhaseLog(log);
      setPendingLeaf(leaf);
      setPendingZ(z);
      return t;
    });
  }

  function runMany(n: number) {
    setRunning(false);
    setTree((prev) => {
      let t = JSON.parse(JSON.stringify(prev)) as Tree;
      let lastPath: number[] = [];
      let lastZ = 0;
      for (let i = 0; i < n; i++) {
        const r = fullIteration(t);
        t = r.tree;
        lastPath = r.path;
        lastZ = r.z;
      }
      setHighlight([]);
      setPhase('done');
      setPhaseLog([`Ran ${n} full iterations. Last z = ${lastZ.toFixed(3)}.`]);
      setIterCount((k) => k + n);
      setPendingLeaf(null);
      setPendingZ(null);
      return t;
    });
  }

  function reset() {
    setRunning(false);
    nextId = 1;
    const root = makeNode(initial, null, null);
    setTree({ [root.id]: root });
    setHighlight([]);
    setPhase('idle');
    setPhaseLog([]);
    setIterCount(0);
    setPendingLeaf(null);
    setPendingZ(null);
    rngSeed.current = 31;
  }

  useEffect(() => {
    if (!running) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => stepPhase(), 250);
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, highlight, tree, c]);

  // Compute layout: bfs by depth, assign x by index within depth.
  const layout = useMemo(() => {
    const byDepth: number[][] = [];
    const depthOf = new Map<number, number>();
    const stack: number[] = [rootId];
    depthOf.set(rootId, 0);
    while (stack.length) {
      const id = stack.shift()!;
      const d = depthOf.get(id)!;
      if (!byDepth[d]) byDepth[d] = [];
      byDepth[d].push(id);
      for (const cid of Object.values(tree[id].children)) {
        depthOf.set(cid, d + 1);
        stack.push(cid);
      }
    }
    const positions = new Map<number, { x: number; y: number }>();
    const W = 760;
    const H = 40 + byDepth.length * 80;
    byDepth.forEach((ids, d) => {
      ids.forEach((id, i) => {
        const x = ((i + 1) / (ids.length + 1)) * W;
        const y = 30 + d * 80;
        positions.set(id, { x, y });
      });
    });
    return { positions, H, W };
  }, [tree, rootId]);

  const rootChildIds = Object.values(tree[rootId]?.children ?? {});

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}>
          UCT c = {c.toFixed(2)}
          <input type="range" min="0" max="3" step="0.05" value={c}
            onChange={(e) => setC(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <div style={{ flex: 1, minWidth: 220, fontSize: '0.85rem' }}>
          <strong>Iterations:</strong> {iterCount}
          <div style={{ opacity: 0.7 }}>Next phase: <code>{phase}</code></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <button onClick={stepPhase} disabled={running} style={btn}>Step phase</button>
        <button onClick={() => setRunning((r) => !r)} style={{ ...btn, background: running ? '#ef4444' : '#3b82f6', color: 'white', borderColor: 'transparent' }}>
          {running ? 'Pause' : 'Auto-step'}
        </button>
        <button onClick={() => runMany(20)} disabled={running} style={btn}>+20 iters</button>
        <button onClick={() => runMany(200)} disabled={running} style={btn}>+200 iters</button>
        <button onClick={reset} style={btn}>Reset</button>
      </div>

      <svg width="100%" viewBox={`0 0 ${layout.W} ${layout.H}`} style={{ background: 'var(--sl-color-gray-6)', borderRadius: 4, maxHeight: 460 }}>
        {/* edges */}
        {Object.values(tree).map((node) => {
          const from = layout.positions.get(node.id);
          if (!from) return null;
          return Object.entries(node.children).map(([a, cid]) => {
            const to = layout.positions.get(cid);
            if (!to) return null;
            const isHi = highlight.includes(node.id) && highlight.includes(cid);
            return (
              <g key={`e-${node.id}-${a}`}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={isHi ? '#3b82f6' : '#94a3b833'} strokeWidth={isHi ? 3 : 1.5} />
                <text x={(from.x + to.x) / 2 + 4} y={(from.y + to.y) / 2 - 4}
                  fill="var(--sl-color-text)" fontSize="10" opacity={0.7}>a={a}</text>
              </g>
            );
          });
        })}
        {/* nodes */}
        {Object.values(tree).map((node) => {
          const p = layout.positions.get(node.id);
          if (!p) return null;
          const isHi = highlight.includes(node.id);
          const isLeaf = node.id === pendingLeaf;
          const meanQ = node.N > 0 ? node.W / node.N : 0;
          const fill = isHi ? '#3b82f6' : isLeaf ? '#f59e0b' : '#1e293b';
          return (
            <g key={`n-${node.id}`}>
              <circle cx={p.x} cy={p.y} r={20} fill={fill} stroke="#475569" strokeWidth={1.5} />
              <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize={10} fill="white" fontWeight={600}>
                N={node.N}
              </text>
              <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={9} fill="white" opacity={0.85}>
                Q̄={meanQ.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 260 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Phase log</div>
          <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.4rem 0.6rem', borderRadius: 4,
            fontFamily: 'monospace', fontSize: '0.78rem', maxHeight: 110, overflowY: 'auto' }}>
            {phaseLog.length === 0 ? <span style={{ opacity: 0.5 }}>Click "Step phase" to walk through Selection → Expansion → Simulation → Backprop.</span>
              : phaseLog.map((s, i) => <div key={i}>{s}</div>)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Root action stats</div>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', width: '100%' }}>
            <thead>
              <tr style={{ opacity: 0.7 }}>
                <th style={{ textAlign: 'left', padding: '2px 6px' }}>a</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>N</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>W</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>W/N</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>UCT</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((a) => {
                const cid = tree[rootId]?.children?.[a];
                const ch = cid ? tree[cid] : null;
                const ucb = ch ? uctScore(tree[rootId].N, ch, c) : Infinity;
                return (
                  <tr key={a}>
                    <td style={{ padding: '2px 6px' }}>{a}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{ch?.N ?? 0}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{ch ? ch.W.toFixed(2) : '0.00'}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{ch && ch.N > 0 ? (ch.W / ch.N).toFixed(3) : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{isFinite(ucb) ? ucb.toFixed(2) : '∞'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rootChildIds.length > 0 && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
              Most-visited root action: <strong>
                {(() => {
                  let best = 0, bn = -1;
                  for (const a of [0, 1, 2]) {
                    const cid = tree[rootId]?.children?.[a];
                    const n = cid ? tree[cid].N : 0;
                    if (n > bn) { bn = n; best = a; }
                  }
                  return `a = ${best}`;
                })()}
              </strong>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', borderRadius: 4, background: 'rgba(59,130,246,0.08)' }}>
        <strong>Toy game.</strong> Depth-3 sequence of moves a ∈ {`{0,1,2}`}. Terminal reward = sum of chosen actions normalized to [0,1]; optimal is always picking 2 (reward 1.0). Set c=0 to see pure exploitation collapse onto the first action that lucked into a high rollout; raise c past ~1.5 to see the search re-spread.
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
