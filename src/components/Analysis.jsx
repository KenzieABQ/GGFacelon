'use client';
// Analysis: one pillar at a time — photo with animated, score-coloured measurement overlays (zoom + soft
// spotlight on the measured feature) and the measurement list. Click any row for the full breakdown.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { app } from '@/lib/app.js';
import { Stage } from '@/lib/canvas/stage.js';
import { drawOverlay, drawPoints, drawLinks, bbox } from '@/lib/canvas/draw.js';
import { PILLARS, METRICS, METRIC_BY_ID, rating, scoreColor, ratioColor, ratioHex, scoreHex, fmt, barGeom, overlayFor, assessmentDetail, percentile, pctText, fmtRange } from '@/lib/engine/metrics.js';
import { Icon, RollingNumber, openModal, fadeUp } from './ui.jsx';
import { FaceThumb } from './Shell.jsx';
import { openMetricDetail, openAssessmentDetail } from './Detail.jsx';
import { scanUrl } from '@/lib/routes.js';

const UNDERSTAND = {
  harmony: `Harmony compares your proportions with ideal male ranges — ${METRICS.filter((m) => m.hm && m.view === 'front').length} front ratios (thirds, widths, eye spacing, tilts) and ${METRICS.filter((m) => m.hm && m.view === 'side').length} side ratios (profile angles, nose and lip lines). Each ratio scores 10 inside its ideal range and less the further outside it falls. Key ratios (FWHR, thirds, eye spacing and tilt, jaw width, chin projection) count up to 5× more than minor ones, ratios a photo can’t measure reliably (many profile angles) count less, weak points count extra, and the pillar is placed on the population scale (5 = average). Front counts 70%, side 30%.`,
  angularity: 'Angularity estimates how sharp and defined your bone structure looks, using the landmark geometry behind cheekbone prominence, jaw definition, cheek leanness, chin definition and the area under the jaw. Each assessment combines several measurements.',
  dimorphism: 'Dimorphism measures how strongly your face shows male‑typical traits: a wide jaw, low, dark, full brows over a brow ridge, wide face shape, narrow eyes with lids close to the iris, a strong chin and neck. Each of the 10 assessments combines the related measurements — landmark geometry plus what the photo shows of your brows and eyes.',
  features: 'Features rates each facial feature on its own — eyes, brows, nose, lips, jaw, chin, cheeks, forehead, hairline, ears & neck, and symmetry — from all the measurements that describe it, including what the photo shows: brow thickness, darkness and length, how open the eyes are, lip fullness and the hairline. Skin isn’t rated.',
};

