// Compare two scans: headline change, pillar and profile deltas, then a large side-by-side viewer that draws the
// selected measurement on both photos (in each one's score colour), and the full list of what moved.
import { $, $$, el, esc, icon, countUp } from './dom.js';
import { METRICS, METRIC_BY_ID, PILLARS, scoreHex, ratioHex, fmt, fmtRange, rating, pctText } from '../metrics.js';
import { faceThumb } from './dashboard.js';
import { photoPanel, openMetricDetail } from './detail.js';

const when = (s) => new Date(s.created).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const signed = (x, dp = 2) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(dp);
const dcls = (x, eps = 0.005) => (x > eps ? 'up' : x < -eps ? 'down' : 'flat');

export function mountCompare(page, app, scan, otherId) {
  if (app.scans.length < 2) {
    page.appendChild(el(`<div class="card empty-small fade-up"><h2>Compare scans</h2><p class="sub">You need at least two scans to compare. Take another scan — for example after a haircut, weight change or with better lighting — and see what moved.</p><a class="btn dark" href="#/new">${icon('scan', 16)} New scan</a></div>`));
    return;
  }
  let A = app.scans.find((s) => s.id === otherId && s.id !== scan.id) || app.scans.find((s) => s.id !== scan.id);
  let B = scan;
  let sel = null, filter = 'all', panels = [];
  const opt = (cur) => app.scans.map((s) => `<option value="${s.id}" ${s.id === cur.id ? 'selected' : ''}>${esc(s.label || when(s))} · ${app.result(s).overall.toFixed(2)}</option>`).join('');

  const v = el(`<div class="cmp2">
    <section class="card cmp-hero fade-up">
      <div class="cmp-pick" data-s="A"><canvas width="200" height="200"></canvas><div><span class="cap">Before</span><select class="select"></select><b class="num big" data-o></b><em data-r></em></div></div>
      <div class="cmp-mid"><span class="cap">Overall change</span><b class="cmp-delta" id="cmpD"></b><span class="muted" id="cmpDp"></span></div>
      <div class="cmp-pick" data-s="B"><canvas width="200" height="200"></canvas><div><span class="cap">After</span><select class="select"></select><b class="num big" data-o></b><em data-r></em></div></div>
    </section>
    <section class="cmp-cards fade-up" id="cmpCards"></section>
    <section class="card cmp-viewer fade-up">
      <div class="cv-head"><div><span class="cap">Measurement</span><h3 id="cvName">—</h3></div>
        <div class="cv-acts"><button class="pill soft" id="cvMore">${icon('info', 14)} Details</button></div></div>
      <div class="cv-stages">
        <div class="cv-stage"><div class="stage-host" data-p="0"></div><div class="cv-foot" data-f="0"></div></div>
        <div class="cv-stage"><div class="stage-host" data-p="1"></div><div class="cv-foot" data-f="1"></div></div>
      </div>
    </section>
    <section class="card cmp-list fade-up">
      <div class="cl-head"><h3>What changed</h3>
        <div class="seg sm" id="clSeg"><button data-f="all" class="on">All</button><button data-f="front">Front</button><button data-f="side">Side</button><button data-f="look">Photo</button></div></div>
      <div class="cl-rows" id="clRows"></div>
    </section>
  </div>`);
  page.appendChild(v);

  const render = () => {
    const ra = app.result(A), rb = app.result(B);
    // hero
    for (const [k, s, r] of [['A', A, ra], ['B', B, rb]]) {
      const box = $(`.cmp-pick[data-s="${k}"]`, v);
      $('select', box).innerHTML = opt(s);
      faceThumb(app, s, $('canvas', box));
      const n = $('[data-o]', box);
      n.style.color = scoreHex(r.overall);
      countUp(n, r.overall, { delay: 80 });
      $('[data-r]', box).textContent = `${rating(r.overall)} · ${when(s)}`;
    }
    const dO = rb.overall - ra.overall;
    const dEl = $('#cmpD', v);
    dEl.className = 'cmp-delta ' + dcls(dO);
    dEl.textContent = signed(dO);
    $('#cmpDp', v).textContent = `higher than ${pctText(ra.percentile)}% → ${pctText(rb.percentile)}% of men`;
    // pillar / profile cards: two bars and the change
    const cards = [
      ['Front profile', ra.views?.front?.score, rb.views?.front?.score],
      ['Side profile', ra.views?.side?.score, rb.views?.side?.score],
      ...PILLARS.map((p) => [p.name, ra.pillars[p.id].score, rb.pillars[p.id].score]),
    ];
    $('#cmpCards', v).innerHTML = cards.map(([name, a, b]) => {
      const d = b - a;
      return `<div class="cc"><div class="cc-top"><span>${name}</span><b class="cmp-chip ${dcls(d)}">${Number.isFinite(d) ? signed(d) : '—'}</b></div>
        <div class="cc-bars"><div><i style="width:${(a || 0) * 10}%;background:${scoreHex(a)};opacity:.45"></i><em>${Number.isFinite(a) ? a.toFixed(2) : '—'}</em></div>
        <div><i style="width:${(b || 0) * 10}%;background:${scoreHex(b)}"></i><em>${Number.isFinite(b) ? b.toFixed(2) : '—'}</em></div></div></div>`;
    }).join('');
    // list
    const rows = METRICS.filter((m) => m.hm || m.look).map((m) => ({ m, a: ra.values[m.id], b: rb.values[m.id] }))
      .filter((r) => Number.isFinite(r.a.v) || Number.isFinite(r.b.v))
      .filter((r) => filter === 'all' || (filter === 'look' ? r.m.look : r.m.view === filter && !r.m.look))
      .map((r) => ({ ...r, d: (Number.isFinite(r.b.v) ? r.b.s : 0) - (Number.isFinite(r.a.v) ? r.a.s : 0) }))
      .sort((p, q) => Math.abs(q.d) * q.m.w - Math.abs(p.d) * p.m.w);
    $('#clRows', v).innerHTML = rows.map((r) => `<button class="cl-row ${sel === r.m.id ? 'on' : ''}" data-id="${r.m.id}">
      <span class="cl-n"><b>${esc(r.m.name)}</b><em>${r.m.view === 'front' ? 'Front' : 'Side'}${r.m.look ? ' · photo' : ''} · ideal ${fmtRange(r.m, r.b)}</em></span>
      <span class="cl-v"><i style="color:${ratioHex(r.a.s)}">${fmt(r.m, r.a.v)}</i>${icon('arrowR', 13)}<i style="color:${ratioHex(r.b.s)}">${fmt(r.m, r.b.v)}</i></span>
      <span class="cl-s"><span class="cl-bar"><i style="width:${(Number.isFinite(r.a.v) ? r.a.s : 0) * 10}%;background:${ratioHex(r.a.s)}"></i></span><span class="cl-bar"><i style="width:${(Number.isFinite(r.b.v) ? r.b.s : 0) * 10}%;background:${ratioHex(r.b.s)}"></i></span></span>
      <b class="cmp-chip ${dcls(r.d, 0.05)}">${signed(r.d, 1)}</b></button>`).join('') || '<p class="fine">Nothing to compare in this group.</p>';
    $$('.cl-row', v).forEach((b) => {
      b.onmouseenter = () => select(b.dataset.id);
      b.onclick = () => select(b.dataset.id);
    });
    // viewer panels
    panels.forEach((p) => p.destroy());
    panels = [A, B].map((s, i) => {
      const host = $(`[data-p="${i}"]`, v);
      host.innerHTML = '';
      return photoPanel(host, app, s, app.result(s));
    });
    const first = sel && rows.some((r) => r.m.id === sel) ? sel : rows[0]?.m.id;
    sel = null;
    if (first) select(first);
  };

  function select(id) {
    if (sel === id) return;
    sel = id;
    const m = METRIC_BY_ID[id];
    $('#cvName', v).textContent = m.name;
    $$('.cl-row', v).forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    [A, B].forEach((s, i) => {
      const r = app.result(s).values[id];
      const ok = Number.isFinite(r.v);
      $(`[data-f="${i}"]`, v).innerHTML = `<span class="cap">${i ? 'After' : 'Before'} · ${esc(s.label || when(s))}</span>
        <span class="cv-val"><b style="color:${ok ? ratioHex(r.s) : 'var(--faint)'}">${fmt(m, r.v)}</b><em>${ok ? r.s.toFixed(1) + '/10' : 'not measured'}</em></span>`;
      panels[i].show(m);
    });
  }
  $('#cvMore', v).onclick = () => {
    if (!sel) return;
    const ids = $$('.cl-row', v).map((b) => b.dataset.id);
    openMetricDetail(app, B, app.result(B), ids, ids.indexOf(sel));
  };
  $('.cmp-pick[data-s="A"] select', v).onchange = (e) => { A = app.scan(e.target.value); render(); };
  $('.cmp-pick[data-s="B"] select', v).onchange = (e) => { B = app.scan(e.target.value); render(); };
  $$('#clSeg button', v).forEach((b) => (b.onclick = () => {
    filter = b.dataset.f;
    $$('#clSeg button', v).forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  render();
  return () => panels.forEach((p) => p.destroy());
}
