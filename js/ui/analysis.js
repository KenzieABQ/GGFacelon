// Analysis page: one pillar at a time, photo with animated measurement overlays + measurement list.
import { $, $$, el, esc, icon, countUp, modal } from './dom.js';
import { Stage } from './stage.js';
import { drawOverlay, drawPoints, drawLinks, bbox } from './draw.js';
import { PILLARS, METRICS, METRIC_BY_ID, rating, scoreColor, ratioColor, ratioHex, scoreHex, ratioLabel, fmt, fmtRange, barGeom, overlayFor, assessmentDetail, percentile, pctText } from '../metrics.js';
import { faceThumb } from './dashboard.js';
import { openMetricDetail, openAssessmentDetail } from './detail.js';

const UNDERSTAND = {
  harmony: `Harmony compares your proportions with ideal male ranges — ${METRICS.filter((m) => m.hm && m.view === 'front').length} front ratios (thirds, widths, eye spacing, tilts) and ${METRICS.filter((m) => m.hm && m.view === 'side').length} side ratios (profile angles, nose and lip lines). Each ratio scores 10 inside its ideal range and less the further outside it falls. Key ratios (FWHR, thirds, eye spacing and tilt, jaw width, chin projection) count up to 5× more than minor ones, ratios a photo can’t measure reliably (many profile angles) count less, weak points count extra, and the pillar is placed on the population scale (5 = average). Front counts 70%, side 30%.`,
  angularity: 'Angularity estimates how sharp and defined your bone structure looks, using the landmark geometry behind cheekbone prominence, jaw definition, cheek leanness, chin definition and the area under the jaw. Each assessment combines several measurements.',
  dimorphism: 'Dimorphism measures how strongly your face shows male‑typical traits: a wide jaw, low, dark, full brows over a brow ridge, wide face shape, narrow eyes with lids close to the iris, a strong chin and neck. Each of the 10 assessments combines the related measurements — landmark geometry plus what the photo shows of your brows and eyes.',
  features: 'Features rates each facial feature on its own — eyes, brows, nose, lips, jaw, chin, cheeks, forehead, hairline, ears & neck, and symmetry — from all the measurements that describe it, including what the photo shows: brow thickness, darkness and length, how open the eyes are, lip fullness and the hairline. Skin isn’t rated.',
};

