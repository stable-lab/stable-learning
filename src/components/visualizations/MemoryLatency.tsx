import { useMemo, useState } from 'react';
import Plot from './LazyPlot';

// User picks a hit-rate distribution across the hierarchy; we compute Average
// Memory Access Time (AMAT) and show it visually. Teaches the intuition that
// even a 99% L1 hit rate leaves AMAT dominated by the 1% that miss.

const LEVELS = [
  { name: 'L1', latency: 1 },
  { name: 'L2', latency: 5 },
  { name: 'L3', latency: 15 },
  { name: 'DRAM', latency: 100 },
];

export default function MemoryLatency() {
  const [l1Hit, setL1Hit] = useState(0.97);
  const [l2Hit, setL2Hit] = useState(0.8);
  const [l3Hit, setL3Hit] = useState(0.6);

  const amat = useMemo(() => {
    // AMAT = L1.latency + (1 - L1Hit) * (L2.latency + (1 - L2Hit) * (L3.latency + (1 - L3Hit) * DRAM.latency))
    const t = LEVELS[0].latency
      + (1 - l1Hit) * (LEVELS[1].latency
        + (1 - l2Hit) * (LEVELS[2].latency
          + (1 - l3Hit) * LEVELS[3].latency));
    return t;
  }, [l1Hit, l2Hit, l3Hit]);

  // breakdown of contribution
  const contrib = useMemo(() => {
    const c1 = LEVELS[0].latency;
    const c2 = (1 - l1Hit) * LEVELS[1].latency;
    const c3 = (1 - l1Hit) * (1 - l2Hit) * LEVELS[2].latency;
    const c4 = (1 - l1Hit) * (1 - l2Hit) * (1 - l3Hit) * LEVELS[3].latency;
    return [c1, c2, c3, c4];
  }, [l1Hit, l2Hit, l3Hit]);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>
          L1 hit rate = {(l1Hit * 100).toFixed(1)}%
          <input type="range" min="0" max="1" step="0.005" value={l1Hit}
            onChange={(e) => setL1Hit(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>
          L2 hit rate (of L1 misses) = {(l2Hit * 100).toFixed(1)}%
          <input type="range" min="0" max="1" step="0.01" value={l2Hit}
            onChange={(e) => setL2Hit(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>
          L3 hit rate (of L2 misses) = {(l3Hit * 100).toFixed(1)}%
          <input type="range" min="0" max="1" step="0.01" value={l3Hit}
            onChange={(e) => setL3Hit(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ fontSize: '0.9rem', padding: '0.5rem', background: 'var(--sl-color-gray-6)', borderRadius: 4, marginBottom: '0.4rem' }}>
        <strong>Average Memory Access Time (AMAT):</strong> {amat.toFixed(2)} ns
      </div>

      <Plot
        data={[
          {
            x: contrib,
            y: LEVELS.map((l) => l.name),
            type: 'bar',
            orientation: 'h',
            marker: { color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'] },
            text: contrib.map((c) => `${c.toFixed(2)} ns`),
            textposition: 'auto',
          },
        ]}
        layout={{
          title: 'Contribution of each level to AMAT',
          xaxis: { title: 'ns added to average access' },
          yaxis: { title: '', autorange: 'reversed' },
          autosize: true,
          margin: { t: 40, r: 10, b: 50, l: 60 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          showlegend: false,
        }}
        useResizeHandler
        style={{ width: '100%', height: 240 }}
        config={{ displayModeBar: false }}
      />
      <div style={{ fontSize: '0.82rem', marginTop: '0.4rem', opacity: 0.85 }}>
        AMAT = T<sub>L1</sub> + P(L1 miss) · (T<sub>L2</sub> + P(L2 miss) · (T<sub>L3</sub> + P(L3 miss) · T<sub>DRAM</sub>)).
        Notice how cutting the L1 hit rate from 99% to 95% — sounds tiny — multiplies the L2/L3/DRAM
        contributions by 5×.
      </div>
    </div>
  );
}
