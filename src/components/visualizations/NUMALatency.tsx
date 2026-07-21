import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// 4-socket NUMA model. User chooses a working set size and the
// distribution of allocations across sockets. We compute average
// memory access latency given local vs remote ratios.

const NUM_SOCKETS = 4;
const LOCAL_LAT = 80;     // ns
const ONE_HOP_LAT = 140;  // ns (adjacent socket)
const TWO_HOP_LAT = 200;  // ns (across the fabric)

// hop-distance matrix for a 2x2 mesh:
//   0 - 1
//   |   |
//   2 - 3
const HOPS: number[][] = [
  [0, 1, 1, 2],
  [1, 0, 2, 1],
  [1, 2, 0, 1],
  [2, 1, 1, 0],
];

function latencyForHops(h: number) {
  if (h === 0) return LOCAL_LAT;
  if (h === 1) return ONE_HOP_LAT;
  return TWO_HOP_LAT;
}

export default function NUMALatency() {
  const [runningSocket, setRunningSocket] = useState(0);
  // 4 sliders summing to 1 — fraction of memory on each socket
  const [alloc, setAlloc] = useState<number[]>([0.25, 0.25, 0.25, 0.25]);

  function setOne(i: number, v: number) {
    // rescale others to sum to 1 - v
    const other = alloc.reduce((s, a, j) => j === i ? s : s + a, 0);
    const next = alloc.slice();
    next[i] = v;
    if (other > 0) {
      const scale = (1 - v) / other;
      for (let j = 0; j < NUM_SOCKETS; j++) if (j !== i) next[j] = alloc[j] * scale;
    } else {
      for (let j = 0; j < NUM_SOCKETS; j++) if (j !== i) next[j] = (1 - v) / (NUM_SOCKETS - 1);
    }
    setAlloc(next);
  }

  const avgLatency = useMemo(() => {
    let s = 0;
    for (let j = 0; j < NUM_SOCKETS; j++) {
      s += alloc[j] * latencyForHops(HOPS[runningSocket][j]);
    }
    return s;
  }, [alloc, runningSocket]);

  const speedup = (LOCAL_LAT / avgLatency * 100).toFixed(0);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: '0.85rem' }}>
          <div><strong>Thread runs on socket:</strong></div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {[0, 1, 2, 3].map((s) => (
              <button key={s} onClick={() => setRunningSocket(s)} style={{
                padding: '4px 10px',
                border: '1px solid var(--sl-color-gray-5)',
                borderRadius: 4,
                background: s === runningSocket ? '#3b82f6' : 'var(--sl-color-bg)',
                color: s === runningSocket ? 'white' : 'inherit',
                cursor: 'pointer', fontSize: '0.85rem',
              }}>S{s}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 2, minWidth: 280, fontSize: '0.82rem' }}>
          <div><strong>Memory allocation fraction by socket:</strong></div>
          {alloc.map((v, i) => (
            <label key={i} style={{ display: 'block', marginTop: 4 }}>
              S{i}: {(v * 100).toFixed(0)}% (hop dist {HOPS[runningSocket][i]} → {latencyForHops(HOPS[runningSocket][i])} ns)
              <input type="range" min="0" max="1" step="0.01" value={v}
                onChange={(e) => setOne(i, parseFloat(e.target.value))} style={{ width: '100%' }} />
            </label>
          ))}
        </div>
      </div>

      <div style={{ fontSize: '0.9rem', padding: '0.5rem', background: 'var(--sl-color-gray-6)', borderRadius: 4, marginBottom: '0.4rem' }}>
        <strong>Average memory latency from socket {runningSocket}:</strong> {avgLatency.toFixed(1)} ns &nbsp;|&nbsp;
        <span style={{ opacity: 0.8 }}>vs. ideal local-only: {LOCAL_LAT} ns ({speedup}% as fast as local)</span>
      </div>

      <Plot
        data={[
          {
            x: [0, 1, 0, 1],
            y: [1, 1, 0, 0],
            text: ['S0', 'S1', 'S2', 'S3'],
            mode: 'markers+text',
            type: 'scatter',
            marker: {
              size: [80, 80, 80, 80],
              color: alloc.map((a) => `rgba(59, 130, 246, ${0.2 + 0.7 * a})`),
              line: { color: [0, 1, 2, 3].map((s) => s === runningSocket ? '#ef4444' : '#475569'), width: [0, 1, 2, 3].map((s) => s === runningSocket ? 4 : 1.5) },
            },
            textfont: { color: 'white', size: 14 },
            showlegend: false,
          },
        ]}
        layout={{
          xaxis: { range: [-0.5, 1.5], visible: false },
          yaxis: { range: [-0.5, 1.5], visible: false },
          margin: { t: 5, r: 5, b: 5, l: 5 },
          autosize: true,
          shapes: [
            { type: 'line', x0: 0, y0: 1, x1: 1, y1: 1, line: { color: '#94a3b8', width: 2 } },
            { type: 'line', x0: 0, y0: 0, x1: 1, y1: 0, line: { color: '#94a3b8', width: 2 } },
            { type: 'line', x0: 0, y0: 0, x1: 0, y1: 1, line: { color: '#94a3b8', width: 2 } },
            { type: 'line', x0: 1, y0: 0, x1: 1, y1: 1, line: { color: '#94a3b8', width: 2 } },
            { type: 'line', x0: 0, y0: 1, x1: 1, y1: 0, line: { color: '#cbd5e1', width: 1, dash: 'dot' } },
            { type: 'line', x0: 0, y0: 0, x1: 1, y1: 1, line: { color: '#cbd5e1', width: 1, dash: 'dot' } },
          ],
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        useResizeHandler
        style={{ width: '100%', height: 230 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.4rem', opacity: 0.85 }}>
        Red border = running socket. Circle intensity = fraction of memory on that socket. Adjacent
        sockets are 1-hop, diagonal sockets are 2-hop. The dotted edges represent the interconnect mesh.
      </div>
    </div>
  );
}
