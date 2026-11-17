// Dashboard shell: sidebar with history, top tabs, Overview page and the empty state.
import { $, $$, el, esc, icon, bars, countUp, relTime, confirmDialog, toast } from './dom.js';
import { Stage } from './stage.js';
import { drawLinks, drawPoints, bbox } from './draw.js';
import { PILLARS, METRIC_BY_ID, rating, scoreColor, fmt, POP } from '../metrics.js';
import { mountAnalysis } from './analysis.js';
import { mountPlan, mountSimulate, mountCompare, mountMethodology, exportCard } from './extras.js';
import { openCalibration } from './calibration.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'plan', label: 'Plan' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'compare', label: 'Compare' },
];
export const PILLAR_ART = {
  harmony: '<svg viewBox="0 0 120 80" class="art"><path d="M10 70 A60 60 0 0 1 70 10 A37 37 0 0 1 107 47 A23 23 0 0 1 84 70 A14 14 0 0 1 70 56 A9 9 0 0 1 79 47"/><path d="M10 70H110M70 10V70M70 47H110" class="thin"/></svg>',
  angularity: '<svg viewBox="0 0 120 80" class="art"><path d="M4 76 L38 22 L52 40 L72 8 L116 76 Z"/><path d="M38 22 L46 44 L52 40 M72 8 L66 36 L80 50" class="thin"/></svg>',
  dimorphism: '<svg viewBox="0 0 120 80" class="art"><path d="M30 4 C90 24 30 56 90 76 M90 4 C30 24 90 56 30 76"/><path d="M42 12H78M36 26H84M44 40H76M36 54H84M42 68H78" class="thin"/></svg>',
  features: '<svg viewBox="0 0 120 80" class="art"><path d="M8 40 C30 14 90 14 112 40 C90 66 30 66 8 40 Z"/><circle cx="60" cy="40" r="15"/><circle cx="60" cy="40" r="6" class="fill"/><path d="M20 22 C40 6 80 6 100 22" class="thin"/></svg>',
};

