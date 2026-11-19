// Measurement detail: a large panel with the photo and the measurement drawn in its score colour, the value on a
// graded range bar, what it means, how it's measured, which assessments it feeds and its scoring curve.
// Also an assessment view (Angularity / Dimorphism / Features) listing every measurement behind it.
import { $, $$, esc, icon, modal, rollNumber } from './dom.js';
import { Stage } from './stage.js';
import { drawOverlay, bbox, withAlpha } from './draw.js';
import { PILLARS, METRIC_BY_ID, ratioHex, ratioLabel, fmt, fmtRange, barGeom, overlayFor, scoreValue, assessmentDetail } from '../metrics.js';

const VIEW = { front: 'Front', side: 'Side' };
const has = (r) => r && Number.isFinite(r.v);

// Where a measurement feeds in: every pillar assessment that uses it
function usedBy(id, res) {
  const out = [];
  if (METRIC_BY_ID[id].hm) out.push({ pillar: 'Harmony', name: `${VIEW[METRIC_BY_ID[id].view]} Harmony`, score: res.pillars.harmony[METRIC_BY_ID[id].view] });
  for (const p of PILLARS.slice(1)) for (const a of res.pillars[p.id].items) if (a.metrics.some(([m]) => m === id)) out.push({ pillar: p.name, name: a.name, score: a.score });
  return out;
}

// Colour-graded range bar with the value bubble
function rangeBar(m, r) {
  const g = barGeom(m, r);
  const pc = (x) => (x * 100).toFixed(2) + '%';
  const grad = `linear-gradient(90deg, #ff6b5e 0%, #f5b544 ${pc(Math.max(0, g.loW - 0.06))}, #a8d84e ${pc(g.loW)}, #3ddc97 ${pc(g.lo)}, #3ddc97 ${pc(g.hi)}, #a8d84e ${pc(g.hiW)}, #f5b544 ${pc(Math.min(1, g.hiW + 0.06))}, #ff6b5e 100%)`;
  const pos = has(r) ? g.at(r.v) : null;
  const f = (v) => fmt(m, v);
  return `<div class="rbar">
    ${pos != null ? `<div class="rbar-bubble" style="left:${pc(pos)};--c:${ratioHex(r.s)}">${f(r.v)}</div>` : ''}
    <div class="rbar-track" style="background:${grad}">
      <i class="rbar-band" style="left:${pc(g.lo)};width:${pc(g.hi - g.lo)}"></i>
      ${pos != null ? `<i class="rbar-mark" style="left:${pc(pos)}"></i>` : ''}
    </div>
    <div class="rbar-labels"><span>${f(g.a)}</span><span class="ideal">ideal ${fmtRange(m, r)}</span><span>${f(g.b)}</span></div>
  </div>`;
}

