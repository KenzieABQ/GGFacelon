// Facial analysis engine.
//
// Consistency rules
//  • Every measurement is a ratio or an angle, so it does not depend on photo size or camera distance.
//  • Frontal points are rotated so the pupils sit on a horizontal line (removes head roll).
//  • Profile points are mirrored to face right and rotated onto the Frankfort horizontal
//    (ear canal → under‑eye rim), so head tilt in the photo does not change the angles.
//  • Scores are a deterministic function of the landmarks: same points → same result.

import { mid, dist, avg, angleAt, angleBetween, rotate, DEG, clamp } from './geom.js';

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
const ys = (...ps) => ps.reduce((a, p) => a + p.y, 0) / ps.length;
// signed forward distance of P from line A→B (A above B); positive = in front of the line (profile, facing +x)
function fwdDist(P, A, B) {
  const bx = B.x - A.x, by = B.y - A.y, px = P.x - A.x, py = P.y - A.y;
  return -(bx * py - by * px) / (Math.hypot(bx, by) || 1);
}
// y of a polyline (brow) at a given x
function polyY(pts, x) {
  const s = [...pts].sort((a, b) => a.x - b.x);
  if (x <= s[0].x) return s[0].y;
  for (let i = 0; i < s.length - 1; i++) {
    if (x <= s[i + 1].x) {
      const t = (x - s[i].x) / ((s[i + 1].x - s[i].x) || 1);
      return s[i].y + (s[i + 1].y - s[i].y) * t;
    }
  }
  return s[s.length - 1].y;
}
const proj = (p, q) => ({ x: p.x, y: q.y });
function isect(a, b, c, d) {
  const x1 = b.x - a.x, y1 = b.y - a.y, x2 = d.x - c.x, y2 = d.y - c.y;
  const den = x1 * y2 - y1 * x2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * y2 - (c.y - a.y) * x2) / den;
  return { x: a.x + x1 * t, y: a.y + y1 * t };
}
const slope = (a, b) => deg(Math.atan2(b.y - a.y, Math.abs(b.x - a.x)));

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
  const pairs = ['pupil', 'endo', 'exo', 'brI', 'ala', 'ch', 'zy', 'go', 'cupid'];
  const midX = avg(pairs.map((k) => mid(N[k + '_r'], N[k + '_l']))).x;
  const browY = ys(N.brI_r, N.brP_r, N.brT_r, N.brI_l, N.brP_l, N.brT_l);
  const eyeW_r = dist(N.endo_r, N.exo_r), eyeW_l = dist(N.endo_l, N.exo_l);
  const eyeH_r = N.lidL_r.y - N.lidU_r.y, eyeH_l = N.lidL_l.y - N.lidU_l.y;
  const c = {
    midX, browY,
    bizyg: N.zy_l.x - N.zy_r.x,
    bigon: N.go_l.x - N.go_r.x,
    bitemp: N.temple_l.x - N.temple_r.x,
    ipd: N.pupil_l.x - N.pupil_r.x,
    icd: N.endo_l.x - N.endo_r.x,
    eyeW: (eyeW_r + eyeW_l) / 2, eyeW_r, eyeW_l,
    eyeH: (eyeH_r + eyeH_l) / 2, eyeH_r, eyeH_l,
    noseW: N.ala_l.x - N.ala_r.x,
    bridgeW: N.bridge_l.x - N.bridge_r.x,
    mouthW: N.ch_l.x - N.ch_r.x,
    neckW: N.neck_l.x - N.neck_r.x,
    earW: N.ear_l.x - N.ear_r.x,
    cheekW: N.cheek_l.x - N.cheek_r.x,
    faceH: N.me.y - N.trichion.y,
    upper: browY - N.trichion.y,
    middle: N.sn.y - browY,
    lower: N.me.y - N.sn.y,
    alarMid: mid(N.ala_r, N.ala_l),
  };
  c.total = c.upper + c.middle + c.lower;
  return c;
}

function sideCtx(N) {
  const H = N.me.y - N.n.y; // nasion → menton height along the Frankfort normal
  const lip = N.ls.x >= N.li.x ? N.ls : N.li;
  return { H, lip };
}

// ───────────────────────── metric definitions ─────────────────────────
// lo/hi: ideal male range. sig: how fast the score falls outside the range (in metric units).
// w: weight inside Harmony. hm:false keeps a metric out of the Harmony ratio list.
const M = [];
const F = (o) => M.push({ view: 'front', w: 1, hm: true, ...o });
const S = (o) => M.push({ view: 'side', w: 1, hm: true, ...o });

// ── FRONT ──
F({ id: 'middle_third', name: 'Middle Third', unit: '%', lo: 31.5, hi: 34.5, sig: 1.4, w: 1.5,
  f: (N, c) => (c.middle / (c.middle + c.lower)) * (200 / 3),
  ov: (N, c) => [vh({ x: 0, y: c.browY }, N.sn, c.midX), hw(N.brI_r, N.brI_l, c.browY, { dash: true }), hw(N.ala_r, N.ala_l, N.sn.y, { dash: true }), lab({ x: c.midX + c.ipd * 0.12, y: (c.browY + N.sn.y) / 2 })],
  desc: 'Height from the middle of the brows to the base of the nose, on the facial‑thirds scale (33.3% = one equal third). Measured against brow‑to‑chin so a covered or receding hairline doesn’t distort it.',
  how: '(nose base − brow line) ÷ (chin − brow line) × 66.7' });

F({ id: 'one_eye_apart', name: 'One Eye Apart Test', unit: 'x', lo: 0.93, hi: 1.04, sig: 0.07,
  f: (N, c) => c.icd / c.eyeW,
  ov: (N, c) => [hw(N.endo_r, N.endo_l, N.endo_r.y, { label: true }), hw(N.exo_r, N.endo_r, N.endo_r.y - c.eyeH * 1.4, { dim: true }), hw(N.endo_l, N.exo_l, N.endo_l.y - c.eyeH * 1.4, { dim: true })],
  desc: 'Gap between the inner eye corners compared with the width of one eye. Ideally the eyes are one eye‑width apart.',
  how: 'inner‑corner distance ÷ average eye width (inner to outer corner)' });

F({ id: 'mouth_nose', name: 'Mouth Width to Nose Width', unit: 'x', lo: 1.38, hi: 1.53, sig: 0.1,
  f: (N, c) => c.mouthW / c.noseW,
  ov: (N, c) => [hw(N.ch_r, N.ch_l, undefined, { label: true }), hw(N.ala_r, N.ala_l, undefined, { dim: true })],
  desc: 'How wide the mouth is relative to the nose.',
  how: 'mouth‑corner distance ÷ nostril‑wing distance' });

F({ id: 'cupid_depth', name: "Cupid's Bow Depth", unit: '%', lo: 8, hi: 24, sig: 6,
  f: (N) => { const cy = (N.cupid_r.y + N.cupid_l.y) / 2; return ((N.ls.y - cy) / ((N.sto.y - cy) || 1)) * 100; },
  ov: (N) => [seg(N.cupid_r, N.ls), seg(N.ls, N.cupid_l), hw(N.cupid_r, N.cupid_l, undefined, { dash: true }), pt(N.ls), lab(N.ls, { dy: -1 })],
  desc: 'How deep the dip in the centre of the upper lip is, relative to the upper lip’s height. A defined bow reads as youthful and well‑shaped.',
  how: '(lip centre − bow peaks) ÷ (mouth line − bow peaks) × 100' });

F({ id: 'neck_width', name: 'Neck Width', unit: '%', lo: 90, hi: 100, sig: 7,
  f: (N, c) => (c.neckW / c.bigon) * 100,
  ov: (N, c) => [hw(N.neck_r, N.neck_l, undefined, { label: true }), hw(N.go_r, N.go_l, undefined, { dim: true })],
  desc: 'Neck width compared with jaw width. A neck close to jaw width is a strong masculine trait.',
  how: 'neck width ÷ bigonial (jaw) width × 100' });

const iaa = (N, c) => angleAt(N.pupil_r, c.alarMid, N.pupil_l);
// Jaw frontal angle: angle between the two jawlines (jaw angle → chin edge) where they meet below the chin
const jfa = (N) => 180 - slope(N.go_r, N.chin_r) - slope(N.go_l, N.chin_l);
const jfaOv = (N) => {
  const X = isect(N.go_r, N.chin_r, N.go_l, N.chin_l) || N.me;
  return [seg(N.go_r, X), seg(N.go_l, X), ang(N.go_r, X, N.go_l, { label: true }), pt(N.go_r), pt(N.go_l), pt(N.chin_r), pt(N.chin_l)];
};
F({ id: 'iaa_jfa_dev', name: 'Deviation of IAA & JFA', unit: '°', lo: 0, hi: 4, sig: 4,
  f: (N, c) => Math.abs(iaa(N, c) - jfa(N)),
  ov: (N, c) => [ang(N.pupil_r, c.alarMid, N.pupil_l), ...jfaOv(N).map((p) => (p.t === 'angle' ? { ...p, label: false } : p)), lab(N.me, { dy: 1.2 })],
  desc: 'Difference between the eye–nose angle (IAA) and the jaw angle (JFA). When they match, the upper and lower face share the same proportions.',
  how: '| IAA − JFA |' });

