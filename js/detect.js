// Automatic first-pass landmark placement.
// 1. MediaPipe Face Landmarker (478-point mesh) gives the frontal landmarks.
// 2. Points the mesh does not cover (hairline, profile neck) are found with pixel heuristics.
// 3. Profile contour points are snapped to the skin/background silhouette.
// If the model can't load or finds no face, a template fitted to the reference face is used.

import { avg, mid, dist, lerp, sub, add, mul, len, fitSimilarity } from './geom.js';
import { refPoints } from './landmarks.js';

const MP_VER = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarkerPromise = null;

export function loadDetector() {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(MP_URL);
    const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.25,
      minFacePresenceConfidence: 0.25,
      minTrackingConfidence: 0.25,
    });
    try {
      return await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      return await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
    }
  })().catch((e) => {
    landmarkerPromise = null;
    throw e;
  });
  return landmarkerPromise;
}

// Run the mesh. Returns array of {x,y} in image pixels, or null.
async function runMesh(img) {
  const det = await loadDetector();
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const tryOn = (src, sx = 1, ox = 0, oy = 0) => {
    const r = det.detect(src);
    if (!r.faceLandmarks || !r.faceLandmarks.length) return null;
    const cw = src.width, ch = src.height;
    return r.faceLandmarks[0].map((p) => ({ x: (p.x * cw - ox) / sx, y: (p.y * ch - oy) / sx, z: p.z }));
  };
  let mesh = tryOn(img);
  if (mesh) return mesh;
  // Retry on a padded square canvas — helps with tight crops and profile shots.
  const side = Math.max(w, h) * 1.3;
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(Math.min(side, 1600));
  const s = c.width / side;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  const ox = ((side - w) / 2) * s, oy = ((side - h) / 2) * s;
  ctx.drawImage(img, ox, oy, w * s, h * s);
  mesh = tryOn(c, s, ox, oy);
  if (mesh) return mesh;
  // Last try: mirrored (the detector is a little better on one profile side)
  ctx.save();
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, ox, oy, w * s, h * s);
  ctx.restore();
  const m2 = tryOn(c, s, ox, oy);
  if (m2) return m2.map((p) => ({ x: w - p.x, y: p.y, z: p.z }));
  return null;
}

