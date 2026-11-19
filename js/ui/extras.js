// Plan, Simulate, Compare, Methodology, and the shareable report image.
import { $, $$, el, esc, icon, toast } from './dom.js';
import { editableStage } from './review.js';
import { analyze, METRICS, METRIC_BY_ID, PILLARS, PILLAR_WEIGHTS, rating, scoreColor, ratioColor, fmt, fmtRange, pctText } from '../metrics.js';
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
  { id: 'eyes', name: 'Eyes', metrics: ['canthal_tilt', 'eye_ar', 'one_eye_apart', 'esr', 'orbital_vector', 'iris_exposure', 'scleral_show', 'brow_eye_gap'],
    soft: ['Sleep 7–9 hours and treat allergies to reduce puffiness that hides eye shape.', 'Lower body fat thins the upper‑lid area and sharpens the eye.', 'Grooming the outer brow can change how the eye’s tilt reads.'],
    hard: ['Canthoplasty and lid procedures exist but carry real risk — only with an oculoplastic surgeon.'] },
  { id: 'brows', name: 'Eyebrows', metrics: ['brow_low_set', 'brow_tilt', 'brow_length', 'brow_thickness', 'brow_density', 'brow_tail_reach'],
    soft: ['Clean up stray hairs but keep a full, straight‑ish masculine shape; avoid over‑plucking — thickness is easy to lose and slow to regrow.', 'Brow gel or a light pencil can fill sparse areas and extend a short tail past the outer eye corner.', 'Light or sparse brows: a brow tint one shade darker than your hair is the quickest, most reversible fix.', 'Let the brows grow out for 6–8 weeks before reshaping; topical treatments for sparse brows exist — ask a dermatologist.'],
    hard: ['Brow‑bone augmentation or brow lifts — specialist consultation only.'] },
  { id: 'nose', name: 'Nose', metrics: ['icd_nose', 'bridge_nose', 'nose_tip_pos', 'nasofrontal', 'nasolabial', 'nasal_projection', 'nasal_tip_angle', 'tip_rotation', 'nasofacial', 'nasomental', 'frankfort_tip', 'nasal_wh'],
    soft: ['Avoid close, wide‑angle selfies — they enlarge the nose. Shoot from 1.5 m+ or use 2× zoom.', 'Facial hair and hairstyle shift visual balance away from the nose.'],
    hard: ['Rhinoplasty or non‑surgical (filler) rhinoplasty — board‑certified surgeon.'] },
  { id: 'lips', name: 'Lips & Mouth', metrics: ['lip_ratio', 'lip_fullness', 'cupid_depth', 'mouth_corner', 'mouth_nose', 'ipd_mouth', 'e_upper', 'e_lower', 's_upper', 's_lower', 'b_upper', 'b_lower'],
    soft: ['Keep lips hydrated and relaxed together at rest.', 'A moustache or beard can balance lip projection against the nose and chin.'],
    hard: ['Orthodontics changes lip support; fillers change volume — dentist or injector consult.'] },
  { id: 'cheeks', name: 'Cheeks', metrics: ['cheekbone_height', 'cheek_lean', 'bitemporal'],
    soft: ['Body‑fat reduction reveals cheekbones and hollows under them.', 'Less sodium and alcohol reduces facial water retention.'],
    hard: ['Cheek filler or implants; buccal fat reduction — specialist consult.'] },
  { id: 'forehead', name: 'Forehead & Hairline', metrics: ['top_third', 'browridge_incl', 'upper_forehead', 'temple_recession'],
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
  { id: 'symmetry', name: 'Symmetry', metrics: ['symmetry', 'iaa_jfa_dev'],
    soft: ['Retake with your head perfectly straight — small turns exaggerate asymmetry.', 'Chew on both sides and avoid always sleeping on the same side.'],
    hard: ['Mild asymmetry is normal. Large asymmetry is worth a maxillofacial opinion.'] },
];