export function mountDashboard(root, app, { scanId, tab, sub }) {
  const scan = scanId ? app.scan(scanId) : null;
  const res = scan ? app.result(scan) : null;
  const collapsed = app.prefs.get('sideCollapsed', false);

  const v = el(`<div class="dash ${collapsed ? 'collapsed' : ''}">
    <aside class="side">
      <div class="side-brand"><a href="#/" class="brand">${icon('logo', 22)} <span>GGFacelon</span></a>
        <button class="icon-btn ghost" id="collapse" title="Collapse sidebar">${icon('sidebar', 19)}</button></div>
      <div class="profile-card">
        <div class="pc-row"><div class="avatar" id="avatar">${icon('user', 18)}</div>
          <div><div class="pc-name">Your profile</div><span class="chip tiny">MALE · ALL FEATURES</span></div></div>
        <button class="btn dark block" id="newScan">${icon('scan', 16)} New scan</button>
      </div>
      <div class="hist-head"><span class="cap">History</span>
        <div><button class="mini-btn" id="hNew">${icon('plus', 13)} New</button><button class="mini-btn" id="hCmp">${icon('compare', 13)} Compare</button></div></div>
      <div class="hist" id="hist"></div>
      <div class="side-foot">
        <div class="cap">Explore</div>
        <a class="side-link" href="#/methodology">${icon('book', 17)} Methodology</a>
        <button class="side-link" id="guide">${icon('camera', 17)} Photo guide</button>
        <button class="side-link" id="calib">${icon('sliders', 17)} Calibration &amp; data</button>
        <button class="side-link" id="wipe">${icon('trash', 17)} Delete all data</button>
      </div>
    </aside>
    <div class="side-scrim"></div>
    <main class="main">
      <header class="topnav">
        <button class="icon-btn ghost only-m" id="menu" title="Show sidebar">${icon('sidebar', 19)}</button>
        <nav class="tabs">${TABS.map((t) => `<a class="tab ${t.id === tab ? 'on' : ''} ${!scan ? 'disabled' : ''}" href="${scan ? `#/scan/${scan.id}/${t.id}` : '#/'}">${t.label}</a>`).join('')}</nav>
        <div class="top-acts">${scan ? `
          <button class="icon-btn" id="share" title="Export report image">${icon('share', 17)}</button>
          <button class="icon-btn" id="edit" title="Edit landmarks">${icon('edit', 17)}</button>
          <button class="icon-btn" id="del" title="Delete this scan">${icon('trash', 17)}</button>` : ''}</div>
      </header>
      <div class="page" id="page"></div>
    </main>
  </div>`);
  root.appendChild(v);

  // sidebar
  $('#collapse', v).onclick = () => {
    const c = !v.classList.contains('collapsed');
    v.classList.toggle('collapsed', c);
    app.prefs.set('sideCollapsed', c);
  };
  // Topbar sidebar button: reopens a collapsed sidebar on desktop, opens the drawer on mobile
  $('#menu', v).onclick = () => {
    if (v.classList.contains('collapsed') && matchMedia('(min-width: 961px)').matches) {
      v.classList.remove('collapsed');
      app.prefs.set('sideCollapsed', false);
    } else v.classList.add('side-open');
  };
  $('.side-scrim', v).onclick = () => v.classList.remove('side-open');
  $('#newScan', v).onclick = $('#hNew', v).onclick = () => app.go('#/new');
  $('#hCmp', v).onclick = () => (app.scans.length ? app.go(`#/scan/${(scan || app.scans[0]).id}/compare`) : toast('Make a scan first'));
  $('#guide', v).onclick = () => photoGuide();
  $('#calib', v).onclick = () => openCalibration(app);
  $('#wipe', v).onclick = async () => {
    if (!app.scans.length) return toast('Nothing to delete');
    if (!(await confirmDialog('Delete all data?', `This permanently removes all ${app.scans.length} scans and photos from this browser. It can’t be undone.`, 'Delete everything', true))) return;
    for (const s of [...app.scans]) await app.remove(s.id);
    app.prefs.set('consent', null);
    app.go('#/');
  };
  renderHistory();

  async function renderHistory() {
    const h = $('#hist', v);
    if (!app.scans.length) { h.innerHTML = '<div class="hist-empty">No scans yet</div>'; return; }
    h.innerHTML = app.scans.map((s) => {
      const r = app.result(s);
      const ps = ['harmony', 'angularity', 'dimorphism', 'features'].map((k) => r.pillars[k].score);
      return `<a class="hist-item ${scan && s.id === scan.id ? 'on' : ''}" href="#/scan/${s.id}/overview">
        <canvas class="hthumb" width="104" height="104" data-id="${s.id}"></canvas>
        <div class="hmid"><div class="hscore" style="color:${scoreColor(r.overall)}">${r.overall.toFixed(2)}</div>
          <div class="hmini">${['H', 'A', 'D', 'F'].map((l, i) => `<span>${l} <b style="color:${scoreColor(ps[i])}">${ps[i].toFixed(1)}</b></span>`).join('')}</div></div>
        <div class="hdate">${s.label ? `<span class="hlabel">${esc(s.label)}</span>` : ''}${relTime(s.created)}</div>
      </a>`;
    }).join('');
    for (const c of $$('canvas.hthumb', h)) {
      const s = app.scan(c.dataset.id);
      faceThumb(app, s, c);
    }
    if (scan) {
      const av = $('#avatar', v);
      const c = el('<canvas width="88" height="88"></canvas>');
      av.innerHTML = '';
      av.appendChild(c);
      faceThumb(app, app.scans[0], c);
    }
  }

  // top actions
  if (scan) {
    $('#share', v).onclick = () => exportCard(app, scan, res);
    $('#edit', v).onclick = () => app.go(`#/edit/${scan.id}`);
    $('#del', v).onclick = async () => {
      if (!(await confirmDialog('Delete this scan?', 'The photos, landmarks and scores for this scan will be permanently removed from this browser.', 'Delete', true))) return;
      await app.remove(scan.id);
      toast('Scan deleted');
      app.go('#/');
    };
  }

  const page = $('#page', v);
  let cleanup = null;
  if (tab === 'empty' || !scan) {
    if (tab === 'methodology') cleanup = mountMethodology(page, app);
    else mountEmpty(page, app);
  } else if (tab === 'overview') cleanup = mountOverview(page, app, scan, res);
  else if (tab === 'analysis') cleanup = mountAnalysis(page, app, scan, res, sub || 'harmony');
  else if (tab === 'plan') cleanup = mountPlan(page, app, scan, res);
  else if (tab === 'simulate') cleanup = mountSimulate(page, app, scan, res);
  else if (tab === 'compare') cleanup = mountCompare(page, app, scan, sub);
  else if (tab === 'methodology') cleanup = mountMethodology(page, app);
  else cleanup = mountOverview(page, app, scan, res);

  return () => cleanup && cleanup();
}