// ---------- pixel helpers ----------
function pixelReader(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  // Box-averaged colour around (x,y)
  const at = (x, y, r = 2) => {
    let R = 0, G = 0, B = 0, n = 0;
    const x0 = Math.max(0, Math.round(x - r)), x1 = Math.min(w - 1, Math.round(x + r));
    const y0 = Math.max(0, Math.round(y - r)), y1 = Math.min(h - 1, Math.round(y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const i = (yy * w + xx) * 4;
      R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
    }
    return n ? [R / n, G / n, B / n] : [0, 0, 0];
  };
  return { at, w, h };
}
const cdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const chroma = (c) => { const t = c[0] + c[1] + c[2] + 1; return [c[0] / t, c[1] / t]; };
const chromaDist = (a, b) => { const p = chroma(a), q = chroma(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
function avgSkin(px, pts) {
  const cs = pts.map((p) => px.at(p.x, p.y, 4));
  return [0, 1, 2].map((i) => cs.reduce((a, c) => a + c[i], 0) / cs.length);
}
// Outermost pixel along a horizontal walk whose chroma still matches skin (ears are skin, background usually isn't)
function outermostSkin(px, start, sign, maxLen, skin) {
  let last = null, gap = 0;
  for (let t = 0; t <= maxLen; t += 1) {
    const x = start.x + sign * t;
    if (x < 1 || x > px.w - 2) break;
    const c = px.at(x, start.y, 1);
    const isSkin = chromaDist(c, skin) < 0.028 && c[0] + c[1] + c[2] > 140;
    if (isSkin) { last = { x, y: start.y }; gap = 0; } else if (last && ++gap > maxLen * 0.25) break;
  }
  return last;
}

// Walk from `start` in direction `dir` (unit) looking for where colour stops matching the skin sample.
function findSkinEdge(px, start, dir, maxLen, skin, r = 2) {
  const step = Math.max(1, maxLen / 400);
  let run = 0, first = null;
  const thr = 38;
  for (let t = 0; t <= maxLen; t += step) {
    const p = { x: start.x + dir.x * t, y: start.y + dir.y * t };
    if (p.x < 1 || p.y < 1 || p.x > px.w - 2 || p.y > px.h - 2) break;
    const c = px.at(p.x, p.y, r);
    if (cdist(c, skin) > thr) {
      if (!run) first = p;
      run++;
      if (run * step >= Math.max(4, maxLen * 0.02)) return first;
    } else run = 0;
  }
  return null;
}

// Snap a point horizontally to the strongest silhouette edge near it.
// fwd = +1 if the face points to image right.
function snapSilhouette(px, p, fwd, radius) {
  let best = null, bestV = 0;
  for (let dx = -radius; dx <= radius; dx += 1) {
    const x = p.x + dx;
    const inner = px.at(x - 3 * fwd, p.y, 1), outer = px.at(x + 3 * fwd, p.y, 1);
    const v = cdist(inner, outer);
    if (v > bestV) { bestV = v; best = x; }
  }
  return bestV > 32 ? { x: best, y: p.y } : p;
}
function snapVertical(px, p, radius) {
  let best = null, bestV = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const y = p.y + dy;
    const v = cdist(px.at(p.x, y - 3, 1), px.at(p.x, y + 3, 1));
    if (v > bestV) { bestV = v; best = y; }
  }
  return bestV > 32 ? { x: p.x, y: best } : p;
}

// ---------- frontal ----------
const pick = (m, i) => ({ x: m[i].x, y: m[i].y });
const mm = (m, a, b) => mid(pick(m, a), pick(m, b));

function lateral(m, ids, centerX, sign) {
  // the candidate farthest from the midline on the given side
  let best = null, bv = -Infinity;
  for (const i of ids) {
    const v = (m[i].x - centerX) * sign;
    if (v > bv) { bv = v; best = pick(m, i); }
  }
  return best;
}

function frontFromMesh(m, px) {
  const cx = (m[468].x + m[473].x) / 2;
  const s = Math.sign(m[473].x - m[468].x) || 1; // +1: subject's left is image right (normal photo)
  const lm = {
    pupil_r: pick(m, 468), pupil_l: pick(m, 473),
    endo_r: pick(m, 133), exo_r: pick(m, 33), lidU_r: pick(m, 159), lidL_r: pick(m, 145),
    endo_l: pick(m, 362), exo_l: pick(m, 263), lidU_l: pick(m, 386), lidL_l: pick(m, 374),
    brI_r: mm(m, 55, 107), brP_r: mm(m, 52, 105), brT_r: mm(m, 46, 70),
    brI_l: mm(m, 285, 336), brP_l: mm(m, 282, 334), brT_l: mm(m, 276, 300),
    glabella: pick(m, 9), nasion: pick(m, 168),
    bridge_r: mm(m, 196, 198), bridge_l: mm(m, 419, 420),
    ala_r: lateral(m, [64, 98, 129, 48, 102, 240], cx, -s),
    ala_l: lateral(m, [294, 327, 358, 278, 331, 460], cx, s),
    prn: pick(m, 1), sn: pick(m, 2),
    ch_r: pick(m, 61), ch_l: pick(m, 291), cupid_r: pick(m, 37), cupid_l: pick(m, 267),
    ls: pick(m, 0), sto: mm(m, 13, 14), li: pick(m, 17),
    temple_r: pick(m, 54), temple_l: pick(m, 284),
    zy_r: lateral(m, [234, 127, 93], cx, -s), zy_l: lateral(m, [454, 356, 323], cx, s),
    cheek_r: null, cheek_l: null, go_r: null, go_l: null,
    chin_r: pick(m, 176), chin_l: pick(m, 400),
    me: pick(m, 152),
  };
  // Jaw angle: where the ramus line (side of the face) meets the lower jaw border, snapped to the contour.
  // Lower cheek: the face contour at mouth-corner height.
  const ovalR = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152].map((i) => pick(m, i));
  const ovalL = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152].map((i) => pick(m, i));
  for (const [side, oval] of [['r', ovalR], ['l', ovalL]]) {
    const I = lineX(oval[1], oval[2], oval[6], oval[8]);
    let best = oval[3], bd = Infinity;
    for (const p of oval.slice(2, 7)) { const d = I ? dist(p, I) : 0; if (d < bd) { bd = d; best = p; } }
    // refine between neighbours by projecting the intersection onto the polyline
    lm['go_' + side] = I ? nearestOnPolyline(oval.slice(1, 8), I) : best;
    lm['cheek_' + side] = atY(oval, lm['ch_' + side].y);
  }
  // Temple: the mesh forehead edge sits a bit high; settle it just above the brow tail level.
  for (const side of ['r', 'l']) {
    const t = lm['temple_' + side], bt = lm['brT_' + side];
    lm['temple_' + side] = { x: t.x, y: bt.y - Math.abs(bt.y - t.y) * 0.55 };
  }
  const faceH = dist(pick(m, 10), lm.me);
  // Ears: walk sideways from the cheekbone and keep the outermost skin-coloured pixel (the ear rim).
  const cheekSkin = avgSkin(px, [lerp(lm.zy_r, lm.prn, 0.45), lerp(lm.zy_l, lm.prn, 0.45)]);
  for (const [side, sign] of [['r', -s], ['l', s]]) {
    const zy = lm['zy_' + side];
    const y = (lm['pupil_' + side].y + lm.sn.y) / 2;
    const out = outermostSkin(px, { x: zy.x, y }, sign, faceH * 0.2, cheekSkin);
    const ear = out && Math.abs(out.x - zy.x) > faceH * 0.012 ? out : { x: zy.x + sign * faceH * 0.05, y };
    lm['ear_' + side] = ear;
    lm['earTop_' + side] = { x: zy.x + (ear.x - zy.x) * 0.3, y: lm['brT_' + side].y + faceH * 0.02 };
  }
  // Neck: below the jaw, walk out from the centre line to the skin edge on each side.
  const ny = lm.me.y + faceH * 0.12;
  const nc = { x: lm.me.x, y: ny };
  const neckSkin = px.at(nc.x, nc.y, 4);
  const halfJaw = Math.abs(lm.go_l.x - lm.go_r.x) / 2;
  for (const [side, sign] of [['r', -s], ['l', s]]) {
    const hit = findSkinEdge(px, nc, { x: sign, y: 0 }, halfJaw * 1.4, neckSkin);
    const ok = hit && Math.abs(hit.x - nc.x) > halfJaw * 0.55;
    lm['neck_' + side] = ok ? { x: hit.x - sign * 2, y: ny } : { x: nc.x + sign * halfJaw * 0.82, y: ny };
  }
  // Hairline: walk up from the mesh's top-of-forehead until the colour leaves skin.
  const top = pick(m, 10), g = lm.glabella;
  const up = sub(top, g), L = len(up) || 1;
  const dir = { x: up.x / L, y: up.y / L };
  const skin = px.at(...Object.values(lerp(g, top, 0.6)), 4);
  const hit = findSkinEdge(px, lerp(g, top, 0.75), dir, L * 1.4, skin);
  lm.trichion = hit || add(top, mul(dir, L * 0.25));
  return { lm, skin: cheekSkin };
}

