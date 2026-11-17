// AI landmark detection screen: scanning sweep → mesh points → landmarks.
import { $, el, icon } from './dom.js';
import { Stage } from './stage.js';
import { drawLinks, drawDot } from './draw.js';
import { detect } from '../detect.js';
import { DEFS } from '../landmarks.js';

export function mountDetecting(body, app, draft, done) {
  const v = el(`<div class="detect fade-up">
    <h1 class="serif center">Mapping your face.</h1>
    <p class="sub center" id="dstatus">Loading the landmark model…</p>
    <div class="detect-grid">
      <div class="detect-card"><div class="stage-host" data-v="front"></div><div class="detect-tag"><span class="dot"></span>Front · ${DEFS.front.length} points</div></div>
      <div class="detect-card"><div class="stage-host" data-v="side"></div><div class="detect-tag"><span class="dot"></span>Profile · ${DEFS.side.length} points</div></div>
    </div>
    <p class="fine center" id="dnote"></p>
  </div>`);
  body.appendChild(v);
  const status = $('#dstatus', v), note = $('#dnote', v);
  let alive = true;
  const stages = {};
  const anim = { front: { phase: 'idle', t0: 0 }, side: { phase: 'idle', t0: 0 } };
  const out = {};

  (async () => {
    for (const view of ['front', 'side']) {
      const img = await app.img(draft[view].url);
      const host = $(`[data-v="${view}"]`, v);
      const a = anim[view];
      const st = new Stage(host, img, {
        bg: '#0d1114',
        onDraw: (ctx, s) => paint(ctx, s, view, a),
      });
      st.autoFit = true;
      st.fitPad = 0;
      st.view = st.fitView(0, true);
      st.onResize = () => { st.view = st.fitView(0, true); };
      stages[view] = st;
    }
    loop();
    for (const view of ['front', 'side']) {
      if (!alive) return;
      const a = anim[view];
      a.phase = 'scan'; a.t0 = performance.now();
      status.textContent = view === 'front' ? 'Detecting facial landmarks…' : 'Tracing your profile…';
      const img = await app.img(draft[view].url);
      const t0 = performance.now();
      const res = await detect(view, img, view === 'side' && out.front ? { front: out.front.lm, skin: out.front.skin } : {});
      const wait = Math.max(0, 900 - (performance.now() - t0)); // let the sweep read as a scan
      await sleep(wait);
      out[view] = res;
      a.res = res;
      a.mesh = res.mesh ? [...res.mesh].sort((p, q) => p.y - q.y) : null;
      a.phase = 'reveal'; a.t0 = performance.now();
      if (res.source === 'template') {
        note.innerHTML = res.error === 'model'
          ? `${icon('info', 14)} The AI model could not load (offline?). Points start from a template — you’ll place them in the next step.`
          : `${icon('info', 14)} No face found in the ${view === 'front' ? 'front' : 'profile'} photo. Points start from a template — place a couple and the rest will follow.`;
      }
      await sleep(1500);
      host(view).classList.add('done');
    }
    if (!alive) return;
    status.textContent = 'First pass complete. Verify each point next.';
    await sleep(650);
    if (alive) done(out);
  })().catch((e) => {
    console.error(e);
    status.textContent = 'Something went wrong: ' + e.message;
  });

  const host = (view) => $(`[data-v="${view}"]`, v).parentElement;

  function paint(ctx, st, view, a) {
    const now = performance.now();
    ctx.fillStyle = 'rgba(8,12,14,0.28)';
    ctx.fillRect(0, 0, st.w, st.h);
    if (a.phase === 'scan') {
      const t = ((now - a.t0) / 1400) % 1;
      const y = t * st.h;
      const g = ctx.createLinearGradient(0, y - 90, 0, y);
      g.addColorStop(0, 'rgba(94,232,176,0)');
      g.addColorStop(1, 'rgba(94,232,176,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 90, st.w, 90);
      ctx.fillStyle = 'rgba(160,255,214,0.9)';
      ctx.fillRect(0, y, st.w, 1.5);
    }
    if (a.phase === 'reveal' && a.res) {
      const t = (now - a.t0) / 1000;
      if (a.mesh) {
        const n = Math.floor(Math.min(1, t / 0.8) * a.mesh.length);
        const fade = t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.5) : 1;
        ctx.fillStyle = `rgba(160,255,214,${0.75 * fade})`;
        for (let i = 0; i < n; i++) {
          const p = st.toScreen(a.mesh[i]);
          ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
        }
      }
      const lt = Math.max(0, (t - (a.mesh ? 0.7 : 0)) / 0.7);
      if (lt > 0) {
        drawLinks(ctx, st, a.res.lm, view, { progress: Math.min(1, lt), color: 'rgba(255,255,255,0.6)' });
        const keys = Object.keys(a.res.lm);
        const k = Math.floor(Math.min(1, lt) * keys.length);
        for (let i = 0; i < k; i++) drawDot(ctx, st.toScreen(a.res.lm[keys[i]]), { r: 2.4, ringW: 1.1 });
      }
    }
  }

  function loop() {
    if (!alive) return;
    for (const k in stages) stages[k].draw();
    requestAnimationFrame(loop);
  }

  return () => {
    alive = false;
    for (const k in stages) stages[k].destroy();
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
