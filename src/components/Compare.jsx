'use client';
// Compare two scans: headline change, profile and pillar deltas, a large side-by-side viewer drawing the
// selected measurement on both photos (each in its score colour), and the list of what moved.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useApp, app } from '@/lib/app.js';
import { photoPanel } from '@/lib/canvas/photo-panel.js';
import { METRICS, METRIC_BY_ID, PILLARS, scoreHex, ratioHex, fmt, fmtRange, rating, pctText } from '@/lib/engine/metrics.js';
import { Icon, RollingNumber, fadeUp } from './ui.jsx';
import { FaceThumb } from './Shell.jsx';
import { openMetricDetail } from './Detail.jsx';

const when = (s) => new Date(s.created).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const signed = (x, dp = 2) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(dp);
const dcls = (x, eps = 0.005) => (x > eps ? 'up' : x < -eps ? 'down' : 'flat');

function Viewer({ scan, id, label }) {
  const ref = useRef(null), panel = useRef(null);
  const res = app.result(scan);
  useEffect(() => { panel.current = photoPanel(ref.current, app, scan, res); return () => panel.current.destroy(); }, [scan.id, scan.updated]);
  useEffect(() => { if (id) panel.current?.show(METRIC_BY_ID[id]); }, [id, scan.id]);
  const m = id && METRIC_BY_ID[id], r = m && res.values[id], ok = r && Number.isFinite(r.v);
  return (
    <div className="cv-stage"><div className="stage-host" ref={ref} />
      <div className="cv-foot"><span className="cap">{label} · {scan.label || when(scan)}</span>
        {m && <span className="cv-val"><b style={{ color: ok ? ratioHex(r.s) : 'var(--faint)' }}>{fmt(m, r.v)}</b><em>{ok ? r.s.toFixed(1) + '/10' : 'not measured'}</em></span>}</div>
    </div>
  );
}