// ── focus blur: a pre-blurred copy of the photo laid over everything except a soft spotlight ──
const FOCUS_MS = 520;
function focusAmt(f) {
  if (!f) return 0;
  const t = Math.min(1, Math.max(0, (performance.now() - f.t0) / FOCUS_MS));
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return f.from + (f.to - f.from) * e;
}
function makeBlur(img) {
  const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, 1600 / Math.max(W, H));
  const c = document.createElement('canvas');
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const x = c.getContext('2d');
  x.filter = 'blur(1.2px)';
  x.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, k };
}
function drawFocusBlur(ctx, s) {
  const f = s.focus, amt = focusAmt(f);
  if (!(amt > 0.002) || !f.box || !s.blur) return;
  const off = s._off || (s._off = document.createElement('canvas'));
  if (off.width !== s.canvas.width || off.height !== s.canvas.height) { off.width = s.canvas.width; off.height = s.canvas.height; }
  const o = off.getContext('2d'), v = s.view, dpr = s.dpr, k = s.blur.k;
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, off.width, off.height);
  o.setTransform((dpr * v.s) / k, 0, 0, (dpr * v.s) / k, dpr * (s.w / 2 - v.cx * v.s), dpr * (s.h / 2 - v.cy * v.s));
  o.drawImage(s.blur.canvas, 0, 0);
  o.setTransform(dpr, 0, 0, dpr, 0, 0);
  o.fillStyle = 'rgba(6,10,12,0.06)'; o.fillRect(0, 0, s.w, s.h);
  o.globalCompositeOperation = 'destination-out';
  const c = s.toScreen({ x: (f.box.x0 + f.box.x1) / 2, y: (f.box.y0 + f.box.y1) / 2 });
  const rx = Math.max(28, ((f.box.x1 - f.box.x0) / 2) * v.s * 1.35), ry = Math.max(28, ((f.box.y1 - f.box.y0) / 2) * v.s * 1.35);
  o.save(); o.translate(c.x, c.y); o.scale(rx, ry);
  const g = o.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = g; o.beginPath(); o.arc(0, 0, 1, 0, Math.PI * 2); o.fill(); o.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = amt * 0.55; ctx.drawImage(off, 0, 0); ctx.restore();
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Imperative photo controller: two stages (front/side), zooms to and draws the active measurement
function createPhoto(hosts, scan, res, getShowLm) {
  const stages = {};
  let active = null, t0 = 0, raf = 0, alive = true, shown = 'front';
  const ready = (async () => {
    for (const view of ['front', 'side']) {
      const img = await app.img(scan[view].url);
      if (!alive) return;
      const lm = scan[view].lm;
      const st = new Stage(hosts[view], img, {
        bg: '#0c1012',
        onDraw: (ctx, s) => {
          drawFocusBlur(ctx, s);
          const g = ctx.createLinearGradient(0, 0, 0, s.h);
          g.addColorStop(0, 'rgba(6,10,12,0.30)'); g.addColorStop(0.6, 'rgba(6,10,12,0.38)'); g.addColorStop(1, 'rgba(6,10,12,0.85)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
          if (getShowLm()) { drawLinks(ctx, s, lm, view, { color: 'rgba(255,255,255,0.3)' }); drawPoints(ctx, s, lm, { r: 1.8, alpha: 0.85 }); }
          if (active && active.m.view === view && Number.isFinite(res.values[active.m.id].v)) {
            const p = Math.min(1, (performance.now() - t0) / 700);
            const { prims, inv } = overlayFor(active.m, res);
            drawOverlay(ctx, s, prims, inv, { progress: easeOut(p), text: fmt(active.m, res.values[active.m.id].v), color: ratioHex(active.sc ?? res.values[active.m.id].s) });
          }
        },
      });
      st.blur = makeBlur(img);
      st.focus = { from: 0, to: 0, t0: 0, box: null };
      st.lmBox = bbox(lm);
      const fit = () => {
        const b = bbox(lm, view === 'front' ? 0.12 : 0.16);
        st.fitV = st.rectView(Math.max(0, b.x0), Math.max(0, b.y0 - b.h * 0.04), Math.min(st.iw, b.x1), Math.min(st.ih, b.y1 + b.h * 0.12), 0);
        st.setView(st.focus.to && st.focus.target ? st.focus.target : st.fitV);
      };
      st.onResize = fit; fit();
      stages[view] = st;
    }
    showView(shown);
  })();
  function showView(view) {
    shown = view;
    for (const k of ['front', 'side']) if (hosts[k]) hosts[k].hidden = k !== view;
    stages[view]?.resize();
  }
  function focusOn(m) {
    const st = stages[m.view];
    t0 = performance.now();
    cancelAnimationFrame(raf);
    if (st) {
      const { prims, inv } = overlayFor(m, res);
      const pts = [];
      for (const p of prims) for (const k of ['a', 'b', 'v', 'p']) if (p[k]) pts.push(inv(p[k]));
      if (pts.length) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        const minS = Math.max(st.lmBox.w, st.lmBox.h) * 0.28, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const hw = Math.max(x1 - x0, minS) * 0.66, hh = Math.max(y1 - y0, minS) * 0.66;
        const target = st.rectView(cx - hw, cy - hh, cx + hw, cy + hh, 0);
        target.s = Math.max(st.fitV.s, Math.min(target.s, st.fitV.s * 3.2));
        st.focus = { from: focusAmt(st.focus), to: 1, t0, box: { x0: cx - hw / 1.45, y0: cy - hh / 1.45, x1: cx + hw / 1.45, y1: cy + hh / 1.45 }, target };
        st.animateTo(target, 650);
      }
    }
    const loop = () => { const s2 = stages[m.view]; if (!s2 || !alive) return; s2.draw(); if (performance.now() - t0 < 760) raf = requestAnimationFrame(loop); };
    loop();
  }
  return {
    ready,
    showView,
    show(m, sc) { active = { m, sc }; ready.then(() => { if (!alive) return; showView(m.view); focusOn(m); }); },
    unfocus() {
      const now = performance.now();
      for (const st of Object.values(stages)) {
        if (!st.focus || !st.focus.to) continue;
        st.focus = { ...st.focus, from: focusAmt(st.focus), to: 0, t0: now, target: null };
        st.animateTo(st.fitV, 650);
      }
    },
    render() { Object.values(stages).forEach((s) => s.render()); },
    destroy() { alive = false; cancelAnimationFrame(raf); Object.values(stages).forEach((s) => s.destroy()); },
  };
}

