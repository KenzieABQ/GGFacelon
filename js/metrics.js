// Facial analysis engine — modelled on FaceIQ Labs' published method (see docs/scoring.md).
//
//  • 66 Harmony ratios (33 front, 33 side) with FaceIQ's formulas and male ideal ranges (js/norms.js).
//  • Each ratio scores 10 inside its ideal range and falls off as 10·exp(−(d/s)²) outside it, with a
//    per-ratio width s fitted to FaceIQ's own scores.
//  • Harmony = 70% front + 30% side (FaceIQ: 60/40; profile angles are measured less reliably); each view is a weighted power mean (p = 0.5, leaning on weak ratios)
//    mapped onto FaceIQ's 0–10 scale. Angularity, Dimorphism and Features are built the same way from
//    groups of measurements. Overall = geometric mean of the four pillars (the weakest pillar drags most).
//  • The scale is FaceIQ's: 5 = average man, 7 ≈ 94th percentile, 8 ≈ 99.6th.
//  • Frontal points are rotated so the pupils are level; profile points are mirrored to face right and
//    levelled to the Frankfort plane (ear canal → under-eye rim). Millimetres assume a 190 mm
//    hairline-to-chin height, as FaceIQ does.

import { mid, dist, avg, angleAt, rotate, DEG, clamp } from './geom.js';
import { FIQ_NORMS, AGG, RANGE_SETS } from './norms.js';

// ───────────────────────── frames ─────────────────────────
export function frontFrame(lm) {
  const mirror = lm.pupil_l.x < lm.pupil_r.x; // mirrored selfie: subject's left on image left
  const m = (p) => (mirror ? { x: -p.x, y: p.y } : p);
  const pr = m(lm.pupil_r), pl = m(lm.pupil_l);
  const c = mid(pr, pl);
  const th = Math.atan2(pl.y - pr.y, pl.x - pr.x);
  const N = {};
  for (const k in lm) {
    const q = rotate(m(lm[k]), -th, c);
    N[k] = { x: q.x - c.x, y: q.y - c.y };
  }
  const inv = (q) => m(rotate({ x: q.x + c.x, y: q.y + c.y }, th, c));
  return { N, inv, roll: th * DEG, mirror };
}

export function sideFrame(lm) {
  const facing = Math.sign(lm.prn.x - lm.tragus.x) || 1;
  const m = (p) => (facing < 0 ? { x: -p.x, y: p.y } : p);
  const t = m(lm.tragus), o = m(lm.or);
  const th = Math.atan2(o.y - t.y, o.x - t.x);
  const N = {};
  for (const k in lm) {
    const q = rotate(m(lm[k]), -th, t);
    N[k] = { x: q.x - t.x, y: q.y - t.y };
  }
  const inv = (q) => m(rotate({ x: q.x + t.x, y: q.y + t.y }, th, t));
  return { N, inv, tilt: th * DEG, facing };
}

// ───────────────────────── helpers ─────────────────────────
const deg = (r) => r * DEG;
const mean = (...v) => v.reduce((a, x) => a + x, 0) / v.length;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
// signed forward distance of P from line A→B (A above B); positive = in front of the line (profile, facing +x)
function fwdDist(P, A, B) {
  const bx = B.x - A.x, by = B.y - A.y, px = P.x - A.x, py = P.y - A.y;
  return -(bx * py - by * px) / (Math.hypot(bx, by) || 1);
}
// Profile angle at V that keeps its orientation: < 180° when V sticks out in front of the line A–B (convex)
const oriented = (A, V, B) => { const a = angleAt(A, V, B); return fwdDist(V, A, B) >= 0 ? a : 360 - a; };
function isect(a, b, c, d) {
  const x1 = b.x - a.x, y1 = b.y - a.y, x2 = d.x - c.x, y2 = d.y - c.y;
  const den = x1 * y2 - y1 * x2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * y2 - (c.y - a.y) * x2) / den;
  return { x: a.x + x1 * t, y: a.y + y1 * t };
}
const slopeUp = (a, b) => deg(Math.atan2(a.y - b.y, Math.abs(b.x - a.x))); // + when b is higher than a
function footOn(P, A, B) {
  const bx = B.x - A.x, by = B.y - A.y;
  const t = ((P.x - A.x) * bx + (P.y - A.y) * by) / (bx * bx + by * by || 1);
  return { x: A.x + bx * t, y: A.y + by * t };
}

// Overlay primitives (normalised frame coordinates; the renderer maps them back to the photo)
const seg = (a, b, o = {}) => ({ t: 'line', a, b, ...o });
const hw = (a, b, y, o = {}) => seg({ x: a.x, y: y ?? (a.y + b.y) / 2 }, { x: b.x, y: y ?? (a.y + b.y) / 2 }, { ticks: true, ...o });
const vh = (a, b, x, o = {}) => seg({ x: x ?? a.x, y: a.y }, { x: x ?? a.x, y: b.y }, { ticks: true, ...o });
const ang = (a, v, b, o = {}) => ({ t: 'angle', a, v, b, ...o });
const pt = (p, o = {}) => ({ t: 'pt', p, ...o });
const lab = (p, o = {}) => ({ t: 'label', p, ...o });
const ext = (a, b, k = 0.25) => [{ x: a.x - (b.x - a.x) * k, y: a.y - (b.y - a.y) * k }, { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }];

// ───────────────────────── derived values ─────────────────────────
function frontCtx(N) {
  const pairs = ['pupil', 'endo', 'exo', 'brI', 'ala', 'ch', 'zy', 'cheek', 'cupid'];
  const midX = avg(pairs.map((k) => mid(N[k + '_r'], N[k + '_l']))).x;
  const browY = mean(N.brI_r.y, N.brP_r.y, N.brT_r.y, N.brI_l.y, N.brP_l.y, N.brT_l.y);
  const cupidY = (N.cupid_r.y + N.cupid_l.y) / 2;
  const pupilY = (N.pupil_r.y + N.pupil_l.y) / 2;
  // FaceIQ measures the eye region to the outer end of the eyelid hood, ~18% beyond the eye corner
  const hood_r = lerp(N.endo_r, N.exo_r, 1.18), hood_l = lerp(N.endo_l, N.exo_l, 1.18);
  const faceH = N.me.y - N.trichion.y;
  const c = {
    midX, browY, cupidY, pupilY, hood_r, hood_l, faceH,
    mm: 190 / (faceH || 1),
    mouthY: (N.ch_r.y + N.ch_l.y) / 2,
    bizyg: N.zy_l.x - N.zy_r.x,
    jawW: N.cheek_l.x - N.cheek_r.x, // FaceIQ's "bigonial" points sit on the jaw contour at mouth level
    goW: N.go_l.x - N.go_r.x,        // jaw corners
    bitemp: N.temple_l.x - N.temple_r.x,
    ipd: N.pupil_l.x - N.pupil_r.x,
    icd: N.endo_l.x - N.endo_r.x,
    eyeW_r: dist(N.endo_r, N.exo_r), eyeW_l: dist(N.endo_l, N.exo_l),
    eyeH_r: N.lidL_r.y - N.lidU_r.y, eyeH_l: N.lidL_l.y - N.lidU_l.y,
    noseW: N.ala_l.x - N.ala_r.x,
    bridgeW: N.bridge_l.x - N.bridge_r.x,
    mouthW: N.ch_l.x - N.ch_r.x,
    neckW: N.neck_l.x - N.neck_r.x,
  };
  c.jfaV = isect(N.go_r, N.chin_r, N.go_l, N.chin_l);
  return c;
}

function sideCtx(N, mm) {
  const H = N.me.y - N.n.y; // nasion → menton height along the Frankfort normal
  return { H, mm: mm || 190 / ((H || 1) * 1.62) };
}

// ───────────────────────── metric definitions ─────────────────────────
// Formulas follow FaceIQ's measurement guides. Ranges and score curves come from js/norms.js.
const M = [];
const F = (o) => M.push({ view: 'front', hm: true, ...o });
const S = (o) => M.push({ view: 'side', hm: true, ...o });
const thirdOv = (N, c, which) => {
  const ys = [N.trichion.y, c.browY, N.sn.y, N.me.y], x = c.midX + c.ipd * 0.62;
  return [0, 1, 2].map((i) => vh({ x, y: ys[i] }, { x, y: ys[i + 1] }, x, { dim: i !== which, label: i === which }))
    .concat([hw(N.brI_r, N.brI_l, c.browY, { dash: true, ticks: false }), hw(N.ala_r, N.ala_l, N.sn.y, { dash: true, ticks: false })]);
};

// ── FRONT ── (subject's right = smaller x in the frame)
F({ id: 'top_third', name: 'Top Third', unit: '%', group: 'Facial Thirds',
  f: (N, c) => ((c.browY - N.trichion.y) / c.faceH) * 100, ov: (N, c) => thirdOv(N, c, 0),
  desc: 'Forehead height (hairline to brow level) as a share of the full face. A larger value usually means a higher or receding hairline.',
  how: '(brow level − hairline) ÷ (chin − hairline) × 100' });
F({ id: 'middle_third', name: 'Middle Third', unit: '%', group: 'Facial Thirds',
  f: (N, c) => ((N.sn.y - c.browY) / c.faceH) * 100, ov: (N, c) => thirdOv(N, c, 1),
  desc: 'Height from brow level to the bottom of the nose, as a share of the full face.',
  how: '(nose base − brow level) ÷ (chin − hairline) × 100' });
F({ id: 'lower_third', name: 'Lower Third', unit: '%', group: 'Facial Thirds',
  f: (N, c) => ((N.me.y - N.sn.y) / c.faceH) * 100, ov: (N, c) => thirdOv(N, c, 2),
  desc: 'Height from the bottom of the nose to the bottom of the chin, as a share of the full face.',
  how: '(chin − nose base) ÷ (chin − hairline) × 100' });
