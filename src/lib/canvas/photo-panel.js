// Photo stage that zooms to one measurement and draws it in its score colour.
import { Stage } from './stage.js';
import { drawOverlay, bbox } from './draw.js';
import { ratioHex, fmt, overlayFor } from '../engine/metrics.js';

const has = (r) => r && Number.isFinite(r.v);

// Photo stage that zooms to a measurement and draws it (re-used as the measurement changes)
export function photoPanel(host, app, scan, res) {
  let st = null, cur = null, t0 = 0, raf = 0, alive = true, view = null;
  const draw = (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s.h);
    g.addColorStop(0, 'rgba(6,10,12,0.25)'); g.addColorStop(1, 'rgba(6,10,12,0.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
    if (!cur) return;
    const { prims, inv } = overlayFor(cur, res);
    const r = res.values[cur.id];
    const p = Math.min(1, (performance.now() - t0) / 750), e = 1 - Math.pow(1 - p, 3);
    if (has(r)) drawOverlay(ctx, s, prims, inv, { progress: e, text: fmt(cur, r.v), color: ratioHex(r.s) });
  };
  const show = async (m) => {
    cur = m;
    if (view !== m.view) {
      const img = await app.img(scan[m.view].url);
      if (!alive || cur !== m) return;
      st?.destroy();
      host.innerHTML = '';
      st = new Stage(host, img, { bg: '#080b0d', onDraw: draw });
      view = m.view;
    }
    if (!st) return;
    const { prims, inv } = overlayFor(m, res);
    const pts = [];
    for (const pr of prims) for (const k of ['a', 'b', 'v', 'p']) if (pr[k]) pts.push(inv(pr[k]));
    const lb = bbox(scan[m.view].lm);
    const fit = () => {
      if (!pts.length) return st.setView(st.rectView(lb.x0, lb.y0, lb.x1, lb.y1, 24));
      const b = bbox(Object.fromEntries(pts.map((p, i) => [i, p])));
      const minS = Math.max(lb.w, lb.h) * 0.45, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const hw = Math.max(b.w, minS) * 0.62, hh = Math.max(b.h, minS) * 0.62;
      return st.rectView(cx - hw, cy - hh, cx + hw, cy + hh, 0);
    };
    st.onResize = () => st.setView(fit());
    st.animateTo(fit(), 600);
    t0 = performance.now();
    cancelAnimationFrame(raf);
    const loop = () => { if (!alive || !st) return; st.draw(); if (performance.now() - t0 < 800) raf = requestAnimationFrame(loop); };
    loop();
  };
  return { show, destroy: () => { alive = false; cancelAnimationFrame(raf); st?.destroy(); } };
}