// Score as a function of the value: 10 across the ideal range, falling off either side
function curveSVG(m, r) {
  const g = barGeom(m, r), W = 520, H = 170, P = { l: 30, r: 12, t: 14, b: 26 };
  const X = (v) => P.l + ((v - g.a) / (g.b - g.a)) * (W - P.l - P.r), Y = (s) => P.t + (1 - s / 10) * (H - P.t - P.b);
  let d = '';
  for (let i = 0; i <= 120; i++) { const v = g.a + ((g.b - g.a) * i) / 120; d += `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(scoreValue(m, v, r.lo, r.hi)).toFixed(1)}`; }
  const area = `${d}L${X(g.b)},${Y(0)}L${X(g.a)},${Y(0)}Z`;
  const you = has(r) ? { x: X(Math.min(g.b, Math.max(g.a, r.v))), y: Y(r.s) } : null;
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3ddc97" stop-opacity=".28"/><stop offset="1" stop-color="#3ddc97" stop-opacity="0"/></linearGradient></defs>
    ${[0, 5, 10].map((s) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(s)}" y2="${Y(s)}" class="grid"/><text x="${P.l - 8}" y="${Y(s) + 4}" text-anchor="end">${s}</text>`).join('')}
    <rect x="${X(r.lo)}" y="${P.t}" width="${Math.max(1, X(r.hi) - X(r.lo))}" height="${H - P.t - P.b}" class="band"/>
    <path d="${area}" fill="url(#cg)"/><path d="${d}" class="line"/>
    ${you ? `<line x1="${you.x}" x2="${you.x}" y1="${you.y}" y2="${Y(0)}" class="you-l" style="stroke:${ratioHex(r.s)}"/><circle cx="${you.x}" cy="${you.y}" r="6" class="you" style="stroke:${ratioHex(r.s)}"/>` : ''}
    <text x="${X(g.a)}" y="${H - 8}">${fmt(m, g.a)}</text><text x="${X(g.b)}" y="${H - 8}" text-anchor="end">${fmt(m, g.b)}</text>
  </svg>`;
}

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
      view = m.view;
      const img = await app.img(scan[m.view].url);
      if (!alive || cur !== m) return;
      st?.destroy();
      host.innerHTML = '';
      st = new Stage(host, img, { bg: '#080b0d', onDraw: draw });
    }
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

// ids: the measurement list to page through (e.g. the ratios currently listed); i: where to start
export function openMetricDetail(app, scan, res, ids, i = 0, { onClose } = {}) {
  let idx = Math.max(0, Math.min(ids.length - 1, i));
  const m0 = modal(`<div class="dt">
    <div class="dt-head"><span class="chip" id="dtIdx"></span><h2 id="dtName"></h2>
      <div class="dt-nav"><button class="icon-btn soft" id="dtPrev" title="Previous (←)">${icon('chevL', 16)}</button><button class="icon-btn soft" id="dtNext" title="Next (→)">${icon('chevR', 16)}</button><button class="icon-btn soft" data-x title="Close (Esc)">${icon('x', 16)}</button></div></div>
    <div class="dt-body">
      <div class="dt-photo"><div class="stage-host"></div><span class="chip dark dt-view" id="dtView"></span></div>
      <div class="dt-side" id="dtSide"></div>
    </div></div>`, { cls: 'detail', onClose: () => { photo.destroy(); document.removeEventListener('keydown', onKey); onClose && onClose(); } });
  const root = m0.el;
  const photo = photoPanel($('.stage-host', root), app, scan, res);
  const render = () => {
    const m = METRIC_BY_ID[ids[idx]], r = res.values[m.id];
    $('#dtIdx', root).textContent = `${idx + 1} / ${ids.length}`;
    $('#dtName', root).textContent = m.name;
    $('#dtView', root).textContent = `${VIEW[m.view]}${m.look ? ' · from the photo' : ''}`;
    const uses = usedBy(m.id, res);
    $('#dtSide', root).innerHTML = `
      <div class="dt-score card-glass">
        <div class="dt-num"><span class="num" id="dtNum" style="color:${has(r) ? ratioHex(r.s) : 'var(--faint)'}">—</span><span class="den">/10</span>
          <div class="cap">${has(r) ? ratioLabel(r.s) : 'Not measured'}</div></div>
        ${rangeBar(m, r)}
      </div>
      ${has(r) ? '' : `<p class="fine dt-na">Not measured on this photo — a point it needs is hidden (for example hair over the forehead) or couldn’t be read, so it is left out of your scores.</p>`}
      <section class="dt-sec"><div class="cap">About this measurement</div><p>${esc(m.desc)}</p></section>
      <section class="dt-sec"><div class="cap">How it's measured</div><p class="mono">${esc(m.how)}</p>
        <div class="dt-kv"><div><span>Your value</span><b>${fmt(m, r.v)}</b></div><div><span>Ideal (male)</span><b>${fmtRange(m, r)}</b></div><div><span>Typical man</span><b>${fmt(m, m.mean)}</b></div><div><span>Weight</span><b>×${m.w.toFixed(2)}</b></div></div></section>
      ${uses.length ? `<section class="dt-sec"><div class="cap">Contributes to <span class="chip tiny">${uses.length}</span></div>
        <div class="dt-uses">${uses.map((u) => `<div class="dt-use"><span><b>${esc(u.name)}</b><em>${esc(u.pillar)}</em></span><b style="color:${ratioHex(u.score)}">${Number.isFinite(u.score) ? u.score.toFixed(2) : '—'}</b></div>`).join('')}</div></section>` : ''}
      <section class="dt-sec"><div class="cap">Scoring curve</div>${curveSVG(m, r)}
        <p class="fine">Scores 10 anywhere inside the ideal range and falls off outside it; how fast depends on how much men normally vary on this measurement.</p></section>`;
    if (has(r)) rollNumber($('#dtNum', root), r.s, { dp: 1, ms: 900 });
    $('#dtPrev', root).disabled = idx === 0;
    $('#dtNext', root).disabled = idx === ids.length - 1;
    photo.show(m);
  };
  const go = (d) => { const n = idx + d; if (n < 0 || n >= ids.length) return; idx = n; render(); };
  $('#dtPrev', root).onclick = () => go(-1);
  $('#dtNext', root).onclick = () => go(1);
  $('[data-x]', root).onclick = () => m0.close();
  const isTop = () => document.getElementById('modal-root').lastElementChild === root.closest('.modal-wrap');
  const onKey = (e) => { if (!isTop()) return; if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  document.addEventListener('keydown', onKey);
  render();
  return m0;
}

// Assessment (Angularity / Dimorphism / Features): its score, what it means and every measurement behind it
export function openAssessmentDetail(app, scan, res, pid, items, i = 0) {
  let idx = Math.max(0, Math.min(items.length - 1, i));
  const m0 = modal(`<div class="dt">
    <div class="dt-head"><span class="chip" id="dtIdx"></span><h2 id="dtName"></h2>
      <div class="dt-nav"><button class="icon-btn soft" id="dtPrev">${icon('chevL', 16)}</button><button class="icon-btn soft" id="dtNext">${icon('chevR', 16)}</button><button class="icon-btn soft" data-x>${icon('x', 16)}</button></div></div>
    <div class="dt-body">
      <div class="dt-photo"><div class="stage-host"></div><span class="chip dark dt-view" id="dtView"></span></div>
      <div class="dt-side" id="dtSide"></div>
    </div></div>`, { cls: 'detail', onClose: () => { photo.destroy(); document.removeEventListener('keydown', onKey); } });
  const root = m0.el;
  const photo = photoPanel($('.stage-host', root), app, scan, res);
  const pillar = PILLARS.find((p) => p.id === pid);
  const render = () => {
    const a = items[idx];
    const det = assessmentDetail(a, res);
    $('#dtIdx', root).textContent = `${idx + 1} / ${items.length}`;
    $('#dtName', root).textContent = a.name;
    const lead = det.find((d) => has(d)) || det[0];
    $('#dtView', root).textContent = `${pillar.name} · ${Math.round(a.w * 100)}% of the pillar`;
    $('#dtSide', root).innerHTML = `
      <div class="dt-score card-glass">
        <div class="dt-num"><span class="num" id="dtNum" style="color:${ratioHex(a.score)}">—</span><span class="den">/10</span>
          <div class="cap">${Number.isFinite(a.score) ? ratioLabel(a.score) : 'Not measured'}</div></div>
        <p class="dt-desc">${esc(a.desc)}</p>
      </div>
      <section class="dt-sec"><div class="cap">Measurements behind it <span class="chip tiny">${det.length}</span></div>
        <div class="dt-subs">${det.map((d, j) => `<button class="dt-sub" data-j="${j}">
          <span class="dt-sub-n"><b>${esc(d.m.name)}</b><em>${VIEW[d.m.view]}${d.m.look ? ' · photo' : ''}${d.w > 1 ? ' · ×' + d.w : ''}</em></span>
          <span class="dt-sub-v">${fmt(d.m, d.v)}<em>${has(d) ? 'ideal ' + fmtRange(d.m, d) : 'not measured'}</em></span>
          <span class="dt-sub-bar"><i style="width:${has(d) ? d.s * 10 : 0}%;background:${ratioHex(d.s)}"></i></span>
          <b style="color:${has(d) ? ratioHex(d.s) : 'var(--faint)'}">${has(d) ? d.s.toFixed(1) : '—'}</b>
        </button>`).join('')}</div>
        <p class="fine">Hover a measurement to see it on your photo; click it for the full breakdown.</p></section>`;
    if (Number.isFinite(a.score)) rollNumber($('#dtNum', root), a.score, { dp: 1, ms: 900 });
    $$('.dt-sub', root).forEach((b) => {
      const d = det[+b.dataset.j];
      b.onmouseenter = () => photo.show(d.m);
      b.onclick = () => openMetricDetail(app, scan, res, det.map((x) => x.m.id), +b.dataset.j);
    });
    $('#dtPrev', root).disabled = idx === 0;
    $('#dtNext', root).disabled = idx === items.length - 1;
    photo.show(lead.m);
  };
  const go = (d) => { const n = idx + d; if (n < 0 || n >= items.length) return; idx = n; render(); };
  $('#dtPrev', root).onclick = () => go(-1);
  $('#dtNext', root).onclick = () => go(1);
  $('[data-x]', root).onclick = () => m0.close();
  const isTop = () => document.getElementById('modal-root').lastElementChild === root.closest('.modal-wrap');
  const onKey = (e) => { if (!isTop()) return; if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  document.addEventListener('keydown', onKey);
  render();
  return m0;
}
