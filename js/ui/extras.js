// Plan, Simulate, Compare, Methodology, and the shareable report image.
import { $, $$, el, esc, icon, toast } from './dom.js';
import { editableStage } from './review.js';
import { analyze, METRICS, METRIC_BY_ID, PILLARS, PILLAR_WEIGHTS, rating, scoreColor, fmt, fmtRange } from '../metrics.js';
import { FRONT, SIDE } from '../landmarks.js';
import { bbox } from './draw.js';
import { faceThumb } from './dashboard.js';

// ───────────────────────── Plan ─────────────────────────
const AREAS = [
  { id: 'jaw', name: 'Jaw', metrics: ['gonial', 'bigonial', 'jfa', 'jaw_slope', 'mpa', 'ramus_mandible', 'gonion_mouth'],
    soft: ['Lower body fat — the jaw angle and lower border show most at a lean body composition.', 'Keep your tongue resting on the roof of the mouth and your head stacked over your shoulders; forward head posture softens the jawline in photos.', 'A short, squared beard line can add visual width and a sharper angle.', 'Chewing training has only modest effects; skip it if you get jaw (TMJ) pain.'],
    hard: ['Jaw filler, implants or orthognathic surgery — talk to a maxillofacial surgeon.'] },
  { id: 'chin', name: 'Chin', metrics: ['chin_philtrum', 'fh_recession', 'mentolabial', 'holdaway', 'z_angle'],
    soft: ['Chin beard growth adds visual height and projection.', 'Fix forward head posture; it makes the chin read as recessed from the side.'],
    hard: ['Chin filler, implant or sliding genioplasty — surgical consult.'] },
  { id: 'eyes', name: 'Eyes', metrics: ['canthal_tilt', 'eye_ar', 'one_eye_apart', 'esr', 'orbital_vector'],
    soft: ['Sleep 7–9 hours and treat allergies to reduce puffiness that hides eye shape.', 'Lower body fat thins the upper‑lid area and sharpens the eye.', 'Grooming the outer brow can change how the eye’s tilt reads.'],
    hard: ['Canthoplasty and lid procedures exist but carry real risk — only with an oculoplastic surgeon.'] },
  { id: 'brows', name: 'Eyebrows', metrics: ['brow_low_set', 'brow_tilt', 'brow_length'],
    soft: ['Clean up stray hairs but keep a full, straight‑ish masculine shape; avoid over‑plucking.', 'Brow gel or a light pencil can fill sparse tails and extend brow length.'],
    hard: ['Brow‑bone augmentation or brow lifts — specialist consultation only.'] },
  { id: 'nose', name: 'Nose', metrics: ['icd_nose', 'bridge_nose', 'nose_tip_pos', 'nasofrontal', 'nasolabial', 'nasal_projection', 'nasal_tip_angle', 'tip_rotation', 'nasofacial', 'nasomental', 'frankfort_tip', 'nasal_wh'],
    soft: ['Avoid close, wide‑angle selfies — they enlarge the nose. Shoot from 1.5 m+ or use 2× zoom.', 'Facial hair and hairstyle shift visual balance away from the nose.'],
    hard: ['Rhinoplasty or non‑surgical (filler) rhinoplasty — board‑certified surgeon.'] },
  { id: 'lips', name: 'Lips & Mouth', metrics: ['lip_ratio', 'cupid_depth', 'mouth_corner', 'mouth_nose', 'ipd_mouth', 'e_upper', 'e_lower', 's_upper', 's_lower', 'b_upper', 'b_lower'],
    soft: ['Keep lips hydrated and relaxed together at rest.', 'A moustache or beard can balance lip projection against the nose and chin.'],
    hard: ['Orthodontics changes lip support; fillers change volume — dentist or injector consult.'] },
  { id: 'cheeks', name: 'Cheeks', metrics: ['cheekbone_height', 'cheek_lean', 'bitemporal'],
    soft: ['Body‑fat reduction reveals cheekbones and hollows under them.', 'Less sodium and alcohol reduces facial water retention.'],
    hard: ['Cheek filler or implants; buccal fat reduction — specialist consult.'] },
  { id: 'forehead', name: 'Forehead & Hairline', metrics: ['top_third', 'browridge_incl', 'upper_forehead'],
    soft: ['A haircut with some fringe or textured front shortens a tall forehead.', 'If the hairline is receding, see a dermatologist early about treatment options.'],
    hard: ['Hair transplant or hairline lowering surgery.'] },
  { id: 'neck', name: 'Neck', metrics: ['neck_width', 'submental'],
    soft: ['Neck training (flexion, extension, shrugs) builds neck width.', 'Lower body fat and good posture sharpen the neck–chin angle.'],
    hard: ['Submental liposuction or fat‑dissolving injections for fat under the chin.'] },
  { id: 'ears', name: 'Ears', metrics: ['ear_angle', 'ear_ratio'],
    soft: ['Hair length over the ears hides protrusion.'],
    hard: ['Otoplasty (ear pinning).'] },
  { id: 'proportions', name: 'Facial Proportions', metrics: ['middle_third', 'lower_third', 'lower_third_prop', 'fwhr', 'total_wh', 'midface_ratio', 'iaa', 'iaa_jfa_dev', 'convexity_g', 'convexity_n', 'total_convexity', 'anterior_depth', 'depth_height', 'midface_proj'],
    soft: ['Hair volume on top lengthens the face; a fringe or wider style shortens it and widens the look.', 'Facial hair adds height and width to the lower third.'],
    hard: ['Orthodontic or orthognathic treatment changes lower‑face proportions — specialist consult.'] },
  { id: 'symmetry', name: 'Symmetry', metrics: ['symmetry', 'nose_tip_pos'],
    soft: ['Retake with your head perfectly straight — small turns exaggerate asymmetry.', 'Chew on both sides and avoid always sleeping on the same side.'],
    hard: ['Mild asymmetry is normal. Large asymmetry is worth a maxillofacial opinion.'] },
];