function lineX(a, b, c, d) {
  const x1 = b.x - a.x, y1 = b.y - a.y, x2 = d.x - c.x, y2 = d.y - c.y;
  const den = x1 * y2 - y1 * x2;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c.x - a.x) * y2 - (c.y - a.y) * x2) / den;
  return { x: a.x + x1 * t, y: a.y + y1 * t };
}
function nearestOnPolyline(pts, p) {
  let best = pts[0], bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    const q = { x: a.x + vx * t, y: a.y + vy * t };
    const d = dist(q, p);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function atY(pts, y) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return { x: a.x + (b.x - a.x) * t, y };
    }
  }
  return pts[3];
}

// ---------- profile ----------
function sideFromMesh(m, px) {
  const fwd = Math.sign(m[1].x - avg([m[234], m[454]]).x) || 1; // nose direction
  // Visible side of the face (the one closer to the camera)
  const leftVisible = fwd > 0; // facing image-right → subject's left side visible
  const V = (r, l) => pick(m, leftVisible ? l : r);
  const faceH = dist(pick(m, 10), pick(m, 152));
  const lm = {
    g: pick(m, 9), n: pick(m, 168), prn: pick(m, 1), cm: pick(m, 94), sn: pick(m, 2),
    ls: pick(m, 0), sto: mm(m, 13, 14), li: pick(m, 17), sm: pick(m, 18), pog: pick(m, 199), me: pick(m, 152),
    ac: V(129, 358), go: V(172, 397), ramus: V(132, 361), tragus: V(234, 454), or: V(119, 348),
    cornea: V(468, 473),
  };
  // Profile: the most-forward mesh points are a better silhouette guess than fixed indices.
  const r = Math.round(faceH * 0.05);
  for (const k of ['g', 'n', 'prn', 'ls', 'li', 'pog']) lm[k] = snapSilhouette(px, lm[k], fwd, r);
  lm.me = snapVertical(px, lm.me, r);
  // Neck: below and behind the chin
  const jaw = sub(lm.go, lm.me);
  lm.c = add(lerp(lm.me, lm.go, 0.48), { x: 0, y: Math.abs(jaw.x) * 0.12 + faceH * 0.03 });
  lm.neck = add(lm.c, { x: -fwd * faceH * 0.06, y: faceH * 0.3 });
  // Hairline on the forehead contour
  const top = pick(m, 10);
  const up = sub(top, lm.g), L = len(up) || 1;
  const dir = { x: up.x / L, y: up.y / L };
  const skin = px.at(...Object.values(lerp(lm.g, top, 0.5)), 3);
  const hit = findSkinEdge(px, lerp(lm.g, top, 0.6), dir, L * 1.3, skin);
  lm.tr = hit ? snapSilhouette(px, hit, fwd, r) : add(top, mul(dir, L * 0.2));
  lm.fh = snapSilhouette(px, lerp(lm.g, lm.tr, 0.5), fwd, r);
  // Jaw joint (condylion) sits just in front of and slightly below the ear canal.
  lm.ramus = { x: lm.tragus.x + fwd * faceH * 0.05, y: lm.tragus.y + faceH * 0.03 };
  // Cornea: the iris centre is slightly behind the corneal apex.
  lm.cornea = { x: lm.cornea.x + fwd * faceH * 0.012, y: lm.cornea.y };
  return lm;
}