F({ id: 'iaa', name: 'Ipsilateral Alar Angle', unit: '°', lo: 80, hi: 92, sig: 5,
  f: iaa,
  ov: (N, c) => [ang(N.pupil_r, c.alarMid, N.pupil_l, { label: true }), pt(N.ala_r), pt(N.ala_l)],
  desc: 'Angle formed at the centre of the nose base by lines running up to each pupil. Describes how the eyes and nose sit together.',
  how: 'angle pupil(R) – nose‑base centre – pupil(L)' });

F({ id: 'top_third', name: 'Top Third', unit: '%', lo: 30.5, hi: 35, sig: 1.8, w: 1.5,
  f: (N, c) => (c.upper / c.total) * 100,
  ov: (N, c) => [vh(N.trichion, { x: 0, y: c.browY }, c.midX), hw(N.temple_r, N.temple_l, N.trichion.y, { dash: true }), hw(N.brI_r, N.brI_l, c.browY, { dash: true }), lab({ x: c.midX + c.ipd * 0.12, y: (c.browY + N.trichion.y) / 2 })],
  desc: 'Forehead height (hairline to mid‑brow) as a share of the face. A larger value usually means a higher or receding hairline.',
  how: '(brow line − hairline) ÷ (chin − hairline) × 100' });

F({ id: 'lower_third_prop', name: 'Lower Third Proportion', unit: '%', lo: 31, hi: 40, sig: 3,
  f: (N) => ((N.sto.y - N.sn.y) / (N.me.y - N.sn.y)) * 100,
  ov: (N, c) => [vh(N.sn, N.sto, c.midX + c.mouthW * 0.6, { label: true }), vh(N.sn, N.me, c.midX - c.mouthW * 0.6, { dim: true })],
  desc: 'Upper lip height as a share of the lower third. Ideally the mouth sits about one third of the way from nose to chin.',
  how: '(mouth line − nose base) ÷ (chin − nose base) × 100' });

F({ id: 'fwhr', name: 'Face Width to Height Ratio', unit: 'x', lo: 1.9, hi: 2.06, sig: 0.12, w: 2,
  f: (N, c) => c.bizyg / (N.ls.y - c.browY),
  ov: (N, c) => [hw(N.zy_r, N.zy_l, undefined, { label: true }), vh({ x: 0, y: c.browY }, N.ls, c.midX), hw(N.brI_r, N.brI_l, c.browY, { dash: true })],
  desc: 'Cheekbone width compared with upper‑face height (brow to upper lip). A higher FWHR reads as more robust and masculine.',
  how: 'bizygomatic width ÷ (upper lip − brow line)' });

F({ id: 'brow_low_set', name: 'Eyebrow Low Setedness', unit: 'x', lo: 1.3, hi: 2.0, sig: 0.4,
  f: (N, c) => {
    const r = N.lidU_r.y - polyY([N.brI_r, N.brP_r, N.brT_r], N.pupil_r.x);
    const l = N.lidU_l.y - polyY([N.brI_l, N.brP_l, N.brT_l], N.pupil_l.x);
    return (r + l) / 2 / c.eyeH;
  },
  ov: (N) => [vh({ x: N.pupil_r.x, y: polyY([N.brI_r, N.brP_r, N.brT_r], N.pupil_r.x) }, N.lidU_r, undefined, { label: true }), vh(N.lidU_r, N.lidL_r, N.pupil_r.x + 4, { dim: true }), vh({ x: N.pupil_l.x, y: polyY([N.brI_l, N.brP_l, N.brT_l], N.pupil_l.x) }, N.lidU_l), seg(N.brI_r, N.brP_r, { dim: true }), seg(N.brP_r, N.brT_r, { dim: true }), seg(N.brI_l, N.brP_l, { dim: true }), seg(N.brP_l, N.brT_l, { dim: true })],
  desc: 'Distance from the brow down to the upper eyelid, compared with eye height. Lower‑set brows give a deeper, more intense eye area.',
  how: '(upper lid − brow, above the pupil) ÷ eye height' });

F({ id: 'brow_length', name: 'Brow Length to Face Width', unit: 'x', lo: 0.34, hi: 0.4, sig: 0.03,
  f: (N, c) => ((dist(N.brI_r, N.brP_r) + dist(N.brP_r, N.brT_r) + dist(N.brI_l, N.brP_l) + dist(N.brP_l, N.brT_l)) / 2) / c.bizyg,
  ov: (N) => [seg(N.brI_r, N.brP_r), seg(N.brP_r, N.brT_r), seg(N.brI_l, N.brP_l), seg(N.brP_l, N.brT_l), hw(N.zy_r, N.zy_l, undefined, { dim: true }), lab(N.brP_l, { dy: -1 })],
  desc: 'Length of each eyebrow compared with face width.',
  how: 'average brow length (head → peak → tail) ÷ bizygomatic width' });

F({ id: 'jaw_slope', name: 'Jaw Slope', unit: '°', lo: 30, hi: 42, sig: 6,
  f: (N) => (slope(N.go_r, N.me) + slope(N.go_l, N.me)) / 2,
  ov: (N) => [seg(N.go_r, N.me), seg(N.go_l, N.me), hw(N.go_r, N.go_l, N.go_r.y, { dash: true, ticks: false }), ang({ x: N.me.x, y: N.go_l.y }, N.go_l, N.me, { label: true })],
  desc: 'How steeply the lower jaw border drops from the jaw angle to the bottom of the chin. Higher jaw angles give a steeper, more defined slope.',
  how: 'angle of jaw angle → chin bottom against the horizontal (average of both sides)' });

const earAng = (top, ear) => deg(Math.atan2(Math.abs(ear.x - top.x), Math.abs(ear.y - top.y) || 1));
F({ id: 'ear_angle', name: 'Ear Protrusion Angle', unit: '°', lo: 8, hi: 24, sig: 8,
  f: (N) => (earAng(N.earTop_r, N.ear_r) + earAng(N.earTop_l, N.ear_l)) / 2,
  ov: (N) => [ang({ x: N.earTop_r.x, y: N.ear_r.y }, N.earTop_r, N.ear_r, { label: true }), ang({ x: N.earTop_l.x, y: N.ear_l.y }, N.earTop_l, N.ear_l)],
  desc: 'How far the ears flare out from the side of the head. Lower values mean flatter‑set ears.',
  how: 'angle between vertical and ear root → outermost ear point (average of both)' });

F({ id: 'esr', name: 'Eye Separation Ratio', unit: '%', lo: 44, hi: 48, sig: 1.4, w: 1.5,
  f: (N, c) => (c.ipd / c.bizyg) * 100,
  ov: (N, c) => [hw(N.pupil_r, N.pupil_l, 0, { label: true }), hw(N.zy_r, N.zy_l, 0, { dim: true, ticks: false })],
  desc: 'Distance between the pupils as a share of face width. Too close or too wide both break facial balance.',
  how: 'interpupillary distance ÷ bizygomatic width × 100' });

const tilt = (endo, exo) => deg(Math.atan2(endo.y - exo.y, Math.abs(endo.x - exo.x)));
F({ id: 'canthal_tilt', name: 'Lateral Canthal Tilt', unit: '°', lo: 2, hi: 8, sig: 3, w: 1.5,
  f: (N) => (tilt(N.endo_r, N.exo_r) + tilt(N.endo_l, N.exo_l)) / 2,
  ov: (N) => [seg(...ext(N.endo_r, N.exo_r, 0.2)), seg(...ext(N.endo_l, N.exo_l, 0.2)), hw(N.exo_r, N.endo_r, N.endo_r.y, { dash: true, ticks: false }), hw(N.endo_l, N.exo_l, N.endo_l.y, { dash: true, ticks: false }), lab(N.exo_l, { dx: 1 })],
  desc: 'Upward slant from the inner to the outer eye corner. A slight positive tilt is considered attractive.',
  how: 'angle of inner → outer eye corner above horizontal (head roll removed)' });

