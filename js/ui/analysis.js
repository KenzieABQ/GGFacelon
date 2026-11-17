// Analysis page: one pillar at a time, photo with animated measurement overlays + measurement list.
import { $, $$, el, esc, icon, countUp, modal } from './dom.js';
import { Stage } from './stage.js';
import { drawOverlay, drawPoints, drawLinks, bbox } from './draw.js';
import { PILLARS, METRICS, METRIC_BY_ID, rating, scoreColor, fmt, fmtRange, barGeom, overlayFor, assessmentDetail } from '../metrics.js';
import { faceThumb } from './dashboard.js';

const UNDERSTAND = {
  harmony: `Harmony compares your proportions with ideal male ranges — ${METRICS.filter((m) => m.hm && m.view === 'front').length} front ratios (thirds, widths, eye spacing, tilts) and ${METRICS.filter((m) => m.hm && m.view === 'side').length} side ratios (profile angles, nose and lip lines). Each ratio is scored 0–10: inside the ideal range scores 8.8–10, and the score falls away the further you are outside it. The pillar score is the weighted average; key ratios like FWHR, facial thirds and canthal tilt count more.`,
  angularity: 'Angularity estimates how sharp and defined your bone structure looks, using the landmark geometry behind cheekbone prominence, jaw definition, cheek leanness, chin definition and the area under the jaw. Each assessment combines several measurements.',
  dimorphism: 'Dimorphism measures how strongly your face shows male‑typical traits: a wide jaw, low brows and brow ridge, wide face shape, narrow eyes, a strong chin and neck. Each of the 10 assessments combines the related measurements.',
  features: 'Features rates each facial feature on its own — eyes, brows, nose, lips, jaw, chin, cheeks, forehead, ears & neck, and symmetry — from all the measurements that describe it. Skin isn’t rated because it can’t be measured from landmarks.',
};