// ---------- template fallback ----------
export function templateFor(view, img) {
  const ref = refPoints(view);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  // Reference face is centred in a 767x1024 frame; place it the same way, scaled to the image height.
  const s = Math.min(w / 767, h / 1024);
  const ox = (w - 767 * s) / 2, oy = (h - 1024 * s) / 2;
  const out = {};
  for (const k in ref) out[k] = { x: ox + ref[k].x * s, y: oy + ref[k].y * s };
  return out;
}

// Re-fit unconfirmed points from the template onto the ones the user already placed.
export function refitTemplate(view, lm, confirmed) {
  const ref = refPoints(view);
  const ids = Object.keys(confirmed).filter((k) => confirmed[k] && ref[k]);
  if (ids.length < 2) return lm;
  const T = fitSimilarity(ids.map((k) => ref[k]), ids.map((k) => lm[k]));
  const out = { ...lm };
  for (const k in ref) if (!confirmed[k]) out[k] = T(ref[k]);
  return out;
}

// ---------- profile from silhouette (used when the mesh can't see a 90° profile) ----------
// Traces the face outline (background colour or skin colour), then finds nose, lips and chin as
// bumps/dips on it. Vertical spacing is predicted from the person's own front landmarks.
function profileFromSilhouette(img, front, skinRGB) {
  const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
  const sc = Math.min(1, 720 / H0);
  const w = Math.round(W0 * sc), h = Math.round(H0 * sc);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const D = ctx.getImageData(0, 0, w, h).data;
  const rgb = (x, y) => { const i = (y * w + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };

  // background from the border
  const border = [];
  for (let x = 0; x < w; x += 3) border.push(rgb(x, 1));
  for (let y = 0; y < h * 0.75; y += 3) { border.push(rgb(1, y)); border.push(rgb(w - 2, y)); }
  const med = [0, 1, 2].map((i) => border.map((c) => c[i]).sort((a, b) => a - b)[border.length >> 1]);
  const uniform = border.filter((c) => cdist(c, med) < 30).length / border.length > 0.72;
  const skin = skinRGB || [190, 140, 115];

  const raw = new Uint8Array(w * h);
  let hairX = 0, hairN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rgb(x, y);
    // Trace skin, not hair: hair can stick out further than the nose. A plain background adds a second check.
    const isSkin = chromaDist(c, skin) < 0.065 && c[0] + c[1] + c[2] > 120;
    raw[y * w + x] = isSkin && (!uniform || cdist(c, med) > 30) ? 1 : 0;
    if (c[0] + c[1] + c[2] < 180 && y < h * 0.6) { hairX += x; hairN++; }
  }
  // opening (erode then dilate) removes speckle such as hair highlights
  const er = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let ok = 1;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!raw[(y + dy) * w + x + dx]) { ok = 0; break; }
    er[y * w + x] = ok;
  }
  const op = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!er[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) op[(y + dy) * w + x + dx] = 1;
  }
  // keep the largest connected region (the face + neck)
  const lab = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let best = 0, bestN = 0, cur = 0;
  for (let i = 0; i < w * h; i++) {
    if (!op[i] || lab[i]) continue;
    cur++;
    let qh = 0, qt = 0, n = 0;
    queue[qt++] = i; lab[i] = cur;
    while (qh < qt) {
      const j = queue[qh++]; n++;
      const x = j % w, y = (j / w) | 0;
      if (x > 0 && op[j - 1] && !lab[j - 1]) { lab[j - 1] = cur; queue[qt++] = j - 1; }
      if (x < w - 1 && op[j + 1] && !lab[j + 1]) { lab[j + 1] = cur; queue[qt++] = j + 1; }
      if (y > 0 && op[j - w] && !lab[j - w]) { lab[j - w] = cur; queue[qt++] = j - w; }
      if (y < h - 1 && op[j + w] && !lab[j + w]) { lab[j + w] = cur; queue[qt++] = j + w; }
    }
    if (n > bestN) { bestN = n; best = cur; }
  }
  if (bestN < w * h * 0.01) return null;
  const fg = new Uint8Array(w * h);
  let skinX = 0;
  for (let i = 0; i < w * h; i++) if (lab[i] === best) { fg[i] = 1; skinX += i % w; }
  skinX /= bestN;
  const F = (x, y) => x >= 0 && y >= 0 && x < w && y < h && fg[y * w + x] === 1;

  // outermost foreground run (≥3 px) per row, from each side
  const outer = (dir) => {
    const c = new Float32Array(h).fill(NaN);
    for (let y = 0; y < h; y++) {
      if (dir > 0) { for (let x = w - 1; x >= 2; x--) if (F(x, y) && F(x - 1, y) && F(x - 2, y)) { c[y] = x; break; } }
      else { for (let x = 0; x < w - 2; x++) if (F(x, y) && F(x + 1, y) && F(x + 2, y)) { c[y] = x; break; } }
    }
    return c;
  };
  let yTop = 0, yBot = h - 1;
  const rowHas = (y) => { let n = 0; for (let x = 0; x < w; x++) n += fg[y * w + x]; return n > 4; };
  while (yTop < h - 1 && !rowHas(yTop)) yTop++;
  while (yBot > yTop && !rowHas(yBot)) yBot--;
  const span = yBot - yTop;
  if (span < h * 0.25) return null;
  const smooth = (a) => {
    const o = new Float32Array(a.length).fill(NaN);
    for (let i = 0; i < a.length; i++) {
      let s = 0, n = 0;
      for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < a.length && !Number.isNaN(a[j])) { s += a[j]; n++; }
      o[i] = n ? s / n : NaN;
    }
    return o;
  };
  const sides = [1, -1].map((dir) => {
    const raw = outer(dir);
    const f = smooth(Array.from(raw, (x) => (Number.isNaN(x) ? NaN : dir > 0 ? x : w - 1 - x)));
    const ys = [];
    for (let y = Math.round(yTop + span * 0.12); y < yTop + span * 0.66; y++) if (!Number.isNaN(f[y])) ys.push(y);
    if (!ys.length) return { dir, f, bump: -1 };
    const vals = ys.map((y) => f[y]).sort((a, b) => a - b);
    let best = ys[0];
    for (const y of ys) if (f[y] > f[best]) best = y;
    const atEdge = f[best] >= w - 3;
    return { dir, f, prnY: best, bump: atEdge ? -1 : f[best] - vals[vals.length >> 1] };
  });
  // Facing: hair sits behind the face. Fall back to the bigger nose-like bump if that's unclear.
  let S = sides[0].bump >= sides[1].bump ? sides[0] : sides[1];
  if (hairN > w * h * 0.01) {
    const hx = hairX / hairN;
    if (Math.abs(hx - skinX) > w * 0.03) S = hx < skinX ? sides[0] : sides[1];
  }
  if (S.bump < h * 0.01) return null;
  const fwd = S.dir, f = S.f;
  const X = (fv) => (fwd > 0 ? fv : w - 1 - fv); // forward coord → image x
  const fy = (y) => { y = Math.round(y); return y >= 0 && y < h && !Number.isNaN(f[y]) ? f[y] : NaN; };
  const P = (y) => ({ x: X(fy(y)), y });
  const argBest = (y0, y1, score) => {
    let b = null, bv = -Infinity;
    for (let y = Math.round(Math.max(0, y0)); y <= Math.min(h - 1, y1); y++) {
      const v = score(y);
      if (Number.isFinite(v) && v > bv) { bv = v; b = y; }
    }
    return b;
  };
  const chordDepth = (ya, yb) => (y) => {
    const fa = fy(ya), fb = fy(yb);
    const cx = fa + ((fb - fa) * (y - ya)) / ((yb - ya) || 1);
    return cx - fy(y);
  };

  const prnY = S.prnY;
  const above = prnY - yTop;
  // nasion: deepest dip between forehead and nose
  const yA = Math.max(yTop + 2, prnY - span * 0.45);
  const nY = argBest(yA + 1, prnY - Math.max(4, above * 0.12), chordDepth(yA, prnY));
  if (nY == null) return null;

  // vertical scale from the person's front landmarks (roll-corrected)
  const th = Math.atan2(front.pupil_l.y - front.pupil_r.y, front.pupil_l.x - front.pupil_r.x);
  const Fy = (k) => { const p = front[k]; return -Math.sin(th) * p.x + Math.cos(th) * p.y; };
  const k = (prnY - nY) / ((Fy('prn') - Fy('nasion')) || 1);
  const faceH = k * (Fy('me') - Fy('trichion'));
  if (!(k > 0) || faceH < h * 0.12 || faceH > h * 1.3) return null;
  const py = (key) => nY + k * (Fy(key) - Fy('nasion'));
  const win = faceH * 0.045;

  const snY = argBest(prnY + 2, Math.max(prnY + 3, py('sn') + win), chordDepth(prnY, py('ls')));
  const lsY = argBest(snY + 1, py('ls') + win, (y) => fy(y));
  const liY0 = py('li');
  const stoY = argBest(lsY + 1, liY0, (y) => -fy(y));
  const liY = argBest(stoY + 1, liY0 + win * 1.5, (y) => fy(y));
  const meY0 = py('me');
  const pogY = argBest(liY + (meY0 - liY) * 0.3, meY0, (y) => fy(y));
  const smY = argBest(liY + 1, pogY - 1, chordDepth(liY, pogY));
  // glabella: brow-ridge bump above the nasion (relative to the chord), else a typical offset
  let gY = Math.round(nY - faceH * 0.07);
  {
    const ya = Math.round(nY - faceH * 0.15), yb = Math.round(nY - faceH * 0.025);
    const cd = chordDepth(ya, nY);
    const bump = argBest(ya + 1, yb, (y) => -cd(y));
    if (bump != null && -cd(bump) > faceH * 0.004) gY = bump;
  }
  if ([snY, lsY, stoY, liY, pogY, smY, gY].some((v) => v == null)) return null;

  // menton: below and behind the chin point, on the underside edge
  const pog = P(pogY);
  let me = { x: pog.x - fwd * 0.8 * Math.max(4, meY0 - pogY), y: meY0 };
  {
    const xx = Math.round(me.x);
    let yy = Math.round(pogY);
    while (yy < h - 1 && F(xx, yy)) yy++;
    if (yy > pogY && yy < meY0 + faceH * 0.08) me.y = yy;
  }
  // neck line and cervical point
  const y1 = me.y + faceH * 0.2, y2 = me.y + faceH * 0.36;
  const n1 = fy(y1), n2 = fy(y2);
  let c = null, neck = null;
  if (Number.isFinite(n1) && Number.isFinite(n2)) {
    neck = P(y2);
    const lineF = (y) => n1 + ((n2 - n1) * (y - y1)) / (y2 - y1);
    let yc = y1;
    for (let y = Math.round(y1); y > me.y; y--) { if (fy(y) - lineF(y) > faceH * 0.03) break; yc = y; }
    c = { x: X(lineF(yc)), y: yc };
  }
  // hairline: the skin outline of the forehead ends where hair starts (checked against the front photo)
  const trP = py('trichion');
  let trY = trP;
  {
    let prev = fy(gY), y = Math.round(gY);
    for (; y > yTop; y--) {
      const fv = fy(y);
      if (!Number.isFinite(fv) || Math.abs(fv - prev) > faceH * 0.02) break;
      prev = fv;
    }
    if (Math.abs(y + 1 - trP) < faceH * 0.07) trY = y + 1;
  }
  trY = Math.min(trY, gY - faceH * 0.08);
  // forehead points: follow the outline upward only while it stays continuous; past a jump
  // (bangs, hair) continue the brow-ridge line instead.
  const track = new Map();
  {
    let prev = fy(gY), lastY = gY;
    for (let y = Math.round(gY); y > Math.min(trY, yTop) - 1; y--) {
      const fv = fy(y);
      if (!Number.isFinite(fv) || Math.abs(fv - prev) > Math.max(1.5, faceH * 0.008)) break;
      track.set(y, fv); prev = fv; lastY = y;
    }
    track.lastY = lastY;
  }
  const gF = fy(gY);
  const nF = fy(nY);
  const foreX = (y) => {
    y = Math.round(y);
    if (track.has(y)) return X(track.get(y));
    const ly = track.lastY, lf = track.get(ly) ?? gF;
    // slope of the tracked part, or a gently receding forehead if too short to tell
    const span2 = gY - ly;
    let k2 = span2 > faceH * 0.04 ? (lf - gF) / span2 : -0.12;
    k2 = Math.max(-0.45, Math.min(0.15, k2));
    void nF;
    return X(lf + k2 * (ly - y));
  };

  const prn = P(prnY), sn = P(snY);
  const lm = {
    tr: { x: foreX(trY), y: trY }, g: P(gY), n: P(nY), prn, sn, ls: P(lsY), sto: P(stoY), li: P(liY), sm: P(smY), pog, me,
  };
  lm.fh = { x: foreX((gY + trY) / 2), y: (gY + trY) / 2 };
  // underside of the nose
  const cmx = prn.x + (sn.x - prn.x) * 0.45;
  let cmy = Math.round(prnY);
  while (cmy < snY + 4 && F(Math.round(cmx), cmy)) cmy++;
  lm.cm = { x: cmx, y: Math.min(cmy, snY) };
  // interior points from the reference template, fitted to the outline points
  const ref = refPoints('side');
  const mir = (p) => (fwd > 0 ? p : { x: 767 - p.x, y: p.y });
  const keys = ['g', 'n', 'prn', 'sn', 'pog', 'me'];
  const T = fitSimilarity(keys.map((q) => mir(ref[q])), keys.map((q) => lm[q]));
  for (const q of ['tragus', 'or', 'cornea', 'go', 'ramus', 'ac']) lm[q] = T(mir(ref[q]));
  if (!c) { lm.c = T(mir(ref.c)); lm.neck = T(mir(ref.neck)); } else { lm.c = c; lm.neck = neck; }
  // Forehead: a line up from the glabella, perpendicular to the Frankfort plane and leaning back ~8°.
  // The traced outline is used only where it agrees with that line (bangs and hair often don't).
  {
    const ux0 = lm.or.x - lm.tragus.x, uy0 = lm.or.y - lm.tragus.y, ul = Math.hypot(ux0, uy0) || 1;
    const ux = ux0 / ul, uy = uy0 / ul;          // forward along Frankfort
    const vx = uy, vy = -ux;                     // up
    const a = 8 * Math.PI / 180;
    const dx = vx * Math.cos(a) - ux * Math.sin(a), dy = vy * Math.cos(a) - uy * Math.sin(a);
    const onLine = (y) => ({ x: lm.g.x + dx * ((y - lm.g.y) / (dy || -1)), y });
    for (const key of ['fh', 'tr']) {
      const L = onLine(lm[key].y);
      const cx = foreX(lm[key].y);
      lm[key] = Math.abs(cx - L.x) < faceH * 0.015 ? { x: cx, y: L.y } : L;
    }
  }
  // back to full-resolution pixels
  const out = {};
  for (const q in lm) out[q] = { x: lm[q].x / sc, y: lm[q].y / sc };
  return out;
}