F({ id: 'cheekbone_height', name: 'Cheekbone Height', unit: '%', lo: 82, hi: 105, sig: 8,
  f: (N) => {
    const r = (N.ls.y - N.zy_r.y) / (N.ls.y - N.pupil_r.y), l = (N.ls.y - N.zy_l.y) / (N.ls.y - N.pupil_l.y);
    return ((r + l) / 2) * 100;
  },
  ov: (N, c) => [vh(N.ls, N.zy_r, N.zy_r.x, { label: true }), vh(N.ls, N.pupil_l, N.zy_l.x, { dim: true }), hw(N.zy_r, N.zy_l, undefined, { dash: true, ticks: false }), hw(N.ch_r, N.ch_l, N.ls.y, { dash: true, ticks: false })],
  desc: 'How high the widest point of the cheekbones sits, measured from the upper lip relative to the pupils. Higher cheekbones give a sharper midface.',
  how: '(upper lip − cheekbone) ÷ (upper lip − pupil) × 100' });

F({ id: 'ipd_mouth', name: 'Interpupillary‑Mouth Width Ratio', unit: 'x', lo: 0.76, hi: 0.9, sig: 0.06,
  f: (N, c) => c.mouthW / c.ipd,
  ov: (N) => [hw(N.ch_r, N.ch_l, undefined, { label: true }), hw(N.pupil_r, N.pupil_l, 0, { dim: true }), seg(N.pupil_r, proj(N.pupil_r, N.ch_r), { dash: true }), seg(N.pupil_l, proj(N.pupil_l, N.ch_l), { dash: true })],
  desc: 'Mouth width compared with the distance between the pupils. Mouth corners ideally fall just inside the pupil lines.',
  how: 'mouth width ÷ interpupillary distance' });

F({ id: 'chin_philtrum', name: 'Chin to Philtrum Ratio', unit: 'x', lo: 2.05, hi: 2.55, sig: 0.25, w: 1.5,
  f: (N) => (N.me.y - N.sto.y) / (N.sto.y - N.sn.y),
  ov: (N, c) => [vh(N.sto, N.me, c.midX + c.mouthW * 0.6, { label: true }), vh(N.sn, N.sto, c.midX - c.mouthW * 0.6, { dim: true })],
  desc: 'Height from the mouth to the chin compared with the height from the nose to the mouth. A taller chin relative to the philtrum is a masculine trait.',
  how: '(chin − mouth line) ÷ (mouth line − nose base)' });

