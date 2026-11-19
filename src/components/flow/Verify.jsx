'use client';
// Step-by-step landmark verification: one point at a time, zoomed in, with a reference photo, diagram and
// how-to. Click to place, drag to pan, scroll/pinch to zoom; arrow keys nudge, Enter next, Backspace back.
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { app } from '@/lib/app.js';
import { Stage } from '@/lib/canvas/stage.js';
import { drawPoints, drawCrosshair, drawLinks, bbox } from '@/lib/canvas/draw.js';
import { DEFS, REF, LINKS, refPoints } from '@/lib/engine/landmarks.js';
import { asset } from '@/lib/routes.js';
import { Icon, modalCount } from '../ui.jsx';

const ZOOMS = [{ id: 'wide', label: 'Wide', frac: 1.05 }, { id: 'medium', label: 'Medium', frac: 0.42 }, { id: 'close', label: 'Close', frac: 0.2 }];

function Diagram({ view, active }) {
  const ref = refPoints(view), b = bbox(ref, 0.12), a = ref[active];
  return (
    <svg className="diagram" viewBox={`${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}`} preserveAspectRatio="xMidYMid meet">
      <g className="dl">{LINKS[view].map(([p, q], i) => <line key={i} x1={ref[p].x} y1={ref[p].y} x2={ref[q].x} y2={ref[q].y} />)}</g>
      <g className="dd">{Object.entries(ref).map(([k, p]) => <circle key={k} cx={p.x} cy={p.y} r={k === active ? 7 : 3.2} className={k === active ? 'on' : ''} />)}</g>
      {a && <circle cx={a.x} cy={a.y} r="16" className="pulse" />}
    </svg>
  );
}

// Reference photo zoomed on the point, with a ring + crosshair marker
function RefCrop({ view, def, img }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, r = REF[view][def.id];
    if (!c || !img || !r) return;
    const W = 600, H = 440, ctx = c.getContext('2d');
    const z = def.zoom === 'close' ? 150 : def.zoom === 'medium' ? 240 : 420, s = W / z;
    const sx = r[0] - z / 2, sy = r[1] - (z * H) / W / 2;
    ctx.fillStyle = '#f4f5f7'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, sx, sy, z, (z * H) / W, 0, 0, W, H);
    const px = (r[0] - sx) * s, py = (r[1] - sy) * s;
    const ring = (st, w, rr) => { ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.strokeStyle = st; ctx.lineWidth = w; ctx.stroke(); };
    const ticks = (st, w) => { ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(px + dx * 14, py + dy * 14); ctx.lineTo(px + dx * 26, py + dy * 26); } ctx.strokeStyle = st; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); };
    ring('rgba(255,255,255,.95)', 5, 10); ticks('rgba(255,255,255,.95)', 5);
    ring('#ff2d43', 2.5, 10); ticks('#ff2d43', 2.5);
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#ff2d43'; ctx.fill();
  }, [view, def.id, img]);
  return <canvas ref={ref} width={600} height={440} className="ref-canvas" />;
}