export default function Compare({ scan, otherId }) {
  const a = useApp();
  const [aId, setAId] = useState(() => (a.scans.find((s) => s.id === otherId && s.id !== scan.id) || a.scans.find((s) => s.id !== scan.id))?.id);
  const [bId, setBId] = useState(scan.id);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const A = a.scan(aId), B = a.scan(bId);
  const ra = A && a.result(A), rb = B && a.result(B);
  const rows = useMemo(() => (!ra ? [] : METRICS.filter((m) => m.hm || m.look).map((m) => ({ m, a: ra.values[m.id], b: rb.values[m.id] }))
    .filter((r) => Number.isFinite(r.a.v) || Number.isFinite(r.b.v))
    .filter((r) => filter === 'all' || (filter === 'look' ? r.m.look : r.m.view === filter && !r.m.look))
    .map((r) => ({ ...r, d: (Number.isFinite(r.b.v) ? r.b.s : 0) - (Number.isFinite(r.a.v) ? r.a.s : 0) }))
    .sort((p, q) => Math.abs(q.d) * q.m.w - Math.abs(p.d) * p.m.w)), [ra, rb, filter]);
  const cur = sel && rows.some((r) => r.m.id === sel) ? sel : rows[0]?.m.id;

  if (a.scans.length < 2 || !A) {
    return (
      <motion.div className="card empty-small" {...fadeUp(0)}><h2>Compare scans</h2>
        <p className="sub">You need at least two scans to compare. Take another scan — for example after a haircut, weight change or with better lighting — and see what moved.</p>
        <Link className="btn dark" href="/new/"><Icon name="scan" size={16} /> New scan</Link></motion.div>
    );
  }
  const opt = a.scans.map((s) => <option key={s.id} value={s.id}>{s.label || when(s)} · {a.result(s).overall.toFixed(2)}</option>);
  const dO = rb.overall - ra.overall;
  const cards = [['Front profile', ra.views?.front?.score, rb.views?.front?.score], ['Side profile', ra.views?.side?.score, rb.views?.side?.score], ...PILLARS.map((p) => [p.name, ra.pillars[p.id].score, rb.pillars[p.id].score])];
  const pick = (k, s, r, set) => (
    <div className="cmp-pick" data-s={k}><FaceThumb scan={s} size={200} />
      <div><span className="cap">{k === 'A' ? 'Before' : 'After'}</span><select className="select" value={s.id} onChange={(e) => set(e.target.value)}>{opt}</select>
        <RollingNumber value={r.overall} className="big" style={{ color: scoreHex(r.overall) }} /><em>{rating(r.overall)} · {when(s)}</em></div></div>
  );
  return (
    <div className="cmp2">
      <motion.section className="card cmp-hero" {...fadeUp(0)}>
        {pick('A', A, ra, setAId)}
        <div className="cmp-mid"><span className="cap">Overall change</span><motion.b key={dO} className={'cmp-delta ' + dcls(dO)} initial={{ scale: 0.8, opacity: 0, filter: 'blur(6px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}>{signed(dO)}</motion.b>
          <span className="muted">higher than {pctText(ra.percentile)}% → {pctText(rb.percentile)}% of men</span></div>
        {pick('B', B, rb, setBId)}
      </motion.section>
      <section className="cmp-cards">{cards.map(([name, x, y], i) => {
        const d = y - x;
        return (
          <motion.div className="cc" key={name} {...fadeUp(i + 1)}>
            <div className="cc-top"><span>{name}</span><b className={'cmp-chip ' + dcls(d)}>{Number.isFinite(d) ? signed(d) : '—'}</b></div>
            <div className="cc-bars">
              <div><motion.i initial={{ width: 0 }} animate={{ width: `${(x || 0) * 10}%` }} style={{ background: scoreHex(x), opacity: 0.45 }} /><em>{Number.isFinite(x) ? x.toFixed(2) : '—'}</em></div>
              <div><motion.i initial={{ width: 0 }} animate={{ width: `${(y || 0) * 10}%` }} transition={{ delay: 0.1 }} style={{ background: scoreHex(y) }} /><em>{Number.isFinite(y) ? y.toFixed(2) : '—'}</em></div>
            </div>
          </motion.div>
        );
      })}</section>
      <motion.section className="card cmp-viewer" {...fadeUp(3)}>
        <div className="cv-head"><div><span className="cap">Measurement</span><h3>{cur ? METRIC_BY_ID[cur].name : '—'}</h3></div>
          <div className="cv-acts"><button className="pill soft" onClick={() => { const ids = rows.map((r) => r.m.id); openMetricDetail(B, rb, ids, ids.indexOf(cur)); }}><Icon name="info" size={14} /> Details</button></div></div>
        <div className="cv-stages"><Viewer scan={A} id={cur} label="Before" /><Viewer scan={B} id={cur} label="After" /></div>
      </motion.section>
      <motion.section className="card cmp-list" {...fadeUp(4)}>
        <div className="cl-head"><h3>What changed</h3>
          <div className="seg sm">{[['all', 'All'], ['front', 'Front'], ['side', 'Side'], ['look', 'Photo']].map(([f, l]) => <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>{l}</button>)}</div></div>
        <div className="cl-rows">
          {!rows.length && <p className="fine">Nothing to compare in this group.</p>}
          {rows.map((r) => (
            <button key={r.m.id} className={'cl-row ' + (cur === r.m.id ? 'on' : '')} onMouseEnter={() => setSel(r.m.id)} onClick={() => setSel(r.m.id)}>
              <span className="cl-n"><b>{r.m.name}</b><em>{r.m.view === 'front' ? 'Front' : 'Side'}{r.m.look ? ' · photo' : ''} · ideal {fmtRange(r.m, r.b)}</em></span>
              <span className="cl-v"><i style={{ color: ratioHex(r.a.s) }}>{fmt(r.m, r.a.v)}</i><Icon name="arrowR" size={13} /><i style={{ color: ratioHex(r.b.s) }}>{fmt(r.m, r.b.v)}</i></span>
              <span className="cl-s"><span className="cl-bar"><i style={{ width: `${(Number.isFinite(r.a.v) ? r.a.s : 0) * 10}%`, background: ratioHex(r.a.s) }} /></span><span className="cl-bar"><i style={{ width: `${(Number.isFinite(r.b.v) ? r.b.s : 0) * 10}%`, background: ratioHex(r.b.s) }} /></span></span>
              <b className={'cmp-chip ' + dcls(r.d, 0.05)}>{signed(r.d, 1)}</b>
            </button>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