export function mountAnalysis(page, app, scan, res, pid) {
  if (!PILLARS.find((p) => p.id === pid)) pid = 'harmony';
  const pillar = PILLARS.find((p) => p.id === pid);
  const score = res.pillars[pid].score;
  const isH = pid === 'harmony';
  let hView = app.prefs.get('hView', 'front');
  let sort = app.prefs.get('sort', 'low');
  let showLm = app.prefs.get('showLm', false);

  const v = el(`<div class="analysis">
    <div class="seg pillar-tabs">${PILLARS.map((p) => `<a href="#/scan/${scan.id}/analysis/${p.id}" class="${p.id === pid ? 'on' : ''}">${p.name}</a>`).join('')}</div>
    <div class="card a-head fade-up">
      <canvas class="a-thumb" width="120" height="120"></canvas>
      <div><div class="cap">${pillar.name}</div><div class="a-score"><span class="num" id="aNum" style="color:${scoreColor(score)}">0.00</span><span class="den">/10</span></div></div>
      <div class="a-rate">${rating(score)} ${pillar.name}</div>
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
          const g = ctx.createLinearGradient(0, 0, 0, s.h);
          g.addColorStop(0, 'rgba(6,10,12,0.30)'); g.addColorStop(0.6, 'rgba(6,10,12,0.38)'); g.addColorStop(1, 'rgba(6,10,12,0.85)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
          if (showLm) { drawLinks(ctx, s, lm, view, { color: 'rgba(255,255,255,0.3)' }); drawPoints(ctx, s, lm, { r: 1.8, alpha: 0.85 }); }
          if (active && active.m.view === view) {
            const p = Math.min(1, (performance.now() - t0) / 700);
            const { prims, inv } = overlayFor(active.m, res);
            drawOverlay(ctx, s, prims, inv, { progress: easeOut(p), text: fmt(active.m, res.values[active.m.id].v) });
          }
        },
      });
      const fit = () => {
        const b = bbox(lm, view === 'front' ? 0.12 : 0.16);
        st.setView(st.rectView(Math.max(0, b.x0), Math.max(0, b.y0 - b.h * 0.04), Math.min(st.iw, b.x1), Math.min(st.ih, b.y1 + b.h * 0.12), 0));
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
    active = { key: kind + id, m };
    $$('.mrow', v).forEach((r) => r.classList.toggle('active', r.dataset.id === id && r.dataset.kind === kind));
    $('#pfMetric', v).textContent = name;
    $('#pfScore', v).textContent = sc.toFixed(1);
    $('#pfScore', v).style.color = scoreColor(sc);
    $('#pfRate', v).textContent = rating(sc);
    showView(m.view);
    t0 = performance.now();
    cancelAnimationFrame(raf);
    const loop = () => {
      const st = stages[m.view];
      if (!st || !alive) return;
      st.draw();
      if (performance.now() - t0 < 720) raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // ── list ──
  function rows() {
    if (isH) {
      return METRICS.filter((m) => m.hm && m.view === hView).map((m) => ({ kind: 'm', id: m.id, name: m.name, score: res.values[m.id].s, m }));
    }
    return res.pillars[pid].items.map((a) => ({ kind: 'a', id: a.id, name: a.name, score: a.score, a }));
  }
  function renderList() {
    let list = rows();
    if (sort === 'low') list.sort((a, b) => a.score - b.score);
    else if (sort === 'high') list.sort((a, b) => b.score - a.score);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    $('#mCount', v).textContent = `${list.length} ${isH ? 'ratios' : 'assessments'}`;
    $('#mList', v).innerHTML = list.map((r, i) => (r.kind === 'm' ? metricRow(r.m, res, i) : assessRow(r.a, res, i))).join('');
    $$('.mrow', v).forEach((row) => {
      const main = $('.mrow-main', row);
      main.addEventListener('mouseenter', () => activate(row.dataset.id, row.dataset.kind));
      main.addEventListener('click', () => {
        const open = !row.classList.contains('open');
        $$('.mrow.open', v).forEach((r) => r !== row && r.classList.remove('open'));
        row.classList.toggle('open', open);
        activate(row.dataset.id, row.dataset.kind);
      });
      $$('.sub-row', row).forEach((sr) => sr.addEventListener('mouseenter', () => {
        const m = METRIC_BY_ID[sr.dataset.m];
        active = { key: 'sub' + m.id, m };
        showView(m.view);
        $('#pfMetric', v).textContent = m.name;
        t0 = performance.now();
        const loop = () => { const st = stages[m.view]; if (!st || !alive) return; st.draw(); if (performance.now() - t0 < 720) raf = requestAnimationFrame(loop); };
        cancelAnimationFrame(raf); loop();
      }));
    });
  }
  renderList();

  // ── controls ──
  $('#sort', v).value = sort;
  $('#sort', v).onchange = (e) => { sort = e.target.value; app.prefs.set('sort', sort); renderList(); };
  if (isH) {
    const seg = $('#hSeg', v);
    const sync = () => $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.h === hView));
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

// ── row templates ──
function gbar(m, val) {
  const g = barGeom(m);
  const pos = (g.at(val) * 100).toFixed(1);
  return `<div class="gbar" style="--loW:${g.loW * 100}%;--lo:${g.lo * 100}%;--hi:${g.hi * 100}%;--hiW:${g.hiW * 100}%"><i class="mk" style="left:${pos}%"></i></div>`;
}
const vchip = (txt, s) => `<span class="vchip" style="--c:${scoreColor(s)}">${txt}</span>`;

export function metricRow(m, res, i) {
  const r = res.values[m.id];
  return `<div class="mrow" data-id="${m.id}" data-kind="m" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="mrow-main">
      <div class="mr-left">
        <div class="mr-name">${esc(m.name)} ${vchip(fmt(m, r.v), r.s)}${m.extra ? '<span class="chip tiny ghost">extra</span>' : ''}</div>
        ${gbar(m, r.v)}
      </div>
      <div class="mr-score" style="color:${scoreColor(r.s)}">${r.s.toFixed(2)}</div>
      <span class="chev">${icon('chevR', 16)}</span>
    </div>
    <div class="mrow-detail">
      <p>${esc(m.desc)}</p>
      <div class="kv3"><div><span>Your value</span><b>${fmt(m, r.v)}</b></div><div><span>Ideal (male)</span><b>${fmtRange(m)}</b></div><div><span>Score</span><b style="color:${scoreColor(r.s)}">${r.s.toFixed(2)} · ${rating(r.s)}</b></div></div>
      <div class="formula">${icon('info', 13)} ${esc(m.how)}</div>
    </div>
  </div>`;
}

function assessRow(a, res, i) {
  const det = assessmentDetail(a, res);
  const lead = det[0];
  return `<div class="mrow" data-id="${a.id}" data-kind="a" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="mrow-main">
      <div class="mr-left">
        <div class="mr-name">${esc(a.name)} ${vchip(fmt(lead.m, lead.v), lead.s)}</div>
        <div class="sbar"><i style="width:${a.score * 10}%;background:${scoreColor(a.score)}"></i></div>
      </div>
      <div class="mr-score" style="color:${scoreColor(a.score)}">${a.score.toFixed(2)}</div>
      <span class="chev">${icon('chevR', 16)}</span>
    </div>
    <div class="mrow-detail">
      <p>${esc(a.desc)}</p>
      <div class="sub-list">${det.map((d) => `<div class="sub-row" data-m="${d.m.id}">
        <div class="sr-name">${esc(d.m.name)}<span class="sr-view">${d.m.view === 'front' ? 'Front' : 'Side'}${d.w > 1 ? ' · ×' + d.w : ''}</span></div>
        <div class="sr-val">${fmt(d.m, d.v)}<span>ideal ${fmtRange(d.m)}</span></div>
        <b style="color:${scoreColor(d.s)}">${d.s.toFixed(2)}</b></div>`).join('')}</div>
    </div>
  </div>`;
}

export function scoringGuide() {
  const bands = [[9, 'Exceptional'], [8, 'Excellent'], [7, 'Good'], [6, 'Above Average'], [5, 'Average'], [4, 'Below Average'], [0, 'Needs Work']];
  const m = modal(`<h3 class="m-title">Scoring guide</h3>
    <p class="m-body">Each measurement is compared with an ideal male range. Inside the range it scores 8.8–10 (10 at the centre). Outside, the score falls smoothly with distance (the falloff width is set per measurement), so being a little off costs a little and being far off costs a lot.</p>
    <div class="bands">${bands.map(([s, l]) => `<div><span class="sw" style="background:${scoreColor(s + 0.5)}"></span><b>${s === 0 ? '< 4' : s + '+'}</b><span>${l}</span></div>`).join('')}</div>
    <p class="m-body">Pillars average their measurements (Harmony) or assessments (Angularity, Dimorphism, Features). Overall = 35% Harmony + 20% Angularity + 25% Dimorphism + 20% Features.</p>
    <button class="btn dark block" data-x>Close</button>`, { cls: 'small' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
}