export function mountAnalysis(page, app, scan, res, pid) {
  if (!PILLARS.find((p) => p.id === pid)) pid = 'harmony';
  const pillar = PILLARS.find((p) => p.id === pid);
  const score = res.pillars[pid].score;
  const isH = pid === 'harmony';
  let hView = app.prefs.get('hView', 'front');
  let sort = app.prefs.get('sort', 'low');
  let showLm = app.prefs.get('showLm', false);
  // this pillar from one photo alone (Harmony: front / side Harmony)
  const vt = (vw) => (isH ? res.pillars.harmony[vw] : res.views?.[vw]?.[pid]);

  const v = el(`<div class="analysis">
    <div class="seg pillar-tabs">${PILLARS.map((p) => `<a href="#/scan/${scan.id}/analysis/${p.id}" class="${p.id === pid ? 'on' : ''}">${p.name}</a>`).join('')}</div>
    <div class="card a-head fade-up">
      <canvas class="a-thumb" width="120" height="120"></canvas>
      <div><div class="cap">${pillar.name}</div><div class="a-score"><span class="num" id="aNum" style="color:${scoreColor(score)}">0.00</span><span class="den">/10</span></div>
        <div class="a-rate">${rating(score)} · higher than ${pctText(percentile(score))}% of men</div></div>
      <div class="view-tiles">${['front', 'side'].map((vw) => { const sc = vt(vw); return `<button class="vtile ${isH && vw === hView ? 'on' : ''}" data-vt="${vw}" ${Number.isFinite(sc) ? '' : 'disabled'}>
        <canvas width="88" height="88" data-thumb="${vw}"></canvas>
        <span><em>${vw === 'front' ? 'Front' : 'Side'}</em><b class="num" data-n="${Number.isFinite(sc) ? sc : ''}" style="color:${scoreHex(sc)}">—</b><small>/10</small></span></button>`; }).join('')}</div>
    </div>
    <div class="a-grid">
      <div class="photo-card fade-up">
        <div class="stage-host" data-v="front"></div>
        <div class="stage-host" data-v="side" hidden></div>
        <button class="icon-btn glass gear" id="gear" title="Display options">${icon('gear', 17)}</button>
        <div class="gear-menu" id="gearMenu" hidden>
          <label class="check sm"><input type="checkbox" id="optLm" ${showLm ? 'checked' : ''}><span class="box">${icon('check', 12, 2.6)}</span><span>Show all landmarks</span></label>
        </div>
        <div class="photo-foot">
          <div class="pf-left"><div class="pf-metric" id="pfMetric">${isH ? 'Hover a ratio' : 'Hover an assessment'}</div><div class="pf-cap">Score</div></div>
          <div class="pf-right"><div class="pf-score"><span id="pfScore" style="color:${scoreColor(score)}">${score.toFixed(1)}</span><span class="den">/10</span></div><div class="pf-rate" id="pfRate">${rating(score)} ${pillar.name}</div></div>
        </div>
      </div>
      <div class="card m-card fade-up" style="animation-delay:80ms">
        <div class="m-top">
          <button class="understand" id="und">Understanding ${pillar.name} ${icon('chevD', 15)}</button>
          <button class="pill soft" id="guideBtn">Scoring guide</button>
        </div>
        <div class="und-body" id="undBody" hidden><p>${esc(UNDERSTAND[pid])}</p></div>
        <div class="m-title-row">
          <h2>Your ${isH ? (hView === 'front' ? 'Front Ratios' : 'Side Ratios') : 'Measurements'}</h2>
          <span class="chip" id="mCount"></span>
        </div>
        <div class="m-tools">
          ${isH ? `<div class="seg sm" id="hSeg"><button data-h="front">Front</button><button data-h="side">Side</button></div>` : '<span></span>'}
          <select id="sort" class="select"><option value="low">Lowest score first</option><option value="high">Highest score first</option><option value="az">A – Z</option></select>
        </div>
        <div class="m-list" id="mList"></div>
      </div>
    </div>
  </div>`);
  page.appendChild(v);
  countUp($('#aNum', v), score, { delay: 100 });
  faceThumb(app, scan, $('.a-thumb', v));
  $$('.vtile b.num', v).forEach((n, i) => n.dataset.n && countUp(n, +n.dataset.n, { delay: 220 + i * 90 }));
  for (const vw of ['front', 'side']) viewThumb(app, scan, vw, $(`[data-thumb="${vw}"]`, v));

  // ── photo stages ──
  const stages = {};
  let active = null, t0 = 0, raf = 0, alive = true;
  (async () => {
    for (const view of ['front', 'side']) {
      const img = await app.img(scan[view].url);
      if (!alive) return;
      const host = $(`.stage-host[data-v="${view}"]`, v);
      const lm = scan[view].lm;
      const st = new Stage(host, img, {
        bg: '#0c1012',
        onDraw: (ctx, s) => {
          drawFocusBlur(ctx, s);
          const g = ctx.createLinearGradient(0, 0, 0, s.h);
          g.addColorStop(0, 'rgba(6,10,12,0.30)'); g.addColorStop(0.6, 'rgba(6,10,12,0.38)'); g.addColorStop(1, 'rgba(6,10,12,0.85)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
          if (showLm) { drawLinks(ctx, s, lm, view, { color: 'rgba(255,255,255,0.3)' }); drawPoints(ctx, s, lm, { r: 1.8, alpha: 0.85 }); }
          if (active && active.m.view === view && Number.isFinite(res.values[active.m.id].v)) {
            const p = Math.min(1, (performance.now() - t0) / 700);
            const { prims, inv } = overlayFor(active.m, res);
            // lines take the colour of the score shown next to them
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
      st.onResize = fit;
      fit();
      stages[view] = st;
    }
    showView(isH ? hView : 'front');
    // start on the first row so the photo isn't empty
    const first = $('.mrow', v);
    if (first) activate(first.dataset.id, first.dataset.kind, true);
  })();

  function showView(view) {
    for (const k of ['front', 'side']) $(`.stage-host[data-v="${k}"]`, v).hidden = k !== view;
    stages[view]?.resize();
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function activate(id, kind, quiet) {
    let m, name, sc;
    if (kind === 'a') {
      const a = res.pillars[pid].items.find((x) => x.id === id);
      m = METRIC_BY_ID[a.metrics[0][0]];
      name = a.name; sc = a.score;
    } else {
      m = METRIC_BY_ID[id]; name = m.name; sc = res.values[id].s;
    }
    if (active && active.key === kind + id) return;
    active = { key: kind + id, m, sc };
    $$('.mrow', v).forEach((r) => r.classList.toggle('active', r.dataset.id === id && r.dataset.kind === kind));
    $('#pfMetric', v).textContent = name;
    const has = Number.isFinite(sc) && (kind === 'a' || Number.isFinite(res.values[id].v));
    $('#pfScore', v).textContent = has ? sc.toFixed(1) : '—';
    $('#pfScore', v).style.color = has ? ratioHex(sc) : 'var(--faint)';
    $('#pfRate', v).textContent = has ? rating(sc) : 'Not measured';
    showView(m.view);
    focusOn(m);
  }

  // Zoom smoothly into the measured feature and blur the rest of the photo
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
        // never zoom tighter than ~a third of the face, and leave room around the lines
        const minS = Math.max(st.lmBox.w, st.lmBox.h) * 0.28;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const hw = Math.max(x1 - x0, minS) * 0.66, hh = Math.max(y1 - y0, minS) * 0.66;
        const box = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
        let target = st.rectView(box.x0, box.y0, box.x1, box.y1, 0);
        target.s = Math.max(st.fitV.s, Math.min(target.s, st.fitV.s * 3.2));
        st.focus = { from: focusAmt(st.focus), to: 1, t0, box: { x0: cx - hw / 1.45, y0: cy - hh / 1.45, x1: cx + hw / 1.45, y1: cy + hh / 1.45 }, target };
        st.animateTo(target, 650);
      }
    }
    const loop = () => {
      const s2 = stages[m.view];
      if (!s2 || !alive) return;
      s2.draw();
      if (performance.now() - t0 < 760) raf = requestAnimationFrame(loop);
    };
    loop();
  }
  // Back to the whole face when the pointer leaves the list
  function unfocus() {
    const now = performance.now();
    for (const st of Object.values(stages)) {
      if (!st.focus || !st.focus.to) continue;
      st.focus = { ...st.focus, from: focusAmt(st.focus), to: 0, t0: now, target: null };
      st.animateTo(st.fitV, 650);
    }
  }

  // ── list ──
  function rows() {
    if (isH) {
      // a ratio that couldn't be measured (e.g. hair over the forehead) has no score
      return METRICS.filter((m) => m.hm && m.view === hView).map((m) => ({ kind: 'm', id: m.id, name: m.name, score: Number.isFinite(res.values[m.id].v) ? res.values[m.id].s : NaN, m }));
    }
    return res.pillars[pid].items.map((a) => ({ kind: 'a', id: a.id, name: a.name, score: a.score, a }));
  }
  function renderList() {
    let list = rows();
    const key = (r, d) => (Number.isFinite(r.score) ? r.score : d); // unmeasured items go last
    if (sort === 'low') list.sort((a, b) => key(a, 99) - key(b, 99));
    else if (sort === 'high') list.sort((a, b) => key(b, -1) - key(a, -1));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    $('#mCount', v).textContent = `${list.length} ${isH ? 'ratios' : 'assessments'}`;
    $('#mList', v).innerHTML = list.map((r, i) => (r.kind === 'm' ? metricRow(r.m, res, i) : assessRow(r.a, res, i))).join('');
    $$('.mrow', v).forEach((row) => {
      const main = $('.mrow-main', row);
      main.addEventListener('mouseenter', () => activate(row.dataset.id, row.dataset.kind));
      // click: the full breakdown, paging through the list in its current order
      main.addEventListener('click', () => {
        activate(row.dataset.id, row.dataset.kind);
        if (row.dataset.kind === 'm') openMetricDetail(app, scan, res, list.map((r) => r.id), list.findIndex((r) => r.id === row.dataset.id));
        else openAssessmentDetail(app, scan, res, pid, list.map((r) => r.a), list.findIndex((r) => r.id === row.dataset.id));
      });
      $$('.sub-row', row).forEach((sr) => sr.addEventListener('mouseenter', () => {
        const m = METRIC_BY_ID[sr.dataset.m];
        active = { key: 'sub' + m.id, m, sc: res.values[m.id].s };
        showView(m.view);
        $('#pfMetric', v).textContent = m.name;
        focusOn(m);
      }));
    });
  }
  renderList();
  $('#mList', v).addEventListener('mouseleave', () => { unfocus(); active = active && { ...active, key: null }; });

  // ── controls ──
  $('#sort', v).value = sort;
  $('#sort', v).onchange = (e) => { sort = e.target.value; app.prefs.set('sort', sort); renderList(); };
  // Front / Side tiles: switch the Harmony list; on other pillars they show that photo
  $$('.vtile', v).forEach((t) => (t.onclick = () => {
    if (isH) $(`#hSeg button[data-h="${t.dataset.vt}"]`, v)?.click();
    else { showView(t.dataset.vt); $$('.vtile', v).forEach((x) => x.classList.toggle('on', x === t)); }
  }));
  if (isH) {
    const seg = $('#hSeg', v);
    const sync = () => { $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.h === hView)); $$('.vtile', v).forEach((x) => x.classList.toggle('on', x.dataset.vt === hView)); };
    sync();
    $$('button', seg).forEach((b) => (b.onclick = () => {
      hView = b.dataset.h;
      app.prefs.set('hView', hView);
      sync();
      $('.m-title-row h2', v).textContent = `Your ${hView === 'front' ? 'Front' : 'Side'} Ratios`;
      renderList();
      showView(hView);
      const first = $('.mrow', v);
      active = null;
      if (first) activate(first.dataset.id, first.dataset.kind);
    }));
  }
  $('#und', v).onclick = () => { const b = $('#undBody', v); b.hidden = !b.hidden; $('#und', v).classList.toggle('open', !b.hidden); };
  $('#guideBtn', v).onclick = scoringGuide;
  $('#gear', v).onclick = (e) => { e.stopPropagation(); $('#gearMenu', v).hidden = !$('#gearMenu', v).hidden; };
  const closeMenu = (e) => { if (!e.target.closest('#gearMenu')) $('#gearMenu', v).hidden = true; };
  document.addEventListener('click', closeMenu);
  $('#optLm', v).onchange = (e) => { showLm = e.target.checked; app.prefs.set('showLm', showLm); Object.values(stages).forEach((s) => s.render()); };

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('click', closeMenu);
    Object.values(stages).forEach((s) => s.destroy());
  };
}