// ── list rows ──
function GBar({ m, r }) {
  const g = barGeom(m, r);
  return <div className="gbar" style={{ '--loW': `${g.loW * 100}%`, '--lo': `${g.lo * 100}%`, '--hi': `${g.hi * 100}%`, '--hiW': `${g.hiW * 100}%` }}><i className="mk" style={{ left: `${(g.at(r.v) * 100).toFixed(1)}%` }} /></div>;
}
const VChip = ({ txt, s }) => <span className="vchip" style={{ '--c': ratioColor(s) }}>{txt}</span>;

function Row({ row, res, i, on, onHover, onOpen }) {
  const anim = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 14) * 0.025, duration: 0.3 } };
  if (row.kind === 'm') {
    const m = row.m, r = res.values[m.id], ok = Number.isFinite(r.v);
    return (
      <motion.div className={`mrow ${ok ? '' : 'na'} ${on ? 'active' : ''}`} {...anim}>
        <div className="mrow-main" onMouseEnter={onHover} onClick={onOpen}>
          <div className="mr-left">
            <div className="mr-name">{m.name} {ok ? <VChip txt={fmt(m, r.v)} s={r.s} /> : <span className="chip tiny ghost">not measured</span>}{m.extra && ok && <span className="chip tiny ghost">extra</span>}</div>
            {ok && <GBar m={m} r={r} />}
          </div>
          <div className={'mr-score ' + (ok ? '' : 'muted')} style={ok ? { color: ratioColor(r.s) } : undefined}>{ok ? r.s.toFixed(2) : '—'}</div>
          <span className="chev"><Icon name="chevR" size={16} /></span>
        </div>
      </motion.div>
    );
  }
  const a = row.a, det = assessmentDetail(a, res), lead = det.find((d) => Number.isFinite(d.v)) || det[0], ok = Number.isFinite(a.score);
  return (
    <motion.div className={`mrow ${ok ? '' : 'na'} ${on ? 'active' : ''}`} {...anim}>
      <div className="mrow-main" onMouseEnter={onHover} onClick={onOpen}>
        <div className="mr-left">
          <div className="mr-name">{a.name} {ok ? <VChip txt={fmt(lead.m, lead.v)} s={lead.s} /> : <span className="chip tiny ghost">not measured</span>}<span className="chip tiny ghost" title="Share of the pillar score">{Math.round(a.w * 100)}%</span></div>
          {ok && <div className="sbar"><i style={{ width: `${a.score * 10}%`, background: ratioColor(a.score) }} /></div>}
        </div>
        <div className={'mr-score ' + (ok ? '' : 'muted')} style={ok ? { color: ratioColor(a.score) } : undefined}>{ok ? a.score.toFixed(2) : '—'}</div>
        <span className="chev"><Icon name="chevR" size={16} /></span>
      </div>
    </motion.div>
  );
}

function scoringGuide() {
  const bands = [[8, 'Exceptional'], [7, 'Great'], [6, 'Good'], [5, 'Average'], [4, 'Below Average'], [0, 'Poor']];
  openModal((close) => (
    <>
      <h3 className="m-title">Scoring guide</h3>
      <p className="m-body">Each ratio scores <b>10 inside its ideal range</b> and drops off smoothly outside it — the shaded band on each bar is the ideal range. How fast it drops is set per ratio, fitted to FaceIQ Labs’ published scores.</p>
      <p className="m-body">Pillars lean on your weaker ratios (a power mean), then sit on FaceIQ’s population scale: <b>5 is average, 7 ≈ top 6%, 8 ≈ top 0.4%</b>.</p>
      <div className="bands">{bands.map(([s, l]) => <div key={s}><span className="sw" style={{ background: scoreColor(s + 0.05) }} /><b>{s === 0 ? '< 4' : s + '+'}</b><span>{l}</span></div>)}</div>
      <p className="m-body">Harmony = 70% front + 30% side. Overall combines the four pillars like a geometric mean, so your weakest pillar pulls hardest.</p>
      <button className="btn dark block" onClick={close}>Close</button>
    </>
  ), { cls: 'small' });
}

