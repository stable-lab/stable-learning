import { useMemo, useState } from 'react';

// User picks a memory-order annotation and an architecture; we display
// the actual instructions emitted and the *relative* cost (illustrative).
//
// This is pulled from godbolt empirical compilations of std::atomic ops.

type Op = 'load' | 'store' | 'rmw';
type Order = 'relaxed' | 'acquire' | 'release' | 'acq_rel' | 'seq_cst';
type Arch = 'x86' | 'arm' | 'riscv';

const TABLE: Record<Arch, Record<Op, Record<Order, { insn: string[]; cycles: number }>>> = {
  x86: {
    load: {
      relaxed: { insn: ['mov rax, [rdi]'], cycles: 1 },
      acquire: { insn: ['mov rax, [rdi]'], cycles: 1 },
      release: { insn: ['(not valid for load)'], cycles: 0 },
      acq_rel: { insn: ['(not valid for load)'], cycles: 0 },
      seq_cst: { insn: ['mov rax, [rdi]'], cycles: 1 },
    },
    store: {
      relaxed: { insn: ['mov [rdi], rsi'], cycles: 1 },
      acquire: { insn: ['(not valid for store)'], cycles: 0 },
      release: { insn: ['mov [rdi], rsi'], cycles: 1 },
      acq_rel: { insn: ['(not valid for store)'], cycles: 0 },
      seq_cst: { insn: ['xchg [rdi], rsi'], cycles: 18 },
    },
    rmw: {
      relaxed: { insn: ['lock xadd [rdi], rsi'], cycles: 18 },
      acquire: { insn: ['lock xadd [rdi], rsi'], cycles: 18 },
      release: { insn: ['lock xadd [rdi], rsi'], cycles: 18 },
      acq_rel: { insn: ['lock xadd [rdi], rsi'], cycles: 18 },
      seq_cst: { insn: ['lock xadd [rdi], rsi'], cycles: 18 },
    },
  },
  arm: {
    load: {
      relaxed: { insn: ['ldr x0, [x1]'], cycles: 1 },
      acquire: { insn: ['ldar x0, [x1]'], cycles: 3 },
      release: { insn: ['(not valid)'], cycles: 0 },
      acq_rel: { insn: ['(not valid)'], cycles: 0 },
      seq_cst: { insn: ['ldar x0, [x1]'], cycles: 3 },
    },
    store: {
      relaxed: { insn: ['str x0, [x1]'], cycles: 1 },
      acquire: { insn: ['(not valid)'], cycles: 0 },
      release: { insn: ['stlr x0, [x1]'], cycles: 4 },
      acq_rel: { insn: ['(not valid)'], cycles: 0 },
      seq_cst: { insn: ['stlr x0, [x1]', 'dmb ish'], cycles: 24 },
    },
    rmw: {
      relaxed: { insn: ['1: ldxr ..., [x1]', '   add ...', '   stxr ..., [x1]', '   cbnz 1b'], cycles: 8 },
      acquire: { insn: ['1: ldaxr ..., [x1]', '   add ...', '   stxr ..., [x1]', '   cbnz 1b'], cycles: 10 },
      release: { insn: ['1: ldxr ..., [x1]', '   add ...', '   stlxr ..., [x1]', '   cbnz 1b'], cycles: 11 },
      acq_rel: { insn: ['1: ldaxr ..., [x1]', '   add ...', '   stlxr ..., [x1]', '   cbnz 1b'], cycles: 13 },
      seq_cst: { insn: ['1: ldaxr ..., [x1]', '   add ...', '   stlxr ..., [x1]', '   cbnz 1b', '   dmb ish'], cycles: 25 },
    },
  },
  riscv: {
    load: {
      relaxed: { insn: ['ld a0, 0(a1)'], cycles: 1 },
      acquire: { insn: ['ld a0, 0(a1)', 'fence r, rw'], cycles: 6 },
      release: { insn: ['(not valid)'], cycles: 0 },
      acq_rel: { insn: ['(not valid)'], cycles: 0 },
      seq_cst: { insn: ['fence rw, rw', 'ld a0, 0(a1)', 'fence r, rw'], cycles: 14 },
    },
    store: {
      relaxed: { insn: ['sd a0, 0(a1)'], cycles: 1 },
      acquire: { insn: ['(not valid)'], cycles: 0 },
      release: { insn: ['fence rw, w', 'sd a0, 0(a1)'], cycles: 6 },
      acq_rel: { insn: ['(not valid)'], cycles: 0 },
      seq_cst: { insn: ['fence rw, w', 'sd a0, 0(a1)', 'fence rw, rw'], cycles: 14 },
    },
    rmw: {
      relaxed: { insn: ['amoadd.d a0, a1, (a2)'], cycles: 10 },
      acquire: { insn: ['amoadd.d.aq a0, a1, (a2)'], cycles: 12 },
      release: { insn: ['amoadd.d.rl a0, a1, (a2)'], cycles: 12 },
      acq_rel: { insn: ['amoadd.d.aqrl a0, a1, (a2)'], cycles: 15 },
      seq_cst: { insn: ['amoadd.d.aqrl a0, a1, (a2)'], cycles: 15 },
    },
  },
};