F({ id: 'fwhr', name: 'Face Width to Height Ratio', unit: 'x', group: 'Face Shape',
  f: (N, c) => c.bizyg / (c.cupidY - c.browY),
  ov: (N, c) => [hw(N.zy_r, N.zy_l, undefined, { label: true }), vh({ x: 0, y: c.browY }, { x: 0, y: c.cupidY }, c.midX, { dim: true }), hw(N.brI_r, N.brI_l, c.browY, { dash: true, ticks: false })],
  desc: 'Cheekbone width compared with upper‑face height (brow level to the Cupid’s bow). A higher value reads as a more compact, robust midface.',
  how: 'cheekbone width ÷ (Cupid’s bow − brow level)' });
F({ id: 'midface_ratio', name: 'Midface Ratio', unit: 'x', group: 'Face Shape',
  f: (N, c) => c.ipd / (c.cupidY - c.pupilY),
  ov: (N, c) => [hw(N.pupil_r, N.pupil_l, c.pupilY, { label: true }), vh({ x: 0, y: c.pupilY }, { x: 0, y: c.cupidY }, c.midX, { dim: true })],
  desc: 'Pupil spacing compared with the height from the pupils to the upper lip. About 1.0 is a compact, balanced midface.',
  how: 'interpupillary distance ÷ (Cupid’s bow − pupil level)' });