export function mountPlan(page, app, scan, res) {
  const areas = AREAS.map((a) => {
    const ms = a.metrics.map((id) => ({ m: METRIC_BY_ID[id], ...res.values[id] }));
    const avg = ms.reduce((s, x) => s + x.s, 0) / ms.length;
    return { ...a, ms, avg, weak: ms.filter((x) => x.s < 7).sort((p, q) => p.s - q.s) };
  }).sort((a, b) => a.avg - b.avg);
  const focus = areas.filter((a) => a.weak.length);
  const strong = areas.filter((a) => !a.weak.length);
  const v = el(`<div class="plan">
    <div class="card plan-head fade-up">
      <div><h2>Your improvement plan</h2><p class="sub">Focus areas ranked by how far they sit from the ideal ranges. Lifestyle steps first; professional options are listed for information only.</p></div>
      <div class="plan-stat"><b>${focus.length}</b><span>focus areas</span></div>
    </div>
    ${focus.map((a, i) => `<section class="card plan-card fade-up" style="animation-delay:${i * 60}ms">
      <div class="pl-top"><span class="pl-rank">${i + 1}</span><h3>${a.name}</h3><b class="pl-score" style="color:${scoreColor(a.avg)}">${a.avg.toFixed(2)}</b></div>
      <div class="pl-weak">${a.weak.slice(0, 5).map((x) => `<span class="chip" title="Ideal ${fmtRange(x.m)}">${esc(x.m.name)} · <b style="color:${scoreColor(x.s)}">${fmt(x.m, x.v)}</b></span>`).join('')}</div>
      <div class="pl-cols">
        <div><div class="cap">${icon('sparkle', 13)} Lifestyle & grooming</div><ul>${a.soft.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
        <div><div class="cap">${icon('info', 13)} Professional options</div><ul class="muted">${a.hard.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      </div>
    </section>`).join('')}
    ${strong.length ? `<section class="card fade-up"><h3>Already strong</h3><div class="pl-weak">${strong.map((a) => `<span class="chip">${a.name} · <b style="color:${scoreColor(a.avg)}">${a.avg.toFixed(2)}</b></span>`).join('')}</div></section>` : ''}
    <p class="fine center">Not medical advice. Bone structure can’t be changed by exercises; talk to a qualified professional before any procedure.</p>
  </div>`);
  page.appendChild(v);
}

// ───────────────────────── Simulate ─────────────────────────
export function mountSimulate(page, app, scan, res) {
  const sim = { front: { ...scan.front.lm }, side: { ...scan.side.lm } };
  const meta = { frontSize: { w: scan.front.w, h: scan.front.h }, sideSize: { w: scan.side.w, h: scan.side.h } };
  const v = el(`<div class="simulate">
    <div class="card sim-head fade-up"><div><h2>Simulate</h2><p class="sub">Drag any landmark to see how a change would move your scores. Your saved scan isn’t modified.</p></div>
      <button class="btn ghost" id="simReset">${icon('undo', 15)} Reset</button></div>
    <div class="sim-grid">
      <div class="sim-stages">
        <div class="review-card"><div class="stage-host" data-v="front"></div><div class="rc-tag">Front</div></div>
        <div class="review-card"><div class="stage-host" data-v="side"></div><div class="rc-tag">Profile</div></div>
      </div>
      <div class="card sim-panel">
        <div class="cap">Overall</div>
        <div class="sim-ov"><span id="simOv">${res.overall.toFixed(2)}</span><span class="delta" id="simOvD"></span></div>
        <div id="simPillars"></div>
        <div class="cap" style="margin-top:18px">Biggest changes</div>
        <div id="simChanges" class="sim-changes"><p class="fine">Move a point to see changes.</p></div>
      </div>
    </div>
  </div>`);
  page.appendChild(v);
  const eds = [];
  let alive = true, pending = 0;
  (async () => {
    for (const view of ['front', 'side']) {
      const img = await app.img(scan[view].url);
      if (!alive) return;
      eds.push(editableStage($(`[data-v="${view}"]`, v), img, () => sim[view], (lm) => { sim[view] = lm; }, view, { onChange: schedule }));
    }
  })();
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; recompute(); });
  }
  const dl = (x) => (Math.abs(x) < 0.005 ? '' : `<span class="delta ${x > 0 ? 'up' : 'down'}">${x > 0 ? '+' : ''}${x.toFixed(2)}</span>`);
  function recompute() {
    const r = analyze(sim.front, sim.side, meta);
    $('#simOv', v).textContent = r.overall.toFixed(2);
    $('#simOv', v).style.color = scoreColor(r.overall);
    $('#simOvD', v).outerHTML = `<span id="simOvD">${dl(r.overall - res.overall)}</span>`;
    $('#simPillars', v).innerHTML = PILLARS.map((p) => `<div class="sim-p"><span>${p.name}</span><b style="color:${scoreColor(r.pillars[p.id].score)}">${r.pillars[p.id].score.toFixed(2)}</b>${dl(r.pillars[p.id].score - res.pillars[p.id].score)}</div>`).join('');
    const ch = METRICS.map((m) => ({ m, a: res.values[m.id], b: r.values[m.id], d: r.values[m.id].s - res.values[m.id].s }))
      .filter((x) => Math.abs(x.d) > 0.01 || Math.abs(x.b.v - x.a.v) > 1e-6)
      .sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 12);
    $('#simChanges', v).innerHTML = ch.length ? ch.map((x) => `<div class="sim-c"><div><b>${esc(x.m.name)}</b><span>${fmt(x.m, x.a.v)} → ${fmt(x.m, x.b.v)}</span></div>${dl(x.d) || '<span class="delta">0.00</span>'}</div>`).join('') : '<p class="fine">No change yet.</p>';
  }
  recompute();
  $('#simReset', v).onclick = () => {
    sim.front = { ...scan.front.lm }; sim.side = { ...scan.side.lm };
    eds.forEach((e) => e.st.render());
    recompute();
  };
  return () => { alive = false; eds.forEach((e) => e.destroy()); };
}

