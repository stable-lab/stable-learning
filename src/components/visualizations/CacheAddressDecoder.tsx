import { useMemo, useState } from 'react';

// Educational decomposer: given cache size, line size, associativity, decompose
// a 32-bit address into Tag / Index / Offset, and show how associativity
// changes the index width.

const ADDR_BITS = 32;

function log2(n: number) { return Math.round(Math.log2(n)); }

export default function CacheAddressDecoder() {
  const [cacheKB, setCacheKB] = useState(32);
  const [lineBytes, setLineBytes] = useState(64);
  const [waysLog, setWaysLog] = useState(3); // ways = 2^waysLog, default 8-way
  const [address, setAddress] = useState('0x1A2B3C40');

  const ways = 1 << waysLog;
  const sets = Math.max(1, (cacheKB * 1024) / lineBytes / ways);
  const validConfig = Number.isInteger(sets);
  const offsetBits = log2(lineBytes);
  const indexBits = log2(sets);
  const tagBits = ADDR_BITS - offsetBits - indexBits;

  const addrNum = useMemo(() => {
    try {
      const v = address.startsWith('0x') || address.startsWith('0X') ? parseInt(address.slice(2), 16) : parseInt(address);
      if (isNaN(v)) return null;
      return v >>> 0; // unsigned 32-bit
    } catch { return null; }
  }, [address]);

  const bits = useMemo(() => {
    if (addrNum === null) return null;
    const s = addrNum.toString(2).padStart(ADDR_BITS, '0');
    return s;
  }, [addrNum]);

  const tagStr = bits ? bits.slice(0, tagBits) : '';
  const idxStr = bits && indexBits > 0 ? bits.slice(tagBits, tagBits + indexBits) : '';
  const offStr = bits ? bits.slice(tagBits + indexBits) : '';

  const tagVal = tagStr ? parseInt(tagStr, 2) : 0;
  const idxVal = idxStr ? parseInt(idxStr, 2) : 0;
  const offVal = offStr ? parseInt(offStr, 2) : 0;

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 150 }}>
          Cache size = {cacheKB} KB
          <input type="range" min="4" max="1024" step="4" value={cacheKB}
            onChange={(e) => setCacheKB(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 150 }}>
          Line size = {lineBytes} B
          <select value={lineBytes} onChange={(e) => setLineBytes(parseInt(e.target.value))}
            style={{ width: '100%', padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            {[16, 32, 64, 128, 256].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 150 }}>
          Associativity = {ways}-way
          <input type="range" min="0" max="7" step="1" value={waysLog}
            onChange={(e) => setWaysLog(parseInt(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: '0.85rem', flex: 1, minWidth: 200 }}>
          Address (hex)
          <input type="text" value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ width: '100%', padding: 4, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)', borderRadius: 3 }} />
        </label>
      </div>

      <div style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'var(--sl-color-gray-6)', borderRadius: 4, marginBottom: '0.5rem' }}>
        <div><strong>Sets</strong>: {validConfig ? sets : 'invalid (not integer)'} &nbsp; (cache_size ÷ line_size ÷ ways)</div>
        <div><strong>Bits</strong>: tag = {tagBits}, index = {indexBits}, offset = {offsetBits} &nbsp; (total = {tagBits + indexBits + offsetBits})</div>
      </div>

      {bits && (
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {Array.from(bits).map((b, i) => {
              const isTag = i < tagBits;
              const isIdx = !isTag && i < tagBits + indexBits;
              const bg = isTag ? 'rgba(59,130,246,0.35)' : isIdx ? 'rgba(245,158,11,0.45)' : 'rgba(34,197,94,0.4)';
              return (
                <span key={i} style={{
                  display: 'inline-block', width: 18, textAlign: 'center',
                  background: bg, borderRight: '1px solid rgba(0,0,0,0.2)',
                  padding: '2px 0', color: 'var(--sl-color-text)', fontWeight: 600,
                }}>{b}</span>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span style={chip('rgba(59,130,246,0.35)')}>tag = 0x{tagVal.toString(16)}</span>
            <span style={chip('rgba(245,158,11,0.45)')}>set index = {idxVal} (0x{idxVal.toString(16)})</span>
            <span style={chip('rgba(34,197,94,0.4)')}>byte offset = {offVal}</span>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', opacity: 0.85 }}>
            The hardware looks up set <strong>{idxVal}</strong>, then compares the stored tag in each of the
            {' '}<strong>{ways}</strong> ways against tag <strong>0x{tagVal.toString(16)}</strong>. A match is a
            hit; the requested byte sits at offset <strong>{offVal}</strong> within that line.
          </div>
        </div>
      )}
    </div>
  );
}

function chip(bg: string): React.CSSProperties {
  return { padding: '2px 8px', borderRadius: 12, background: bg, fontFamily: 'monospace' };
}