export default function FenceCost() {
  const [arch, setArch] = useState<Arch>('x86');
  const [op, setOp] = useState<Op>('store');
  const [order, setOrder] = useState<Order>('seq_cst');

  const cell = TABLE[arch][op][order];
  const validOrders: Order[] = op === 'load' ? ['relaxed', 'acquire', 'seq_cst'] : op === 'store' ? ['relaxed', 'release', 'seq_cst'] : ['relaxed', 'acquire', 'release', 'acq_rel', 'seq_cst'];

  // baseline relaxed cost for comparison
  const relaxedCost = TABLE[arch][op]['relaxed'].cycles;
  const overhead = relaxedCost > 0 ? (cell.cycles / relaxedCost) : cell.cycles;

  return (
    <div className="plotly-viz" style={{ fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem' }}>Architecture
          <select value={arch} onChange={(e) => setArch(e.target.value as Arch)}
            style={{ marginLeft: 6, padding: 3, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            <option value="x86">x86 (TSO)</option>
            <option value="arm">ARM64</option>
            <option value="riscv">RISC-V</option>
          </select>
        </label>
        <label style={{ fontSize: '0.85rem' }}>Operation
          <select value={op} onChange={(e) => { setOp(e.target.value as Op); setOrder('seq_cst'); }}
            style={{ marginLeft: 6, padding: 3, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            <option value="load">load</option>
            <option value="store">store</option>
            <option value="rmw">fetch-add (RMW)</option>
          </select>
        </label>
        <label style={{ fontSize: '0.85rem' }}>std::memory_order
          <select value={order} onChange={(e) => setOrder(e.target.value as Order)}
            style={{ marginLeft: 6, padding: 3, background: 'var(--sl-color-bg)', color: 'inherit', border: '1px solid var(--sl-color-gray-5)' }}>
            {validOrders.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>

      <div style={{ background: 'var(--sl-color-gray-6)', padding: '0.6rem', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.84rem' }}>
        {cell.cycles === 0 ? (
          <span style={{ opacity: 0.6 }}>{cell.insn[0]}</span>
        ) : (
          cell.insn.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>

      <div style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
        <strong>≈ {cell.cycles} cycle{cell.cycles === 1 ? '' : 's'}</strong>{relaxedCost > 0 && cell.cycles > 0 && (
          <> &nbsp;|&nbsp; {overhead.toFixed(1)}× the cost of a relaxed {op}</>
        )}
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(59,130,246,0.08)' }}>
        Cycle counts are approximate (single-thread, uncontended, Skylake/Cortex-A76/U74 ranges).
        Notice: an x86 `seq_cst` *load* costs the same as `relaxed`, but an x86 `seq_cst` *store* needs
        a locked instruction and is ~18× slower. On ARM both load-acquire and store-release have a real
        cost but it's a small constant — the cliff is at `seq_cst`.
      </div>
    </div>
  );
}