export function mountPlan(page, app, scan, res) {
  const areas = AREAS.map((a) => {
    // only what could be measured on these photos
    const ms = a.metrics.map((id) => ({ m: METRIC_BY_ID[id], ...res.values[id] })).filter((x) => Number.isFinite(x.v));
    const avg = ms.reduce((s, x) => s + x.s, 0) / (ms.length || 1);
    return { ...a, ms, avg, weak: ms.filter((x) => x.s < 7).sort((p, q) => p.s - q.s) };
  }).filter((a) => a.ms.length).sort((a, b) => a.avg - b.avg);
  const focus = areas.filter((a) => a.weak.length);
  const strong = areas.filter((a) => !a.weak.length);
  const v = el(`<div class="plan">
    <div class="card plan-head fade-up">
      <div><h2>Your improvement plan</h2><p class="sub">Focus areas ranked by how far they sit from the ideal ranges. Lifestyle steps first; professional options are listed for information only.</p></div>
      <div class="plan-stat"><b>${focus.length}</b><span>focus areas</span></div>
    </div>
    ${focus.map((a, i) => `<section class="card plan-card fade-up" style="animation-delay:${i * 60}ms">
      <div class="pl-top"><span class="pl-rank">${i + 1}</span><h3>${a.name}</h3><b class="pl-score" style="color:${ratioColor(a.avg)}">${a.avg.toFixed(2)}</b></div>
      <div class="pl-weak">${a.weak.slice(0, 5).map((x) => `<span class="chip" title="Ideal ${fmtRange(x.m, x)}">${esc(x.m.name)} · <b style="color:${ratioColor(x.s)}">${fmt(x.m, x.v)}</b></span>`).join('')}</div>
      <div class="pl-cols">
        <div><div class="cap">${icon('sparkle', 13)} Lifestyle & grooming</div><ul>${a.soft.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
        <div><div class="cap">${icon('info', 13)} Professional options</div><ul class="muted">${a.hard.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      </div>
    </section>`).join('')}
    ${strong.length ? `<section class="card fade-up"><h3>Already strong</h3><div class="pl-weak">${strong.map((a) => `<span class="chip">${a.name} · <b style="color:${ratioColor(a.avg)}">${a.avg.toFixed(2)}</b></span>`).join('')}</div></section>` : ''}
    <p class="fine center">Not medical advice. Bone structure can’t be changed by exercises; talk to a qualified professional before any procedure.</p>
  </div>`);
  page.appendChild(v);
}

// ───────────────────────── Simulate ─────────────────────────
export function mountSimulate(page, app, scan, res) {
  const sim = { front: { ...scan.front.lm }, side: { ...scan.side.lm } };
  // photo measurements stay as measured (moving a landmark here only changes geometry)
  const meta = { frontSize: { w: scan.front.w, h: scan.front.h }, sideSize: { w: scan.side.w, h: scan.side.h }, appearance: scan.look || null };
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
// Compare lives in compare.js
export { mountCompare } from './compare.js';

// ───────────────────────── Methodology ─────────────────────────
export function mountMethodology(page) {
  const mt = (view) => METRICS.filter((m) => m.view === view).map((m) => `<tr><td><b>${esc(m.name)}</b>${m.look ? ' <span class="chip tiny ghost">from photo</span>' : m.extra ? ' <span class="chip tiny ghost">extra</span>' : ''}<div class="muted">${esc(m.desc)}</div></td><td class="mono">${esc(m.how)}</td><td class="nowrap">${fmtRange(m)}</td><td class="nowrap">${fmt(m, m.mean)}</td><td>${m.w}</td></tr>`).join('');
  const lt = (defs) => defs.map((d, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(d.name)}</b></td><td class="muted">${esc(d.anat)}</td><td>${esc(d.how)}</td></tr>`).join('');
  const v = el(`<div class="method">
    <section class="card fade-up"><h2>Methodology</h2>
      <p>GGFacelon measures ${METRICS.filter((m) => m.hm).length} Harmony ratios (33 front, 33 side) plus symmetry and jaw taper from ${FRONT.length} front and ${SIDE.length} profile landmarks, following FaceIQ Labs’ published formulas and landmark conventions. It also reads ${METRICS.filter((m) => m.look).length} things straight from the photo’s pixels that angles can’t capture: eyebrow thickness, darkness and tail length, the gap between brow and eyelid, how open the eyes are against the iris, white under the iris, lip fullness and temple recession. Landmarks start from two AI models: a 478‑point face mesh (MediaPipe Face Landmarker) and a person segmenter (hair, face skin, body skin, clothes, background). Front points come from the mesh. Profiles are read from the traced silhouette — nose tip, nose base, both lips, the lip–chin fold and the chin are its peaks and dips — or, for three‑quarter photos, from the mesh’s midline. Sideways or upside‑down photos are turned upright, and tilted ones are levelled. You then verify each point.</p>
      <h3>Why results are consistent</h3>
      <ul class="dots">
        <li>Every measurement is a ratio, an angle, or millimetres on a fixed 190 mm hairline‑to‑chin scale (as FaceIQ uses), so photo resolution and how big your face is in the frame don’t change it.</li>
        <li>Front: points are rotated so the pupils are level. Profile: points are mirrored to face right and levelled to the Frankfort plane (ear canal → under‑eye rim).</li>
        <li>Scores are a fixed function of the landmarks. The same points always give the same result.</li>
        <li>The pose check warns when the face is small in the frame, low resolution, or turned — and when hair hides forehead points in the profile, those angles are left out instead of guessed.</li>
      </ul>
      <h3>Scoring</h3>
      <p>Each ratio scores <b>10 inside its ideal range</b> and falls off outside it as 10·exp(−(d/s)²), where d is the distance outside the range and s is how forgiving that ratio is — both fitted to FaceIQ’s own published scores. FaceIQ adjusts its ranges for ethnicity; GGFacelon doesn’t ask, so it scores your face against each of FaceIQ’s six range sets and uses the one your face fits unusually well (each set’s average result is subtracted first, so the most lenient set doesn’t win by default).</p>
      <p>Measured against FaceIQ’s own numbers on 119 analysed men (55 of them rated 7 or higher), some ratios came out consistently offset — FaceIQ places a few points (brow level, the ear canal, nostril base, profile eye corner) slightly differently. Those offsets are removed before scoring. Each ratio’s weight is also scaled by how reliably it can be measured automatically: front ratios agree closely with FaceIQ, many profile angles much less (a few degrees of landmark error moves them a lot), so a profile angle that is mostly noise can’t sink your score.</p>
      <p>The photo measurements have their own ideal ranges — full, dark, low‑set brows that reach past the outer eye corner; lids resting close to the iris with no white beneath; moderately full lips; a full hairline (from looksmax.org’s eye‑area and brow guides and the clinical eye‑area literature) — and feed Features and Dimorphism. On the benchmark, brow darkness and a small brow‑to‑eye gap track FaceIQ’s dimorphism scores strongly. Jaw shadow and cheek hollows were tested too and left out: they followed the lighting and double‑chin shadows, not bone structure.</p>
      <p>Harmony combines the ratios with a weighted power mean that leans on weaker ratios (front and side separately, then 70% front + 30% side — FaceIQ uses 60/40, but profile angles from a photo are less reliable than frontal ratios, so the front carries more). The weights reproduce FaceIQ’s published flaw impacts — face width‑to‑height, brow position and eye shape count about five times as much as the nose tip angle or mouth corners. Angularity, Dimorphism and Features (FaceIQ rates these with a vision model) are estimated from groups of measurements and calibrated against FaceIQ’s scores on a benchmark of celebrity faces. Overall is the geometric mean of the four pillars, exactly as FaceIQ combines them, so your weakest pillar pulls hardest.</p>
      <p><b>Front profile</b> and <b>Side profile</b> scores repeat the whole calculation with only that photo’s measurements, on the same scale — so you can see whether your face or your profile carries your score.</p>
      <p>Against FaceIQ on the benchmark (fully automatic landmarks, no corrections), the overall score lands within about 0.9 points on average and ranks faces in much the same order (correlation ≈ 0.8); the very top (FaceIQ 8+) comes out about half a point lower on average. Checking your landmarks in the verify step brings it closer.</p>
      <p>The scale is FaceIQ’s: <b>5 is the average man, 7 ≈ top 6%, 8 ≈ top 0.4%</b>. You can fine‑tune it with known scores under <b>Calibration</b>.</p>
      <p class="fine">Full details: <span class="mono">docs/scoring.md</span>. Ideal ranges describe statistical ideals, not a person’s worth. Skin is not assessed. Weights in the tables include the reliability scaling.</p>
    </section>
    <section class="card fade-up"><h2>Front measurements</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Measurement</th><th>Formula</th><th>Ideal (Caucasian set)</th><th>Typical man</th><th>Weight</th></tr></thead><tbody>${mt('front')}</tbody></table></div></section>
    <section class="card fade-up"><h2>Side measurements</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Measurement</th><th>Formula</th><th>Ideal (Caucasian set)</th><th>Typical man</th><th>Weight</th></tr></thead><tbody>${mt('side')}</tbody></table></div></section>
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
  await document.fonts?.ready;
  const font = (w, s) => `${w} ${s}px Manrope, system-ui, sans-serif`;
  const hex = (s) => (s >= 7 ? '#3ddc97' : s >= 5.5 ? '#a8d84e' : s >= 4 ? '#f5b544' : '#ff6b5e');
  const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const [fi, si] = await Promise.all([app.img(scan.front.url), app.img(scan.side.url)]);

  // backdrop: the front photo, heavily blurred, under a dark wash and two soft glows
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, W, H);
  {
    const k = Math.max(W / fi.naturalWidth, H / fi.naturalHeight) * 1.15;
    ctx.save(); ctx.filter = 'blur(70px) saturate(1.25)'; ctx.globalAlpha = 0.55;
    ctx.drawImage(fi, (W - fi.naturalWidth * k) / 2, (H - fi.naturalHeight * k) / 2, fi.naturalWidth * k, fi.naturalHeight * k);
    ctx.restore();
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, 'rgba(5,7,10,0.55)'); wash.addColorStop(0.45, 'rgba(5,7,10,0.72)'); wash.addColorStop(1, 'rgba(5,7,10,0.94)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
    const glow = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    glow(250, 830, 420, rgba(hex(res.overall), 0.16));
    glow(980, 120, 380, 'rgba(110,140,255,0.10)');
  }
  const glass = (x, y, w, h, r = 30) => {
    ctx.save(); rr(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  };
  // header
  ctx.fillStyle = '#fff'; ctx.font = font(800, 32); ctx.fillText('GGFacelon', 70, 88);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = font(500, 22); ctx.textAlign = 'right';
  ctx.fillText(new Date(scan.created).toLocaleDateString([], { dateStyle: 'long' }), W - 70, 88); ctx.textAlign = 'left';

  // photos with their profile scores
  const ph = (img, view, x) => {
    const b = bbox(scan[view].lm, 0.16), w = 455, h = 500;
    const sz = Math.max(b.x1 - b.x0, ((b.y1 - b.y0) * w) / h);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    ctx.save(); rr(ctx, x, 130, w, h, 30); ctx.clip();
    ctx.drawImage(img, cx - sz / 2, cy - (sz * h) / w / 2, sz, (sz * h) / w, x, 130, w, h);
    const g = ctx.createLinearGradient(0, 130 + h * 0.55, 0, 130 + h); g.addColorStop(0, 'rgba(5,7,10,0)'); g.addColorStop(1, 'rgba(5,7,10,0.85)');
    ctx.fillStyle = g; ctx.fillRect(x, 130, w, h);
    ctx.restore();
    ctx.save(); rr(ctx, x, 130, w, h, 30); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    const sc = res.views?.[view]?.score;
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = font(700, 17); ctx.fillText(view === 'front' ? 'FRONT PROFILE' : 'SIDE PROFILE', x + 28, 130 + h - 70);
    if (Number.isFinite(sc)) {
      ctx.save(); ctx.shadowColor = rgba(hex(sc), 0.55); ctx.shadowBlur = 24;
      ctx.fillStyle = hex(sc); ctx.font = font(800, 46); ctx.fillText(sc.toFixed(2), x + 26, 130 + h - 22); ctx.restore();
    }
  };
  ph(fi, 'front', 70); ph(si, 'side', 555);

  // overall
  glass(70, 665, 940, 330);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = font(700, 19); ctx.fillText('OVERALL SCORE', 116, 728);
  ctx.save(); ctx.shadowColor = rgba(hex(res.overall), 0.5); ctx.shadowBlur = 48;
  ctx.fillStyle = hex(res.overall); ctx.font = font(800, 132); ctx.fillText(res.overall.toFixed(2), 106, 866); ctx.restore();
  const sw = ctx.measureText(res.overall.toFixed(2)).width;
  ctx.font = font(800, 132); const sw2 = ctx.measureText(res.overall.toFixed(2)).width;
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = font(600, 40); ctx.fillText('/10', 116 + Math.max(sw, sw2), 866);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 30); ctx.fillText(rating(res.overall), 116, 920);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = font(500, 22); ctx.fillText(`Higher than ${pctText(res.percentile)}% of men`, 116, 956);
  PILLARS.forEach((p, i) => {
    const y = 728 + i * 64, s = res.pillars[p.id].score, x = 600, bw = 300;
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.font = font(600, 22); ctx.fillText(p.name, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.09)'; rr(ctx, x, y + 14, bw, 9, 4.5); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + bw, 0); g.addColorStop(0, rgba(hex(s), 0.55)); g.addColorStop(1, hex(s));
    ctx.save(); ctx.shadowColor = rgba(hex(s), 0.5); ctx.shadowBlur = 12; ctx.fillStyle = g; rr(ctx, x, y + 14, Math.max(9, (bw * s) / 10), 9, 4.5); ctx.fill(); ctx.restore();
    ctx.fillStyle = hex(s); ctx.font = font(800, 24); ctx.textAlign = 'right'; ctx.fillText(s.toFixed(2), 970, y + 2); ctx.textAlign = 'left';
  });

  // strongest measurements
  const top = METRICS.filter((m) => m.hm || m.look).map((m) => ({ m, ...res.values[m.id] })).filter((t) => Number.isFinite(t.v) && t.s >= 9)
    .sort((a, b) => b.m.w - a.m.w).slice(0, 4);
  glass(70, 1025, 940, 225);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = font(700, 19); ctx.fillText('STRONGEST', 116, 1080);
  top.forEach((t, i) => {
    const x = 116 + (i % 2) * 450, y = 1130 + Math.floor(i / 2) * 64;
    ctx.fillStyle = '#fff'; ctx.font = font(700, 25); ctx.fillText(t.m.name.length > 26 ? t.m.name.slice(0, 25) + '…' : t.m.name, x, y);
    ctx.fillStyle = hex(t.s); ctx.font = font(600, 21); ctx.fillText(`${fmt(t.m, t.v)} · ideal`, x, y + 30);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = font(500, 19); ctx.textAlign = 'center';
  ctx.fillText(`${METRICS.length} measurements · analysed on‑device · ggfacelon`, W / 2, 1302);
  ctx.textAlign = 'left';

  // preview, then save
  const url = c.toDataURL('image/png');
  const { modal } = await import('./dom.js');
  const m = modal(`<div class="share-prev"><img src="${url}" alt="Report card"><div class="m-actions"><button class="btn ghost" data-x>Close</button><button class="btn dark" data-dl>${icon('download', 16)} Download PNG</button></div></div>`, { cls: 'share' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('[data-dl]').onclick = () => {
    const a = document.createElement('a');
    a.download = `ggfacelon-${new Date(scan.created).toISOString().slice(0, 10)}.png`;
    a.href = url;
    a.click();
    toast('Report image saved');
  };
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
