import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// Conceptual demo: show how naive sequential training (highly correlated
// samples) makes the loss spiky compared to mini-batch from a replay buffer
// drawn uniformly at random. Both fit the same toy "target Q-function":
// Q*(s) = sin(s/2) on s ∈ [0, 30]. Trainer is a simple online regressor on
// a piecewise-linear (10 knot) approximator.

const N_KNOTS = 11;
const S_MAX = 30;
const KNOT_X = Array.from({ length: N_KNOTS }, (_, i) => (i * S_MAX) / (N_KNOTS - 1));

function trueQ(s: number) {
  return Math.sin(s / 2);
}

function interp(theta: number[], s: number): number {
  const t = s / (S_MAX / (N_KNOTS - 1));
  const i = Math.min(N_KNOTS - 2, Math.max(0, Math.floor(t)));
  const f = t - i;
  return theta[i] * (1 - f) + theta[i + 1] * f;
}

function grad(theta: number[], s: number): number[] {
  const g = Array(N_KNOTS).fill(0);
  const t = s / (S_MAX / (N_KNOTS - 1));
  const i = Math.min(N_KNOTS - 2, Math.max(0, Math.floor(t)));
  const f = t - i;
  g[i] = 1 - f;
  g[i + 1] = f;
  return g;
}

function simulate(replay: boolean, lr: number, steps: number, bufferSize: number) {
  let theta = Array(N_KNOTS).fill(0);
  const buffer: { s: number; y: number }[] = [];
  const losses: number[] = [];
  let s = 0;
  // deterministic RNG
  let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let step = 0; step < steps; step++) {
    // collect one sequential sample (sweeping s from 0..S_MAX and back, like trajectory)
    s = (step * 0.6) % S_MAX;
    const sample = { s, y: trueQ(s) };
    buffer.push(sample);
    if (buffer.length > bufferSize) buffer.shift();

    let batch: { s: number; y: number }[];
    if (replay) {
      batch = [];
      for (let k = 0; k < 8; k++) {
        const idx = Math.floor(rand() * buffer.length);
        batch.push(buffer[idx]);
      }
    } else {
      // naive: just train on the latest sample (sequential, correlated)
      batch = [sample];
    }

    // SGD update on MSE
    let lossStep = 0;
    for (const ex of batch) {
      const yhat = interp(theta, ex.s);
      const err = yhat - ex.y;
      lossStep += err * err;
      const g = grad(theta, ex.s);
      for (let i = 0; i < N_KNOTS; i++) theta[i] -= lr * err * g[i];
    }
    losses.push(lossStep / batch.length);
  }
  // running global loss on uniform eval grid
  const evalLosses: number[] = [];
  let acc = 0;
  for (let step = 0; step < steps; step++) {
    const l = losses[step];
    acc = step === 0 ? l : 0.95 * acc + 0.05 * l;
    evalLosses.push(acc);
  }
  return { theta, losses, evalLosses };
}

export default function ReplayBufferDemo() {
  const [steps, setSteps] = useState(300);
  const [bufferSize, setBufferSize] = useState(200);
  const [lr, setLr] = useState(0.15);

  const a = useMemo(() => simulate(false, lr, steps, bufferSize), [steps, bufferSize, lr]);
  const b = useMemo(() => simulate(true, lr, steps, bufferSize), [steps, bufferSize, lr]);

  const xEval = Array.from({ length: 80 }, (_, i) => (i * S_MAX) / 79);
  const yTrue = xEval.map(trueQ);
  const yNaive = xEval.map((s) => interp(a.theta, s));
  const yReplay = xEval.map((s) => interp(b.theta, s));

  return (
    <div className="plotly-viz">
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}>
          training steps = {steps}
          <input type="range" min="50" max="800" step="10" value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}>
          replay buffer size = {bufferSize}
          <input type="range" min="5" max="500" step="5" value={bufferSize}
            onChange={(e) => setBufferSize(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}>
          learning rate = {lr.toFixed(2)}
          <input type="range" min="0.02" max="0.6" step="0.02" value={lr}
            onChange={(e) => setLr(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <Plot
        data={[
          { x: xEval, y: yTrue, type: 'scatter', mode: 'lines', name: 'True Q*(s)', line: { color: '#94a3b8', width: 2, dash: 'dash' } },
          { x: xEval, y: yNaive, type: 'scatter', mode: 'lines', name: 'Naive (sequential)', line: { color: '#ef4444', width: 2 } },
          { x: xEval, y: yReplay, type: 'scatter', mode: 'lines', name: 'Replay buffer (random batch)', line: { color: '#3b82f6', width: 2 } },
        ]}
        layout={{
          title: 'Fit after training: sequential vs replay',
          xaxis: { title: 'state s' },
          yaxis: { title: 'Q(s)', range: [-1.3, 1.3] },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 50 },
          legend: { x: 0.5, y: 1.18, xanchor: 'center', orientation: 'h' },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: '300px' }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.4rem', opacity: 0.85 }}>
        Without a replay buffer the model overfits whichever region the trajectory last visited, then
        forgets it as the trajectory moves on. Random mini-batches from a buffer let one transition
        contribute to many updates spread evenly across the state space.
      </div>
    </div>
  );
}