F({ id: 'bigonial', name: 'Bigonial Width', unit: '%', lo: 85.5, hi: 94, sig: 4, w: 1.5,
  f: (N, c) => (c.bigon / c.bizyg) * 100,
  ov: (N) => [hw(N.go_r, N.go_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Jaw width compared with cheekbone width. A wide jaw relative to the cheekbones gives a strong, square lower face.',
  how: 'jaw‑angle distance ÷ bizygomatic width × 100' });

F({ id: 'lower_third', name: 'Lower Third', unit: '%', lo: 32.5, hi: 36, sig: 1.6, w: 1.5,
  f: (N, c) => (c.lower / (c.middle + c.lower)) * (200 / 3),
  ov: (N, c) => [vh(N.sn, N.me, c.midX), hw(N.ala_r, N.ala_l, N.sn.y, { dash: true }), hw(N.chin_r, N.chin_l, N.me.y, { dash: true }), lab({ x: c.midX + c.ipd * 0.12, y: (N.sn.y + N.me.y) / 2 })],
  desc: 'Nose base to chin on the facial‑thirds scale (33.3% = one equal third). A slightly longer lower third is typical of masculine faces. Measured against brow‑to‑chin so the hairline doesn’t distort it.',
  how: '(chin − nose base) ÷ (chin − brow line) × 66.7' });

F({ id: 'total_wh', name: 'Total Facial Width to Height Ratio', unit: 'x', lo: 1.33, hi: 1.38, sig: 0.05, w: 1.5,
  f: (N, c) => c.faceH / c.bizyg,
  ov: (N, c) => [vh(N.trichion, N.me, c.midX, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Full face height (hairline to chin) compared with cheekbone width. Around 1.35 is considered ideal.',
  how: '(chin − hairline) ÷ bizygomatic width' });

F({ id: 'bitemporal', name: 'Bitemporal Width', unit: '%', lo: 84, hi: 93, sig: 4,
  f: (N, c) => (c.bitemp / c.bizyg) * 100,
  ov: (N) => [hw(N.temple_r, N.temple_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Forehead width at the temples compared with cheekbone width.',
  how: 'temple distance ÷ bizygomatic width × 100' });

F({ id: 'eye_ar', name: 'Eye Aspect Ratio', unit: 'x', lo: 2.8, hi: 3.5, sig: 0.3, w: 1.5,
  f: (N, c) => c.eyeW / c.eyeH,
  ov: (N, c) => [hw(N.exo_r, N.endo_r, (N.exo_r.y + N.endo_r.y) / 2, { label: true }), vh(N.lidU_r, N.lidL_r, N.pupil_r.x), hw(N.endo_l, N.exo_l, undefined, { dim: true }), vh(N.lidU_l, N.lidL_l, N.pupil_l.x, { dim: true })],
  desc: 'Eye width compared with eye height. Longer, narrower eyes (“hunter eyes”) score higher for men.',
  how: 'eye width (corner to corner) ÷ eye height (upper to lower lid)' });

F({ id: 'brow_tilt', name: 'Eyebrow Tilt', unit: '°', lo: -3, hi: 6, sig: 4,
  f: (N) => {
    const r = deg(Math.atan2(N.brI_r.y - N.brT_r.y, Math.abs(N.brI_r.x - N.brT_r.x)));
    const l = deg(Math.atan2(N.brI_l.y - N.brT_l.y, Math.abs(N.brI_l.x - N.brT_l.x)));
    return (r + l) / 2;
  },
  ov: (N) => [seg(...ext(N.brI_r, N.brT_r, 0.1)), seg(...ext(N.brI_l, N.brT_l, 0.1)), hw(N.brI_l, { x: N.brT_l.x, y: N.brI_l.y }, N.brI_l.y, { dash: true, ticks: false }), lab(N.brT_l, { dx: 1 })],
  desc: 'Slant of the brow from its head to its tail.',
  how: 'angle of brow head → brow tail above horizontal (average of both)' });

F({ id: 'nose_tip_pos', name: 'Nose Tip Position', unit: '%', lo: 0, hi: 4, sig: 3,
  f: (N, c) => (Math.abs(N.prn.x - c.midX) / c.noseW) * 100,
  ov: (N, c) => [vh({ x: c.midX, y: N.nasion.y }, { x: c.midX, y: N.me.y }, c.midX, { dash: true, ticks: false }), pt(N.prn), seg(N.prn, { x: c.midX, y: N.prn.y }), lab(N.prn, { dy: 1 })],
  desc: 'How far the nose tip sits from the facial midline. Lower means a straighter nose.',
  how: '| nose tip − midline | ÷ nose width × 100' });

F({ id: 'icd_nose', name: 'Intercanthal‑Nasal Width Ratio', unit: 'x', lo: 0.97, hi: 1.12, sig: 0.08,
  f: (N, c) => c.noseW / c.icd,
  ov: (N, c) => [hw(N.ala_r, N.ala_l, undefined, { label: true }), hw(N.endo_r, N.endo_l, undefined, { dim: true }), seg(N.endo_r, proj(N.endo_r, N.ala_r), { dash: true }), seg(N.endo_l, proj(N.endo_l, N.ala_l), { dash: true })],
  desc: 'Nose width compared with the gap between the inner eye corners. Ideally the nose fits between vertical lines dropped from the inner corners.',
  how: 'nostril‑wing distance ÷ inner‑corner distance' });

F({ id: 'bridge_nose', name: 'Nose Bridge to Nose Width', unit: 'x', lo: 0.38, hi: 0.55, sig: 0.06,
  f: (N, c) => c.bridgeW / c.noseW,
  ov: (N) => [hw(N.bridge_r, N.bridge_l, undefined, { label: true }), hw(N.ala_r, N.ala_l, undefined, { dim: true })],
  desc: 'Width of the nose bridge compared with the width of the nostrils. A slimmer bridge looks more refined.',
  how: 'bridge width ÷ nostril‑wing width' });

F({ id: 'lip_ratio', name: 'Lower Lip to Upper Lip Ratio', unit: 'x', lo: 1.4, hi: 2.0, sig: 0.25,
  f: (N) => (N.li.y - N.sto.y) / ((N.sto.y - N.ls.y) || 1),
  ov: (N, c) => [vh(N.sto, N.li, c.midX + c.mouthW * 0.35, { label: true }), vh(N.ls, N.sto, c.midX - c.mouthW * 0.35, { dim: true })],
  desc: 'Lower lip height compared with upper lip height. A fuller lower lip (about 1.6×) is the classic ideal.',
  how: '(lower lip − mouth line) ÷ (mouth line − upper lip)' });

const corner = (sto, ch) => deg(Math.atan2(sto.y - ch.y, Math.abs(sto.x - ch.x)));
F({ id: 'mouth_corner', name: 'Mouth Corner Position', unit: '°', lo: -4, hi: 4, sig: 3,
  f: (N) => (corner(N.sto, N.ch_r) + corner(N.sto, N.ch_l)) / 2,
  ov: (N) => [seg(N.ch_r, N.sto), seg(N.sto, N.ch_l), hw(N.ch_r, N.ch_l, N.sto.y, { dash: true, ticks: false }), lab(N.ch_l, { dx: 1 })],
  desc: 'Whether the mouth corners turn up or down from the centre of the mouth. Slightly upturned corners look relaxed and positive.',
  how: 'angle of mouth centre → corner above horizontal (average of both)' });

F({ id: 'jfa', name: 'Jaw Frontal Angle', unit: '°', lo: 84.5, hi: 95, sig: 5, w: 1.5,
  f: jfa,
  ov: jfaOv,
  desc: 'Angle where the two jawlines (jaw angle → chin) would meet below the chin. Smaller means a more V‑shaped jaw; larger means a squarer, flatter jawline.',
  how: '180° − slope(jaw angle R → chin edge R) − slope(jaw angle L → chin edge L)' });

F({ id: 'ear_ratio', name: 'Ear Protrusion Ratio', unit: 'x', lo: 1.0, hi: 1.12, sig: 0.05,
  f: (N, c) => c.earW / c.bizyg,
  ov: (N) => [hw(N.ear_r, N.ear_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Width across the ears compared with cheekbone width. Higher values mean the ears stick out past the face.',
  how: 'outer ear distance ÷ bizygomatic width' });

// extras (front)
F({ id: 'midface_ratio', name: 'Midface Ratio', unit: 'x', lo: 0.97, hi: 1.1, sig: 0.06, extra: true,
  f: (N, c) => c.ipd / (N.ls.y - N.nasion.y),
  ov: (N, c) => [hw(N.pupil_r, N.pupil_l, 0, { label: true }), vh(N.nasion, N.ls, c.midX, { dim: true })],
  desc: 'Interpupillary distance compared with midface height (nasion to upper lip). A compact midface (about 1.0) is attractive.',
  how: 'interpupillary distance ÷ (upper lip − nasion)' });

F({ id: 'symmetry', name: 'Facial Symmetry', unit: '%', lo: 0, hi: 2.2, sig: 1.4, extra: true, w: 1.5,
  f: (N, c) => {
    const pairs = ['pupil', 'endo', 'exo', 'lidU', 'lidL', 'brI', 'brP', 'brT', 'ala', 'ch', 'cupid', 'zy', 'go', 'chin', 'temple'];
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
  how: 'mean distance of each pair’s mirror from the midline ÷ bizygomatic width × 100' });

F({ id: 'cheek_lean', name: 'Lower Cheek Width', unit: '%', lo: 80, hi: 88, sig: 4, hm: false,
  f: (N, c) => (c.cheekW / c.bizyg) * 100,
  ov: (N) => [hw(N.cheek_r, N.cheek_l, undefined, { label: true }), hw(N.zy_r, N.zy_l, undefined, { dim: true })],
  desc: 'Face width at mouth level compared with the cheekbones. A narrower lower cheek suggests leaner, more hollow cheeks.',
  how: 'contour width at mouth level ÷ bizygomatic width × 100' });

// ── SIDE ──
S({ id: 'orbital_vector', name: 'Orbital Vector', unit: '%', lo: -3, hi: 4, sig: 3,
  f: (N, c) => ((N.or.x - N.cornea.x) / c.H) * 100,
  ov: (N) => [seg(N.cornea, { x: N.cornea.x, y: N.or.y + 12 }, { dash: true }), hw({ x: N.cornea.x, y: N.or.y }, N.or, N.or.y, { label: true }), pt(N.cornea), pt(N.or)],
  desc: 'Whether the cheek under the eye sits in front of (positive) or behind (negative) the front of the eye. Positive is ideal, neutral is fine.',
  how: '(under‑eye rim − eye front, horizontal) ÷ (chin − nasion) × 100; positive = cheek ahead' });

S({ id: 'nasal_wh', name: 'Nasal W to H Ratio', unit: 'x', lo: 0.55, hi: 0.72, sig: 0.06,
  f: (N) => (N.prn.x - N.ac.x) / (N.sn.y - N.n.y),
  ov: (N) => [hw(N.ac, N.prn, N.prn.y, { label: true }), vh(N.n, N.sn, N.ac.x - 6, { dim: true })],
  desc: 'How far the nose projects from the face compared with its height.',
  how: '(nose tip − nostril crease, horizontal) ÷ (nose base − nasion, vertical)' });

S({ id: 'nasofrontal', name: 'Nasofrontal Angle', unit: '°', lo: 106, hi: 129, sig: 7,
  f: (N) => angleAt(N.g, N.n, N.prn),
  ov: (N) => [ang(N.g, N.n, N.prn, { label: true })],
  desc: 'Angle where the forehead meets the nose. Smaller angles mean a deeper set nose bridge under a stronger brow.',
  how: 'angle glabella – nasion – nose tip' });

S({ id: 'submental', name: 'Submental Cervical Angle', unit: '°', lo: 100, hi: 120, sig: 10, w: 1.5,
  f: (N) => angleAt(N.me, N.c, N.neck),
  ov: (N) => [ang(N.me, N.c, N.neck, { label: true })],
  desc: 'Angle between the underside of the chin and the front of the neck. A sharp angle means a defined jawline from the side.',
  how: 'angle chin bottom – neck‑chin point – front of neck' });

S({ id: 'ramus_mandible', name: 'Ramus to Mandible Ratio', unit: 'x', lo: 0.59, hi: 0.75, sig: 0.08,
  f: (N) => dist(N.ramus, N.go) / dist(N.go, N.me),
  ov: (N) => [seg(N.ramus, N.go, { label: true }), seg(N.go, N.me, { dim: true }), pt(N.go)],
  desc: 'Height of the back of the jaw (ramus) compared with jaw length. A taller ramus gives a more defined jaw angle.',
  how: '|jaw joint → jaw angle| ÷ |jaw angle → chin bottom|' });

S({ id: 'frankfort_tip', name: 'Frankfort‑Tip Angle', unit: '°', lo: 50, hi: 62, sig: 5,
  f: (N) => deg(Math.atan2(N.prn.y - N.n.y, N.prn.x - N.n.x)),
  ov: (N) => [seg({ x: N.n.x - 30, y: N.n.y }, { x: N.prn.x + 30, y: N.n.y }, { dash: true }), ang({ x: N.prn.x, y: N.n.y }, N.n, N.prn, { label: true })],
  desc: 'Angle of the nose bridge (nasion → tip) against the Frankfort horizontal.',
  how: 'angle between Frankfort plane and nasion → nose tip' });

S({ id: 'fh_recession', name: 'Recession Relative to Frankfort Plane', unit: '°', lo: 88, hi: 95, sig: 3.5, w: 1.5,
  f: (N) => deg(Math.atan2(N.pog.y - N.n.y, -(N.pog.x - N.n.x))),
  ov: (N) => [seg({ x: N.tragus.x, y: 0 }, { x: N.n.x + 40, y: 0 }, { dash: true }), seg(N.n, N.pog, { label: true }), vh(N.n, { x: N.n.x, y: N.pog.y }, N.n.x, { dash: true, ticks: false })],
  desc: 'Facial angle: how far forward the chin sits under the nasion, measured from the Frankfort plane. Below about 88° means a recessed chin.',
  how: 'angle between Frankfort plane and nasion → chin point (90° = chin straight below nasion)' });

S({ id: 'mentolabial', name: 'Mentolabial Angle', unit: '°', lo: 108, hi: 130, sig: 8,
  f: (N) => angleAt(N.li, N.sm, N.pog),
  ov: (N) => [ang(N.li, N.sm, N.pog, { label: true })],
  desc: 'Angle of the fold between the lower lip and the chin. Too shallow looks flat; too deep looks strained.',
  how: 'angle lower lip – lip‑chin fold – chin point' });

S({ id: 'nasal_projection', name: 'Nasal Projection', unit: 'x', lo: 0.55, hi: 0.62, sig: 0.05,
  f: (N) => (N.prn.x - N.ac.x) / dist(N.n, N.prn),
  ov: (N) => [hw(N.ac, N.prn, N.prn.y, { label: true }), seg(N.n, N.prn, { dim: true })],
  desc: 'Goode ratio: how far the tip projects compared with nose length.',
  how: '(nose tip − nostril crease, horizontal) ÷ |nasion → nose tip|' });

S({ id: 'convexity_g', name: 'Facial Convexity (Glabella)', unit: '°', lo: 164, hi: 172, sig: 4, w: 1.5,
  f: (N) => angleAt(N.g, N.sn, N.pog),
  ov: (N) => [ang(N.g, N.sn, N.pog, { label: true })],
  desc: 'Profile straightness from brow to chin through the nose base. Lower values mean a more convex (receding chin) profile.',
  how: 'angle glabella – subnasale – chin point' });

S({ id: 'anterior_depth', name: 'Anterior Facial Depth', unit: 'x', lo: 0.95, hi: 1.1, sig: 0.06,
  f: (N, c) => (N.sn.x - N.tragus.x) / c.H,
  ov: (N) => [hw(N.tragus, N.sn, N.sn.y, { label: true }), vh(N.n, N.me, N.sn.x + 12, { dim: true })],
  desc: 'How far the midface projects forward from the ear, relative to face height. More depth = a more forward‑grown face.',
  how: '(nose base − ear canal, horizontal) ÷ (chin − nasion, vertical)' });

S({ id: 'holdaway', name: 'Holdaway H Line', unit: '°', lo: 7, hi: 15, sig: 4,
  f: (N) => angleAt(N.ls, N.pog, N.n),
  ov: (N) => [seg(...ext(N.pog, N.ls, 0.4)), seg(N.pog, N.n, { dim: true }), ang(N.ls, N.pog, N.n, { label: true })],
  desc: 'H‑angle between the chin‑to‑upper‑lip line and the soft‑tissue facial line. Describes lip–chin balance.',
  how: 'angle upper lip – chin point – nasion' });

S({ id: 'browridge_incl', name: 'Browridge Inclination Angle', unit: '°', lo: 4, hi: 16, sig: 6,
  f: (N) => deg(Math.atan2(N.g.x - N.fh.x, (N.g.y - N.fh.y) || 1)),
  ov: (N) => [seg(N.fh, N.g, { label: true }), vh(N.fh, N.g, N.fh.x, { dash: true, ticks: false })],
  desc: 'How much the lower forehead leans back from the brow ridge. A stronger brow ridge gives a larger angle.',
  how: 'angle of mid‑forehead → glabella from vertical' });

S({ id: 'upper_forehead', name: 'Upper Forehead Slope', unit: '°', lo: 2, hi: 16, sig: 6,
  f: (N) => deg(Math.atan2(N.fh.x - N.tr.x, (N.fh.y - N.tr.y) || 1)),
  ov: (N) => [seg(N.tr, N.fh, { label: true }), vh(N.tr, N.fh, N.tr.x, { dash: true, ticks: false })],
  desc: 'Backward slope of the upper forehead.',
  how: 'angle of hairline → mid‑forehead from vertical' });

S({ id: 'convexity_n', name: 'Facial Convexity (Nasion)', unit: '°', lo: 161, hi: 171, sig: 4,
  f: (N) => angleAt(N.n, N.sn, N.pog),
  ov: (N) => [ang(N.n, N.sn, N.pog, { label: true })],
  desc: 'Profile straightness from the nose bridge to the chin.',
  how: 'angle nasion – subnasale – chin point' });

S({ id: 'total_convexity', name: 'Total Facial Convexity', unit: '°', lo: 137, hi: 149, sig: 4,
  f: (N) => angleAt(N.g, N.prn, N.pog),
  ov: (N) => [ang(N.g, N.prn, N.pog, { label: true })],
  desc: 'Profile angle including the nose: brow, nose tip and chin.',
  how: 'angle glabella – nose tip – chin point' });

S({ id: 'depth_height', name: 'Facial Depth to Height Ratio', unit: 'x', lo: 1.1, hi: 1.28, sig: 0.07,
  f: (N, c) => (N.prn.x - N.tragus.x) / c.H,
  ov: (N) => [hw(N.tragus, N.prn, 0, { label: true }), vh(N.n, N.me, N.prn.x + 12, { dim: true })],
  desc: 'Depth of the face from ear to nose tip compared with face height.',
  how: '(nose tip − ear canal, horizontal) ÷ (chin − nasion, vertical)' });

S({ id: 'midface_proj', name: 'Interior Midface Projection Angle', unit: '°', lo: 0, hi: 10, sig: 4,
  f: (N) => deg(Math.atan2(N.sn.x - N.n.x, (N.sn.y - N.n.y) || 1)),
  ov: (N) => [seg(N.n, N.sn, { label: true }), vh(N.n, N.sn, N.n.x, { dash: true, ticks: false })],
  desc: 'How far the base of the nose (and the upper jaw under it) projects forward of the nasion, relative to the Frankfort perpendicular.',
  how: 'angle of nasion → subnasale from the Frankfort perpendicular; positive = forward' });

S({ id: 'z_angle', name: 'Z Angle', unit: '°', lo: 70, hi: 80, sig: 4,
  f: (N, c) => deg(Math.atan2(N.pog.y - c.lip.y, (c.lip.x - N.pog.x) || 0.001)),
  ov: (N, c) => [seg(...ext(N.pog, c.lip, 0.5)), seg({ x: N.pog.x - 40, y: N.pog.y }, { x: N.pog.x + 30, y: N.pog.y }, { dash: true }), ang({ x: N.pog.x - 40, y: N.pog.y }, N.pog, c.lip, { label: true })],
  desc: 'Merrifield Z‑angle: the chin‑to‑lip line against the Frankfort plane. Low values mean protruding lips or a weak chin.',
  how: 'angle between Frankfort plane and chin point → most forward lip' });

S({ id: 'nasal_tip_angle', name: 'Nasal Tip Angle', unit: '°', lo: 98, hi: 118, sig: 7,
  f: (N) => angleAt(N.n, N.prn, N.cm),
  ov: (N) => [ang(N.n, N.prn, N.cm, { label: true })],
  desc: 'Angle at the nose tip between the bridge and the underside of the nose.',
  how: 'angle nasion – nose tip – columella' });

S({ id: 'tip_rotation', name: 'Nose Tip Rotation Angle', unit: '°', lo: 12, hi: 28, sig: 6,
  f: (N) => deg(Math.atan2(N.sn.y - N.prn.y, (N.prn.x - N.sn.x) || 0.001)),
  ov: (N) => [seg(N.sn, N.prn, { label: true }), seg(N.sn, { x: N.prn.x + 10, y: N.sn.y }, { dash: true })],
  desc: 'How much the nose tip is turned up. Men usually look best with modest rotation.',
  how: 'angle of subnasale → nose tip above the Frankfort horizontal' });

S({ id: 'nasolabial', name: 'Nasolabial Angle', unit: '°', lo: 94, hi: 117, sig: 7,
  f: (N) => angleAt(N.cm, N.sn, N.ls),
  ov: (N) => [ang(N.cm, N.sn, N.ls, { label: true })],
  desc: 'Angle between the underside of the nose and the upper lip.',
  how: 'angle columella – subnasale – upper lip' });

S({ id: 'nasofacial', name: 'Nasofacial Angle', unit: '°', lo: 30, hi: 36, sig: 3,
  f: (N) => angleBetween({ x: N.pog.x - N.g.x, y: N.pog.y - N.g.y }, { x: N.prn.x - N.n.x, y: N.prn.y - N.n.y }),
  ov: (N) => [seg(N.g, N.pog, { dim: true }), seg(...ext(N.n, N.prn, 0.15)), lab(N.prn, { dx: 1 })],
  desc: 'Angle between the facial plane (brow to chin) and the nose bridge.',
  how: 'angle between glabella → chin point and nasion → nose tip' });

S({ id: 'nasomental', name: 'Nasomental Angle', unit: '°', lo: 120, hi: 132, sig: 4,
  f: (N) => angleAt(N.n, N.prn, N.pog),
  ov: (N) => [ang(N.n, N.prn, N.pog, { label: true })],
  desc: 'Angle at the nose tip between the bridge and the line to the chin.',
  how: 'angle nasion – nose tip – chin point' });

const lineOv = (A, B, P, label) => [seg(...ext(A, B, 0.15), { dim: !label }), seg(P, footOn(P, A, B), { label }), pt(P)];
function footOn(P, A, B) {
  const bx = B.x - A.x, by = B.y - A.y;
  const t = ((P.x - A.x) * bx + (P.y - A.y) * by) / (bx * bx + by * by || 1);
  return { x: A.x + bx * t, y: A.y + by * t };
}
const pct = (P, A, B) => (fwdDist(P, A, B) / dist(A, B)) * 100;

S({ id: 's_lower', name: 'Lower Lip S‑Line Position', unit: '%', lo: -3, hi: 2, sig: 2.5,
  f: (N) => pct(N.li, N.cm, N.pog), ov: (N) => lineOv(N.cm, N.pog, N.li, true),
  desc: 'Steiner S‑line (columella to chin). Lips should just touch it; negative = behind the line.',
  how: 'signed distance of lower lip from columella → chin line ÷ line length × 100' });
S({ id: 's_upper', name: 'Upper Lip S‑Line Position', unit: '%', lo: -3, hi: 2, sig: 2.5,
  f: (N) => pct(N.ls, N.cm, N.pog), ov: (N) => lineOv(N.cm, N.pog, N.ls, true),
  desc: 'Steiner S‑line for the upper lip.',
  how: 'signed distance of upper lip from columella → chin line ÷ line length × 100' });
S({ id: 'e_lower', name: 'Lower Lip E‑Line Position', unit: '%', lo: -5, hi: 0.5, sig: 2.5,
  f: (N) => pct(N.li, N.prn, N.pog), ov: (N) => lineOv(N.prn, N.pog, N.li, true),
  desc: 'Ricketts E‑line (nose tip to chin). The lower lip ideally sits slightly behind it.',
  how: 'signed distance of lower lip from nose tip → chin line ÷ line length × 100' });
S({ id: 'e_upper', name: 'Upper Lip E‑Line Position', unit: '%', lo: -8, hi: -2, sig: 2.5,
  f: (N) => pct(N.ls, N.prn, N.pog), ov: (N) => lineOv(N.prn, N.pog, N.ls, true),
  desc: 'Ricketts E‑line for the upper lip, which ideally sits a little further back than the lower lip.',
  how: 'signed distance of upper lip from nose tip → chin line ÷ line length × 100' });
S({ id: 'b_lower', name: 'Lower Lip Burstone Line', unit: '%', lo: 1.5, hi: 8, sig: 3,
  f: (N) => pct(N.li, N.sn, N.pog), ov: (N) => lineOv(N.sn, N.pog, N.li, true),
  desc: 'Burstone B‑line (nose base to chin). Lips ideally sit slightly in front of it.',
  how: 'signed distance of lower lip from subnasale → chin line ÷ line length × 100' });
S({ id: 'b_upper', name: 'Upper Lip Burstone Line', unit: '%', lo: 4, hi: 10, sig: 3,
  f: (N) => pct(N.ls, N.sn, N.pog), ov: (N) => lineOv(N.sn, N.pog, N.ls, true),
  desc: 'Burstone B‑line for the upper lip.',
  how: 'signed distance of upper lip from subnasale → chin line ÷ line length × 100' });

S({ id: 'mpa', name: 'Mandibular Plane Angle', unit: '°', lo: 18, hi: 28, sig: 5, w: 1.5,
  f: (N) => deg(Math.atan2(N.me.y - N.go.y, (N.me.x - N.go.x) || 0.001)),
  ov: (N) => [seg(...ext(N.go, N.me, 0.2)), seg({ x: N.go.x - 20, y: N.go.y }, { x: N.me.x + 20, y: N.go.y }, { dash: true }), ang({ x: N.me.x, y: N.go.y }, N.go, N.me, { label: true })],
  desc: 'Steepness of the lower jaw border against the Frankfort plane. Flatter (lower) angles look more defined; steep angles suggest a long, recessive lower face.',
  how: 'angle of jaw angle → chin bottom below the Frankfort horizontal' });

S({ id: 'gonion_mouth', name: 'Gonion to Mouth Line', unit: '%', lo: 0, hi: 14, sig: 6,
  f: (N, c) => ((N.go.y - N.sto.y) / c.H) * 100,
  ov: (N) => [seg({ x: N.go.x - 20, y: N.sto.y }, { x: N.sto.x, y: N.sto.y }, { dash: true }), vh({ x: N.go.x, y: N.sto.y }, N.go, N.go.x, { label: true }), pt(N.go)],
  desc: 'How far the jaw angle sits below a horizontal line through the mouth. A jaw angle near mouth level indicates a tall ramus.',
  how: '(jaw angle − mouth line, vertical) ÷ (chin − nasion) × 100' });

S({ id: 'gonial', name: 'Gonial Angle', unit: '°', lo: 112, hi: 123, sig: 6, extra: true, w: 1.5,
  f: (N) => angleAt(N.ramus, N.go, N.me),
  ov: (N) => [ang(N.ramus, N.go, N.me, { label: true })],
  desc: 'Angle of the jaw corner seen from the side. Sharper (lower) angles give a more chiselled jaw.',
  how: 'angle jaw joint – jaw angle – chin bottom' });

export const METRICS = M;
export const METRIC_BY_ID = Object.fromEntries(M.map((m) => [m.id, m]));

// ───────────────────────── population norms ─────────────────────────
// For each measurement: [ideal, typical spread among adult men (SD), typical male average].
// A score is the distance from the ideal measured in units of how much men normally vary, so an
// ordinary face lands mid-scale on most measurements and only rare faces reach 9–10.
// The averages are only used to calibrate the pillar/overall scale (see CAL below).
const NORMS = {
  // front
  middle_third: [32.8, 1.6, 33.4], one_eye_apart: [1.0, 0.09, 1.07], mouth_nose: [1.47, 0.12, 1.4],
  cupid_depth: [16, 7, 14], neck_width: [96, 7, 88], iaa_jfa_dev: [4, 8, 18], iaa: [86, 5, 82],
  top_third: [32.5, 2.5, 32], lower_third_prop: [34, 2.5, 33], fwhr: [2.0, 0.13, 1.86],
  brow_low_set: [1.45, 0.35, 1.85], brow_length: [0.37, 0.03, 0.355], jaw_slope: [36, 6, 30],
  ear_angle: [10, 8, 17], esr: [46, 1.8, 46.5], canthal_tilt: [6, 3, 3], cheekbone_height: [97, 7, 89],
  ipd_mouth: [0.83, 0.06, 0.81], chin_philtrum: [2.3, 0.28, 2.05], bigonial: [91, 4.5, 85],
  lower_third: [33.9, 1.6, 33.3], total_wh: [1.35, 0.07, 1.4], bitemporal: [89, 4, 87], eye_ar: [3.3, 0.3, 3.0],
  brow_tilt: [2, 4, 2], nose_tip_pos: [0, 3, 2.5], icd_nose: [1.02, 0.1, 1.08], bridge_nose: [0.45, 0.07, 0.5],
  lip_ratio: [1.65, 0.3, 1.5], mouth_corner: [1, 3, -1.5], jfa: [90, 8, 100], ear_ratio: [1.04, 0.06, 1.1],
  midface_ratio: [1.03, 0.06, 1.0], symmetry: [0, 1.2, 2.0], cheek_lean: [82, 4, 88],
  // side
  orbital_vector: [1, 3, -3], nasal_wh: [0.63, 0.07, 0.6], nasofrontal: [120, 7, 130], submental: [108, 11, 122],
  ramus_mandible: [0.7, 0.08, 0.66], frankfort_tip: [56, 5, 58], fh_recession: [92, 4, 88], mentolabial: [120, 11, 125],
  nasal_projection: [0.58, 0.05, 0.57], convexity_g: [170, 5, 166], anterior_depth: [1.04, 0.07, 1.0],
  holdaway: [11, 4, 13], browridge_incl: [12, 6, 8], upper_forehead: [8, 6, 10], convexity_n: [167, 5, 164],
  total_convexity: [143, 5, 140], depth_height: [1.2, 0.07, 1.15], midface_proj: [6, 4, 4], z_angle: [77, 6, 73],
  nasal_tip_angle: [110, 8, 108], tip_rotation: [18, 7, 22], nasolabial: [103, 10, 100], nasofacial: [33, 4, 33],
  nasomental: [126, 5, 128], s_lower: [0, 3, 0.5], s_upper: [-1, 3, -0.5], e_lower: [-2, 3, -1], e_upper: [-4.5, 3, -3],
  b_lower: [4.5, 3, 4], b_upper: [7, 3, 6], mpa: [21, 5.5, 26], gonion_mouth: [4, 6, 10], gonial: [117, 7, 123],
};
// Measurements where only the size of the deviation matters (ideal is 0, values can't be negative)
const ONE_SIDED = new Set(['symmetry', 'nose_tip_pos']);
// How much each measurement counts in Harmony. Core proportions that drive perceived attractiveness weigh
// most; minor or hard-to-place measurements (ears, cupid's bow, lip lines, nose tip angles) weigh least.
const WEIGHTS = {
  fwhr: 3, middle_third: 3, lower_third: 3, esr: 3, canthal_tilt: 3, midface_ratio: 3, bigonial: 3, chin_philtrum: 3,
  symmetry: 3, fh_recession: 3, convexity_g: 3, submental: 3, eye_ar: 3, cheekbone_height: 3,
  total_wh: 1.2, brow_low_set: 2, jfa: 2, gonial: 2, mpa: 2, top_third: 1.2, one_eye_apart: 2, nasofrontal: 2,
  z_angle: 2, e_upper: 2, e_lower: 2, neck_width: 2, lower_third_prop: 2,
  mouth_nose: 1.2, icd_nose: 1.2, ipd_mouth: 1.2, lip_ratio: 1.2, bitemporal: 1.2, jaw_slope: 1.2, nasolabial: 1.2,
  nasofacial: 1.2, nasomental: 1.2, ramus_mandible: 1.2, holdaway: 1.2, mentolabial: 1.2, total_convexity: 1.2,
  convexity_n: 1.2, orbital_vector: 1.2, nasal_projection: 1.2, browridge_incl: 1.2,
  cupid_depth: 0.6, brow_length: 0.6, brow_tilt: 0.6, mouth_corner: 0.6, nose_tip_pos: 0.6, bridge_nose: 0.6,
  ear_angle: 0.6, ear_ratio: 0.6, iaa: 0.6, iaa_jfa_dev: 0.6, s_lower: 0.6, s_upper: 0.6, b_lower: 0.6, b_upper: 0.6,
  frankfort_tip: 0.6, anterior_depth: 0.6, depth_height: 0.6, midface_proj: 0.6, nasal_tip_angle: 0.6,
  tip_rotation: 0.6, nasal_wh: 0.6, upper_forehead: 0.6, gonion_mouth: 0.6,
};
// Score curve: flat top within ±TOL SD of the ideal, then a heavy-tailed fall-off of width WIDTH (in SD).
const TOL = 0.2, WIDTH = 0.85;
for (const m of M) {
  const [ideal, sd, mean] = NORMS[m.id];
  m.ideal = ideal; m.sd = sd; m.mean = mean;
  m.oneSided = ONE_SIDED.has(m.id);
  const half = (TOL + 0.5 * WIDTH) * sd; // inside this band the score stays ≥ 8.5
  m.lo = m.oneSided ? ideal : ideal - half;
  m.hi = ideal + half;
  m.sig = sd;
  m.w = WEIGHTS[m.id] ?? 1;
}

// ───────────────────────── scoring ─────────────────────────
export function scoreValue(m, v) {
  if (!Number.isFinite(v)) return 0;
  const z = Math.max(0, Math.abs(v - m.ideal) / m.sd - TOL);
  return 10 * Math.pow(1 + (z * z) / (3 * WIDTH * WIDTH), -2);
}

export function fmt(m, v) {
  if (!Number.isFinite(v)) return '—';
  if (m.unit === 'x') return v.toFixed(2) + 'x';
  if (m.unit === '%') return v.toFixed(1) + '%';
  return v.toFixed(1) + '°';
}
export const fmtRange = (m) => {
  const f = (v) => (m.unit === 'x' ? v.toFixed(2) : String(+v.toFixed(1)));
  const u = m.unit === 'x' ? 'x' : m.unit;
  return `${f(m.lo)}–${f(m.hi)}${u}`;
};
// Position of value along the bar [0..1] and the ideal band
export function barGeom(m) {
  const span = m.hi - m.lo;
  const a = m.lo - Math.max(m.sig * 2.6, span * 0.6), b = m.hi + Math.max(m.sig * 2.6, span * 0.6);
  const at = (v) => clamp((v - a) / (b - a), 0, 1);
  return { a, b, at, lo: at(m.lo), hi: at(m.hi), loW: at(m.lo - m.sig * 1.5), hiW: at(m.hi + m.sig * 1.5) };
}

// Labels follow the population scale (average man ≈ 5.4, top 5% ≈ 7.0, top 1% ≈ 7.7)
export function rating(s) {
  if (s >= 7.6) return 'Exceptional';
  if (s >= 6.9) return 'Excellent';
  if (s >= 6.3) return 'Good';
  if (s >= 5.8) return 'Above Average';
  if (s >= 5.1) return 'Average';
  if (s >= 4.4) return 'Below Average';
  return 'Needs Work';
}
export function scoreColor(s) {
  if (s >= 6.9) return 'var(--good)';
  if (s >= 5.8) return 'var(--ok)';
  if (s >= 4.6) return 'var(--warn)';
  return 'var(--bad)';
}

// ───────────────────────── assessments & pillars ─────────────────────────
// w = the assessment's share of its pillar. Shares follow two lines of evidence: eye-tracking studies, where
// the central triangle (eyes, nose, mouth) draws most attention during attractiveness judgments, and
// conjoint studies of male faces, where jaw and brow prominence outweigh cheekbones and eye size.
// Larger regions (lower face, midface) also outweigh small peripheral ones (ears, hairline).
const A = (id, name, metrics, desc, w) => ({ id, name, metrics, desc, w });
export const PILLARS = [
  { id: 'harmony', name: 'Harmony', blurb: 'How well your proportions fit together — 70 front and side ratios compared with ideal male ranges.' },
  { id: 'angularity', name: 'Angularity', blurb: 'How sharp and defined your bone structure reads: cheekbones, jaw, chin and the area under the jaw.',
    items: [
      A('cheekbones', 'Cheekbone Prominence', [['cheekbone_height', 2], ['bitemporal', 1], ['orbital_vector', 1]], 'High, forward cheekbones that are wider than the temples.', 0.18),
      A('jaw_def', 'Jaw Definition', [['gonial', 2], ['bigonial', 2], ['jfa', 1], ['jaw_slope', 1], ['mpa', 1]], 'A wide jaw with a crisp angle and a flat lower border.', 0.32),
      A('cheek_lean', 'Cheek Leanness', [['cheek_lean', 2], ['bigonial', 1]], 'How much the face narrows below the cheekbones — estimated from the facial contour.', 0.12),
      A('chin_def', 'Chin Definition', [['chin_philtrum', 2], ['fh_recession', 2], ['mentolabial', 1], ['z_angle', 1]], 'A tall, forward chin with a clear fold under the lip.', 0.22),
      A('submental', 'Submental Definition', [['submental', 2], ['mpa', 1], ['gonion_mouth', 1]], 'A sharp angle under the chin and a defined neck–jaw transition.', 0.16),
    ] },
  { id: 'dimorphism', name: 'Dimorphism', blurb: 'How strongly your features show male‑typical traits.',
    items: [
      A('d_jaw', 'Jaw', [['bigonial', 2], ['gonial', 1], ['ramus_mandible', 1]], 'Wide jaw, tall ramus, sharp angle.', 0.2),
      A('d_brow', 'Brow Ridge', [['brow_low_set', 2], ['browridge_incl', 1], ['nasofrontal', 1]], 'Low brows and a projecting brow ridge.', 0.18),
      A('d_shape', 'Face Shape', [['fwhr', 2], ['total_wh', 1]], 'Wide, compact face proportions.', 0.14),
      A('d_eyes', 'Eyes', [['canthal_tilt', 1], ['eye_ar', 2]], 'Narrow, horizontally long eyes with positive tilt.', 0.08),
      A('d_nose', 'Nose', [['icd_nose', 1], ['nasal_projection', 1], ['nasal_wh', 1]], 'A proportionate, well‑projected nose.', 0.07),
      A('d_hair', 'Hairline', [['top_third', 2], ['upper_forehead', 1]], 'Forehead height and slope.', 0.04),
      A('d_lips', 'Lips', [['lip_ratio', 1], ['e_lower', 1], ['e_upper', 1]], 'Moderate lip fullness and projection.', 0.04),
      A('d_chin', 'Chin', [['chin_philtrum', 2], ['fh_recession', 1]], 'A tall, projecting chin.', 0.12),
      A('d_cheek', 'Cheekbones', [['cheekbone_height', 1], ['bitemporal', 1]], 'High cheekbones.', 0.07),
      A('d_neck', 'Neck', [['neck_width', 2], ['submental', 1]], 'A thick neck and sharp neck–chin angle.', 0.06),
    ] },
  { id: 'features', name: 'Features', blurb: 'Feature‑by‑feature assessment of eyes, brows, nose, lips, jaw, chin, cheeks, forehead, ears and symmetry. (Skin is not assessed — it can’t be measured from landmarks.)',
    items: [
      A('f_eyes', 'Eyes', [['canthal_tilt', 2], ['eye_ar', 2], ['one_eye_apart', 1], ['esr', 1], ['orbital_vector', 1]], 'Shape, tilt and spacing of the eyes.', 0.2),
      A('f_brows', 'Eyebrows', [['brow_low_set', 2], ['brow_tilt', 1], ['brow_length', 1]], 'Position, tilt and length of the brows.', 0.1),
      A('f_nose', 'Nose', [['icd_nose', 1], ['bridge_nose', 1], ['nose_tip_pos', 1], ['nasofrontal', 1], ['nasolabial', 1], ['nasal_projection', 1], ['nasal_tip_angle', 1], ['tip_rotation', 1], ['nasofacial', 1], ['nasomental', 1]], 'Width, bridge, projection and angles of the nose.', 0.15),
      A('f_lips', 'Lips', [['lip_ratio', 1], ['cupid_depth', 1], ['mouth_corner', 1], ['mouth_nose', 1], ['ipd_mouth', 1], ['e_upper', 1], ['e_lower', 1], ['s_upper', 1], ['s_lower', 1]], 'Lip proportions and position against profile lines.', 0.13),
      A('f_jaw', 'Jaw', [['gonial', 2], ['bigonial', 2], ['jfa', 1], ['jaw_slope', 1], ['mpa', 1], ['ramus_mandible', 1], ['gonion_mouth', 1]], 'Jaw width, angle and slope.', 0.14),
      A('f_chin', 'Chin', [['chin_philtrum', 2], ['fh_recession', 2], ['mentolabial', 1], ['holdaway', 1], ['z_angle', 1]], 'Chin height and projection.', 0.09),
      A('f_cheeks', 'Cheeks', [['cheekbone_height', 2], ['cheek_lean', 1]], 'Cheekbone height and lower‑cheek leanness.', 0.07),
      A('f_forehead', 'Forehead', [['top_third', 2], ['bitemporal', 1], ['browridge_incl', 1], ['upper_forehead', 1]], 'Forehead height, width and slope.', 0.04),
      A('f_ears_neck', 'Ears & Neck', [['ear_angle', 1], ['ear_ratio', 1], ['neck_width', 1], ['submental', 1]], 'Ear protrusion and neck build.', 0.02),
      A('f_sym', 'Symmetry', [['symmetry', 2], ['nose_tip_pos', 1], ['iaa_jfa_dev', 1]], 'Left–right balance and midline alignment.', 0.06),
    ] },
];
export const PILLAR_WEIGHTS = { harmony: 0.35, angularity: 0.2, dimorphism: 0.25, features: 0.2 };

// ───────────────────────── calibration ─────────────────────────
// Final scores are put on a population scale matched to FaceIQ's: 7.03 → top 5.0%, 7.77 → top 0.8%,
// i.e. scores ~ Normal(mean 5.44, SD 0.97). CAL maps each raw composite to that scale with
// percentile-matched knots [raw, shown], estimated by simulating adult men from NORMS.
// Regenerate with: node tools/calibrate.mjs
export const POP = { mean: 5.44, sd: 0.97 };
const CAL = {
  harmony: [[2.094, 2.44], [2.623, 3.18], [3.173, 3.84], [3.712, 4.48], [4.524, 5.44], [5.229, 6.40], [5.655, 7.04], [6.069, 7.70], [6.540, 8.44]],
  angularity: [[0.921, 2.44], [1.362, 3.18], [1.947, 3.84], [2.606, 4.48], [3.816, 5.44], [5.173, 6.40], [6.080, 7.04], [7.015, 7.70], [7.975, 8.44]],
  dimorphism: [[1.292, 2.44], [1.779, 3.18], [2.355, 3.84], [2.976, 4.48], [4.052, 5.44], [5.157, 6.40], [5.892, 7.04], [6.640, 7.70], [7.461, 8.44]],
  features: [[1.596, 2.44], [2.134, 3.18], [2.668, 3.84], [3.218, 4.48], [4.151, 5.44], [5.043, 6.40], [5.591, 7.04], [6.140, 7.70], [6.759, 8.44]],
  overall: [[1.679, 2.44], [2.178, 3.18], [2.710, 3.84], [3.281, 4.48], [4.205, 5.44], [5.091, 6.40], [5.630, 7.04], [6.176, 7.70], [6.724, 8.44]],
};
// Piecewise-linear through the knots, extended past the ends with the outer slopes
function calibrate(raw, knots) {
  if (!Number.isFinite(raw)) return 0;
  let i = 0;
  while (i < knots.length - 2 && raw > knots[i + 1][0]) i++;
  const [x0, y0] = knots[i], [x1, y1] = knots[i + 1];
  return clamp(y0 + ((y1 - y0) * (raw - x0)) / ((x1 - x0) || 1), 0, 9.99);
}

// Weighted mean that leans on weak points: the weakest third (by weight) counts extra,
// so one clear flaw drags a score down more than one strength lifts it.
function flawMean(items) {
  const it = items.filter((x) => Number.isFinite(x.s) && x.w > 0).sort((a, b) => a.s - b.s);
  const W = it.reduce((a, x) => a + x.w, 0);
  if (!W) return 0;
  const mean = it.reduce((a, x) => a + x.s * x.w, 0) / W;
  let acc = 0, sum = 0;
  for (const x of it) {
    const take = Math.min(x.w, W / 3 - acc);
    if (take <= 0) break;
    sum += x.s * take; acc += take;
  }
  return 0.7 * mean + 0.3 * (sum / acc);
}

// Pure scoring from raw measurement values ({id: number}) — used by analyze, Simulate and calibration.
export function scoreValues(raw) {
  const values = {};
  for (const m of M) values[m.id] = { v: raw[m.id], s: scoreValue(m, raw[m.id]) };
  const item = (id, w) => ({ s: values[id].s, w: Number.isFinite(values[id].v) ? w : 0 });
  const pillars = {}, rawP = {};
  const hmList = M.filter((m) => m.hm);
  rawP.harmony = flawMean(hmList.map((m) => item(m.id, m.w)));
  pillars.harmony = { score: calibrate(rawP.harmony, CAL.harmony), raw: rawP.harmony, items: hmList.map((m) => m.id) };
  for (const p of PILLARS.slice(1)) {
    const items = p.items.map((a) => ({ ...a, score: flawMean(a.metrics.map(([id, w]) => item(id, w * METRIC_BY_ID[id].w))) }));
    rawP[p.id] = flawMean(items.map((a) => ({ s: a.score, w: a.w })));
    pillars[p.id] = { score: calibrate(rawP[p.id], CAL[p.id]), raw: rawP[p.id], items };
  }
  const rawOverall = Object.entries(PILLAR_WEIGHTS).reduce((s, [k, w]) => s + rawP[k] * w, 0);
  const overall = calibrate(rawOverall, CAL.overall);
  return { values, pillars, overall, rawOverall, percentile: percentile(overall) };
}

// ───────────────────────── run analysis ─────────────────────────
export function measure(front, side) {
  const ff = frontFrame(front), sf = sideFrame(side);
  const fc = frontCtx(ff.N), sc = sideCtx(sf.N);
  const raw = {};
  for (const m of M) {
    const N = m.view === 'front' ? ff.N : sf.N;
    const c = m.view === 'front' ? fc : sc;
    let v;
    try { v = m.f(N, c); } catch { v = NaN; }
    raw[m.id] = v;
  }
  return { raw, ff, fc, sf, sc };
}

export function analyze(front, side, meta = {}) {
  const { raw, ff, fc, sf, sc } = measure(front, side);
  return { ...scoreValues(raw), quality: quality(front, side, ff, fc, sf, sc, meta), frames: { front: ff, side: sf } };
}

// Normal CDF → share of men scoring below
export function percentile(s) {
  const z = (s - POP.mean) / POP.sd;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p * 100;
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
  const yaw = (ff.N.prn.x - fc.midX) / (fc.bizyg / 2);
  const halfR = fc.midX - ff.N.zy_r.x, halfL = ff.N.zy_l.x - fc.midX;
  const halfDiff = Math.abs(halfR - halfL) / ((halfR + halfL) / 2);
  if (Math.abs(yaw) > 0.07 || halfDiff > 0.12) out.push({ level: 'warn', view: 'front', text: 'Head looks turned to one side. Width ratios may be off by a few percent — retake facing the camera straight on.' });
  else out.push({ level: 'ok', view: 'front', text: 'Head is facing straight on.' });
  if (sh) {
    const faceFrac = sc.H / sh.h;
    if (faceFrac < 0.15) out.push({ level: 'warn', view: 'side', text: 'Profile face is small in the frame — crop closer for better precision.' });
  }
  if (Math.abs(sf.tilt) > 14) out.push({ level: 'warn', view: 'side', text: `Frankfort plane is ${sf.tilt.toFixed(0)}° off level. Angles are measured against it, but double‑check the ear‑canal and under‑eye points.` });
  else out.push({ level: 'ok', view: 'side', text: `Profile aligned to the Frankfort plane (${sf.tilt >= 0 ? '+' : ''}${sf.tilt.toFixed(1)}°).` });
  return out;
}

// Overlay primitives for one metric on a finished analysis
export function overlayFor(m, res) {
  const fr = res.frames[m.view];
  const c = m.view === 'front' ? frontCtx(fr.N) : sideCtx(fr.N);
  let prims = [];
  try { prims = m.ov(fr.N, c); } catch { prims = []; }
  return { prims, inv: fr.inv };
}

// Every metric an assessment depends on, with values
export function assessmentDetail(a, res) {
  return a.metrics.map(([id, w]) => ({ m: METRIC_BY_ID[id], w, ...res.values[id] }));
}