// ── focus blur ──
const FOCUS_MS = 520;
function focusAmt(f) {
  if (!f) return 0;
  const t = Math.min(1, Math.max(0, (performance.now() - f.t0) / FOCUS_MS));
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return f.from + (f.to - f.from) * e;
}
// A pre-blurred, downscaled copy of the photo (blurring every frame would be too slow)
function makeBlur(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const k = Math.min(1, 1600 / Math.max(W, H));
  const c = document.createElement('canvas');
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const x = c.getContext('2d');
  x.filter = 'blur(1.2px)'; // subtle: the copy is magnified with the zoom
  x.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, k };
}
// Lay the blurred copy over the photo everywhere except a soft spotlight on the focused feature
function drawFocusBlur(ctx, s) {
  const f = s.focus, amt = focusAmt(f);
  if (!(amt > 0.002) || !f.box || !s.blur) return;
  const off = s._off || (s._off = document.createElement('canvas'));
  if (off.width !== s.canvas.width || off.height !== s.canvas.height) { off.width = s.canvas.width; off.height = s.canvas.height; }
  const o = off.getContext('2d');
  const v = s.view, dpr = s.dpr, k = s.blur.k;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.clearRect(0, 0, off.width, off.height);
  o.setTransform((dpr * v.s) / k, 0, 0, (dpr * v.s) / k, dpr * (s.w / 2 - v.cx * v.s), dpr * (s.h / 2 - v.cy * v.s));
  o.drawImage(s.blur.canvas, 0, 0);
  o.setTransform(dpr, 0, 0, dpr, 0, 0);
  o.fillStyle = 'rgba(6,10,12,0.06)';
  o.fillRect(0, 0, s.w, s.h);
  o.globalCompositeOperation = 'destination-out';
  const c = s.toScreen({ x: (f.box.x0 + f.box.x1) / 2, y: (f.box.y0 + f.box.y1) / 2 });
  const rx = Math.max(28, ((f.box.x1 - f.box.x0) / 2) * v.s * 1.35), ry = Math.max(28, ((f.box.y1 - f.box.y0) / 2) * v.s * 1.35);
  o.save();
  o.translate(c.x, c.y);
  o.scale(rx, ry);
  const g = o.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = g;
  o.beginPath(); o.arc(0, 0, 1, 0, Math.PI * 2); o.fill();
  o.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = amt * 0.55;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

// ── row templates ──
function gbar(m, r) {
  const g = barGeom(m, r);
  const pos = (g.at(r.v) * 100).toFixed(1);
  return `<div class="gbar" style="--loW:${g.loW * 100}%;--lo:${g.lo * 100}%;--hi:${g.hi * 100}%;--hiW:${g.hiW * 100}%"><i class="mk" style="left:${pos}%"></i></div>`;
}
const vchip = (txt, s) => `<span class="vchip" style="--c:${ratioColor(s)}">${txt}</span>`;

export function metricRow(m, res, i) {
  const r = res.values[m.id];
  if (!Number.isFinite(r.v)) {
    return `<div class="mrow na" data-id="${m.id}" data-kind="m" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="mrow-main">
      <div class="mr-left"><div class="mr-name">${esc(m.name)} <span class="chip tiny ghost">not measured</span></div></div>
      <div class="mr-score muted">—</div>
      <span class="chev">${icon('chevR', 16)}</span>
    </div>
    <div class="mrow-detail">
      <p>${esc(m.desc)}</p>
      <p class="fine">Not measured on this photo — a point it needs is hidden (for example hair over the forehead) or couldn’t be read. It is left out of your scores rather than guessed.</p>
      <div class="formula">${icon('info', 13)} ${esc(m.how)}</div>
    </div>
  </div>`;
  }
  return `<div class="mrow" data-id="${m.id}" data-kind="m" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="mrow-main">
      <div class="mr-left">
        <div class="mr-name">${esc(m.name)} ${vchip(fmt(m, r.v), r.s)}${m.extra ? '<span class="chip tiny ghost">extra</span>' : ''}</div>
        ${gbar(m, r)}
      </div>
      <div class="mr-score" style="color:${ratioColor(r.s)}">${r.s.toFixed(2)}</div>
      <span class="chev">${icon('chevR', 16)}</span>
    </div>
    <div class="mrow-detail">
      <p>${esc(m.desc)}</p>
      <div class="kv3"><div><span>Your value</span><b>${fmt(m, r.v)}</b></div><div><span>Ideal (male)</span><b>${fmtRange(m, r)}</b><span>typical man ${fmt(m, m.mean)}</span></div><div><span>Score</span><b style="color:${ratioColor(r.s)}">${r.s.toFixed(2)} · ${ratioLabel(r.s)}</b></div></div>
      <div class="formula">${icon('info', 13)} ${esc(m.how)}</div>
    </div>
  </div>`;
}

function assessRow(a, res, i) {
  const det = assessmentDetail(a, res);
  const lead = det.find((d) => Number.isFinite(d.v)) || det[0];
  if (!Number.isFinite(a.score)) {
    return `<div class="mrow na" data-id="${a.id}" data-kind="a" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="mrow-main">
      <div class="mr-left"><div class="mr-name">${esc(a.name)} <span class="chip tiny ghost">not measured</span></div></div>
      <div class="mr-score muted">—</div>
      <span class="chev">${icon('chevR', 16)}</span>
    </div>
    <div class="mrow-detail"><p>${esc(a.desc)}</p><p class="fine">None of its measurements could be read from these photos, so it is left out.</p></div>
  </div>`;
  }
  return `<div class="mrow" data-id="${a.id}" data-kind="a" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="mrow-main">
      <div class="mr-left">
        <div class="mr-name">${esc(a.name)} ${vchip(fmt(lead.m, lead.v), lead.s)}<span class="chip tiny ghost" title="Share of the pillar score">${Math.round(a.w * 100)}%</span></div>
        <div class="sbar"><i style="width:${a.score * 10}%;background:${ratioColor(a.score)}"></i></div>
      </div>
      <div class="mr-score" style="color:${ratioColor(a.score)}">${a.score.toFixed(2)}</div>
      <span class="chev">${icon('chevR', 16)}</span>
    </div>
    <div class="mrow-detail">
      <p>${esc(a.desc)}</p>
      <div class="sub-list">${det.map((d) => `<div class="sub-row" data-m="${d.m.id}">
        <div class="sr-name">${esc(d.m.name)}<span class="sr-view">${d.m.view === 'front' ? 'Front' : 'Side'}${d.w > 1 ? ' · ×' + d.w : ''}</span></div>
        <div class="sr-val">${fmt(d.m, d.v)}<span>${Number.isFinite(d.v) ? 'ideal ' + fmtRange(d.m, d) : 'not measured'}</span></div>
        <b style="color:${Number.isFinite(d.v) ? ratioColor(d.s) : 'var(--faint)'}">${Number.isFinite(d.v) ? d.s.toFixed(2) : '—'}</b></div>`).join('')}</div>
    </div>
  </div>`;
}

export function scoringGuide() {
  const bands = [[8, 'Exceptional'], [7, 'Great'], [6, 'Good'], [5, 'Average'], [4, 'Below Average'], [0, 'Poor']];
  const m = modal(`<h3 class="m-title">Scoring guide</h3>
    <p class="m-body">Each ratio scores <b>10 inside its ideal range</b> and drops off smoothly outside it — the shaded band on each bar is the ideal range. How fast it drops is set per ratio, fitted to FaceIQ Labs’ published scores.</p>
    <p class="m-body">Pillars lean on your weaker ratios (a power mean), then sit on FaceIQ’s population scale: <b>5 is average, 7 ≈ top 6%, 8 ≈ top 0.4%</b>.</p>
    <div class="bands">${bands.map(([s, l]) => `<div><span class="sw" style="background:${scoreColor(s + 0.05)}"></span><b>${s === 0 ? '< 4' : s + '+'}</b><span>${l}</span></div>`).join('')}</div>
    <p class="m-body">Harmony = 70% front + 30% side. Overall combines the four pillars like a geometric mean, so your weakest pillar pulls hardest.</p>
    <button class="btn dark block" data-x>Close</button>`, { cls: 'small' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
}

// Small face crop for the Front / Side tiles
async function viewThumb(app, scan, view, canvas) {
  if (!canvas) return;
  const img = await app.img(scan[view].url);
  const b = bbox(scan[view].lm, 0.08);
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size, 0, 0, canvas.width, canvas.height);
}