// Thumbnail centred on the face
export async function faceThumb(app, s, canvas) {
  if (!s) return;
  const img = await app.img(s.front.url);
  const b = bbox(s.front.lm);
  const size = Math.max(b.w, b.h) * 1.25;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size, 0, 0, canvas.width, canvas.height);
}

// ───────────────────────── Overview ─────────────────────────
function mountOverview(page, app, scan, res) {
  const P = res.pillars;
  const ov = res.overall;
  const v = el(`<div class="overview">
    <div class="pillar-row">${PILLARS.map((p, i) => `
      <a class="pillar-card fade-up" style="animation-delay:${i * 70}ms" href="#/scan/${scan.id}/analysis/${p.id}">
        <div class="pc-top">${bars(i + 1)}<span class="pc-name">${p.name}</span>${icon('arrowR', 17)}</div>
        <div class="pc-score"><span class="num" data-n="${P[p.id].score}" style="color:${scoreColor(P[p.id].score)}">0.00</span><span class="den">/10</span></div>
        <div class="pc-rate">${rating(P[p.id].score)} ${p.name}</div>
        <div class="pc-art">${PILLAR_ART[p.id]}</div>
      </a>`).join('')}</div>
    <div class="connectors">${PILLARS.map(() => '<i></i>').join('')}</div>
    <section class="card overall fade-up" style="animation-delay:280ms">
      <div class="ov-head">${bars(4)}<h2>Overall Score</h2><span class="muted">4 of 4 pillars</span></div>
      <div class="ov-body">
        <div class="ov-left">
          <div class="ov-score"><span class="num big" id="ovNum" style="color:${scoreColor(ov)}">0.00</span><span class="den">/10</span></div>
          <div class="ov-rate">${rating(ov)}</div>
          <p class="ov-pct">Higher than <b>${res.percentile.toFixed(0)}%</b> of men</p>
          <div class="ov-weights">${PILLARS.map((p) => `<div><span>${p.name}</span><b style="color:${scoreColor(P[p.id].score)}">${P[p.id].score.toFixed(2)}</b></div>`).join('')}</div>
        </div>
        <div class="ov-right">${bellCurve(ov, res.percentile)}</div>
      </div>
      <div class="ov-tabs seg dark" id="ovTabs">${PILLARS.map((p, i) => `<button data-p="${p.id}" class="${i === 0 ? 'on' : ''}">${p.name}</button>`).join('')}</div>
      <div class="ov-pillar" id="ovPillar"></div>
    </section>
    <section class="card quality fade-up" style="animation-delay:360ms">
      <h3>${icon('camera', 17)} Photo & pose check</h3>
      <ul>${res.quality.map((q) => `<li class="${q.level}"><span class="qdot"></span><span class="qv">${q.view === 'front' ? 'Front' : 'Profile'}</span>${esc(q.text)}</li>`).join('')}</ul>
      <p class="fine">All measurements are ratios or angles, so they don’t depend on photo size or distance. Pose problems (head turned, lens too close) still distort them — retake if flagged.</p>
    </section>
  </div>`);
  page.appendChild(v);
  $$('.pc-score .num', v).forEach((n, i) => countUp(n, +n.dataset.n, { delay: 150 + i * 80 }));
  countUp($('#ovNum', v), ov, { delay: 350, ms: 1400 });
  requestAnimationFrame(() => $('.bell', v)?.classList.add('go'));

  const stages = [];
  let pid = 'harmony';
  const renderPillar = async () => {
    stages.splice(0).forEach((s) => s.destroy());
    const box = $('#ovPillar', v);
    const p = PILLARS.find((x) => x.id === pid);
    const sc = res.pillars[pid].score;
    const list = pid === 'harmony'
      ? res.pillars.harmony.items.map((id) => ({ name: METRIC_BY_ID[id].name, score: res.values[id].s, val: fmt(METRIC_BY_ID[id], res.values[id].v) }))
      : res.pillars[pid].items.map((a) => ({ name: a.name, score: a.score, val: '' }));
    const sorted = [...list].sort((a, b) => b.score - a.score);
    const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();
    box.innerHTML = `
      <div class="ovp-bar"><span class="cap">${p.name}</span><div class="meter"><i style="width:${sc * 10}%;background:${scoreColor(sc)}"></i></div><b style="color:${scoreColor(sc)}">${sc.toFixed(2)}</b><span class="den">/10</span></div>
      <div class="ovp-grid">
        <div class="ovp-photo"><div class="stage-host" data-v="front"></div></div>
        <div class="ovp-photo"><div class="stage-host" data-v="side"></div></div>
        <div class="ovp-lists">
          <div><div class="cap good-t">Strengths</div>${best.map(row).join('')}</div>
          <div><div class="cap bad-t">Weakest</div>${worst.map(row).join('')}</div>
          <a class="btn ghost block" href="#/scan/${scan.id}/analysis/${pid}">See all ${pid === 'harmony' ? list.length + ' ratios' : list.length + ' assessments'} ${icon('arrowR', 15)}</a>
        </div>
      </div>`;
    for (const view of ['front', 'side']) {
      const img = await app.img(scan[view].url);
      const host = $(`[data-v="${view}"]`, box);
      if (!host) return;
      const lm = scan[view].lm;
      const st = new Stage(host, img, {
        bg: '#0f1316',
        onDraw: (ctx, s) => {
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, s.w, s.h);
          drawLinks(ctx, s, lm, view, { color: 'rgba(255,255,255,0.45)' });
          drawPoints(ctx, s, lm, { r: 2 });
        },
      });
      const fit = () => { const b = bbox(lm, 0.2); st.setView(st.rectView(b.x0, b.y0, b.x1, b.y1, 0)); };
      st.onResize = fit; fit();
      stages.push(st);
    }
  };
  const row = (r) => `<div class="mini-row"><span>${esc(r.name)}</span>${r.val ? `<span class="chip tiny">${r.val}</span>` : ''}<b style="color:${scoreColor(r.score)}">${r.score.toFixed(2)}</b></div>`;
  $$('#ovTabs button', v).forEach((b) => (b.onclick = () => {
    pid = b.dataset.p;
    $$('#ovTabs button', v).forEach((x) => x.classList.toggle('on', x === b));
    renderPillar();
  }));
  renderPillar();
  return () => stages.forEach((s) => s.destroy());
}