F({ id: 'total_wh', name: 'Total Facial Width to Height Ratio', unit: 'x', group: 'Face Shape',
  f: (N, c) => c.faceH / c.bizyg,
  ov: (N, c) => [vh(N.trichion, N.me, c.midX, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Full face height (hairline to chin) compared with cheekbone width.',
  how: '(chin − hairline) ÷ cheekbone width' });
F({ id: 'bitemporal', name: 'Bitemporal Width', unit: '%', group: 'Face Shape',
  f: (N, c) => (c.bitemp / c.bizyg) * 100,
  ov: (N) => [hw(N.temple_r, N.temple_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Forehead width at the temples compared with cheekbone width.',
  how: 'temple width ÷ cheekbone width × 100' });
F({ id: 'cheekbone_height', name: 'Cheekbone Height', unit: '%', group: 'Face Shape',
  f: (N, c) => mean((c.cupidY - N.zy_r.y) / (c.cupidY - N.pupil_r.y), (c.cupidY - N.zy_l.y) / (c.cupidY - N.pupil_l.y)) * 100,
  ov: (N, c) => [vh({ x: 0, y: c.cupidY }, N.zy_r, N.zy_r.x, { label: true }), vh({ x: 0, y: c.cupidY }, N.pupil_r, N.zy_r.x - 8, { dim: true }), hw(N.zy_r, N.zy_l, undefined, { dash: true, ticks: false })],
  desc: 'How high the widest point of the cheekbones sits between the upper lip and the pupils. 100% = level with the pupils.',
  how: '(Cupid’s bow − cheekbone level) ÷ (Cupid’s bow − pupil level) × 100' });
F({ id: 'esr', name: 'Eye Separation Ratio', unit: '%', group: 'Eyes',
  f: (N, c) => (c.ipd / c.bizyg) * 100,
  ov: (N) => [hw(N.pupil_r, N.pupil_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Distance between the pupils as a share of cheekbone width.',
  how: 'interpupillary distance ÷ cheekbone width × 100' });
F({ id: 'one_eye_apart', name: 'One Eye Apart Test', unit: 'x', group: 'Eyes',
  f: (N, c) => c.icd / mean(dist(N.endo_r, c.hood_r), dist(N.endo_l, c.hood_l)),
  ov: (N, c) => [hw(N.endo_r, N.endo_l, undefined, { label: true }), hw(c.hood_r, N.endo_r, undefined, { dim: true }), hw(N.endo_l, c.hood_l, undefined, { dim: true })],
  desc: 'Gap between the inner eye corners compared with the width of one eye region. Ideally the eyes are one eye‑width apart.',
  how: 'inner‑corner gap ÷ average inner corner → outer eyelid‑hood span' });
const tilt = (endo, exo) => deg(Math.atan2(endo.y - exo.y, Math.abs(endo.x - exo.x)));
F({ id: 'canthal_tilt', name: 'Lateral Canthal Tilt', unit: '°', group: 'Eyes',
  f: (N) => mean(tilt(N.endo_r, N.exo_r), tilt(N.endo_l, N.exo_l)),
  ov: (N) => [seg(...ext(N.endo_r, N.exo_r, 0.2)), seg(...ext(N.endo_l, N.exo_l, 0.2)), hw(N.exo_r, N.endo_r, N.endo_r.y, { dash: true, ticks: false }), hw(N.endo_l, N.exo_l, N.endo_l.y, { dash: true, ticks: false }), lab(N.exo_l, { dx: 1 })],
  desc: 'Slope from the inner to the outer eye corner. A slight upward tilt reads as alert and attractive.',
  how: 'mean angle of inner → outer eye corner above horizontal (head roll removed)' });
F({ id: 'brow_length', name: 'Brow Length to Face Width Ratio', unit: 'x', group: 'Eyes',
  f: (N, c) => (Math.abs(N.brT_r.x - N.brI_r.x) + Math.abs(N.brT_l.x - N.brI_l.x)) / c.bizyg,
  ov: (N) => [hw(N.brT_r, N.brI_r, undefined, { label: true }), hw(N.brI_l, N.brT_l), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Combined horizontal length of both brows compared with cheekbone width.',
  how: '(right brow span + left brow span) ÷ cheekbone width' });
F({ id: 'brow_low_set', name: 'Eyebrow Low Setedness', unit: 'x', group: 'Eyes',
  f: (N, c) => mean(Math.abs(N.pupil_r.y - N.brI_r.y), Math.abs(N.pupil_l.y - N.brI_l.y)) / mean(c.eyeH_r, c.eyeH_l),
  ov: (N) => [vh(N.brI_r, N.pupil_r, N.brI_r.x, { label: true }), vh(N.lidU_r, N.lidL_r, N.pupil_r.x, { dim: true }), vh(N.brI_l, N.pupil_l, N.brI_l.x), vh(N.lidU_l, N.lidL_l, N.pupil_l.x, { dim: true })],
  desc: 'How far the inner brows sit above pupil level, relative to how open the eyes are. Lower means lower‑set brows and a more intense eye area.',
  how: '|pupil level − inner brow| ÷ average eye opening (upper → lower lid)' });
F({ id: 'eye_ar', name: 'Eye Aspect Ratio', unit: 'x', group: 'Eyes',
  f: (N, c) => mean(c.eyeW_r / c.eyeH_r, c.eyeW_l / c.eyeH_l),
  ov: (N) => [hw(N.exo_r, N.endo_r, undefined, { label: true }), vh(N.lidU_r, N.lidL_r, N.pupil_r.x), hw(N.endo_l, N.exo_l, undefined, { dim: true }), vh(N.lidU_l, N.lidL_l, N.pupil_l.x, { dim: true })],
  desc: 'Eye width compared with how open the eye is. Longer, narrower eyes read as more masculine.',
  how: 'average of eye width (corner to corner) ÷ eye opening (upper → lower lid)' });
F({ id: 'brow_tilt', name: 'Eyebrow Tilt', unit: '°', group: 'Eyes',
  f: (N) => mean(slopeUp(N.brI_r, N.brP_r), slopeUp(N.brI_l, N.brP_l)),
  ov: (N) => [seg(...ext(N.brI_r, N.brP_r, 0.15)), seg(...ext(N.brI_l, N.brP_l, 0.15)), hw(N.brI_l, { x: N.brP_l.x, y: N.brI_l.y }, N.brI_l.y, { dash: true, ticks: false }), lab(N.brP_l, { dx: 1 })],
  desc: 'Slope from the inner brow to the brow arch.',
  how: 'mean angle of inner brow → brow peak above horizontal' });
const iaa = (N, c) => angleAt(c.hood_r, N.sn, c.hood_l);
const jfa = (N, c) => (c.jfaV ? angleAt(N.go_r, c.jfaV, N.go_l) : 180 + slopeUp(N.chin_r, N.go_r) + slopeUp(N.chin_l, N.go_l));
const jfaOv = (N, c) => { const X = c.jfaV || N.me; return [seg(N.go_r, X), seg(N.go_l, X), ang(N.go_r, X, N.go_l, { label: true }), pt(N.go_r), pt(N.go_l)]; };
F({ id: 'iaa_jfa_dev', name: 'Deviation of IAA & JFA', unit: '°', group: 'Nose',
  f: (N, c) => Math.abs(iaa(N, c) - jfa(N, c)),
  ov: (N, c) => [ang(c.hood_r, N.sn, c.hood_l), ...jfaOv(N, c).map((p) => (p.t === 'angle' ? { ...p, label: false } : p)), lab(N.me, { dy: 1.2 })],
  desc: 'Difference between the eye–nose angle (IAA) and the jaw angle (JFA). When they match, the upper and lower face share the same proportions.',
  how: '| Ipsilateral Alar Angle − Jaw Frontal Angle |' });
F({ id: 'iaa', name: 'Ipsilateral Alar Angle', unit: '°', group: 'Nose',
  f: iaa, ov: (N, c) => [ang(c.hood_r, N.sn, c.hood_l, { label: true })],
  desc: 'Angle at the nose base between lines to the outer ends of the eyelid hoods.',
  how: 'angle outer eyelid hood (R) – nose base – outer eyelid hood (L)' });
F({ id: 'bridge_nose', name: 'Nose Bridge to Nose Width', unit: 'x', group: 'Nose',
  f: (N, c) => c.noseW / c.bridgeW,
  ov: (N) => [hw(N.ala_r, N.ala_l, undefined, { label: true }), hw(N.bridge_r, N.bridge_l, undefined, { dim: true })],
  desc: 'Nose base width compared with the width of the nose bridge (base ÷ bridge, as FaceIQ calculates it).',
  how: 'nostril‑wing width ÷ bridge width' });
F({ id: 'icd_nose', name: 'Intercanthal‑Nasal Width Ratio', unit: 'x', group: 'Nose',
  f: (N, c) => c.noseW / c.icd,
  ov: (N) => [hw(N.ala_r, N.ala_l, undefined, { label: true }), hw(N.endo_r, N.endo_l, undefined, { dim: true })],
  desc: 'Nose width compared with the gap between the inner eye corners.',
  how: 'nostril‑wing width ÷ inner‑corner distance' });
F({ id: 'nose_tip_pos', name: 'Nose Tip Position', unit: 'mm', group: 'Nose',
  // FaceIQ: nose bottom (subnasale) relative to the nasal base (alar base) — estimated a quarter of the way
  // from subnasale up to the nostril-wing line
  f: (N, c) => 0.25 * (N.sn.y - (N.ala_r.y + N.ala_l.y) / 2) * c.mm,
  ov: (N) => [hw(N.ala_r, N.ala_l, undefined, { dash: true, ticks: false }), vh({ x: N.sn.x, y: (N.ala_r.y + N.ala_l.y) / 2 }, N.sn, N.sn.x + 6, { label: true })],
  desc: 'How far the bottom of the nose hangs below the nasal base.',
  how: '(nose bottom − nasal base) in mm (190 mm hairline‑to‑chin scale)' });
F({ id: 'mouth_corner', name: 'Mouth Corner Position', unit: 'mm', group: 'Mouth',
  f: (N, c) => mean(N.sto.y - N.ch_r.y, N.sto.y - N.ch_l.y) * c.mm,
  ov: (N) => [seg(N.ch_r, N.sto), seg(N.sto, N.ch_l), hw(N.ch_r, N.ch_l, N.sto.y, { dash: true, ticks: false }), lab(N.ch_l, { dx: 1 })],
  desc: 'Whether the mouth corners sit above (positive) or below (negative) the centre of the mouth line.',
  how: 'mean (mouth centre − corner) height in mm' });
F({ id: 'cupid_depth', name: "Cupid's Bow Depth", unit: 'mm', group: 'Mouth',
  f: (N, c) => (N.ls.y - c.cupidY) * c.mm,
  ov: (N) => [seg(N.cupid_r, N.ls), seg(N.ls, N.cupid_l), hw(N.cupid_r, N.cupid_l, undefined, { dash: true }), pt(N.ls), lab(N.ls, { dy: -1 })],
  desc: 'Depth of the dip in the centre of the upper lip below its two peaks.',
  how: '(central dip − bow peaks) in mm' });
F({ id: 'mouth_nose', name: 'Mouth Width to Nose Width', unit: 'x', group: 'Mouth',
  f: (N, c) => c.mouthW / c.noseW,
  ov: (N) => [hw(N.ch_r, N.ch_l, undefined, { label: true }), hw(N.ala_r, N.ala_l, undefined, { dim: true })],
  desc: 'How wide the mouth is relative to the nose.',
  how: 'mouth‑corner width ÷ nostril‑wing width' });
F({ id: 'lip_ratio', name: 'Lower Lip to Upper Lip Ratio', unit: 'x', group: 'Mouth',
  f: (N, c) => (N.li.y - N.sto.y) / ((N.sto.y - c.cupidY) || 1),
  ov: (N, c) => [vh(N.sto, N.li, c.midX + c.mouthW * 0.3, { label: true }), vh({ x: 0, y: c.cupidY }, N.sto, c.midX - c.mouthW * 0.3, { dim: true })],
  desc: 'Visible height of the lower lip compared with the upper lip (measured from the Cupid’s bow).',
  how: '(lower lip − mouth line) ÷ (mouth line − Cupid’s bow)' });
F({ id: 'ipd_mouth', name: 'Interpupillary‑Mouth Width Ratio', unit: 'x', group: 'Mouth',
  f: (N, c) => c.mouthW / c.ipd,
  ov: (N) => [hw(N.ch_r, N.ch_l, undefined, { label: true }), hw(N.pupil_r, N.pupil_l, undefined, { dim: true })],
  desc: 'Mouth width compared with the distance between the pupils.',
  how: 'mouth width ÷ interpupillary distance' });
F({ id: 'chin_philtrum', name: 'Chin to Philtrum Ratio', unit: 'x', group: 'Mouth',
  f: (N, c) => (N.me.y - N.li.y) / ((c.cupidY - N.sn.y) || 1),
  ov: (N, c) => [vh(N.li, N.me, c.midX + c.mouthW * 0.6, { label: true }), vh(N.sn, { x: 0, y: c.cupidY }, c.midX - c.mouthW * 0.6, { dim: true })],
  desc: 'Height below the lower lip compared with the philtrum (nose base to Cupid’s bow). A taller chin is a masculine trait.',
  how: '(chin − lower lip) ÷ (Cupid’s bow − nose base)' });
F({ id: 'jaw_slope', name: 'Jaw Slope', unit: '°', group: 'Jaw',
  f: (N) => mean(angleAt(N.zy_r, N.go_r, N.chin_r), angleAt(N.zy_l, N.go_l, N.chin_l)),
  ov: (N) => [ang(N.zy_r, N.go_r, N.chin_r, { label: true }), ang(N.zy_l, N.go_l, N.chin_l)],
  desc: 'Angle at the jaw corner between the cheek line and the lower jaw border.',
  how: 'mean angle cheekbone – jaw angle – chin edge' });
F({ id: 'bigonial', name: 'Bigonial Width', unit: '%', group: 'Jaw',
  f: (N, c) => (c.jawW / c.bizyg) * 100,
  ov: (N) => [hw(N.cheek_r, N.cheek_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Jaw width (measured on the face contour at mouth level, as FaceIQ does) compared with cheekbone width.',
  how: 'jaw width ÷ cheekbone width × 100' });
F({ id: 'lower_third_prop', name: 'Lower Third Proportion', unit: '%', group: 'Jaw',
  f: (N) => ((N.sto.y - N.sn.y) / (N.me.y - N.sn.y)) * 100,
  ov: (N, c) => [vh(N.sn, N.sto, c.midX + c.mouthW * 0.6, { label: true }), vh(N.sn, N.me, c.midX - c.mouthW * 0.6, { dim: true })],
  desc: 'Nose‑to‑mouth height as a share of the lower third. Ideally the mouth sits about one third of the way from nose to chin.',
  how: '(mouth line − nose base) ÷ (chin − nose base) × 100' });
F({ id: 'jfa', name: 'Jaw Frontal Angle', unit: '°', group: 'Jaw', f: jfa, ov: jfaOv,
  desc: 'Angle where the two lower jaw borders would meet below the chin. Smaller = more V‑shaped; larger = squarer and flatter.',
  how: 'angle between jaw angle → chin edge lines, at their meeting point' });
const earAng = (ear, zy, y) => deg(Math.atan2(Math.abs(ear.x - zy.x), Math.abs(y - ear.y) || 1));
F({ id: 'ear_angle', name: 'Ear Protrusion Angle', unit: '°', group: 'Jaw',
  f: (N, c) => mean(earAng(N.ear_r, N.zy_r, c.mouthY), earAng(N.ear_l, N.zy_l, c.mouthY)),
  ov: (N, c) => [seg({ x: N.zy_r.x, y: c.mouthY }, N.ear_r), vh(N.ear_r, { x: 0, y: c.mouthY }, N.zy_r.x, { dash: true, ticks: false }), ang(N.ear_r, { x: N.zy_r.x, y: c.mouthY }, { x: N.zy_r.x, y: N.ear_r.y }, { label: true })],
  desc: 'How far the ears flare out, as an angle from a vertical line through the cheekbone.',
  how: 'mean angle of (cheekbone line at mouth level → outer ear) from vertical' });
F({ id: 'ear_ratio', name: 'Ear Protrusion Ratio', unit: '%', group: 'Jaw',
  f: (N, c) => (mean(Math.abs(N.ear_r.x - N.zy_r.x), Math.abs(N.ear_l.x - N.zy_l.x)) / c.bizyg) * 100,
  ov: (N) => [hw(N.ear_r, N.zy_r, undefined, { label: true }), hw(N.zy_l, N.ear_l)],
  desc: 'How far the ears stick out past the cheekbones, as a share of face width.',
  how: 'mean |outer ear − cheekbone| ÷ cheekbone width × 100' });
F({ id: 'neck_width', name: 'Neck Width', unit: '%', group: 'Other',
  f: (N, c) => (c.neckW / c.jawW) * 100,
  ov: (N) => [hw(N.neck_r, N.neck_l, undefined, { label: true }), hw(N.cheek_r, N.cheek_l, undefined, { dim: true })],
  desc: 'Neck width compared with jaw width. A neck close to jaw width is a strong masculine trait.',
  how: 'neck width ÷ jaw width × 100' });
// extras (not in Harmony)
F({ id: 'symmetry', name: 'Facial Symmetry', unit: '%', hm: false, extra: true,
  f: (N, c) => {
    const pairs = ['pupil', 'endo', 'exo', 'lidU', 'lidL', 'brI', 'brP', 'brT', 'ala', 'ch', 'cupid', 'zy', 'go', 'chin', 'cheek'];
    let s = 0;
    for (const k of pairs) {
      const r = N[k + '_r'], l = N[k + '_l'];
      s += Math.hypot((r.x + l.x) / 2 - c.midX, (r.y - l.y) / 2);
    }
    return (s / pairs.length / c.bizyg) * 100;
  },
  ov: (N, c) => [vh({ x: c.midX, y: N.trichion.y }, { x: c.midX, y: N.me.y }, c.midX, { dash: true, ticks: false }),
    ...['exo', 'ch', 'go', 'zy'].map((k) => seg(N[k + '_r'], N[k + '_l'], { dim: true })), lab({ x: c.midX, y: N.trichion.y }, { dy: -1 })],
  desc: 'Average left–right mismatch of paired landmarks as a share of face width. Lower is more symmetric.',
  how: 'mean distance of each pair’s mirror from the midline ÷ cheekbone width × 100' });
F({ id: 'cheek_lean', name: 'Lower Face Taper', unit: '%', hm: false, extra: true,
  f: (N, c) => (c.goW / c.bizyg) * 100,
  ov: (N) => [hw(N.go_r, N.go_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Width across the jaw corners compared with the cheekbones. A clear taper from cheekbones to jaw reads as lean and defined.',
  how: 'jaw‑corner width ÷ cheekbone width × 100' });

// ── APPEARANCE ── read from the photo's pixels around the landmarks (js/appearance.js), not from geometry.
// f receives the measured values as its third argument. Overlays point at the region that was read.
const LOOK = (o) => F({ hm: false, extra: true, look: true, group: 'Appearance', f: (N, c, L) => L?.[o.id] ?? NaN, ...o });
const browLine = (N, s, o = {}) => [seg(N['brI_' + s], N['brP_' + s], o), seg(N['brP_' + s], N['brT_' + s], o)];
LOOK({ id: 'brow_thickness', name: 'Eyebrow Thickness', unit: 'mm',
  ov: (N) => [...browLine(N, 'r', { label: true }), ...browLine(N, 'l')],
  desc: 'Height of the brow hair, measured from the photo along each brow. Full, thick brows frame the eyes and read as masculine; thin or over‑plucked brows soften the eye area.',
  how: 'median height of the dark brow band (half‑contrast edges against the skin above and below) over the inner two‑thirds of each brow, in mm' });
LOOK({ id: 'brow_density', name: 'Eyebrow Density', unit: '%',
  ov: (N) => [...browLine(N, 'r', { label: true }), ...browLine(N, 'l')],
  desc: 'How dark and filled‑in the brows are against the surrounding skin. Sparse or very light brows make the face look unfinished.',
  how: '(forehead skin brightness − brow brightness) ÷ skin brightness × 100' });
LOOK({ id: 'brow_tail_reach', name: 'Brow Tail Length', unit: 'x',
  ov: (N) => [vh(N.exo_r, N.brT_r, N.exo_r.x, { label: true }), vh(N.exo_l, N.brT_l, N.exo_l.x), ...browLine(N, 'r', { dim: true }), ...browLine(N, 'l', { dim: true })],
  desc: 'How far the brow tail runs past the outer eye corner, in eye widths. Brows should at least reach the outer corner; a tail a little beyond it frames the eye.',
  how: 'horizontal distance from the outer eye corner to where the brow hair ends ÷ eye width (0 = ends right above the corner)' });
LOOK({ id: 'brow_eye_gap', name: 'Brow‑to‑Eye Distance', unit: 'mm',
  ov: (N) => [vh(N.brP_r, N.lidU_r, N.pupil_r.x, { label: true }), vh(N.brP_l, N.lidU_l, N.pupil_l.x)],
  desc: 'Gap between the bottom of the brow and the upper eyelid, above the pupil. A small gap — low brows and little upper‑lid show — gives the deep‑set, intense eye area; a large gap reads as surprised or tired.',
  how: 'upper lid → lower edge of the brow hair, straight above the pupil, in mm' });
LOOK({ id: 'iris_exposure', name: 'Eye Openness', unit: 'x',
  ov: (N) => [vh(N.lidU_r, N.lidL_r, N.pupil_r.x, { label: true }), vh(N.lidU_l, N.lidL_l, N.pupil_l.x)],
  desc: 'Eye opening compared with the size of the iris. Lids that cover a little of the top of the iris and meet its bottom read as calm and confident; white showing above or below the iris reads as startled or tired.',
  how: 'upper‑to‑lower lid distance at the pupil ÷ iris diameter (iris edge found in the photo)' });
LOOK({ id: 'scleral_show', name: 'Lower Scleral Show', unit: 'mm',
  ov: (N) => [vh(N.pupil_r, N.lidL_r, N.pupil_r.x, { label: true }), vh(N.pupil_l, N.lidL_l, N.pupil_l.x)],
  desc: 'White of the eye visible between the iris and the lower lid. Ideally none — the lower lid meets the iris.',
  how: 'lower lid − bottom edge of the iris, in mm (0 = the lid touches the iris)' });
LOOK({ id: 'lip_fullness', name: 'Lip Fullness', unit: '%',
  ov: (N) => [vh(N.ls, N.li, N.ls.x, { label: true }), hw(N.ch_r, N.ch_l, undefined, { dim: true })],
  desc: 'Total lip height compared with mouth width. Moderately full lips are attractive on men; very thin lips age the face.',
  how: '(bottom of the lower lip − top of the upper lip) ÷ mouth width × 100' });
LOOK({ id: 'temple_recession', name: 'Temple Recession', unit: '%',
  ov: (N) => [hw(N.temple_r, N.temple_l, N.trichion.y, { dash: true, ticks: false }), vh(N.trichion, N.glabella, N.trichion.x, { label: true })],
  desc: 'How much higher the hairline sits at the temple corners than at the centre. Zero or below means a full, straight hairline; a receding hairline shows as a positive value.',
  how: '(hairline height at the temple corners − at the centre) ÷ face height × 100, from the hair segmentation' });

// ── SIDE ── (frame: facing +x, levelled to the Frankfort plane)
const lineDist = (P, A, B, c) => -fwdDist(P, A, B) * c.mm; // + = behind the line, as FaceIQ reports it
const lineOv = (A, B, P, label) => [seg(...ext(A, B, 0.15), { dim: !label }), seg(P, footOn(P, A, B), { label }), pt(P)];
S({ id: 'nasofrontal', name: 'Nasofrontal Angle', unit: '°', group: 'Upper Third',
  f: (N) => angleAt(N.g, N.n, N.st), ov: (N) => [ang(N.g, N.n, N.st, { label: true })],
  desc: 'Angle at the root of the nose between the forehead and the nose bridge.',
  how: 'angle glabella – nasion – supratip' });
S({ id: 'browridge_incl', name: 'Browridge Inclination Angle', unit: '°', group: 'Upper Third',
  f: (N) => deg(Math.atan2(Math.abs(N.g.x - N.tr.x), Math.abs(N.g.y - N.tr.y) || 1)),
  ov: (N) => [seg(N.tr, N.g, { label: true }), vh(N.tr, N.g, N.g.x, { dash: true, ticks: false })],
  desc: 'How much the forehead leans back from the brow ridge to the hairline.',
  how: 'angle of hairline → glabella from vertical (Frankfort‑levelled)' });
S({ id: 'upper_forehead', name: 'Upper Forehead Slope', unit: '°', group: 'Upper Third',
  f: (N) => angleAt(N.tr, N.g, N.fh), ov: (N) => [seg(N.g, N.tr), seg(N.g, N.fh), ang(N.tr, N.g, N.fh, { label: true })],
  desc: 'How much the upper forehead curves away from the line of the lower forehead.',
  how: 'angle hairline – glabella – mid‑forehead' });
S({ id: 'total_convexity', name: 'Total Facial Convexity', unit: '°', group: 'Facial Profile',
  f: (N) => oriented(N.g, N.prn, N.pog), ov: (N) => [ang(N.g, N.prn, N.pog, { label: true })],
  desc: 'Profile angle including the nose: brow, nose tip and chin.',
  how: 'oriented angle glabella – nose tip – chin point' });
S({ id: 'midface_proj', name: 'Interior Midface Projection Angle', unit: '°', group: 'Facial Profile',
  f: (N) => deg(Math.atan2(Math.abs(N.exs.y - N.ac.y), Math.abs(N.ac.x - N.exs.x) || 1)),
  ov: (N) => [seg(N.ac, N.exs, { label: true }), hw(N.exs, N.ac, N.ac.y, { dash: true, ticks: false })],
  desc: 'Direction from the base of the nostril up to the outer eye corner. Lower = a midface that projects further forward.',
  how: 'arctan(vertical ÷ horizontal distance, nostril base → outer eye corner)' });
S({ id: 'depth_height', name: 'Facial Depth to Height Ratio', unit: 'x', group: 'Facial Profile',
  f: (N) => dist(N.tragus, N.sn) / dist(N.n, N.sm),
  ov: (N) => [seg(N.tragus, N.sn, { label: true }), seg(N.n, N.sm, { dim: true })],
  desc: 'Depth of the face from ear to nose base compared with the height from nasion to the chin fold.',
  how: '|ear canal → nose base| ÷ |nasion → lip–chin fold|' });
S({ id: 'z_angle', name: 'Z Angle', unit: '°', group: 'Facial Profile',
  f: (N) => deg(Math.atan2(N.pog.y - N.ls.y, (N.ls.x - N.pog.x) || 0.001)),
  ov: (N) => [seg(...ext(N.pog, N.ls, 0.5)), seg({ x: N.pog.x - 40, y: N.pog.y }, { x: N.pog.x + 30, y: N.pog.y }, { dash: true }), ang({ x: N.pog.x - 40, y: N.pog.y }, N.pog, N.ls, { label: true })],
  desc: 'Angle between the chin‑to‑upper‑lip line and the Frankfort plane. Low values mean protruding lips or a weak chin.',
  how: 'angle between Frankfort plane and chin point → upper lip' });
S({ id: 'orbital_vector', name: 'Orbital Vector', unit: 'mm', group: 'Facial Profile',
  f: (N, c) => (N.or.x - N.cornea.x) * c.mm,
  ov: (N) => [seg(N.cornea, { x: N.cornea.x, y: N.or.y + 12 }, { dash: true }), hw({ x: N.cornea.x, y: N.or.y }, N.or, N.or.y, { label: true }), pt(N.cornea), pt(N.or)],
  desc: 'Whether the under‑eye rim sits in front of (positive) or behind (negative) the front of the eye.',
  how: '(under‑eye rim − eye front), horizontal, in mm' });
S({ id: 'convexity_g', name: 'Facial Convexity (Glabella)', unit: '°', group: 'Facial Profile',
  f: (N) => oriented(N.g, N.sn, N.pog), ov: (N) => [ang(N.g, N.sn, N.pog, { label: true })],
  desc: 'Profile straightness from brow to chin through the nose base. Lower = more convex (receding chin).',
  how: 'oriented angle glabella – subnasale – chin point' });
S({ id: 'convexity_n', name: 'Facial Convexity (Nasion)', unit: '°', group: 'Facial Profile',
  f: (N) => oriented(N.n, N.sn, N.pog), ov: (N) => [ang(N.n, N.sn, N.pog, { label: true })],
  desc: 'Profile straightness from the root of the nose to the chin.',
  how: 'oriented angle nasion – subnasale – chin point' });
S({ id: 'anterior_depth', name: 'Anterior Facial Depth', unit: '°', group: 'Facial Profile',
  f: (N) => angleAt(N.tragus, N.ac, N.exs), ov: (N) => [ang(N.tragus, N.ac, N.exs, { label: true })],
  desc: 'Angle at the nostril base between the ear and the outer eye corner — how far forward the midface sits.',
  how: 'angle ear canal – nostril base – outer eye corner' });
S({ id: 'nasal_tip_angle', name: 'Nasal Tip Angle', unit: '°', group: 'Nose',
  f: (N) => angleAt(N.st, N.prn, N.it), ov: (N) => [ang(N.st, N.prn, N.it, { label: true })],
  desc: 'How sharply the nose turns at the tip. Lower = a more defined tip.',
  how: 'angle supratip – nose tip – infratip' });
S({ id: 'nasofacial', name: 'Nasofacial Angle', unit: '°', group: 'Nose',
  f: (N) => angleAt(N.prn, N.n, N.pog), ov: (N) => [seg(N.n, N.pog, { dim: true }), seg(N.n, N.prn), ang(N.prn, N.n, N.pog, { label: true })],
  desc: 'Angle at the nasion between the nose and the line to the chin — how far the nose projects from the face.',
  how: 'angle nose tip – nasion – chin point' });
S({ id: 'nasomental', name: 'Nasomental Angle', unit: '°', group: 'Nose',
  f: (N) => angleAt(N.n, N.prn, N.pog), ov: (N) => [ang(N.n, N.prn, N.pog, { label: true })],
  desc: 'Angle at the nose tip between the bridge and the line to the chin.',
  how: 'angle nasion – nose tip – chin point' });
S({ id: 'frankfort_tip', name: 'Frankfort‑Tip Angle', unit: '°', group: 'Nose',
  f: (N) => Math.abs(deg(Math.atan2(N.sn.y - N.prn.y, (N.prn.x - N.sn.x) || 0.001))),
  ov: (N) => [seg(N.sn, N.prn, { label: true }), seg(N.sn, { x: N.prn.x + 12, y: N.sn.y }, { dash: true })],
  desc: 'Angle of the nose‑base‑to‑tip line against the Frankfort plane.',
  how: 'angle between Frankfort plane and subnasale → nose tip' });
S({ id: 'tip_rotation', name: 'Nose Tip Rotation Angle', unit: '°', group: 'Nose',
  f: (N) => deg(Math.atan2(N.sn.y - N.cm.y, (N.cm.x - N.sn.x) || 0.001)),
  ov: (N) => [seg(N.sn, N.cm, { label: true }), seg(N.sn, { x: N.cm.x + 12, y: N.sn.y }, { dash: true })],
  desc: 'How much the underside of the nose is turned up from the Frankfort plane. Men usually look best with modest rotation.',
  how: 'signed angle of subnasale → columella above the Frankfort plane' });
S({ id: 'nasolabial', name: 'Nasolabial Angle', unit: '°', group: 'Nose',
  f: (N) => angleAt(N.cm, N.sn, N.ls), ov: (N) => [ang(N.cm, N.sn, N.ls, { label: true })],
  desc: 'Angle between the underside of the nose and the upper lip.',
  how: 'angle columella – subnasale – upper lip' });
S({ id: 'nasal_projection', name: 'Nasal Projection', unit: 'x', group: 'Nose',
  f: (N) => Math.abs(N.prn.x - N.ac.x) / dist(N.n, N.prn),
  ov: (N) => [hw(N.ac, N.prn, N.prn.y, { label: true }), seg(N.n, N.prn, { dim: true })],
  desc: 'How far the tip projects in front of the nostril base, relative to nose length.',
  how: '(nose tip − nostril base, horizontal) ÷ |nasion → nose tip|' });
S({ id: 'nasal_wh', name: 'Nasal W to H Ratio', unit: 'x', group: 'Nose',
  f: (N) => Math.abs(N.prn.x - N.ac.x) / (Math.abs(N.prn.y - N.cornea.y) || 1),
  ov: (N) => [hw(N.ac, N.prn, N.prn.y, { label: true }), vh(N.cornea, N.prn, N.ac.x - 6, { dim: true })],
  desc: 'How far the nose reaches forward compared with the height from the eye to the nose tip.',
  how: '(nose tip − nostril base, horizontal) ÷ (nose tip − eye front, vertical)' });
S({ id: 'mentolabial', name: 'Mentolabial Angle', unit: '°', group: 'Lips',
  f: (N) => angleAt(N.li, N.sm, N.pog), ov: (N) => [ang(N.li, N.sm, N.pog, { label: true })],
  desc: 'Angle of the fold between the lower lip and the chin. Too open looks flat; too closed looks strained.',
  how: 'angle lower lip – lip‑chin fold – chin point' });
S({ id: 'holdaway', name: 'Holdaway H Line', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.li, N.ls, N.pog, c), ov: (N) => lineOv(N.ls, N.pog, N.li, true),
  desc: 'Lower lip distance from the line joining the upper lip and the chin (negative = in front of it).',
  how: 'signed distance of lower lip from upper lip → chin line, in mm' });
const sMid = (N) => mid(N.sn, N.prn);
S({ id: 's_lower', name: 'Lower Lip S‑Line Position', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.li, sMid(N), N.pog, c), ov: (N) => lineOv(sMid(N), N.pog, N.li, true),
  desc: 'Steiner S‑line (mid‑nose base to chin). Negative = lip in front of the line.',
  how: 'signed distance of lower lip from the S‑line, in mm' });
S({ id: 'b_lower', name: 'Lower Lip Burstone Line', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.li, N.sn, N.pog, c), ov: (N) => lineOv(N.sn, N.pog, N.li, true),
  desc: 'Burstone line (nose base to chin). Negative = lip in front of the line.',
  how: 'signed distance of lower lip from subnasale → chin line, in mm' });
S({ id: 'e_upper', name: 'Upper Lip E‑Line Position', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.ls, N.prn, N.pog, c), ov: (N) => lineOv(N.prn, N.pog, N.ls, true),
  desc: 'Ricketts E‑line (nose tip to chin). Positive = upper lip behind the line.',
  how: 'signed distance of upper lip from nose tip → chin line, in mm' });
S({ id: 'e_lower', name: 'Lower Lip E‑Line Position', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.li, N.prn, N.pog, c), ov: (N) => lineOv(N.prn, N.pog, N.li, true),
  desc: 'Ricketts E‑line for the lower lip. Positive = behind the line.',
  how: 'signed distance of lower lip from nose tip → chin line, in mm' });
S({ id: 's_upper', name: 'Upper Lip S‑Line Position', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.ls, sMid(N), N.pog, c), ov: (N) => lineOv(sMid(N), N.pog, N.ls, true),
  desc: 'Steiner S‑line for the upper lip. Negative = in front of the line.',
  how: 'signed distance of upper lip from the S‑line, in mm' });
S({ id: 'b_upper', name: 'Upper Lip Burstone Line', unit: 'mm', group: 'Lips',
  f: (N, c) => lineDist(N.ls, N.sn, N.pog, c), ov: (N) => lineOv(N.sn, N.pog, N.ls, true),
  desc: 'Burstone line for the upper lip. Negative = in front of the line.',
  how: 'signed distance of upper lip from subnasale → chin line, in mm' });
S({ id: 'gonial', name: 'Gonial Angle', unit: '°', group: 'Jaw',
  f: (N) => angleAt(N.ramus, N.go, N.me), ov: (N) => [ang(N.ramus, N.go, N.me, { label: true })],
  desc: 'Angle of the jaw corner seen from the side. Sharper (lower) angles give a more chiselled jaw.',
  how: 'angle ear notch – jaw angle – chin bottom' });
const chinVert = (N) => isect(N.go, N.me, N.pog, { x: N.pog.x, y: N.pog.y + 1 }) || N.me;
S({ id: 'ramus_mandible', name: 'Ramus to Mandible Ratio', unit: 'x', group: 'Jaw',
  f: (N) => dist(N.tragus, N.go) / (dist(N.go, chinVert(N)) || 1),
  ov: (N) => [seg(N.tragus, N.go, { label: true }), seg(N.go, chinVert(N), { dim: true }), vh(N.pog, chinVert(N), N.pog.x, { dash: true, ticks: false })],
  desc: 'Height of the back of the jaw compared with jaw length. A taller ramus gives a more defined jaw angle.',
  how: '|ear canal → jaw angle| ÷ |jaw angle → chin vertical|' });
S({ id: 'mpa', name: 'Mandibular Plane Angle', unit: '°', group: 'Jaw',
  f: (N) => deg(Math.atan2(Math.abs(N.me.y - N.go.y), Math.abs(N.me.x - N.go.x) || 0.001)),
  ov: (N) => [seg(...ext(N.go, N.me, 0.2)), seg({ x: N.go.x - 20, y: N.go.y }, { x: N.me.x + 20, y: N.go.y }, { dash: true }), ang({ x: N.me.x, y: N.go.y }, N.go, N.me, { label: true })],
  desc: 'Steepness of the lower jaw border against the Frankfort plane. Flatter angles look more defined.',
  how: 'angle of jaw angle → chin bottom against the Frankfort horizontal' });
S({ id: 'gonion_mouth', name: 'Gonion to Mouth Line', unit: 'mm', group: 'Jaw',
  f: (N, c) => (N.go.y - N.sto.y) * c.mm,
  ov: (N) => [seg({ x: N.go.x - 20, y: N.sto.y }, { x: N.sto.x, y: N.sto.y }, { dash: true }), vh({ x: N.go.x, y: N.sto.y }, N.go, N.go.x, { label: true }), pt(N.go)],
  desc: 'How far the jaw angle sits below the level of the mouth.',
  how: '(jaw angle − mouth line), vertical, in mm' });
S({ id: 'fh_recession', name: 'Recession Relative to Frankfort Plane', unit: 'mm', group: 'Jaw',
  f: (N, c) => (N.pog.x - N.n.x) * c.mm,
  ov: (N) => [vh(N.n, { x: N.n.x, y: N.pog.y }, N.n.x, { dash: true, ticks: false }), hw({ x: N.n.x, y: N.pog.y }, N.pog, N.pog.y, { label: true })],
  desc: 'How far the chin sits in front of (positive) or behind (negative) the nasion, with the head level.',
  how: '(chin point − nasion), horizontal, in mm' });
S({ id: 'submental', name: 'Submental Cervical Angle', unit: '°', group: 'Other',
  f: (N) => angleAt(N.me, N.c, N.neck), ov: (N) => [ang(N.me, N.c, N.neck, { label: true })],
  desc: 'Angle between the underside of the chin and the front of the neck. A sharp angle means a defined jawline from the side.',
  how: 'angle chin bottom – neck‑chin point – front of neck' });

export const METRICS = M;
export const METRIC_BY_ID = Object.fromEntries(M.map((m) => [m.id, m]));

// ───────────────────────── norms & weights ─────────────────────────
const EXTRA_NORMS = {
  symmetry: { lo: 0, hi: 1.2, s: 1.6, mu: 1.7, sd: 0.9 },
  cheek_lean: { lo: 78, hi: 88, s: 7, mu: 86, sd: 4.5 },
  ...(AGG.look || {}),
};
for (const m of M) {
  const n = FIQ_NORMS[m.id] || EXTRA_NORMS[m.id] || { lo: 0, hi: 0, s: 1, mu: 0, sd: 1 };
  // weight: FaceIQ's importance × how reliably the measurement agrees with FaceIQ's (AGG.rel); photo
  // measurements carry AGG.lookK on top
  const w = (AGG.w[m.id] ?? 1) * (AGG.rel?.[m.id] ?? 1) * (m.look ? AGG.lookK ?? 1 : 1);
  // s: FaceIQ's fall-off width, widened by our measurement noise (AGG.sEff) so that noise alone doesn't pull a
  // ratio that truly sits in its ideal range down; s0 keeps FaceIQ's own width
  const sEff = AGG.sEff?.[m.id] ?? n.s;
  Object.assign(m, { lo: n.lo, hi: n.hi, s: sEff, s0: n.s, sig: sEff, mean: n.mu, sd: n.sd, w: +w.toFixed(3), baseW: AGG.w[m.id] ?? 1, rel: AGG.rel?.[m.id] ?? 1 });
}
// Which profile points each side metric reads (recorded by running it on a recording stand-in), so a metric
// can be left out when one of its points is hidden in the photo.
for (const m of M) {
  if (m.view !== 'side') continue;
  const used = new Set();
  const N = new Proxy({}, { get: (_, k) => { if (typeof k === 'string') used.add(k); return { x: Math.random() * 100, y: Math.random() * 100 }; } });
  const c = new Proxy({}, { get: () => 1 });
  try { m.f(N, c); } catch { /* only the reads matter */ }
  m.deps = [...used];
}

// ───────────────────────── scoring ─────────────────────────
export function scoreValue(m, v, lo = m.lo, hi = m.hi) {
  if (!Number.isFinite(v)) return 0;
  const d = v < lo ? lo - v : v > hi ? v - hi : 0;
  return 10 * Math.exp(-((d / m.s) ** 2));
}

export function fmt(m, v) {
  if (!Number.isFinite(v)) return '—';
  if (m.unit === 'x') return v.toFixed(2) + 'x';
  if (m.unit === '%') return v.toFixed(1) + '%';
  if (m.unit === 'mm') return v.toFixed(2) + 'mm';
  return v.toFixed(1) + '°';
}
// r: an analysed value ({ lo, hi }) — the ideal range that applied to this face
export const fmtRange = (m, r) => {
  const f = (v) => (m.unit === 'x' || m.unit === 'mm' ? v.toFixed(2) : String(+v.toFixed(1)));
  return `${f(r?.lo ?? m.lo)}–${f(r?.hi ?? m.hi)}${m.unit}`;
};
// Position of value along the bar [0..1] and the ideal band
export function barGeom(m, r) {
  const lo = r?.lo ?? m.lo, hi = r?.hi ?? m.hi, span = hi - lo;
  const a = lo - Math.max(m.s * 1.8, span * 0.5), b = hi + Math.max(m.s * 1.8, span * 0.5);
  const at = (v) => clamp((v - a) / (b - a), 0, 1);
  return { a, b, at, lo: at(lo), hi: at(hi), loW: at(lo - m.s * 0.6), hiW: at(hi + m.s * 0.6) };
}

// FaceIQ's rating words for the 0–10 population scale
export function rating(s) {
  if (s >= 9.5) return 'Near Perfection';
  if (s >= 9) return 'Approaching Perfection';
  if (s >= 8.5) return 'Outstanding';
  if (s >= 8) return 'Exceptional';
  if (s >= 7.5) return 'Excellent';
  if (s >= 7) return 'Great';
  if (s >= 6.5) return 'Very Good';
  if (s >= 6) return 'Good';
  if (s >= 5.5) return 'Slightly Above Average';
  if (s >= 5) return 'Average';
  if (s >= 4) return 'Below Average';
  return 'Poor';
}
export function scoreColor(s) {
  if (s >= 7) return 'var(--good)';
  if (s >= 5.5) return 'var(--ok)';
  if (s >= 4) return 'var(--warn)';
  return 'var(--bad)';
}
// Words for a single ratio's 0–10 score (10 = inside the ideal range)
export function ratioLabel(s) {
  if (s >= 9.5) return 'Ideal';
  if (s >= 8) return 'Close to ideal';
  if (s >= 6) return 'Slightly off';
  if (s >= 3.5) return 'Off';
  return 'Far off';
}
// Same scale as ratioColor, as solid colours bright enough for lines drawn on a photo (canvas can't use CSS vars)
export function ratioHex(s) {
  if (!Number.isFinite(s)) return '#9aa3ae';
  if (s >= 9) return '#3ddc97';
  if (s >= 7) return '#a8d84e';
  if (s >= 4.5) return '#f5b544';
  return '#ff6b5e';
}
export function scoreHex(s) {
  if (!Number.isFinite(s)) return '#9aa3ae';
  if (s >= 7) return '#3ddc97';
  if (s >= 5.5) return '#a8d84e';
  if (s >= 4) return '#f5b544';
  return '#ff6b5e';
}
// Individual ratios score 10 inside their ideal range, so they use a stricter colour scale
export function ratioColor(s) {
  if (s >= 9) return 'var(--good)';
  if (s >= 7) return 'var(--ok)';
  if (s >= 4.5) return 'var(--warn)';
  return 'var(--bad)';
}

// ───────────────────────── assessments & pillars ─────────────────────────
// w = the assessment's share of its pillar. Shares follow eye-tracking studies (the central triangle of eyes,
// nose and mouth draws most attention) and conjoint studies of male faces (jaw and brow prominence outweigh
// cheekbones and eye size); larger regions outweigh small peripheral ones.
const A = (id, name, metrics, desc, w) => ({ id, name, metrics, desc, w });
export const PILLARS = [
  { id: 'harmony', name: 'Harmony', blurb: 'How closely your proportions fall inside their ideal ranges — 33 front and 33 side ratios, 70% front and 30% side.' },
  { id: 'angularity', name: 'Angularity', blurb: 'How sharp and defined your bone structure reads: cheekbones, jaw, chin and the area under the jaw.',
    items: [
      A('cheekbones', 'Cheekbone Prominence', [['cheekbone_height', 2], ['bitemporal', 1], ['orbital_vector', 1], ['midface_proj', 1]], 'High, forward cheekbones that are wider than the temples.', 0.2),
      A('cheek_lean', 'Cheek Leanness', [['cheek_lean', 2], ['bigonial', 1], ['fwhr', 1]], 'How much the face narrows from the cheekbones to the jaw corners.', 0.16),
      A('jaw_def', 'Jaw Definition', [['gonial', 2], ['jaw_slope', 2], ['jfa', 1], ['mpa', 1], ['ramus_mandible', 1]], 'A crisp jaw angle and a flat, well‑defined lower border.', 0.28),
      A('chin_def', 'Chin Definition', [['chin_philtrum', 2], ['fh_recession', 2], ['mentolabial', 1], ['z_angle', 1]], 'A tall, forward chin with a clear fold under the lip.', 0.2),
      A('submental', 'Submental Definition', [['submental', 3], ['mpa', 1], ['gonion_mouth', 1]], 'A sharp angle under the chin and a defined neck–jaw transition.', 0.16),
    ] },
  { id: 'dimorphism', name: 'Dimorphism', blurb: 'How strongly your features show male‑typical traits.',
    items: [
      A('d_jaw', 'Jaw', [['bigonial', 2], ['gonial', 1], ['ramus_mandible', 1], ['jaw_slope', 1]], 'Wide jaw, tall ramus, sharp angle.', 0.2),
      A('d_brow', 'Brows & Brow Ridge', [['brow_low_set', 2], ['brow_eye_gap', 2], ['brow_density', 2], ['brow_thickness', 1], ['browridge_incl', 1], ['nasofrontal', 1]], 'Low, dark, full brows over a projecting brow ridge.', 0.18),
      A('d_shape', 'Face Shape', [['fwhr', 2], ['total_wh', 1], ['midface_ratio', 1]], 'Wide, compact face proportions.', 0.14),
      A('d_eyes', 'Eyes', [['canthal_tilt', 1], ['eye_ar', 2], ['iris_exposure', 1]], 'Narrow, horizontally long eyes with positive tilt and lids close to the iris.', 0.08),
      A('d_nose', 'Nose', [['icd_nose', 1], ['nasal_projection', 1], ['nasal_wh', 1]], 'A proportionate, well‑projected nose.', 0.07),
      A('d_hair', 'Hairline', [['top_third', 2], ['browridge_incl', 1]], 'Forehead height and slope.', 0.04),
      A('d_lips', 'Lips', [['lip_ratio', 1], ['lip_fullness', 1], ['e_lower', 1], ['e_upper', 1]], 'Moderate lip fullness and projection.', 0.04),
      A('d_chin', 'Chin', [['chin_philtrum', 2], ['fh_recession', 1]], 'A tall, projecting chin.', 0.12),
      A('d_cheek', 'Cheekbones', [['cheekbone_height', 1], ['bitemporal', 1]], 'High cheekbones.', 0.07),
      A('d_neck', 'Neck', [['neck_width', 2], ['submental', 1]], 'A thick neck and sharp neck–chin angle.', 0.06),
    ] },
  { id: 'features', name: 'Features', blurb: 'Feature‑by‑feature assessment of eyes, brows, nose, lips, jaw, chin, cheeks, forehead, hairline, ears and symmetry — from the landmarks and, for brows, eye openness, lips and hairline, from the photo itself. (Skin is not assessed.)',
    items: [
      A('f_eyes', 'Eyes', [['canthal_tilt', 2], ['eye_ar', 2], ['one_eye_apart', 1], ['esr', 1], ['orbital_vector', 1], ['brow_eye_gap', 1], ['iris_exposure', 1], ['scleral_show', 1]], 'Shape, tilt and spacing of the eyes, how open they are and how closely the brows frame them.', 0.2),
      A('f_brows', 'Eyebrows', [['brow_low_set', 2], ['brow_tilt', 1], ['brow_length', 1], ['brow_density', 2], ['brow_thickness', 1], ['brow_tail_reach', 1]], 'Position, tilt and length of the brows, and how full and dark they are in the photo.', 0.12),
      A('f_nose', 'Nose', [['icd_nose', 1], ['bridge_nose', 1], ['nose_tip_pos', 1], ['nasofrontal', 1], ['nasolabial', 1], ['nasal_projection', 1], ['nasal_tip_angle', 1], ['tip_rotation', 1], ['nasofacial', 1], ['nasomental', 1]], 'Width, bridge, projection and angles of the nose.', 0.15),
      A('f_lips', 'Lips', [['lip_ratio', 1], ['lip_fullness', 1], ['cupid_depth', 1], ['mouth_corner', 1], ['mouth_nose', 1], ['ipd_mouth', 1], ['e_upper', 1], ['e_lower', 1], ['s_upper', 1], ['s_lower', 1]], 'Lip proportions and position against profile lines.', 0.13),
      A('f_jaw', 'Jaw', [['gonial', 2], ['bigonial', 2], ['jfa', 1], ['jaw_slope', 1], ['mpa', 1], ['ramus_mandible', 1], ['gonion_mouth', 1]], 'Jaw width, angle and slope.', 0.14),
      A('f_chin', 'Chin', [['chin_philtrum', 2], ['fh_recession', 2], ['mentolabial', 1], ['holdaway', 1], ['z_angle', 1]], 'Chin height and projection.', 0.09),
      A('f_cheeks', 'Cheeks', [['cheekbone_height', 2], ['cheek_lean', 1]], 'Cheekbone height and lower‑face taper.', 0.07),
      A('f_forehead', 'Forehead', [['top_third', 2], ['bitemporal', 1], ['browridge_incl', 1], ['upper_forehead', 1]], 'Forehead height, width and slope.', 0.04),
      A('f_hair', 'Hairline', [['temple_recession', 2], ['top_third', 1]], 'A full, straight hairline at a normal height.', 0.03),
      A('f_ears_neck', 'Ears & Neck', [['ear_angle', 1], ['ear_ratio', 1], ['neck_width', 1], ['submental', 1]], 'Ear protrusion and neck build.', 0.02),
      A('f_sym', 'Symmetry', [['symmetry', 2], ['iaa_jfa_dev', 1]], 'Left–right balance and midline alignment.', 0.06),
    ] },
];
// Overall = power mean of the four pillars with a very small exponent (≈ geometric mean), as FaceIQ does
export const PILLAR_WEIGHTS = { harmony: 0.25, angularity: 0.25, dimorphism: 0.25, features: 0.25 };

// ───────────────────────── scale ─────────────────────────
// FaceIQ's population scale: 5 = average, 7.0 ≈ 94th percentile, 8.0 ≈ 99.6th, symmetric rarity.
// Piecewise in z: ±1.286 points per SD up to ±2 points, then ±0.913 per SD.
export const POP = { mean: 5, sd: 1.286 };
const toZ = (s) => { const d = s - 5, a = Math.abs(d); return Math.sign(d) * (a <= 2 ? a / 1.286 : 1.555 + (a - 2) / 0.913); };
export function percentile(s) {
  const z = toZ(s);
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p * 100;
}
// "Higher than X% of men": whole percent, with a decimal near the top so 99.6% doesn't read as 100%
export const pctText = (p) => (p >= 99 ? Math.min(99.9, p).toFixed(1) : p <= 1 ? Math.max(0.1, p).toFixed(1) : p.toFixed(0));
const show = (raw, [a, b]) => clamp(a + b * raw, 0, 10);
const PILLAR_MAP = AGG.pillar || {};
// Front/side Harmony maps: fitted on the FaceIQ benchmark when available, else FaceIQ's published examples
const VIEW_MAP = { front: AGG.view?.front || [AGG.A, AGG.B], side: AGG.view?.side || [AGG.A, AGG.B] };

// Weighted power mean; p < 1 leans on the weaker items, p → 0 is the geometric mean.
function powerMean(items, p) {
  const it = items.filter((x) => Number.isFinite(x.s) && x.w > 0);
  const W = it.reduce((a, x) => a + x.w, 0);
  if (!W) return NaN;
  if (Math.abs(p) < 1e-3) return Math.exp(it.reduce((a, x) => a + x.w * Math.log(Math.max(0.05, x.s)), 0) / W);
  return Math.pow(it.reduce((a, x) => a + x.w * Math.pow(Math.max(0.05, x.s), p), 0) / W, 1 / p);
}

// Ratio scores for one set of ideal ranges
function valuesFor(raw, set) {
  const R = set ? RANGE_SETS[set] || {} : {};
  const values = {};
  for (const m of M) {
    const [lo, hi] = R[m.id] || [m.lo, m.hi];
    values[m.id] = { v: raw[m.id], s: scoreValue(m, raw[m.id], lo, hi), lo, hi };
  }
  return values;
}
const harmonyOf = (values, hmList) => {
  const item = (m) => ({ s: values[m.id].s, w: Number.isFinite(values[m.id].v) ? m.w : 0 });
  const view = (v) => powerMean(hmList.filter((m) => m.view === v).map(item), AGG.p);
  const f = view('front'), sd = view('side');
  return { f, sd, h: AGG.front * show(f, VIEW_MAP.front) + AGG.side * show(sd, VIEW_MAP.side) };
};
export const RANGE_SET_IDS = Object.keys(RANGE_SETS);

// Pure scoring from raw measurement values ({id: number}) — used by analyze, Simulate and calibration.
// FaceIQ adjusts its ideal ranges for ethnicity; GGFacelon doesn't ask, so every face is scored against
// each of FaceIQ's range sets and the best-fitting set is used throughout (opts.set forces one).
export function scoreValues(raw, opts = {}) {
  const hmList = M.filter((m) => m.hm);
  // Every set is tried; each set's average Harmony on the benchmark is subtracted first, so the choice goes to
  // the set this face fits unusually well rather than to whichever set is most lenient (AGG.setBias).
  const setBias = AGG.setBias || {};
  let rangeSet = opts.set || null, values = null, hb = null, bestKey = -Infinity;
  for (const set of opts.set ? [opts.set] : RANGE_SET_IDS.length ? RANGE_SET_IDS : [null]) {
    const v = valuesFor(raw, set), hh = harmonyOf(v, hmList);
    const key = hh.h - (setBias[set] || 0);
    if (key > bestKey + 1e-9) { bestKey = key; hb = hh; values = v; rangeSet = set; }
  }
  const item = (id, w) => ({ s: values[id].s, w: Number.isFinite(values[id].v) ? w : 0 });
  // pillar from its assessments; view = 'front' | 'side' keeps only that photo's measurements
  const pillarOf = (p, view) => {
    const items = p.items.map((a) => {
      const ms = a.metrics.filter(([id]) => !view || METRIC_BY_ID[id].view === view);
      return { ...a, score: ms.length ? powerMean(ms.map(([id, w]) => item(id, w * METRIC_BY_ID[id].w)), AGG.p) : NaN };
    });
    return { raw: powerMean(items.map((a) => ({ s: a.score, w: a.w })), AGG.p), items };
  };
  const pillars = {}, rawP = {};
  rawP.front = hb.f; rawP.side = hb.sd;
  const front = show(rawP.front, VIEW_MAP.front), side = show(rawP.side, VIEW_MAP.side);
  pillars.harmony = { score: AGG.front * front + AGG.side * side, front, side, raw: rawP, items: hmList.map((m) => m.id) };
  for (const p of PILLARS.slice(1)) {
    const { raw: r, items } = pillarOf(p);
    rawP[p.id] = r;
    pillars[p.id] = { score: show(r, PILLAR_MAP[p.id] || [AGG.A, AGG.B]), raw: r, items };
  }
  // Geometric mean of the pillars (FaceIQ), then stretched so the benchmark keeps FaceIQ's spread of scores
  const gm = powerMean(Object.entries(PILLAR_WEIGHTS).map(([k, w]) => ({ s: pillars[k].score, w })), 0);
  const overall = AGG.overall ? show(gm, AGG.overall) : gm;
  // Front profile and side profile on their own: the same four pillars from one photo's measurements only,
  // each mapped onto the same scale (AGG.byView), so either can be read like the overall score.
  const views = {};
  for (const view of ['front', 'side']) {
    const BV = AGG.byView?.[view] || {};
    const v = { harmony: view === 'front' ? front : side, raw: {} };
    for (const p of PILLARS.slice(1)) {
      const r = pillarOf(p, view).raw;
      v.raw[p.id] = r;
      v[p.id] = Number.isFinite(r) ? show(r, BV[p.id] || PILLAR_MAP[p.id] || [AGG.A, AGG.B]) : NaN;
    }
    const g = powerMean(['harmony', 'angularity', 'dimorphism', 'features'].map((k) => ({ s: v[k], w: 1 })), 0);
    v.rawGm = g;
    v.score = show(g, BV.overall || AGG.overall || [0, 1]);
    views[view] = v;
  }
  return { values, pillars, overall, rawOverall: overall, percentile: percentile(overall), rangeSet, views };
}

// ───────────────────────── run analysis ─────────────────────────
// Scans saved before supratip, infratip and the profile eye corner existed: estimate them from the rest
function withDerivedSide(side) {
  if (side.st && side.it && side.exs) return side;
  const s = { ...side, _derived: true }, f = Math.sign(s.prn.x - s.tragus.x) || 1, H = Math.abs(s.me.y - s.n.y) || 1;
  const noseL = dist(s.n, s.prn), toward = (a, b, d) => { const l = dist(a, b) || 1; return lerp(a, b, d / l); };
  if (!s.st) s.st = toward(s.prn, s.n, noseL * 0.12);
  if (!s.it) s.it = toward(s.prn, s.sn, noseL * 0.1);
  if (!s.exs) s.exs = { x: s.cornea.x - f * H * 0.1, y: s.cornea.y };
  return s;
}

// look: the appearance measurements saved with the scan ({ v: {id: value}, hidden: [profile point ids] })
// opts.raw: skip the convention offsets (the benchmark fits them from raw values)
export function measure(front, side, look = null, opts = {}) {
  side = withDerivedSide(side);
  const ff = frontFrame(front), sf = sideFrame(side);
  const fc = frontCtx(ff.N);
  // Side millimetres: carry the front photo's 190 mm hairline-to-chin scale over via nasion → menton
  const nmF = ff.N.me.y - ff.N.nasion.y, nmS = sf.N.me.y - sf.N.n.y;
  const sc = sideCtx(sf.N, nmS > 0 && nmF > 0 ? fc.mm * (nmF / nmS) : null);
  const L = look?.v || null;
  const hidden = new Set(look?.hidden || []);
  const raw = {};
  for (const m of M) {
    const N = m.view === 'front' ? ff.N : sf.N;
    const c = m.view === 'front' ? fc : sc;
    let v;
    try { v = m.f(N, c, L); } catch { v = NaN; }
    if (v == null) v = NaN;
    // a profile point under hair (e.g. a fringe over the forehead) can't be measured: leave its metrics out
    if (m.deps && m.deps.some((k) => hidden.has(k))) v = NaN;
    // convention offsets: FaceIQ places some interior profile points differently (fitted on its benchmark)
    if (Number.isFinite(v) && AGG.shift?.[m.id] && !opts.raw) v -= AGG.shift[m.id];
    raw[m.id] = v;
  }
  // an estimated supratip/infratip can't give a meaningful tip angle — leave it out for older scans
  if (side._derived) raw.nasal_tip_angle = NaN;
  return { raw, ff, fc, sf, sc, hidden: [...hidden] };
}

export function analyze(front, side, meta = {}) {
  const { raw, ff, fc, sf, sc, hidden } = measure(front, side, meta.appearance);
  return { ...scoreValues(raw), quality: quality(front, side, ff, fc, sf, sc, { ...meta, hidden }), frames: { front: ff, side: sf }, mm: { front: fc.mm, side: sc.mm }, look: meta.appearance || null };
}

// Photo / pose checks. These only warn — the measurements stay ratio‑based either way.
function quality(front, side, ff, fc, sf, sc, meta) {
  const out = [];
  const fh = meta.frontSize, sh = meta.sideSize;
  if (fh) {
    const faceFrac = fc.faceH / fh.h;
    if (faceFrac < 0.22) out.push({ level: 'warn', view: 'front', text: `Face fills only ${(faceFrac * 100).toFixed(0)}% of the photo height. Crop closer or retake so points can be placed precisely.` });
    else out.push({ level: 'ok', view: 'front', text: `Face size ${(faceFrac * 100).toFixed(0)}% of frame — good for precise landmarks.` });
    if (fc.ipd < 55) out.push({ level: 'warn', view: 'front', text: `Low resolution: only ${fc.ipd.toFixed(0)} px between the pupils. One pixel of error shifts ratios by ~${(100 / fc.ipd).toFixed(1)}%.` });
  }
  if (Math.abs(ff.roll) > 4) out.push({ level: 'info', view: 'front', text: `Head tilted ${ff.roll.toFixed(1)}° — corrected automatically.` });
  const yaw = (ff.N.sn.x - fc.midX) / (fc.bizyg / 2);
  const halfR = fc.midX - ff.N.zy_r.x, halfL = ff.N.zy_l.x - fc.midX;
  const halfDiff = Math.abs(halfR - halfL) / ((halfR + halfL) / 2);
  if (Math.abs(yaw) > 0.07 || halfDiff > 0.12) out.push({ level: 'warn', view: 'front', text: 'Head looks turned to one side. Width ratios may be off by a few percent — retake facing the camera straight on.' });
  else out.push({ level: 'ok', view: 'front', text: 'Head is facing straight on.' });
  if (sh) {
    const faceFrac = sc.H / sh.h;
    if (faceFrac < 0.15) out.push({ level: 'warn', view: 'side', text: 'Profile face is small in the frame — crop closer for better precision.' });
  }
  if (meta.hidden?.length) {
    const what = meta.hidden.includes('g') ? 'Hair covers the forehead and brow ridge' : 'Hair covers the upper forehead';
    const n = M.filter((m) => m.deps && m.deps.some((k) => meta.hidden.includes(k))).length;
    out.push({ level: 'warn', view: 'side', text: `${what} in the profile photo, so ${n} angle${n === 1 ? '' : 's'} there can’t be measured and ${n === 1 ? 'is' : 'are'} left out. Push the hair back for a complete profile.` });
  }
  if (Math.abs(sf.tilt) > 14) out.push({ level: 'warn', view: 'side', text: `Frankfort plane is ${sf.tilt.toFixed(0)}° off level. Angles are measured against it, but double‑check the ear‑canal and under‑eye points.` });
  else out.push({ level: 'ok', view: 'side', text: `Profile levelled to the Frankfort plane (${sf.tilt >= 0 ? '+' : ''}${sf.tilt.toFixed(1)}°).` });
  return out;
}

// Overlay primitives for one metric on a finished analysis
export function overlayFor(m, res) {
  const fr = res.frames[m.view];
  const c = m.view === 'front' ? frontCtx(fr.N) : sideCtx(fr.N, res.mm?.side);
  let prims = [];
  try { prims = m.ov(fr.N, c); } catch { prims = []; }
  return { prims, inv: fr.inv };
}

// Every metric an assessment depends on, with values
export function assessmentDetail(a, res) {
  return a.metrics.map(([id, w]) => ({ m: METRIC_BY_ID[id], w, ...res.values[id] }));
}
