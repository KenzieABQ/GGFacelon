// Editable landmark stage: drag any point (with a magnifier loupe); hovering shows a hint card with the
// reference photo. Used by the review step, edit mode and Simulate.
import { Stage } from './stage.js';
import { drawPoints, drawLinks, bbox, roundRect } from './draw.js';
import { DEF_BY_ID, REF } from '../engine/landmarks.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Reusable editable stage for one view (also used by Simulate)
// refImg: the reference photo — when given, hovering a point shows where it belongs (gone once you drag it)
export function editableStage(host, img, getLm, setLm, view, { onChange, fitPad = 0.08, showLinks = true, loupe = true, refImg = null } = {}) {
  let hover = null, drag = null;
  const lens = loupe ? el('<canvas class="loupe" width="300" height="300"></canvas>') : null;
  if (lens) host.appendChild(lens);
  const tip = refImg ? el('<div class="lm-tip" aria-hidden="true"></div>') : null;
  if (tip) host.appendChild(tip);
  let tipT = 0;
  const st = new Stage(host, img, {
    bg: '#0f1316',
    onDraw: (ctx, s) => {
      const lm = getLm();
      if (showLinks) drawLinks(ctx, s, lm, view, { color: 'rgba(255,255,255,0.42)' });
      drawPoints(ctx, s, lm, { r: 2.8, active: drag, hover });
      if (hover && !drag && !tip) {
        const p = s.toScreen(lm[hover]);
        const name = DEF_BY_ID[view][hover]?.name || hover;
        ctx.font = '600 12px Manrope, system-ui, sans-serif';
        const w = ctx.measureText(name).width + 16;
        const x = Math.min(s.w - w - 6, Math.max(6, p.x - w / 2)), y = Math.max(6, p.y - 34);
        ctx.fillStyle = 'rgba(15,19,22,0.85)';
        roundRect(ctx, x, y, w, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x + 8, y + 11.5);
      }
    },
  });
  const fit = () => {
    const b = bbox(getLm(), fitPad + 0.1);
    st.setView(st.rectView(Math.max(0, b.x0), Math.max(0, b.y0), Math.min(st.iw, b.x1), Math.min(st.ih, b.y1), 8));
  };
  st.onResize = fit;
  fit();

  const c = st.canvas;
  c.style.touchAction = 'none';
  const nearest = (sp) => {
    const lm = getLm();
    let best = null, bd = 14;
    for (const k in lm) {
      const p = st.toScreen(lm[k]);
      const dd = Math.hypot(p.x - sp.x, p.y - sp.y);
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  };
  let pan = null;
  c.addEventListener('pointerdown', (e) => {
    const sp = { x: e.offsetX, y: e.offsetY };
    const k = nearest(sp);
    c.setPointerCapture(e.pointerId);
    if (k) { drag = k; c.style.cursor = 'grabbing'; hideTip(); showLens(sp); }
    else pan = { sp, v: { ...st.view } };
    st.render();
  });
  c.addEventListener('pointermove', (e) => {
    const sp = { x: e.offsetX, y: e.offsetY };
    if (drag) {
      const p = st.toImage(sp);
      setLm({ ...getLm(), [drag]: { x: Math.max(0, Math.min(st.iw, p.x)), y: Math.max(0, Math.min(st.ih, p.y)) } });
      showLens(sp);
      st.render();
      onChange && onChange(drag);
      return;
    }
    if (pan) {
      st.setView({ cx: pan.v.cx - (sp.x - pan.sp.x) / st.view.s, cy: pan.v.cy - (sp.y - pan.sp.y) / st.view.s, s: st.view.s });
      return;
    }
    const k = nearest(sp);
    if (k !== hover) { hover = k; c.style.cursor = k ? 'grab' : 'default'; st.render(); if (k) showTip(k); else hideTip(); }
  });
  const up = () => {
    if (drag) onChange && onChange(drag, true);
    drag = null; pan = null;
    if (lens) lens.classList.remove('on');
    c.style.cursor = hover ? 'grab' : 'default';
    st.render();
  };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { hideTip(); if (!drag && hover) { hover = null; st.render(); } });
  c.addEventListener('wheel', hideTip, { passive: true });

  // Hint card: name, where it goes, and the reference photo zoomed on the same point
  function showTip(k) {
    if (!tip) return;
    clearTimeout(tipT);
    tipT = setTimeout(() => {
      if (hover !== k || drag) return;
      const def = DEF_BY_ID[view][k], r = REF[view][k];
      if (!def) return;
      tip.innerHTML = `<canvas width="300" height="200"></canvas><div class="lm-tip-t"><b>${esc(def.name)}</b><em>${esc(def.anat)}</em><p>${esc(def.how)}</p></div>`;
      if (r) {
        const ctx = tip.querySelector('canvas').getContext('2d');
        const z = def.zoom === 'close' ? 150 : def.zoom === 'medium' ? 240 : 380, W = 300, H = 200;
        ctx.drawImage(refImg, r[0] - z / 2, r[1] - (z * H) / W / 2, z, (z * H) / W, 0, 0, W, H);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff3b4f'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2); ctx.fill();
      } else tip.querySelector('canvas').remove();
      const p = st.toScreen(getLm()[k]);
      const tw = 240, th = tip.offsetHeight || 230;
      const left = p.x + 18 + tw > st.w ? p.x - 18 - tw : p.x + 18;
      const top = Math.max(8, Math.min(st.h - th - 8, p.y - th / 2));
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top = top + 'px';
      tip.classList.add('on');
    }, 120);
  }
  function hideTip() { clearTimeout(tipT); tip && tip.classList.remove('on'); }
  c.addEventListener('wheel', (e) => { e.preventDefault(); st.zoomAt({ x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  c.addEventListener('dblclick', fit);

  function showLens(sp) {
    if (!lens) return;
    const lm = getLm();
    const p = lm[drag];
    const ctx = lens.getContext('2d');
    const z = 70 / st.view.s; // image px radius shown
    ctx.clearRect(0, 0, 300, 300);
    ctx.save();
    ctx.beginPath(); ctx.arc(150, 150, 148, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, p.x - z, p.y - z, z * 2, z * 2, 0, 0, 300, 300);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(150, 120); ctx.lineTo(150, 142); ctx.moveTo(150, 158); ctx.lineTo(150, 180);
    ctx.moveTo(120, 150); ctx.lineTo(142, 150); ctx.moveTo(158, 150); ctx.lineTo(180, 150); ctx.stroke();
    ctx.fillStyle = '#ff3b4f'; ctx.beginPath(); ctx.arc(150, 150, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    lens.classList.add('on');
    const L = 150; // css size
    const left = sp.x + 24 + L > st.w ? sp.x - 24 - L : sp.x + 24;
    const top = Math.max(0, Math.min(st.h - L, sp.y - L - 20 < 0 ? sp.y + 20 : sp.y - L - 20));
    lens.style.left = left + 'px';
    lens.style.top = top + 'px';
  }
  return { st, fit, destroy: () => st.destroy() };
}