// Bell curve with the user's position
export function bellCurve(score, pct) {
  const W = 520, H = 220, pad = 24;
  const mu = POP.mean, sd = POP.sd;
  const X = (s) => pad + (s / 10) * (W - pad * 2);
  const Y = (s) => H - 30 - Math.exp(-0.5 * ((s - mu) / sd) ** 2) * (H - 60);
  let d = '';
  for (let s = 0; s <= 10.001; s += 0.1) d += `${s === 0 ? 'M' : 'L'}${X(s).toFixed(1)},${Y(s).toFixed(1)}`;
  let area = `M${X(0)},${H - 30}`;
  for (let s = 0; s <= score + 0.001; s += 0.05) area += `L${X(s).toFixed(1)},${Y(s).toFixed(1)}`;
  area += `L${X(score)},${H - 30}Z`;
  const ticks = [0, 2, 4, 6, 8, 10].map((t) => `<text x="${X(t)}" y="${H - 8}" text-anchor="middle">${t}</text>`).join('');
  return `<svg class="bell" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="bellg" x1="0" x2="1"><stop offset="0" stop-color="#e86a5e" stop-opacity=".22"/><stop offset=".5" stop-color="#e8b34a" stop-opacity=".22"/><stop offset="1" stop-color="#36a675" stop-opacity=".3"/></linearGradient></defs>
    <line x1="${pad}" x2="${W - pad}" y1="${H - 30}" y2="${H - 30}" class="axis"/>
    <path d="${area}" class="area" fill="url(#bellg)"/>
    <path d="${d}" class="curve"/>
    <g class="marker" style="--x:${X(score)}px">
      <line x1="${X(score)}" x2="${X(score)}" y1="${Y(score) - 18}" y2="${H - 30}"/>
      <circle cx="${X(score)}" cy="${Y(score)}" r="6"/>
      <g transform="translate(${Math.min(W - 70, Math.max(70, X(score)))},${Math.max(18, Y(score) - 34)})"><rect x="-58" y="-15" width="116" height="28" rx="14"/><text text-anchor="middle" y="4">You · top ${Math.max(1, 100 - pct).toFixed(0)}%</text></g>
    </g>
    ${ticks}
  </svg>`;
}

