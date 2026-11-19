'use client';
// Measurement detail: the photo with the measurement drawn in its score colour, the value on a graded range
// bar, what it means, how it's measured, which assessments it feeds and its scoring curve. Assessment view:
// every measurement behind it (hover to see it on the photo, click for its own breakdown).
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { app } from '@/lib/app.js';
import { photoPanel } from '@/lib/canvas/photo-panel.js';
import { PILLARS, METRIC_BY_ID, ratioHex, ratioLabel, fmt, fmtRange, barGeom, scoreValue, assessmentDetail } from '@/lib/engine/metrics.js';
import { Icon, RollingNumber, openModal, modalCount } from './ui.jsx';

const VIEW = { front: 'Front', side: 'Side' };
const has = (r) => r && Number.isFinite(r.v);

function usedBy(id, res) {
  const m = METRIC_BY_ID[id], out = [];
  if (m.hm) out.push({ pillar: 'Harmony', name: `${VIEW[m.view]} Harmony`, score: res.pillars.harmony[m.view] });
  for (const p of PILLARS.slice(1)) for (const a of res.pillars[p.id].items) if (a.metrics.some(([x]) => x === id)) out.push({ pillar: p.name, name: a.name, score: a.score });
  return out;
}

function RangeBar({ m, r }) {
  const g = barGeom(m, r), pc = (x) => (x * 100).toFixed(2) + '%';
  const grad = `linear-gradient(90deg, #ff6b5e 0%, #f5b544 ${pc(Math.max(0, g.loW - 0.06))}, #a8d84e ${pc(g.loW)}, #3ddc97 ${pc(g.lo)}, #3ddc97 ${pc(g.hi)}, #a8d84e ${pc(g.hiW)}, #f5b544 ${pc(Math.min(1, g.hiW + 0.06))}, #ff6b5e 100%)`;
  const pos = has(r) ? g.at(r.v) : null;
  return (
    <div className="rbar">
      {pos != null && <motion.div className="rbar-bubble" style={{ '--c': ratioHex(r.s) }} initial={{ left: '50%', opacity: 0 }} animate={{ left: pc(pos), opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }}>{fmt(m, r.v)}</motion.div>}
      <div className="rbar-track" style={{ background: grad }}>
        <i className="rbar-band" style={{ left: pc(g.lo), width: pc(g.hi - g.lo) }} />
        {pos != null && <motion.i className="rbar-mark" initial={{ left: '50%' }} animate={{ left: pc(pos) }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} />}
      </div>
      <div className="rbar-labels"><span>{fmt(m, g.a)}</span><span className="ideal">ideal {fmtRange(m, r)}</span><span>{fmt(m, g.b)}</span></div>
    </div>
  );
}

function Curve({ m, r }) {
  const g = barGeom(m, r), W = 520, H = 170, P = { l: 30, r: 12, t: 14, b: 26 };
  const X = (v) => P.l + ((v - g.a) / (g.b - g.a)) * (W - P.l - P.r), Y = (s) => P.t + (1 - s / 10) * (H - P.t - P.b);
  let d = '';
  for (let i = 0; i <= 120; i++) { const v = g.a + ((g.b - g.a) * i) / 120; d += `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(scoreValue(m, v, r.lo, r.hi)).toFixed(1)}`; }
  const you = has(r) ? { x: X(Math.min(g.b, Math.max(g.a, r.v))), y: Y(r.s) } : null;
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3ddc97" stopOpacity=".28" /><stop offset="1" stopColor="#3ddc97" stopOpacity="0" /></linearGradient></defs>
      {[0, 5, 10].map((s) => <g key={s}><line x1={P.l} x2={W - P.r} y1={Y(s)} y2={Y(s)} className="grid" /><text x={P.l - 8} y={Y(s) + 4} textAnchor="end">{s}</text></g>)}
      <rect x={X(r.lo)} y={P.t} width={Math.max(1, X(r.hi) - X(r.lo))} height={H - P.t - P.b} className="band" />
      <path d={`${d}L${X(g.b)},${Y(0)}L${X(g.a)},${Y(0)}Z`} fill="url(#cg)" />
      <motion.path d={d} className="line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      {you && <><line x1={you.x} x2={you.x} y1={you.y} y2={Y(0)} className="you-l" style={{ stroke: ratioHex(r.s) }} /><motion.circle cx={you.x} cy={you.y} r="6" className="you" style={{ stroke: ratioHex(r.s) }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 }} /></>}
      <text x={X(g.a)} y={H - 8}>{fmt(m, g.a)}</text><text x={X(g.b)} y={H - 8} textAnchor="end">{fmt(m, g.b)}</text>
    </svg>
  );
}