// Public entry: returns { lm, mesh, source: 'ai' | 'outline' | 'template', error? }
// For the profile, pass { front, skin } from the frontal result so the outline tracer can scale itself.
export async function detect(view, img, opts = {}) {
  let mesh = null, error = null;
  try {
    mesh = await runMesh(img);
  } catch (e) {
    error = 'model';
  }
  const px = pixelReader(img);
  if (view === 'front') {
    if (!mesh) return { lm: templateFor(view, img), mesh: null, source: 'template', error: error || 'noface' };
    const r = frontFromMesh(mesh, px);
    return { lm: r.lm, skin: r.skin, mesh, source: 'ai' };
  }
  // A profile at ~90° is usually invisible to the mesh model; prefer it when it does see a face.
  if (mesh && plausibleProfileMesh(mesh)) return { lm: sideFromMesh(mesh, px), mesh, source: 'ai' };
  if (opts.front) {
    try {
      const lm = profileFromSilhouette(img, opts.front, opts.skin);
      if (lm) return { lm, mesh: null, source: 'outline' };
    } catch (e) { console.warn('outline tracer failed', e); }
  }
  return { lm: templateFor(view, img), mesh: null, source: 'template', error: error || 'noface' };
}

// A real profile has the nose tip far outside the eye corners; a near-frontal detection doesn't.
function plausibleProfileMesh(m) {
  const eyeW = Math.abs(m[263].x - m[33].x);
  const faceW = Math.abs(m[454].x - m[234].x);
  return eyeW < faceW * 0.45;
}
