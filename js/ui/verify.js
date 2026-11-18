// Step-by-step landmark verification (one point at a time, zoomed in, with a reference photo).
import { $, $$, el, esc, icon } from './dom.js';
import { Stage } from './stage.js';
import { drawPoints, drawCrosshair, drawLinks, bbox } from './draw.js';
import { DEFS, REF, LINKS, refPoints } from '../landmarks.js';
import { refitTemplate, detect } from '../detect.js';

const ZOOMS = [
  { id: 'wide', label: 'Wide', frac: 1.05 },
  { id: 'medium', label: 'Medium', frac: 0.42 },
  { id: 'close', label: 'Close', frac: 0.2 },
];

export function mountVerify(body, app, draft, view, { onBack, onDone }) {
  let defs = DEFS[view];
  const d = draft[view];
  d.confirmed = d.confirmed || {};
  let idx = Math.min(d.idx || 0, defs.length - 1);
  let zoomId = defs[idx].zoom;
  let tab = 'photo';
  let alive = true;
  const isTemplate = d.source === 'template';
  // From a template, ask for well-spread anchor points first so the rest can snap into place.
  if (isTemplate) {
    const first = view === 'side' ? ['prn', 'tragus', 'me'] : ['pupil_r', 'pupil_l', 'me'];
    defs = [...first.map((id) => defs.find((x) => x.id === id)), ...defs.filter((x) => !first.includes(x.id))];
  }

  const v = el(`<div class="verify">
    <div class="verify-stage">
      <div class="stage-host"></div>
      <div class="vs-top"><span class="chip dark">${view === 'front' ? 'Front' : 'Profile'}</span><span class="chip" id="vsCount"></span></div>
      <div class="vs-hint">${icon('target', 14)} Click to place · drag to pan · scroll to zoom</div>
    </div>
    <aside class="verify-panel">
      <div class="hint-card">${isTemplate ? 'Points start from a template. Place the first couple and the rest will snap into position.' : 'AI placed a first pass. Verify each point before continuing.'}
        ${view === 'side' ? `<button class="link-btn" id="flip">${icon('flip', 14)} Wrong way? Flip face direction</button>` : ''}</div>
      <div class="vp-card">
        <div class="vp-prog"><span id="pCount"></span><span id="pPct"></span></div>
        <div class="bar"><i id="pBar"></i></div>
        <div class="vp-head">
          <div><div class="vp-name" id="pName"></div><div class="vp-anat" id="pAnat"></div></div>
          <div class="vp-acts">
            <button class="icon-btn soft" id="reset" title="Reset to AI position (R)">${icon('undo', 16)}</button>
            <span class="okdot" id="okdot" title="Confirmed">${icon('check', 14, 2.6)}</span>
          </div>
        </div>
        <div class="tabs3" role="tablist">
          <button data-tab="photo" class="on">Photo</button><button data-tab="diagram">Diagram</button><button data-tab="how">How to Find</button>
        </div>
        <div class="ref-box" id="refBox"></div>
      </div>
      <div class="vp-card keys">
        <div class="cap">Keyboard shortcuts</div>
        <div class="arrows"><kbd class="k up">${icon('chevU', 14)}</kbd><kbd class="k">${icon('chevL', 14)}</kbd><kbd class="k">${icon('chevD', 14)}</kbd><kbd class="k">${icon('chevR', 14)}</kbd></div>
        <div class="krow"><kbd>Enter</kbd><span>Next / Confirm</span></div>
        <div class="krow"><kbd>Backspace</kbd><span>Previous</span></div>
        <div class="krow"><kbd>R</kbd><span>Reset</span><kbd>Shift</kbd><span>5× nudge</span></div>
      </div>
      <div class="vp-card">
        <div class="cap">Zoom level</div>
        <div class="seg" id="zoomSeg">${ZOOMS.map((z) => `<button data-z="${z.id}">${z.label}</button>`).join('')}</div>
      </div>
      <button class="link-btn center" id="skipAll">Accept remaining points &amp; review</button>
      <div class="vp-foot"><button class="btn ghost" id="back">Back</button><button class="btn blue" id="next">Next</button></div>
    </aside>
  </div>`);
  body.appendChild(v);

  const host = $('.stage-host', v);
  let st = null, refImg = null;
  let faceSize = 400;

  (async () => {
    const img = await app.img(d.url);
    refImg = await app.img(view === 'front' ? 'assets/ref-front.jpg' : 'assets/ref-side.jpg');
    if (!alive) return;
    st = new Stage(host, img, { bg: '#eef1f4', onDraw: paint, maxScale: 30 });
    st.onResize = () => focus(false);
    computeFace();
    bindStage();
    update(false);
  })();

  function computeFace() {
    const b = bbox(d.lm);
    faceSize = Math.max(b.h, b.w * 1.1, 60);
  }

  const cur = () => defs[idx].id;

  function focus(animate = true) {
    if (!st) return;
    const z = ZOOMS.find((q) => q.id === zoomId);
    const p = d.lm[cur()];
    const s = Math.min(st.w, st.h) / (faceSize * z.frac);
    const target = { cx: p.x, cy: p.y, s };
    animate ? st.animateTo(target, 480) : st.setView(target);
  }

  function paint(ctx, s) {
    const id = cur();
    drawLinks(ctx, s, d.lm, view, { color: 'rgba(255,255,255,0.35)' });
    const others = {};
    for (const k in d.lm) if (k !== id) others[k] = d.lm[k];
    drawPoints(ctx, s, others, { r: 3.4 });
    drawCrosshair(ctx, s.toScreen(d.lm[id]));
  }

  // ── stage interaction ──
  function bindStage() {
    const c = st.canvas;
    const ptrs = new Map();
    let mode = null, start = null, startView = null, pinch = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.view.s, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        mode = 'pinch';
        return;
      }
      start = { x: e.offsetX, y: e.offsetY };
      startView = { ...st.view };
      const p = st.toScreen(d.lm[cur()]);
      mode = Math.hypot(p.x - start.x, p.y - start.y) < 16 ? 'drag' : 'maybe';
      if (mode === 'drag') c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) {
        const p = st.toScreen(d.lm[cur()]);
        c.style.cursor = Math.hypot(p.x - e.offsetX, p.y - e.offsetY) < 16 ? 'grab' : 'crosshair';
        return;
      }
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (mode === 'pinch' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        st.zoomAt(pinch.c, (pinch.s * dd) / pinch.d / st.view.s);
        return;
      }
      const dx = e.offsetX - start.x, dy = e.offsetY - start.y;
      if (mode === 'drag') {
        setPoint(st.toImage({ x: e.offsetX, y: e.offsetY }));
      } else if (mode === 'maybe' && Math.hypot(dx, dy) > 5) {
        mode = 'pan';
      }
      if (mode === 'pan') {
        st.setView({ cx: startView.cx - dx / st.view.s, cy: startView.cy - dy / st.view.s, s: st.view.s });
      }
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (mode === 'maybe') setPoint(st.toImage({ x: e.offsetX, y: e.offsetY }));
      if (ptrs.size === 0) { mode = null; c.style.cursor = 'crosshair'; }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      st.zoomAt({ x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.style.cursor = 'crosshair';
    c.style.touchAction = 'none';
  }

  function setPoint(p) {
    const id = cur();
    p = { x: Math.max(0, Math.min(st.iw, p.x)), y: Math.max(0, Math.min(st.ih, p.y)) };
    d.lm = { ...d.lm, [id]: p };
    d.confirmed[id] = true;
    if (isTemplate) {
      d.lm = refitTemplate(view, d.lm, d.confirmed);
      computeFace();
    }
    st.render();
    syncStatus();
  }

  // ── panel ──
  function update(animate = true) {
    d.idx = idx;
    const def = defs[idx];
    $('#pCount', v).textContent = `${idx + 1} of ${defs.length}`;
    const pct = Math.round(((idx + 1) / defs.length) * 100);
    $('#pPct', v).textContent = pct + '%';
    $('#pBar', v).style.width = pct + '%';
    $('#vsCount', v).textContent = `${idx + 1} / ${defs.length}`;
    $('#pName', v).textContent = def.name;
    $('#pAnat', v).textContent = def.anat;
    $('#next', v).textContent = idx === defs.length - 1 ? 'Done' : 'Next';
    zoomId = def.zoom;
    syncZoom();
    syncStatus();
    renderRef();
    focus(animate);
  }
  function syncStatus() {
    $('#okdot', v).classList.toggle('on', !!d.confirmed[cur()]);
  }
  function syncZoom() {
    $$('#zoomSeg button', v).forEach((b) => b.classList.toggle('on', b.dataset.z === zoomId));
  }

  function renderRef() {
    const box = $('#refBox', v);
    const def = defs[idx];
    $$('.tabs3 button', v).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'how') {
      box.innerHTML = `<div class="how"><div class="how-t">${esc(def.name)}</div><div class="how-a">${esc(def.anat)}</div><p>${esc(def.how)}</p>
        <p class="fine">Sides follow your face: “Right” is your right, which is on the left of a normal (non‑mirrored) photo.</p></div>`;
      return;
    }
    if (tab === 'diagram') {
      box.innerHTML = diagramSVG(view, def.id);
      return;
    }
    if (!refImg) return;
    const r = REF[view][def.id];
    const c = document.createElement('canvas');
    const W = 600, H = 440;
    c.width = W; c.height = H;
    c.className = 'ref-canvas';
    const ctx = c.getContext('2d');
    const z = def.zoom === 'close' ? 150 : def.zoom === 'medium' ? 240 : 420;
    const s = W / z;
    const sx = r[0] - z / 2, sy = r[1] - (z * H) / W / 2;
    ctx.fillStyle = '#f4f5f7';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(refImg, sx, sy, z, (z * H) / W, 0, 0, W, H);
    const px = (r[0] - sx) * s, py = (r[1] - sy) * s;
    // Hollow ring + crosshair with a tiny centre dot, so the exact spot stays visible under the marker
    const ring = (stroke, w, r) => { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); };
    const ticks = (stroke, w) => {
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(px + dx * 14, py + dy * 14); ctx.lineTo(px + dx * 26, py + dy * 26); }
      ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
    };
    ring('rgba(255,255,255,.95)', 5, 10); ticks('rgba(255,255,255,.95)', 5);
    ring('#ff2d43', 2.5, 10); ticks('#ff2d43', 2.5);
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#ff2d43'; ctx.fill();
    box.innerHTML = '';
    box.appendChild(c);
  }

  // ── controls ──
  $$('.tabs3 button', v).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderRef(); }));
  $$('#zoomSeg button', v).forEach((b) => (b.onclick = () => { zoomId = b.dataset.z; syncZoom(); focus(true); }));
  $('#reset', v).onclick = reset;
  $('#next', v).onclick = next;
  $('#back', v).onclick = prev;
  $('#skipAll', v).onclick = () => { for (const def of defs) d.confirmed[def.id] = true; d.idx = defs.length - 1; onDone(); };
  // Re-run profile detection forced to the opposite facing direction
  const flipBtn = $('#flip', v);
  if (flipBtn) flipBtn.onclick = async () => {
    if (!st) return;
    const cur = d.dir || Math.sign(d.lm.prn.x - d.lm.tragus.x) || 1;
    flipBtn.disabled = true;
    flipBtn.textContent = 'Re‑detecting…';
    try {
      const res = await detect('side', st.img, { front: draft.front.lm, skin: draft.front.skin, forceDir: -cur });
      d.lm = res.lm; d.ai = { ...res.lm }; d.dir = res.dir || -cur; d.source = res.source;
      d.confirmed = {};
      idx = 0;
      computeFace();
      update(true);
    } finally {
      flipBtn.disabled = false;
      flipBtn.innerHTML = `${icon('flip', 14)} Wrong way? Flip face direction`;
    }
  };

  function reset() {
    const id = cur();
    d.lm = { ...d.lm, [id]: { ...d.ai[id] } };
    delete d.confirmed[id];
    st.render();
    syncStatus();
    focus(true);
  }
  function next() {
    d.confirmed[cur()] = true;
    if (isTemplate) d.lm = refitTemplate(view, d.lm, d.confirmed);
    if (idx < defs.length - 1) { idx++; update(); } else onDone();
  }
  function prev() {
    if (idx > 0) { idx--; update(); } else onBack();
  }

  const onKey = (e) => {
    if (!st || e.target.closest('input,textarea') || document.querySelector('.modal-wrap')) return;
    const k = e.key;
    const step = (e.shiftKey ? 5 : 1) / st.view.s;
    const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (mv) {
      e.preventDefault();
      const p = d.lm[cur()];
      setPoint({ x: p.x + mv[0] * step, y: p.y + mv[1] * step });
      const sp = st.toScreen(d.lm[cur()]);
      if (sp.x < 40 || sp.y < 40 || sp.x > st.w - 40 || sp.y > st.h - 40) focus(true);
    } else if (k === 'Enter') { e.preventDefault(); next(); }
    else if (k === 'Backspace') { e.preventDefault(); prev(); }
    else if (k === 'r' || k === 'R') { reset(); }
    else if (k === '1' || k === '2' || k === '3') { zoomId = ZOOMS[+k - 1].id; syncZoom(); focus(true); }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    alive = false;
    document.removeEventListener('keydown', onKey);
    st && st.destroy();
  };
}

// Line diagram of the reference face with the current point highlighted
export function diagramSVG(view, active) {
  const ref = refPoints(view);
  const b = bbox(ref, 0.12);
  const lines = LINKS[view].map(([a, c]) => `<line x1="${ref[a].x}" y1="${ref[a].y}" x2="${ref[c].x}" y2="${ref[c].y}"/>`).join('');
  const dots = Object.entries(ref).map(([k, p]) => `<circle cx="${p.x}" cy="${p.y}" r="${k === active ? 7 : 3.2}" class="${k === active ? 'on' : ''}"/>`).join('');
  const a = ref[active];
  return `<svg class="diagram" viewBox="${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}" preserveAspectRatio="xMidYMid meet">
    <g class="dl">${lines}</g><g class="dd">${dots}</g>
    ${a ? `<circle cx="${a.x}" cy="${a.y}" r="16" class="pulse"/>` : ''}</svg>`;
}