// ───────────────────────── Compare ─────────────────────────
export function mountCompare(page, app, scan, otherId) {
  if (app.scans.length < 2) {
    page.appendChild(el(`<div class="card empty-small fade-up"><h2>Compare scans</h2><p class="sub">You need at least two scans to compare. Take another scan — for example after a haircut, weight change or with better lighting — and see what moved.</p><a class="btn dark" href="#/new">${icon('scan', 16)} New scan</a></div>`));
    return;
  }
  let A = app.scans.find((s) => s.id === otherId && s.id !== scan.id) || app.scans.find((s) => s.id !== scan.id);
  let B = scan;
  const opt = (sel) => app.scans.map((s) => `<option value="${s.id}" ${s.id === sel.id ? 'selected' : ''}>${new Date(s.created).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${app.result(s).overall.toFixed(2)}</option>`).join('');
  const v = el(`<div class="compare">
    <div class="card cmp-head fade-up">
      <div class="cmp-side"><canvas width="160" height="160" id="cA"></canvas><select class="select" id="sA">${opt(A)}</select></div>
      <div class="cmp-vs">vs</div>
      <div class="cmp-side"><canvas width="160" height="160" id="cB"></canvas><select class="select" id="sB">${opt(B)}</select></div>
    </div>
    <div class="card fade-up" id="cmpBody"></div>
  </div>`);
  page.appendChild(v);
  const render = () => {
    const ra = app.result(A), rb = app.result(B);
    faceThumb(app, A, $('#cA', v)); faceThumb(app, B, $('#cB', v));
    const d = (x) => `<span class="delta ${x > 0.005 ? 'up' : x < -0.005 ? 'down' : ''}">${x > 0 ? '+' : ''}${x.toFixed(2)}</span>`;
    const rows = METRICS.map((m) => ({ m, a: ra.values[m.id], b: rb.values[m.id] })).sort((p, q) => Math.abs(q.b.s - q.a.s) - Math.abs(p.b.s - p.a.s));
    $('#cmpBody', v).innerHTML = `
      <div class="cmp-pillars">
        <div class="cmp-p"><span>Overall</span><b>${ra.overall.toFixed(2)} → ${rb.overall.toFixed(2)}</b>${d(rb.overall - ra.overall)}</div>
        ${PILLARS.map((p) => `<div class="cmp-p"><span>${p.name}</span><b>${ra.pillars[p.id].score.toFixed(2)} → ${rb.pillars[p.id].score.toFixed(2)}</b>${d(rb.pillars[p.id].score - ra.pillars[p.id].score)}</div>`).join('')}
      </div>
      <table class="tbl"><thead><tr><th>Measurement</th><th>View</th><th>A</th><th>B</th><th>Score Δ</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.m.name)}</td><td class="muted">${r.m.view === 'front' ? 'Front' : 'Side'}</td><td>${fmt(r.m, r.a.v)}</td><td>${fmt(r.m, r.b.v)}</td><td>${d(r.b.s - r.a.s)}</td></tr>`).join('')}
      </tbody></table>`;
  };
  $('#sA', v).onchange = (e) => { A = app.scan(e.target.value); render(); };
  $('#sB', v).onchange = (e) => { B = app.scan(e.target.value); render(); };
  render();
}

// ───────────────────────── Methodology ─────────────────────────
export function mountMethodology(page) {
  const mt = (view) => METRICS.filter((m) => m.view === view).map((m) => `<tr><td><b>${esc(m.name)}</b>${m.extra ? ' <span class="chip tiny ghost">extra</span>' : ''}${!m.hm ? ' <span class="chip tiny ghost">angularity only</span>' : ''}<div class="muted">${esc(m.desc)}</div></td><td class="mono">${esc(m.how)}</td><td class="nowrap">${fmtRange(m)}</td><td class="nowrap">${fmt(m, m.mean)}</td><td>${m.w}</td></tr>`).join('');
  const lt = (defs) => defs.map((d, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(d.name)}</b></td><td class="muted">${esc(d.anat)}</td><td>${esc(d.how)}</td></tr>`).join('');
  const v = el(`<div class="method">
    <section class="card fade-up"><h2>Methodology</h2>
      <p>GGFacelon measures ${METRICS.length} facial ratios and angles from ${FRONT.length} front and ${SIDE.length} profile landmarks. Landmarks start from two AI models: a 478‑point face mesh (MediaPipe Face Landmarker) for the front, and a person segmenter (MediaPipe selfie‑multiclass: hair, face skin, body skin, clothes, background) that finds the hairline, ears, neck and the profile outline regardless of background colour. The profile tracer works for faces pointing left or right, picks the nose as the sharpest bump on the outline, and uses your front photo's proportions to place the lips, chin and brow. You then verify each point.</p>
      <h3>Why results are consistent</h3>
      <ul class="dots">
        <li>Every measurement is a ratio or an angle, so photo resolution and how big your face is in the frame don’t change it. Points are stored in the photo’s own pixel space.</li>
        <li>Front: all points are rotated so the pupils are level, which removes head roll.</li>
        <li>Profile: points are mirrored to face right and rotated onto the Frankfort horizontal (ear canal → under‑eye rim), so head tilt doesn’t change the angles.</li>
        <li>Scores are a fixed function of the landmarks. The same points always give the same result.</li>
        <li>The pose check warns when the face is small in the frame, low resolution, or turned, since these do distort ratios.</li>
      </ul>
      <h3>Scoring</h3>
      <p>Each measurement has a male ideal and a typical spread (how much adult men vary). Its score is the distance from the ideal in units of that spread: within ±0.2 spreads it scores 10, a typical man scores about 5–6, and it falls smoothly towards 0 (score = 10 × (1 + z²/2.17)^−2, z = distance in spreads − 0.2). Harmony weighs the ${METRICS.filter((m) => m.hm).length} ratios by importance (core proportions ×3, minor ones ×0.6) and counts the weakest third extra, so one clear flaw costs more than one strength gains. Angularity, Dimorphism and Features take a weighted average of their assessments: eye‑tracking studies show the central triangle (eyes, nose, mouth) draws most attention during attractiveness judgments, and studies of male faces find jaw and brow prominence outweigh cheekbones and eye size, so those regions carry the largest shares (each assessment shows its share). Overall = ${Object.entries(PILLAR_WEIGHTS).map(([k, w]) => `${Math.round(w * 100)}% ${k[0].toUpperCase() + k.slice(1)}`).join(' + ')}.</p>
      <p>Pillars and Overall are then placed on a population scale matched to FaceIQ’s published examples (7.03 ≈ top 5%, 7.77 ≈ top 0.8%): mean 5.44, SD 0.97. The mapping comes from simulating 20,000 men from the population norms including landmark‑placement noise (<span class="mono">tools/calibrate.mjs</span>). You can fine‑tune it with known scores under <b>Calibration</b>.</p>
      <p class="fine">Ranges come from published facial‑aesthetics norms (Ricketts E‑line, Steiner S‑line, Burstone B‑line, Holdaway H‑angle, Merrifield Z‑angle, Goode ratio, Legan convexity) and commonly cited male ideal ranges for the rest. They describe statistical ideals, not a person’s worth. Skin is not assessed.</p>
    </section>
    <section class="card fade-up"><h2>Front measurements</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Measurement</th><th>Formula</th><th>Ideal (≥8.5)</th><th>Typical man</th><th>Weight</th></tr></thead><tbody>${mt('front')}</tbody></table></div></section>
    <section class="card fade-up"><h2>Side measurements</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Measurement</th><th>Formula</th><th>Ideal (≥8.5)</th><th>Typical man</th><th>Weight</th></tr></thead><tbody>${mt('side')}</tbody></table></div></section>
    <section class="card fade-up"><h2>Landmarks</h2>
      <h3>Front (${FRONT.length})</h3><div class="tbl-wrap"><table class="tbl"><tbody>${lt(FRONT)}</tbody></table></div>
      <h3>Profile (${SIDE.length})</h3><div class="tbl-wrap"><table class="tbl"><tbody>${lt(SIDE)}</tbody></table></div></section>
  </div>`);
  page.appendChild(v);
}

