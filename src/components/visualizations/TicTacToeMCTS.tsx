import { useMemo, useState } from 'react';

// Play tic-tac-toe vs MCTS, with an adjustable iteration budget.
// User plays X (always), MCTS plays O on its turn.

type Cell = 0 | 1 | 2;  // 0 empty, 1 = X, 2 = O
type Board = Cell[];    // length 9

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(b: Board): 0 | 1 | 2 | 3 {
  for (const ln of LINES) {
    const [a, c, d] = ln;
    if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
  }
  if (b.every((x) => x !== 0)) return 3; // draw
  return 0;
}
function legal(b: Board): number[] { return b.map((v, i) => v === 0 ? i : -1).filter((i) => i >= 0); }
function apply(b: Board, idx: number, player: 1 | 2): Board { const nb = b.slice() as Board; nb[idx] = player; return nb; }

type Node = {
  state: Board;
  player: 1 | 2;            // who plays next from this state
  parent: Node | null;
  action: number | null;
  children: Map<number, Node>;
  untried: number[];
  N: number;
  W: number;                 // total reward from perspective of `parent`'s mover (the player who moved to reach this state)
};

function makeNode(state: Board, player: 1 | 2, parent: Node | null, action: number | null): Node {
  const w = winner(state);
  return {
    state,
    player,
    parent,
    action,
    children: new Map(),
    untried: w === 0 ? legal(state) : [],
    N: 0,
    W: 0,
  };
}

function rolloutResult(state: Board, player: 1 | 2, seed: { v: number }): number {
  // returns +1 if 'O' wins, -1 if 'X' wins, 0 draw (from O's perspective)
  let s = state.slice() as Board;
  let cur: 1 | 2 = player;
  while (true) {
    const w = winner(s);
    if (w === 1) return -1;
    if (w === 2) return +1;
    if (w === 3) return 0;
    const acts = legal(s);
    seed.v = (seed.v * 1664525 + 1013904223) % 4294967296;
    const a = acts[Math.floor((seed.v / 4294967296) * acts.length)];
    s = apply(s, a, cur);
    cur = cur === 1 ? 2 : 1;
  }
}

function uct(parentN: number, child: Node, c: number): number {
  if (child.N === 0) return Infinity;
  return child.W / child.N + c * Math.sqrt(Math.log(Math.max(1, parentN)) / child.N);
}

function chooseMCTS(state: Board, iterations: number, c = 1.41): number {
  const root = makeNode(state, 2, null, null);
  const seed = { v: 12345 };
  for (let i = 0; i < iterations; i++) {
    let node = root;
    // selection
    while (node.untried.length === 0 && node.children.size > 0) {
      let best: Node | null = null;
      let bestScore = -Infinity;
      for (const ch of node.children.values()) {
        const sc = uct(node.N, ch, c);
        if (sc > bestScore) { bestScore = sc; best = ch; }
      }
      node = best!;
    }
    // expansion
    const w = winner(node.state);
    if (w === 0 && node.untried.length > 0) {
      const idx = Math.floor(((seed.v = (seed.v * 1664525 + 1013904223) % 4294967296) / 4294967296) * node.untried.length);
      const a = node.untried.splice(idx, 1)[0];
      const ns = apply(node.state, a, node.player);
      const next: 1 | 2 = node.player === 1 ? 2 : 1;
      const child = makeNode(ns, next, node, a);
      node.children.set(a, child);
      node = child;
    }
    // simulation
    const z = rolloutResult(node.state, node.player, seed);
    // backprop — z is from O's perspective; the W stored at a node is the
    // value for the player who *moved to reach that node*.
    let cur: Node | null = node;
    while (cur !== null) {
      cur.N += 1;
      // the player who moved to reach `cur` is the opposite of `cur.player`
      const mover = cur.player === 1 ? 2 : 1;
      cur.W += mover === 2 ? z : -z;
      cur = cur.parent;
    }
  }
  // pick most-visited action at root
  let best = -1, bn = -1;
  for (const [a, ch] of root.children.entries()) {
    if (ch.N > bn) { bn = ch.N; best = a; }
  }
  return best;
}

export default function TicTacToeMCTS() {
  const [board, setBoard] = useState<Board>(Array(9).fill(0) as Board);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [iters, setIters] = useState(200);
  const [history, setHistory] = useState<string[]>([]);
  const w = useMemo(() => winner(board), [board]);

  function reset() {
    setBoard(Array(9).fill(0) as Board);
    setTurn(1);
    setHistory([]);
  }

  function userPlay(i: number) {
    if (board[i] || w || turn !== 1) return;
    let nb = apply(board, i, 1);
    const newHist = [...history, `You (X) → ${i}`];
    let nextTurn: 1 | 2 = 2;
    let wins = winner(nb);
    if (wins === 0) {
      // MCTS responds
      const a = chooseMCTS(nb, iters);
      if (a >= 0) {
        nb = apply(nb, a, 2);
        newHist.push(`MCTS (O, ${iters} iters) → ${a}`);
        nextTurn = 1;
      }
    }
    setBoard(nb);
    setTurn(nextTurn);
    setHistory(newHist);
  }

  const status = w === 1 ? 'You win 🎉' : w === 2 ? 'MCTS wins' : w === 3 ? 'Draw' : turn === 1 ? 'Your move (X)' : 'MCTS thinking…';

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.6rem' }}>
        <label style={{ flex: 1, minWidth: 200, fontSize: '0.85rem' }}>
          MCTS iterations per move = {iters}
          <input type="range" min="10" max="3000" step="10" value={iters}
            onChange={(e) => setIters(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <button onClick={reset} style={btn}>New game</button>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{status}</div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gridGap: 4 }}>
          {board.map((v, i) => (
            <button key={i} onClick={() => userPlay(i)}
              disabled={!!v || !!w || turn !== 1}
              style={{
                width: 64, height: 64,
                background: 'var(--sl-color-gray-6)',
                border: '1px solid var(--sl-color-gray-5)',
                borderRadius: 4,
                fontSize: '1.8rem',
                fontFamily: 'inherit',
                color: v === 1 ? '#3b82f6' : v === 2 ? '#ef4444' : 'inherit',
                cursor: !v && !w && turn === 1 ? 'pointer' : 'default',
              }}>
              {v === 1 ? 'X' : v === 2 ? 'O' : ''}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Game log</div>
          <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.4rem', borderRadius: 4,
            fontFamily: 'monospace', fontSize: '0.78rem', maxHeight: 180, overflowY: 'auto' }}>
            {history.length === 0 ? <span style={{ opacity: 0.5 }}>Click a square to start.</span>
              : history.map((s, i) => <div key={i}>{s}</div>)}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', borderRadius: 4, background: 'rgba(59,130,246,0.08)' }}>
            With ~20 iterations MCTS plays roughly like a beginner. By ~500 it is optimal — every game should
            end in a draw if you play perfectly. Try beating it with the budget at 20 vs 1000 to feel the
            scaling.
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