// Shared shell: header with index and prev/next, photo on the left
function DetailShell({ idx, n, title, view, onPrev, onNext, close, photoRef, children }) {
  const depth = useRef(modalCount());
  useEffect(() => {
    const onKey = (e) => { if (modalCount() !== depth.current) return; if (e.key === 'ArrowLeft') onPrev(); else if (e.key === 'ArrowRight') onNext(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);
  return (
    <div className="dt">
      <div className="dt-head"><span className="chip">{idx + 1} / {n}</span><h2>{title}</h2>
        <div className="dt-nav"><button className="icon-btn soft" disabled={idx === 0} onClick={onPrev} title="Previous (←)"><Icon name="chevL" size={16} /></button>
          <button className="icon-btn soft" disabled={idx === n - 1} onClick={onNext} title="Next (→)"><Icon name="chevR" size={16} /></button>
          <button className="icon-btn soft" onClick={close} title="Close (Esc)"><Icon name="x" size={16} /></button></div></div>
      <div className="dt-body">
        <div className="dt-photo"><div className="stage-host" ref={photoRef} /><span className="chip dark dt-view">{view}</span></div>
        <AnimatePresence mode="wait"><motion.div key={title} className="dt-side" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>{children}</motion.div></AnimatePresence>
      </div>
    </div>
  );
}
function usePhoto(scan, res) {
  const ref = useRef(null), panel = useRef(null);
  useEffect(() => { panel.current = photoPanel(ref.current, app, scan, res); return () => panel.current.destroy(); }, [scan, res]);
  return { ref, show: (m) => panel.current?.show(m) };
}

function MetricDetail({ scan, res, ids, start, close }) {
  const [idx, setIdx] = useState(start);
  const ph = usePhoto(scan, res);
  const m = METRIC_BY_ID[ids[idx]], r = res.values[m.id];
  useEffect(() => { ph.show(m); }, [m.id]);
  const uses = usedBy(m.id, res);
  return (
    <DetailShell idx={idx} n={ids.length} title={m.name} view={`${VIEW[m.view]}${m.look ? ' · from the photo' : ''}`} close={close} photoRef={ph.ref}
      onPrev={() => setIdx((i) => Math.max(0, i - 1))} onNext={() => setIdx((i) => Math.min(ids.length - 1, i + 1))}>
      <div className="dt-score card-glass">
        <div className="dt-num">{has(r) ? <RollingNumber value={r.s} dp={1} duration={0.9} style={{ color: ratioHex(r.s) }} /> : <span className="num" style={{ color: 'var(--faint)' }}>—</span>}<span className="den">/10</span>
          <div className="cap">{has(r) ? ratioLabel(r.s) : 'Not measured'}</div></div>
        <RangeBar m={m} r={r} />
      </div>
      {!has(r) && <p className="fine dt-na">Not measured on this photo — a point it needs is hidden (for example hair over the forehead) or couldn’t be read, so it is left out of your scores.</p>}
      <section className="dt-sec"><div className="cap">About this measurement</div><p>{m.desc}</p></section>
      <section className="dt-sec"><div className="cap">How it&apos;s measured</div><p className="mono">{m.how}</p>
        <div className="dt-kv"><div><span>Your value</span><b>{fmt(m, r.v)}</b></div><div><span>Ideal (male)</span><b>{fmtRange(m, r)}</b></div><div><span>Typical man</span><b>{fmt(m, m.mean)}</b></div><div><span>Weight</span><b>×{m.w.toFixed(2)}</b></div></div></section>
      {uses.length > 0 && <section className="dt-sec"><div className="cap">Contributes to <span className="chip tiny">{uses.length}</span></div>
        <div className="dt-uses">{uses.map((u) => <div className="dt-use" key={u.pillar + u.name}><span><b>{u.name}</b><em>{u.pillar}</em></span><b style={{ color: ratioHex(u.score) }}>{Number.isFinite(u.score) ? u.score.toFixed(2) : '—'}</b></div>)}</div></section>}
      <section className="dt-sec"><div className="cap">Scoring curve</div><Curve m={m} r={r} />
        <p className="fine">Scores 10 anywhere inside the ideal range and falls off outside it; how fast depends on how much men normally vary on this measurement.</p></section>
    </DetailShell>
  );
}

function AssessmentDetail({ scan, res, pid, items, start, close }) {
  const [idx, setIdx] = useState(start);
  const ph = usePhoto(scan, res);
  const a = items[idx], det = assessmentDetail(a, res);
  const lead = det.find((d) => has(d)) || det[0];
  const pillar = PILLARS.find((p) => p.id === pid);
  useEffect(() => { ph.show(lead.m); }, [a.id]);
  return (
    <DetailShell idx={idx} n={items.length} title={a.name} view={`${pillar.name} · ${Math.round(a.w * 100)}% of the pillar`} close={close} photoRef={ph.ref}
      onPrev={() => setIdx((i) => Math.max(0, i - 1))} onNext={() => setIdx((i) => Math.min(items.length - 1, i + 1))}>
      <div className="dt-score card-glass">
        <div className="dt-num">{Number.isFinite(a.score) ? <RollingNumber value={a.score} dp={1} duration={0.9} style={{ color: ratioHex(a.score) }} /> : <span className="num">—</span>}<span className="den">/10</span>
          <div className="cap">{Number.isFinite(a.score) ? ratioLabel(a.score) : 'Not measured'}</div></div>
        <p className="dt-desc">{a.desc}</p>
      </div>
      <section className="dt-sec"><div className="cap">Measurements behind it <span className="chip tiny">{det.length}</span></div>
        <div className="dt-subs">{det.map((d, j) => (
          <button className="dt-sub" key={d.m.id} onMouseEnter={() => ph.show(d.m)} onClick={() => openMetricDetail(scan, res, det.map((x) => x.m.id), j)}>
            <span className="dt-sub-n"><b>{d.m.name}</b><em>{VIEW[d.m.view]}{d.m.look ? ' · photo' : ''}{d.w > 1 ? ' · ×' + d.w : ''}</em></span>
            <span className="dt-sub-v">{fmt(d.m, d.v)}<em>{has(d) ? 'ideal ' + fmtRange(d.m, d) : 'not measured'}</em></span>
            <span className="dt-sub-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${has(d) ? d.s * 10 : 0}%` }} transition={{ duration: 0.6, delay: j * 0.03 }} style={{ background: ratioHex(d.s) }} /></span>
            <b style={{ color: has(d) ? ratioHex(d.s) : 'var(--faint)' }}>{has(d) ? d.s.toFixed(1) : '—'}</b>
          </button>
        ))}</div>
        <p className="fine">Hover a measurement to see it on your photo; click it for the full breakdown.</p></section>
    </DetailShell>
  );
}

export const openMetricDetail = (scan, res, ids, i = 0) =>
  openModal((close) => <MetricDetail scan={scan} res={res} ids={ids} start={Math.max(0, Math.min(ids.length - 1, i))} close={close} />, { cls: 'detail' });
export const openAssessmentDetail = (scan, res, pid, items, i = 0) =>
  openModal((close) => <AssessmentDetail scan={scan} res={res} pid={pid} items={items} start={Math.max(0, Math.min(items.length - 1, i))} close={close} />, { cls: 'detail' });