export default function Analysis({ scan, res, pid: pid0 }) {
  const pid = PILLARS.find((p) => p.id === pid0) ? pid0 : 'harmony';
  const pillar = PILLARS.find((p) => p.id === pid);
  const isH = pid === 'harmony';
  const score = res.pillars[pid].score;
  const [hView, setHView] = useState(() => app.prefs.get('hView', 'front'));
  const [sort, setSort] = useState(() => app.prefs.get('sort', 'low'));
  const [showLm, setShowLm] = useState(() => app.prefs.get('showLm', false));
  const [gear, setGear] = useState(false);
  const [und, setUnd] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const [foot, setFoot] = useState({ name: isH ? 'Hover a ratio' : 'Hover an assessment', sc: score, has: true, label: `${rating(score)} ${pillar.name}` });
  const [tileView, setTileView] = useState(isH ? hView : 'front');
  const fRef = useRef(null), sRef = useRef(null), photo = useRef(null), lmRef = useRef(showLm);
  lmRef.current = showLm;

  const vt = (vw) => (isH ? res.pillars.harmony[vw] : res.views?.[vw]?.[pid]);
  const list = useMemo(() => {
    let l = isH
      ? METRICS.filter((m) => m.hm && m.view === hView).map((m) => ({ kind: 'm', id: m.id, name: m.name, score: Number.isFinite(res.values[m.id].v) ? res.values[m.id].s : NaN, m }))
      : res.pillars[pid].items.map((a) => ({ kind: 'a', id: a.id, name: a.name, score: a.score, a }));
    const key = (r, d) => (Number.isFinite(r.score) ? r.score : d);
    if (sort === 'low') l = [...l].sort((a, b) => key(a, 99) - key(b, 99));
    else if (sort === 'high') l = [...l].sort((a, b) => key(b, -1) - key(a, -1));
    else l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    return l;
  }, [isH, hView, sort, pid, res]);

  useEffect(() => {
    const ph = createPhoto({ front: fRef.current, side: sRef.current }, scan, res, () => lmRef.current);
    photo.current = ph;
    ph.showView(isH ? hView : 'front');
    return () => ph.destroy();
  }, [scan.id, scan.updated, res]);
  useEffect(() => { photo.current?.render(); }, [showLm]);

  const activate = (row) => {
    let m, name, sc;
    if (row.kind === 'a') { m = METRIC_BY_ID[row.a.metrics[0][0]]; const lead = assessmentDetail(row.a, res).find((d) => Number.isFinite(d.v)); if (lead) m = lead.m; name = row.a.name; sc = row.a.score; }
    else { m = row.m; name = m.name; sc = res.values[m.id].s; }
    const key = row.kind + row.id;
    if (activeKey === key) return;
    setActiveKey(key);
    const has = Number.isFinite(sc) && (row.kind === 'a' || Number.isFinite(res.values[m.id].v));
    setFoot({ name, sc, has, label: has ? rating(sc) : 'Not measured' });
    setTileView(m.view);
    photo.current?.show(m, sc);
  };
  // start on the first row so the photo isn't empty
  useEffect(() => { if (list[0]) { setActiveKey(null); setTimeout(() => activate(list[0]), 0); } }, [pid, hView]);

  const open = (row) => {
    if (row.kind === 'm') openMetricDetail(scan, res, list.map((r) => r.id), list.findIndex((r) => r.id === row.id));
    else openAssessmentDetail(scan, res, pid, list.map((r) => r.a), list.findIndex((r) => r.id === row.id));
  };
  const setH = (v) => { setHView(v); app.prefs.set('hView', v); };

  return (
    <div className="analysis">
      <div className="seg pillar-tabs">{PILLARS.map((p) => (
        <Link key={p.id} href={scanUrl(scan.id, 'analysis', p.id)} className={p.id === pid ? 'on' : ''}>
          {p.name}{p.id === pid && <motion.span className="seg-pill" layoutId="pillar-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        </Link>
      ))}</div>
      <motion.div className="card a-head" {...fadeUp(0)}>
        <FaceThumb scan={scan} size={120} className="a-thumb" />
        <div><div className="cap">{pillar.name}</div><div className="a-score"><RollingNumber value={score} delay={100} style={{ color: scoreColor(score) }} /><span className="den">/10</span></div>
          <div className="a-rate">{rating(score)} · higher than {pctText(percentile(score))}% of men</div></div>
        <div className="view-tiles">{['front', 'side'].map((vw, i) => {
          const sc = vt(vw);
          return (
            <button key={vw} className={`vtile ${(isH ? vw === hView : vw === tileView) ? 'on' : ''}`} disabled={!Number.isFinite(sc)}
              onClick={() => { if (isH) setH(vw); else { setTileView(vw); photo.current?.showView(vw); } }}>
              <FaceThumb scan={scan} view={vw} size={88} pad={0.08} />
              <span><em>{vw === 'front' ? 'Front' : 'Side'}</em><RollingNumber value={sc} delay={220 + i * 90} style={{ color: scoreHex(sc) }} /></span>
            </button>
          );
        })}</div>
      </motion.div>
      <div className="a-grid">
        <motion.div className="photo-card" {...fadeUp(1)}>
          <div className="stage-host" ref={fRef} />
          <div className="stage-host" ref={sRef} hidden />
          <button className="icon-btn glass gear" title="Display options" onClick={(e) => { e.stopPropagation(); setGear(!gear); }}><Icon name="gear" size={17} /></button>
          {gear && (
            <div className="gear-menu">
              <label className="check sm"><input type="checkbox" checked={showLm} onChange={(e) => { setShowLm(e.target.checked); app.prefs.set('showLm', e.target.checked); }} /><span className="box"><Icon name="check" size={12} sw={2.6} /></span><span>Show all landmarks</span></label>
            </div>
          )}
          <div className="photo-foot">
            <div className="pf-left"><div className="pf-metric">{foot.name}</div><div className="pf-cap">Score</div></div>
            <div className="pf-right"><div className="pf-score"><span style={{ color: foot.has ? ratioHex(foot.sc) : 'var(--faint)' }}>{foot.has ? foot.sc.toFixed(1) : '—'}</span><span className="den">/10</span></div><div className="pf-rate">{foot.label}</div></div>
          </div>
        </motion.div>
        <motion.div className="card m-card" {...fadeUp(2)}>
          <div className="m-top">
            <button className={'understand ' + (und ? 'open' : '')} onClick={() => setUnd(!und)}>Understanding {pillar.name} <Icon name="chevD" size={15} /></button>
            <button className="pill soft" onClick={scoringGuide}>Scoring guide</button>
          </div>
          {und && <motion.div className="und-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}><p>{UNDERSTAND[pid]}</p></motion.div>}
          <div className="m-title-row">
            <h2>Your {isH ? (hView === 'front' ? 'Front Ratios' : 'Side Ratios') : 'Measurements'}</h2>
            <span className="chip">{list.length} {isH ? 'ratios' : 'assessments'}</span>
          </div>
          <div className="m-tools">
            {isH ? <div className="seg sm">{['front', 'side'].map((h) => <button key={h} className={h === hView ? 'on' : ''} onClick={() => setH(h)}>{h === 'front' ? 'Front' : 'Side'}</button>)}</div> : <span />}
            <select className="select" value={sort} onChange={(e) => { setSort(e.target.value); app.prefs.set('sort', e.target.value); }}>
              <option value="low">Lowest score first</option><option value="high">Highest score first</option><option value="az">A – Z</option>
            </select>
          </div>
          <div className="m-list" onMouseLeave={() => { photo.current?.unfocus(); }}>
            {list.map((row, i) => <Row key={row.kind + row.id + hView} row={row} res={res} i={i} on={activeKey === row.kind + row.id} onHover={() => activate(row)} onOpen={() => { activate(row); open(row); }} />)}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
