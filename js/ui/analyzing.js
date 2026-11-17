// "Analyzing your face" — landmark network draws in while measurement names tick by.
import { $, el } from './dom.js';
import { Stage } from './stage.js';
import { drawLinks, drawDot, bbox } from './draw.js';
import { METRICS } from '../metrics.js';

export function mountAnalyzing(body, app, draft, done) {
  const v = el(`<div class="analyzing">
    <div class="an-stage"><div class="stage-host"></div><div class="an-ring"></div></div>
    <div class="an-text"><div class="spinner"></div><div class="an-t">Analyzing your face…</div><div class="an-s" id="anS">&nbsp;</div></div>
  </div>`);
  body.appendChild(v);
  let alive = true, st = null;
  const t0 = performance.now();
  const DUR = 3200;
  (async () => {
    const img = await app.img(draft.front.url);
    if (!alive) return;
    const lm = draft.front.lm;
    st = new Stage($('.stage-host', v), img, {
      bg: '#06090b',
      onDraw: (ctx, s) => {
        const t = Math.min(1, (performance.now() - t0) / DUR);
        ctx.fillStyle = 'rgba(4,8,10,0.55)';
        ctx.fillRect(0, 0, s.w, s.h);
        drawLinks(ctx, s, lm, 'front', { progress: Math.min(1, t * 1.6), color: 'rgba(94,232,176,0.8)', width: 1.2 });
        const keys = Object.keys(lm);
        const k = Math.floor(Math.min(1, t * 1.3) * keys.length);
        for (let i = 0; i < k; i++) drawDot(ctx, s.toScreen(lm[keys[i]]), { r: 2, ringW: 1, fill: '#5ee8b0' });
        const y = ((performance.now() - t0) / 1600 % 1) * s.h;
        const g = ctx.createLinearGradient(0, y - 60, 0, y);
        g.addColorStop(0, 'rgba(94,232,176,0)'); g.addColorStop(1, 'rgba(94,232,176,0.18)');
        ctx.fillStyle = g; ctx.fillRect(0, y - 60, s.w, 60);
      },
    });
    const b = bbox(lm, 0.18);
    st.setView(st.rectView(b.x0, b.y0, b.x1, b.y1, 0));
    st.onResize = () => st.setView(st.rectView(b.x0, b.y0, b.x1, b.y1, 0));
    const names = METRICS.map((m) => m.name);
    const s = $('#anS', v);
    const loop = () => {
      if (!alive) return;
      st.draw();
      const t = (performance.now() - t0) / DUR;
      s.textContent = 'Measuring ' + names[Math.min(names.length - 1, Math.floor(t * names.length))];
      if (t < 1) requestAnimationFrame(loop);
      else { s.textContent = 'Building your report'; setTimeout(() => alive && done(), 350); }
    };
    loop();
  })();
  return () => { alive = false; st && st.destroy(); };
}