export default function Verify({ draft, view, onBack, onDone, onSkip }) {
  const d = draft[view];
  d.confirmed = d.confirmed || {};
  const isTemplate = d.source === 'template';
  const defsRef = useRef((() => {
    let defs = DEFS[view];
    // From a template, ask for well-spread anchor points first so the rest can snap into place
    if (isTemplate) { const first = view === 'side' ? ['prn', 'tragus', 'me'] : ['pupil_r', 'pupil_l', 'me']; defs = [...first.map((id) => defs.find((x) => x.id === id)), ...defs.filter((x) => !first.includes(x.id))]; }
    return defs;
  })());
  const defs = defsRef.current;
  const [idx, setIdx] = useState(Math.min(d.idx || 0, defs.length - 1));
  const [zoomId, setZoomId] = useState(defs[idx].zoom);
  const [tab, setTab] = useState('photo');
  const [, tick] = useState(0);
  const [refImg, setRefImg] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const host = useRef(null), stRef = useRef(null), S = useRef({ idx, zoomId, faceSize: 400 });
  S.current.idx = idx; S.current.zoomId = zoomId;
  const cur = () => defs[S.current.idx].id;

  const computeFace = () => { const b = bbox(d.lm); S.current.faceSize = Math.max(b.h, b.w * 1.1, 60); };
  const focus = (animate = true) => {
    const st = stRef.current; if (!st) return;
    const z = ZOOMS.find((q) => q.id === S.current.zoomId), p = d.lm[cur()];
    const target = { cx: p.x, cy: p.y, s: Math.min(st.w, st.h) / (S.current.faceSize * z.frac) };
    animate ? st.animateTo(target, 480) : st.setView(target);
  };
  const setPoint = async (p) => {
    const st = stRef.current, id = cur();
    p = { x: Math.max(0, Math.min(st.iw, p.x)), y: Math.max(0, Math.min(st.ih, p.y)) };
    d.lm = { ...d.lm, [id]: p };
    d.confirmed[id] = true;
    if (isTemplate) { const { refitTemplate } = await import('@/lib/engine/detect.js'); d.lm = refitTemplate(view, d.lm, d.confirmed); computeFace(); }
    st.render(); tick((x) => x + 1);
  };

  useEffect(() => {
    let alive = true, st = null;
    app.img(asset(view === 'front' ? '/assets/ref-front.jpg' : '/assets/ref-side.jpg')).then((im) => alive && setRefImg(im));
    app.img(d.url).then((img) => {
      if (!alive) return;
      st = new Stage(host.current, img, {
        bg: '#eef1f4', maxScale: 30,
        onDraw: (ctx, s) => {
          const id = cur();
          drawLinks(ctx, s, d.lm, view, { color: 'rgba(255,255,255,0.35)' });
          const others = {}; for (const k in d.lm) if (k !== id) others[k] = d.lm[k];
          drawPoints(ctx, s, others, { r: 3.4 });
          drawCrosshair(ctx, s.toScreen(d.lm[id]));
        },
      });
      stRef.current = st;
      st.onResize = () => focus(false);
      computeFace();
      bind(st);
      focus(false);
    });
    return () => { alive = false; st?.destroy(); stRef.current = null; };
  }, [d.url, view]);

  function bind(st) {
    const c = st.canvas, ptrs = new Map();
    let mode = null, start = null, startView = null, pinch = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.view.s, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; mode = 'pinch'; return; }
      start = { x: e.offsetX, y: e.offsetY }; startView = { ...st.view };
      const p = st.toScreen(d.lm[cur()]);
      mode = Math.hypot(p.x - start.x, p.y - start.y) < 16 ? 'drag' : 'maybe';
      if (mode === 'drag') c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) { const p = st.toScreen(d.lm[cur()]); c.style.cursor = Math.hypot(p.x - e.offsetX, p.y - e.offsetY) < 16 ? 'grab' : 'crosshair'; return; }
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (mode === 'pinch' && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; st.zoomAt(pinch.c, (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d / st.view.s); return; }
      const dx = e.offsetX - start.x, dy = e.offsetY - start.y;
      if (mode === 'drag') setPoint(st.toImage({ x: e.offsetX, y: e.offsetY }));
      else if (mode === 'maybe' && Math.hypot(dx, dy) > 5) mode = 'pan';
      if (mode === 'pan') st.setView({ cx: startView.cx - dx / st.view.s, cy: startView.cy - dy / st.view.s, s: st.view.s });
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (mode === 'maybe') setPoint(st.toImage({ x: e.offsetX, y: e.offsetY }));
      if (ptrs.size === 0) { mode = null; c.style.cursor = 'crosshair'; }
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { e.preventDefault(); st.zoomAt({ x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    c.style.cursor = 'crosshair'; c.style.touchAction = 'none';
  }

  const go = (i) => { d.idx = i; setIdx(i); setZoomId(defs[i].zoom); };
  useEffect(() => { d.idx = idx; S.current.zoomId = zoomId; focus(true); stRef.current?.render(); }, [idx, zoomId]);
  const next = async () => {
    d.confirmed[cur()] = true;
    if (isTemplate) { const { refitTemplate } = await import('@/lib/engine/detect.js'); d.lm = refitTemplate(view, d.lm, d.confirmed); }
    if (idx < defs.length - 1) go(idx + 1); else onDone();
  };
  const prev = () => (idx > 0 ? go(idx - 1) : onBack());
  const reset = () => { const id = cur(); d.lm = { ...d.lm, [id]: { ...d.ai[id] } }; delete d.confirmed[id]; stRef.current?.render(); tick((x) => x + 1); focus(true); };
  const flip = async () => {
    const st = stRef.current; if (!st) return;
    const curDir = d.dir || Math.sign(d.lm.prn.x - d.lm.tragus.x) || 1;
    setFlipping(true);
    try {
      const { detect } = await import('@/lib/engine/detect.js');
      const res = await detect('side', st.img, { front: draft.front.lm, skin: draft.front.skin, forceDir: -curDir });
      d.lm = res.lm; d.ai = { ...res.lm }; d.dir = res.dir || -curDir; d.source = res.source; d.confirmed = {};
      computeFace(); go(0); st.render();
    } finally { setFlipping(false); }
  };

  useEffect(() => {
    const onKey = (e) => {
      const st = stRef.current;
      if (!st || e.target.closest('input,textarea') || modalCount()) return;
      const k = e.key, step = (e.shiftKey ? 5 : 1) / st.view.s;
      const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
      if (mv) {
        e.preventDefault();
        const p = d.lm[cur()];
        setPoint({ x: p.x + mv[0] * step, y: p.y + mv[1] * step });
        const sp = st.toScreen(d.lm[cur()]);
        if (sp.x < 40 || sp.y < 40 || sp.x > st.w - 40 || sp.y > st.h - 40) focus(true);
      } else if (k === 'Enter') { e.preventDefault(); next(); }
      else if (k === 'Backspace') { e.preventDefault(); prev(); }
      else if (k === 'r' || k === 'R') reset();
      else if (k === '1' || k === '2' || k === '3') setZoomId(ZOOMS[+k - 1].id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const def = defs[idx], pct = Math.round(((idx + 1) / defs.length) * 100);
  return (
    <div className="verify">
      <div className="verify-stage">
        <div className="stage-host" ref={host} />
        <div className="vs-top"><span className="chip dark">{view === 'front' ? 'Front' : 'Profile'}</span><span className="chip">{idx + 1} / {defs.length}</span></div>
        <div className="vs-hint"><Icon name="target" size={14} /> Click to place · drag to pan · scroll to zoom</div>
      </div>
      <aside className="verify-panel">
        <div className="hint-card">{isTemplate ? 'Points start from a template. Place the first couple and the rest will snap into position.' : 'AI placed a first pass. Verify each point before continuing.'}
          {view === 'side' && <button className="link-btn" disabled={flipping} onClick={flip}><Icon name="flip" size={14} /> {flipping ? 'Re‑detecting…' : 'Wrong way? Flip face direction'}</button>}</div>
        <div className="vp-card">
          <div className="vp-prog"><span>{idx + 1} of {defs.length}</span><span>{pct}%</span></div>
          <div className="bar"><motion.i animate={{ width: pct + '%' }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} /></div>
          <div className="vp-head">
            <AnimatePresence mode="wait"><motion.div key={def.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <div className="vp-name">{def.name}</div><div className="vp-anat">{def.anat}</div></motion.div></AnimatePresence>
            <div className="vp-acts">
              <button className="icon-btn soft" title="Reset to AI position (R)" onClick={reset}><Icon name="undo" size={16} /></button>
              <span className={'okdot ' + (d.confirmed[def.id] ? 'on' : '')} title="Confirmed"><Icon name="check" size={14} sw={2.6} /></span>
            </div>
          </div>
          <div className="tabs3" role="tablist">{[['photo', 'Photo'], ['diagram', 'Diagram'], ['how', 'How to Find']].map(([t, l]) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}</div>
          <div className="ref-box">
            {tab === 'how' && <div className="how"><div className="how-t">{def.name}</div><div className="how-a">{def.anat}</div><p>{def.how}</p><p className="fine">Sides follow your face: “Right” is your right, which is on the left of a normal (non‑mirrored) photo.</p></div>}
            {tab === 'diagram' && <Diagram view={view} active={def.id} />}
            {tab === 'photo' && <RefCrop view={view} def={def} img={refImg} />}
          </div>
        </div>
        <div className="vp-card keys">
          <div className="cap">Keyboard shortcuts</div>
          <div className="arrows"><kbd className="k up"><Icon name="chevU" size={14} /></kbd><kbd className="k"><Icon name="chevL" size={14} /></kbd><kbd className="k"><Icon name="chevD" size={14} /></kbd><kbd className="k"><Icon name="chevR" size={14} /></kbd></div>
          <div className="krow"><kbd>Enter</kbd><span>Next / Confirm</span></div>
          <div className="krow"><kbd>Backspace</kbd><span>Previous</span></div>
          <div className="krow"><kbd>R</kbd><span>Reset</span><kbd>Shift</kbd><span>5× nudge</span></div>
        </div>
        <div className="vp-card"><div className="cap">Zoom level</div>
          <div className="seg">{ZOOMS.map((z) => <button key={z.id} className={z.id === zoomId ? 'on' : ''} onClick={() => setZoomId(z.id)}>{z.label}</button>)}</div></div>
        <button className="link-btn center" onClick={() => { for (const x of defs) d.confirmed[x.id] = true; d.idx = defs.length - 1; onDone(); }}>Accept remaining points &amp; continue</button>
        {onSkip && <button className="btn ghost block skip-btn" onClick={onSkip}><Icon name="sparkle" size={15} /> Skip review — use the AI points &amp; analyze</button>}
        <div className="vp-foot"><button className="btn ghost" onClick={prev}>Back</button><button className="btn blue" onClick={next}>{idx === defs.length - 1 ? 'Done' : 'Next'}</button></div>
      </aside>
    </div>
  );
}
