// Calibration & data: tune the overall scale with known scores (e.g. from FaceIQ) and export landmarks.
import { $, $$, el, esc, icon, modal, toast } from './dom.js';
import { faceThumb } from './dashboard.js';

// Least-squares fit target ≈ a + b · model; one anchor → shift only.
export function fitAnchors(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n, my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let b = 1;
  if (n >= 2) {
    const sxx = pairs.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    const sxy = pairs.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    b = sxx > 1e-6 ? sxy / sxx : 1;
    b = Math.max(0.4, Math.min(2.5, b)); // keep the scale sane with few or noisy anchors
  }
  const a = my - b * mx;
  return { a: +a.toFixed(4), b: +b.toFixed(4), n };
}

export function openCalibration(app) {
  const rows = app.scans.map((s) => {
    const base = app.baseResult(s).overall;
    return `<div class="cal-row" data-id="${s.id}">
      <canvas width="80" height="80"></canvas>
      <div class="cal-meta"><input class="cal-label" type="text" placeholder="Name (optional)" value="${esc(s.label || '')}" maxlength="40">
        <span>${new Date(s.created).toLocaleDateString([], { dateStyle: 'medium' })} · model ${base.toFixed(2)}</span></div>
      <input class="cal-target" type="number" min="0" max="10" step="0.01" placeholder="Known" value="${s.target ?? ''}" aria-label="Known overall score">
    </div>`;
  }).join('');
  const fit = app.prefs.get('anchorFit', null);
  const m = modal(`<h3 class="m-title">Calibration &amp; data</h3>
    <p class="m-body">If you know the real overall score for some faces — for example FaceIQ results such as 7.77 or 7.03 — enter them here. GGFacelon fits its overall and pillar scale to match (one known score shifts the scale; two or more also stretch it). Leave blank for faces you don’t have a score for.</p>
    <div class="cal-list">${rows || '<p class="fine">No scans yet.</p>'}</div>
    <div class="cal-status" id="calStatus">${fit ? `Active: shown = ${fit.a.toFixed(2)} + ${fit.b.toFixed(2)} × model, from ${fit.n} known score${fit.n > 1 ? 's' : ''}.` : 'No calibration active — using the built‑in population scale.'}</div>
    <div class="m-actions wrap">
      <button class="btn ghost" data-a="export">${icon('download', 15)} Export landmarks (JSON)</button>
      <span class="grow"></span>
      <button class="btn ghost" data-a="reset">Reset</button>
      <button class="btn dark" data-a="apply">Save &amp; apply</button>
    </div>
    <p class="fine">The export contains landmark coordinates, image sizes, names and scores — no photos.</p>`, { cls: 'cal-modal' });

  $$('.cal-row canvas', m.el).forEach((c) => faceThumb(app, app.scan(c.closest('.cal-row').dataset.id), c));

  const collect = async () => {
    for (const row of $$('.cal-row', m.el)) {
      const s = app.scan(row.dataset.id);
      const label = $('.cal-label', row).value.trim();
      const t = parseFloat($('.cal-target', row).value);
      const target = Number.isFinite(t) && t >= 0 && t <= 10 ? +t.toFixed(2) : undefined;
      if ((s.label || '') !== label || s.target !== target) {
        s.label = label || undefined;
        s.target = target;
        await app.save(s);
      }
    }
  };

  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'export') {
      await collect();
      exportJSON(app);
    } else if (a === 'reset') {
      app.prefs.set('anchorFit', null);
      $('#calStatus', m.el).textContent = 'Calibration cleared — using the built‑in population scale.';
      toast('Calibration reset');
      refresh(app);
    } else if (a === 'apply') {
      await collect();
      const pairs = app.scans.filter((s) => Number.isFinite(s.target)).map((s) => ({ x: app.baseResult(s).overall, y: s.target }));
      const f = fitAnchors(pairs);
      app.prefs.set('anchorFit', f);
      if (!f) {
        $('#calStatus', m.el).textContent = 'No known scores entered — using the built‑in population scale.';
      } else {
        const err = (fn) => Math.sqrt(pairs.reduce((s, p) => s + (fn(p.x) - p.y) ** 2, 0) / pairs.length);
        const before = err((x) => x), after = err((x) => f.a + f.b * x);
        $('#calStatus', m.el).textContent = `Applied: shown = ${f.a.toFixed(2)} + ${f.b.toFixed(2)} × model, from ${f.n} known score${f.n > 1 ? 's' : ''}. Average error ${before.toFixed(2)} → ${after.toFixed(2)}.`;
      }
      toast('Calibration saved');
      refresh(app);
    }
  });
}

function refresh(app) {
  // re-render the current page so every score uses the new scale
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function exportJSON(app) {
  const data = {
    app: 'GGFacelon',
    exported: new Date().toISOString(),
    calibration: app.prefs.get('anchorFit', null),
    scans: app.scans.map((s) => {
      const r = app.baseResult(s);
      return {
        id: s.id, created: new Date(s.created).toISOString(), label: s.label || null, target: s.target ?? null,
        front: { w: s.front.w, h: s.front.h, source: s.front.source || null, lm: round(s.front.lm) },
        side: { w: s.side.w, h: s.side.h, source: s.side.source || null, lm: round(s.side.lm) },
        model: { overall: +r.overall.toFixed(3), pillars: Object.fromEntries(Object.entries(r.pillars).map(([k, p]) => [k, +p.score.toFixed(3)])) },
      };
    }),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ggfacelon-landmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Exported ${data.scans.length} scan${data.scans.length === 1 ? '' : 's'}`);
}
const round = (lm) => Object.fromEntries(Object.entries(lm).map(([k, p]) => [k, [+p.x.toFixed(1), +p.y.toFixed(1)]]));
