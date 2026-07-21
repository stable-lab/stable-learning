import { useMemo, useState } from 'react';

// Tiny LRU cache simulator: user picks size/associativity and one of three
// access patterns (sequential, strided, looping). We show hits/misses and
// classify each miss as compulsory / capacity / conflict.

type Pattern = 'sequential' | 'strided' | 'looping' | 'pingpong';

function makePattern(p: Pattern, n: number): number[] {
  const addrs: number[] = [];
  if (p === 'sequential') {
    for (let i = 0; i < n; i++) addrs.push(i * 4);
  } else if (p === 'strided') {
    // strided so that consecutive accesses fall in the same set
    for (let i = 0; i < n; i++) addrs.push(i * 4096);
  } else if (p === 'looping') {
    // working set 16 blocks (line 64), looped
    for (let i = 0; i < n; i++) addrs.push((i % 16) * 64);
  } else {
    // ping-pong two addresses
    for (let i = 0; i < n; i++) addrs.push(i % 2 === 0 ? 0 : 64);
  }
  return addrs;
}

const LINE = 64;

export default function CacheSim() {
  const [pattern, setPattern] = useState<Pattern>('looping');
  const [sets, setSets] = useState(4);
  const [ways, setWays] = useState(2);
  const [steps, setSteps] = useState(32);

  const result = useMemo(() => {
    const addrs = makePattern(pattern, steps);
    // each set holds `ways` lines: store {tag, lastUsed}
    type Entry = { tag: number; lastUsed: number };
    const cache: Entry[][] = Array.from({ length: sets }, () => []);
    let hits = 0, miss = 0, comp = 0, cap = 0, conf = 0;
    const seenTags = new Set<string>();
    const fullyAssocSet = new Set<number>(); // simulate fully-assoc cache with `sets*ways` slots
    const fullyAssocCap = sets * ways;
    const fullyAssoc: { tag: number; lastUsed: number }[] = [];
    const log: { addr: number; tagIdxOff: { tag: number; idx: number; off: number }; result: 'hit' | 'miss'; kind?: 'compulsory' | 'capacity' | 'conflict' }[] = [];

    addrs.forEach((addr, step) => {
      const off = addr % LINE;
      const block = Math.floor(addr / LINE);
      const idx = block % sets;
      const tag = Math.floor(block / sets);
      const key = `${idx}-${tag}`;
      const set = cache[idx];
      const found = set.find((e) => e.tag === tag);
      if (found) {
        found.lastUsed = step;
        hits += 1;
        log.push({ addr, tagIdxOff: { tag, idx, off }, result: 'hit' });
      } else {
        miss += 1;
        // classify
        let kind: 'compulsory' | 'capacity' | 'conflict' = 'conflict';
        if (!seenTags.has(key)) { kind = 'compulsory'; comp += 1; seenTags.add(key); }
        else {
          // would a fully-assoc cache of same total size have hit? if yes → conflict; else capacity
          const fa = fullyAssoc.find((e) => e.tag === block);
          if (!fa) { kind = 'capacity'; cap += 1; }
          else { kind = 'conflict'; conf += 1; }
        }
        log.push({ addr, tagIdxOff: { tag, idx, off }, result: 'miss', kind });
        if (set.length < ways) {
          set.push({ tag, lastUsed: step });
        } else {
          // evict LRU
          let lru = 0;
          for (let i = 1; i < set.length; i++) if (set[i].lastUsed < set[lru].lastUsed) lru = i;
          set[lru] = { tag, lastUsed: step };
        }
      }
      // update fully-assoc shadow
      const idxFa = fullyAssoc.findIndex((e) => e.tag === block);
      if (idxFa >= 0) {
        fullyAssoc[idxFa].lastUsed = step;
      } else {
        if (fullyAssoc.length < fullyAssocCap) {
          fullyAssoc.push({ tag: block, lastUsed: step });
        } else {
          let lru = 0;
          for (let i = 1; i < fullyAssoc.length; i++) if (fullyAssoc[i].lastUsed < fullyAssoc[lru].lastUsed) lru = i;
          fullyAssoc[lru] = { tag: block, lastUsed: step };
        }
      }
    });
    return { hits, miss, comp, cap, conf, log, cache };
  }, [pattern, sets, ways, steps]);

  const hitRate = (result.hits / Math.max(1, result.hits + result.miss) * 100).toFixed(1);

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>
          Sets = {sets}
          <input type="range" min="1" max="32" step="1" value={sets}
            onChange={(e) => setSets(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>
          Ways = {ways}
          <input type="range" min="1" max="8" step="1" value={ways}
            onChange={(e) => setWays(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>
          Steps = {steps}
          <input type="range" min="8" max="200" step="4" value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 200 }}>
          Pattern
          <select value={pattern} onChange={(e) => setPattern(e.target.value as Pattern)}
            style={{ width: '100%', padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            <option value="sequential">Sequential (i*4)</option>
            <option value="strided">Strided (i*4096) — conflict trap</option>
            <option value="looping">Looping working set (16 blocks)</option>
            <option value="pingpong">Ping-pong (2 addresses)</option>
          </select>
        </label>
      </div>

      <div style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'var(--sl-color-gray-6)', borderRadius: 4, marginBottom: '0.5rem' }}>
        <strong>Capacity:</strong> {sets * ways} lines × {LINE} B = {sets * ways * LINE} B &nbsp;|&nbsp;
        <strong>Hit rate:</strong> {hitRate}% ({result.hits}/{result.hits + result.miss}) &nbsp;|&nbsp;
        misses: <span style={{ color: '#94a3b8' }}>compulsory={result.comp}</span>,{' '}
        <span style={{ color: '#f59e0b' }}>capacity={result.cap}</span>,{' '}
        <span style={{ color: '#ef4444' }}>conflict={result.conf}</span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 300, maxHeight: 220, overflowY: 'auto', background: 'var(--sl-color-gray-6)', padding: '0.4rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.76rem' }}>
          {result.log.map((e, i) => (
            <div key={i} style={{ color: e.result === 'hit' ? '#22c55e' : (e.kind === 'compulsory' ? '#94a3b8' : e.kind === 'capacity' ? '#f59e0b' : '#ef4444') }}>
              t={String(i).padStart(3, ' ')}  addr=0x{e.addr.toString(16).padStart(6, '0')}  idx={e.tagIdxOff.idx}  tag={e.tagIdxOff.tag}  →  {e.result}{e.kind ? ` (${e.kind})` : ''}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 600 }}>Cache snapshot</div>
          <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.4rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.74rem' }}>
            {result.cache.map((set, si) => (
              <div key={si}>set {si}: [{set.length === 0 ? <span style={{ opacity: 0.5 }}>empty</span> :
                set.map((e, j) => <span key={j}>tag={e.tag}{j < set.length - 1 ? ', ' : ''}</span>)}]</div>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(59,130,246,0.08)', borderRadius: 4 }}>
            Try: <em>Strided</em> pattern with ways=1 vs ways=8. Same total capacity, but only the higher
            associativity converts the conflict misses into hits.
          </div>
        </div>
      </div>
    </div>
  );
}