// ───────────────────────── Report image ─────────────────────────
export async function exportCard(app, scan, res) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f7f9'; ctx.fillRect(0, 0, W, H);
  const font = (w, s, f = 'Inter, system-ui, sans-serif') => `${w} ${s}px ${f}`;
  ctx.fillStyle = '#111827'; ctx.font = font(700, 34); ctx.fillText('GGFacelon', 70, 92);
  ctx.fillStyle = '#6b7280'; ctx.font = font(500, 24); ctx.textAlign = 'right';
  ctx.fillText(new Date(scan.created).toLocaleDateString([], { dateStyle: 'long' }), W - 70, 92);
  ctx.textAlign = 'left';
  // photos
  const ph = async (view, x) => {
    const img = await app.img(scan[view].url);
    const b = bbox(scan[view].lm, 0.15);
    const sz = Math.max(b.x1 - b.x0, (b.y1 - b.y0) * 0.86);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    ctx.save();
    rr(ctx, x, 140, 455, 530, 32); ctx.clip();
    ctx.drawImage(img, cx - sz / 2, cy - (sz * 530) / 455 / 2, sz, (sz * 530) / 455, x, 140, 455, 530);
    ctx.restore();
  };
  await ph('front', 70); await ph('side', 555);
  // score
  const col = (s) => (s >= 7.5 ? '#2f9e6e' : s >= 6 ? '#8aa83a' : s >= 4.5 ? '#d9962b' : '#d4574e');
  ctx.fillStyle = '#fff'; rr(ctx, 70, 710, 940, 300, 32); ctx.fill();
  ctx.fillStyle = '#6b7280'; ctx.font = font(600, 24); ctx.fillText('OVERALL SCORE', 120, 775);
  ctx.fillStyle = col(res.overall); ctx.font = font(700, 128); ctx.fillText(res.overall.toFixed(2), 112, 905);
  const sw = ctx.measureText(res.overall.toFixed(2)).width;
  ctx.fillStyle = '#9ca3af'; ctx.font = font(500, 44); ctx.fillText('/10', 122 + sw, 905);
  ctx.fillStyle = '#111827'; ctx.font = font(600, 30); ctx.fillText(rating(res.overall), 120, 960);
  ctx.fillStyle = '#6b7280'; ctx.font = font(500, 24); ctx.fillText(`Higher than ${res.percentile.toFixed(0)}% of men`, 120, 995);
  PILLARS.forEach((p, i) => {
    const y = 770 + i * 58;
    const s = res.pillars[p.id].score;
    ctx.fillStyle = '#374151'; ctx.font = font(600, 24); ctx.fillText(p.name, 600, y + 8);
    ctx.fillStyle = '#eef0f3'; rr(ctx, 600, y + 20, 290, 10, 5); ctx.fill();
    ctx.fillStyle = col(s); rr(ctx, 600, y + 20, 29 * s, 10, 5); ctx.fill();
    ctx.fillStyle = col(s); ctx.font = font(700, 26); ctx.textAlign = 'right'; ctx.fillText(s.toFixed(2), 1000, y + 30); ctx.textAlign = 'left';
  });
  // highlights
  const top = METRICS.filter((m) => m.hm).map((m) => ({ m, ...res.values[m.id] })).sort((a, b) => b.s - a.s).slice(0, 4);
  ctx.fillStyle = '#fff'; rr(ctx, 70, 1040, 940, 230, 32); ctx.fill();
  ctx.fillStyle = '#6b7280'; ctx.font = font(600, 22); ctx.fillText('TOP RATIOS', 120, 1095);
  top.forEach((t, i) => {
    const x = 120 + (i % 2) * 450, y = 1150 + Math.floor(i / 2) * 64;
    ctx.fillStyle = '#111827'; ctx.font = font(600, 26); ctx.fillText(t.m.name.length > 24 ? t.m.name.slice(0, 23) + '…' : t.m.name, x, y);
    ctx.fillStyle = col(t.s); ctx.font = font(500, 22); ctx.fillText(`${fmt(t.m, t.v)} · ${t.s.toFixed(2)}`, x, y + 30);
  });
  ctx.fillStyle = '#9ca3af'; ctx.font = font(500, 20); ctx.textAlign = 'center';
  ctx.fillText('70 landmark ratios · analysed on‑device', W / 2, 1315);
  const a = document.createElement('a');
  a.download = `ggfacelon-${new Date(scan.created).toISOString().slice(0, 10)}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
  toast('Report image saved');
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