// Empty state (no scans yet)
function mountEmpty(page, app) {
  const v = el(`<div class="empty fade-up">
    <div class="empty-card card">
      <div class="empty-art">${PILLAR_ART.features}</div>
      <h1 class="serif">Get your facial analysis.</h1>
      <p class="sub">Upload a front and a side photo. AI places ${49 + 21} landmarks, you verify them, and GGFacelon measures 70 facial ratios across Harmony, Angularity, Dimorphism and Features — every result unlocked.</p>
      <div class="empty-acts"><a class="btn dark" href="#/new">${icon('scan', 16)} Start a new scan</a><button class="btn ghost" id="sample">${icon('sparkle', 16)} Try the sample face</button></div>
      <ul class="empty-feats">
        <li>${icon('target', 16)}<span><b>70 measurements</b> — thirds, FWHR, canthal tilt, gonial angle, E‑line and more</span></li>
        <li>${icon('shield', 16)}<span><b>Private</b> — everything runs in your browser</span></li>
        <li>${icon('wand', 16)}<span><b>Plan & Simulate</b> — see what moves your score</span></li>
      </ul>
    </div>
  </div>`);
  page.appendChild(v);
  $('#sample', v).onclick = () => { app.sample = true; app.go('#/new'); };
}

export function photoGuide() {
  import('./dom.js').then(({ modal }) => {
    const m = modal(`<h3 class="m-title">Photo guide</h3>
      <div class="guide-cols">
        <div><div class="cap">Front</div><ul class="tips">
          <li>${icon('check', 14, 2.4)}<span>Camera at eye level, an arm’s length or more away (or 2× zoom) to avoid lens distortion</span></li>
          <li>${icon('check', 14, 2.4)}<span>Neutral face, lips closed, looking straight into the lens</span></li>
          <li>${icon('check', 14, 2.4)}<span>Hair off the forehead and ears, no glasses</span></li>
          <li>${icon('check', 14, 2.4)}<span>Soft, even light from the front</span></li></ul></div>
        <div><div class="cap">Side</div><ul class="tips">
          <li>${icon('check', 14, 2.4)}<span>Turn exactly 90° so only one ear shows</span></li>
          <li>${icon('check', 14, 2.4)}<span>Keep the ear‑to‑under‑eye line level</span></li>
          <li>${icon('check', 14, 2.4)}<span>Neck visible to the collar, hair behind the ear</span></li>
          <li>${icon('check', 14, 2.4)}<span>Plain background so the outline is clear</span></li></ul></div>
      </div>
      <button class="btn dark block" data-x>Close</button>`);
    m.el.querySelector('[data-x]').onclick = () => m.close();
  });
}
