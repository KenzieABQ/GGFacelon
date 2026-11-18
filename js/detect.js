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

const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
// selfie_multiclass categories
const C_BG = 0, C_HAIR = 1, C_BODY = 2, C_FACE = 3, C_CLOTHES = 4, C_OTHER = 5;
const isSkinClass = (c) => c === C_BODY || c === C_FACE;

// Loaded models live on globalThis so every copy of this module (e.g. after a code reload) shares one
// instance — two MediaPipe instances in a page conflict.
const MODELS = (globalThis.__ggfModels ??= { landmarker: null, segmenter: null });

export function loadDetector() {
  if (MODELS.landmarker) return MODELS.landmarker;
  MODELS.landmarker = (async () => {
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
    MODELS.landmarker = null;
    throw e;
  });
  return MODELS.landmarker;
}

// Person segmentation (hair / face skin / body skin / clothes / background). Works at any head angle and
// doesn't depend on background colour, so it drives the profile outline, hairline, ears and neck.
export function loadSegmenter() {
  if (MODELS.segmenter) return MODELS.segmenter;
  MODELS.segmenter = (async () => {
    const { ImageSegmenter, FilesetResolver } = await import(MP_URL);
    const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  })().catch((e) => {
    MODELS.segmenter = null;
    throw e;
  });
  return MODELS.segmenter;
}

// Returns { at(x, y) → category } in image pixel coordinates, or null if unavailable.
// Model downloads can stall on a bad connection; never let detection hang on them.
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);

async function runSeg(img) {
  try {
    const seg = await withTimeout(loadSegmenter(), 90000, 'segmenter');
    const r = seg.segment(img);
    const mk = r.categoryMask;
    const mw = mk.width, mh = mk.height;
    const data = mk.getAsUint8Array().slice();
    if (r.close) r.close();
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const sx = mw / W, sy = mh / H;
    let skinN = 0;
    for (let i = 0; i < data.length; i += 7) if (isSkinClass(data[i])) skinN++;
    if (skinN < (data.length / 7) * 0.01) return null; // nothing person-like found
    return {
      at(x, y) {
        const xi = Math.min(mw - 1, Math.max(0, Math.round(x * sx)));
        const yi = Math.min(mh - 1, Math.max(0, Math.round(y * sy)));
        return data[yi * mw + xi];
      },
    };
  } catch (e) {
    console.warn('segmenter unavailable', e);
    return null;
  }
}

// Segmentation for other modules (photo appearance): { at(x, y) → category } or null
export const segmentPhoto = (img) => runSeg(img);
export const SEG_CLASS = { BG: C_BG, HAIR: C_HAIR, BODY: C_BODY, FACE: C_FACE, CLOTHES: C_CLOTHES, OTHER: C_OTHER };

// Run the mesh. Returns array of {x,y} in image pixels, or null.
async function runMesh(img) {
  const det = await withTimeout(loadDetector(), 90000, 'face model');
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

function frontFromMesh(m, px, seg) {
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
    zy_r: null, zy_l: null,
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
  // FaceIQ conventions, measured against its own landmarks on 59 faces (tools/bench.js): its jaw angle sits a
  // little further down the jawline, its mouth-level jaw points a little above the mouth corners, its chin
  // bottom a little lower than the mesh's, and its nose width just inside the outermost wing points.
  {
    const ipd = dist(lm.pupil_r, lm.pupil_l);
    for (const sd of ['r', 'l']) {
      lm['go_' + sd] = lerp(lm['go_' + sd], lm['chin_' + sd], 0.12);
      lm['cheek_' + sd] = { x: lm['cheek_' + sd].x, y: lm['cheek_' + sd].y - ipd * 0.035 };
      lm['ala_' + sd] = lerp(lm['ala_' + sd], lm.sn, 0.023 * ipd / (Math.abs(lm['ala_' + sd].x - lm.sn.x) || 1));
    }
    lm.me = { x: lm.me.x, y: lm.me.y + ipd * 0.035 };
  }
  // Cheekbone width (FaceIQ convention): the face contour a sixth of the way from pupil level down to the
  // Cupid's bow, i.e. about lower-eyelid level.
  {
    const pupilY = (lm.pupil_r.y + lm.pupil_l.y) / 2, cupidY = (lm.cupid_r.y + lm.cupid_l.y) / 2;
    const zyY = pupilY + 0.22 * (cupidY - pupilY);
    const cR = [127, 234, 93, 132].map((i) => pick(m, i)), cL = [356, 454, 323, 361].map((i) => pick(m, i));
    lm.zy_r = atY(cR, zyY); lm.zy_l = atY(cL, zyY);
  }
  // Long hair over the sides of the face: the mesh guesses the head outline under the hair, which can put the
  // cheekbone (and mouth-level jaw) points deep in the hair — a face far wider than it looks. Move such points
  // in to the visible face edge. Only for deep cover (≥ 5% of the eye spacing): on FaceIQ's benchmark,
  // smaller moves (sideburns, the hair boundary) made agreement slightly worse, larger ones clearly better.
  if (seg) {
    const ipd = dist(lm.pupil_r, lm.pupil_l);
    for (const k of ['zy_r', 'zy_l', 'cheek_r', 'cheek_l']) {
      const p = lm[k], inward = Math.sign(cx - p.x) || 1;
      if (seg.at(p.x, p.y) !== C_HAIR) continue;
      for (let t = 1; t <= ipd * 0.3; t += 1) {
        const c = seg.at(p.x + inward * t, p.y);
        if (isSkinClass(c)) { if (t - 1 >= ipd * 0.05) lm[k] = { x: p.x + inward * (t - 1), y: p.y }; break; }
        if (c !== C_HAIR) break;
      }
    }
  }
  const faceH = dist(pick(m, 10), lm.me);
  const cheekSkin = avgSkin(px, [lerp(lm.zy_r, lm.prn, 0.45), lerp(lm.zy_l, lm.prn, 0.45)]);
  const skinAt = seg ? (x, y) => isSkinClass(seg.at(x, y)) : null;
  // Ears: walk sideways from the cheekbone and keep the outermost skin pixel (the ear rim).
  for (const [side, sign] of [['r', -s], ['l', s]]) {
    const zy = lm['zy_' + side];
    const y = (lm['pupil_' + side].y + lm.sn.y) / 2;
    let out = null;
    if (skinAt) {
      let gap = 0;
      for (let t = 0; t <= faceH * 0.22; t += 1) {
        const x = zy.x + sign * t;
        if (skinAt(x, y)) { out = { x, y }; gap = 0; } else if (out && ++gap > faceH * 0.04) break;
      }
    } else {
      out = outermostSkin(px, { x: zy.x, y }, sign, faceH * 0.2, cheekSkin);
    }
    const ear = out && Math.abs(out.x - zy.x) > faceH * 0.012 ? out : { x: zy.x + sign * faceH * 0.05, y };
    lm['ear_' + side] = ear;
    // Ear root: where the top of the ear meets the head — follow the ear rim upward while it stays skin.
    let top = { x: zy.x + (ear.x - zy.x) * 0.3, y: lm['brT_' + side].y + faceH * 0.02 };
    if (skinAt && out) {
      let yy = y, xx = ear.x;
      for (; yy > lm['brT_' + side].y - faceH * 0.06; yy -= 1) {
        // outermost skin on this row, scanning inward from just outside the ear
        let found = null;
        for (let t = 0; t <= Math.abs(ear.x - zy.x) + faceH * 0.02; t += 1) {
          const x = ear.x + sign * faceH * 0.01 - sign * t;
          if (skinAt(x, yy)) { found = x; break; }
        }
        if (found == null || Math.abs(found - xx) > faceH * 0.05) break;
        xx = found;
      }
      // the rim usually curls inward near the top; if tracking stopped low, fall back to brow-tail height
      const browY = lm['brT_' + side].y + faceH * 0.02;
      top = { x: zy.x + (xx - zy.x) * 0.35, y: yy < y - faceH * 0.1 ? yy + faceH * 0.01 : browY };
    }
    lm['earTop_' + side] = top;
  }
  // Neck (FaceIQ convention): the outline a third of the way from the jaw angle down to chin level —
  // where the side of the neck shows below the jaw corner. Walk out from the centre line to the skin edge.
  const halfJaw = Math.abs(lm.go_l.x - lm.go_r.x) / 2;
  for (const [side, sign] of [['r', -s], ['l', s]]) {
    const ny = lm['go_' + side].y + 0.3 * (lm.me.y - lm['go_' + side].y);
    const nc = { x: lm.me.x, y: ny };
    const neckSkin = px.at(nc.x, nc.y, 4);
    let hit = null;
    if (skinAt && skinAt(nc.x, ny)) {
      let x = nc.x;
      for (let t = 0; t <= halfJaw * 1.5; t += 1) { if (!skinAt(nc.x + sign * t, ny)) break; x = nc.x + sign * t; }
      hit = { x: x + sign * 2, y: ny };
    } else {
      hit = findSkinEdge(px, nc, { x: sign, y: 0 }, halfJaw * 1.4, neckSkin);
    }
    const ok = hit && Math.abs(hit.x - nc.x) > halfJaw * 0.55 && Math.abs(hit.x - nc.x) < halfJaw * 1.4;
    lm['neck_' + side] = ok ? { x: hit.x - sign * 2, y: ny } : { x: nc.x + sign * halfJaw * 0.82, y: ny };
  }
  // Hairline: walk up the centre line from the brows until skin turns into hair (or background if bald).
  const top = pick(m, 10), g = lm.glabella;
  const up = sub(top, g), L = len(up) || 1;
  const dir = { x: up.x / L, y: up.y / L };
  let tri = null;
  if (skinAt) {
    let run = 0, last = null;
    for (let t = L * 0.3; t <= L * 2.2; t += 1) {
      const p = { x: g.x + dir.x * t, y: g.y + dir.y * t };
      if (p.y < 1) break;
      if (skinAt(p.x, p.y)) { run = 0; last = p; } else if (++run > Math.max(3, faceH * 0.012)) break;
    }
    if (last && dist(last, g) > L * 0.5) tri = last;
  }
  if (!tri) {
    const skin = px.at(...Object.values(lerp(g, top, 0.6)), 4);
    tri = findSkinEdge(px, lerp(g, top, 0.75), dir, L * 1.4, skin) || add(top, mul(dir, L * 0.25));
  }
  lm.trichion = tri;
  // Temples (FaceIQ convention): on the forehead edge a little over halfway from brow level up to the hairline
  {
    const browY = (lm.brI_r.y + lm.brP_r.y + lm.brT_r.y + lm.brI_l.y + lm.brP_l.y + lm.brT_l.y) / 6;
    const ty = browY - 0.58 * Math.max(0, browY - tri.y);
    const fR = [127, 162, 21, 54, 103, 67, 109].map((i) => pick(m, i)), fL = [356, 389, 251, 284, 332, 297, 338].map((i) => pick(m, i));
    lm.temple_r = atY(fR, ty); lm.temple_l = atY(fL, ty);
    // the mesh's forehead edge runs a little inside the visible one
    const ipd = dist(lm.pupil_r, lm.pupil_l), out = Math.sign(lm.temple_l.x - lm.temple_r.x) || 1;
    lm.temple_r = { x: lm.temple_r.x - out * ipd * 0.1, y: lm.temple_r.y - ipd * 0.04 };
    lm.temple_l = { x: lm.temple_l.x + out * ipd * 0.1, y: lm.temple_l.y - ipd * 0.04 };
  }
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
// Median jaw-angle and ear-notch positions of 63 FaceIQ-landmarked profiles, in the reference photo's frame
// (tools/side-shape.mjs). Placed by fitting the reference's g, n, sn, pog and me onto the traced profile.
const JAW_SHAPE = { go: { x: 412.6, y: 564.7 }, ramus: { x: 385.8, y: 469.1 } };
const JAW_ANCHORS = ['g', 'n', 'sn', 'pog', 'me'];
function jawFromShape(lm, fwd) {
  const ref = refPoints('side');
  const mir = (p) => (fwd > 0 ? p : { x: 767 - p.x, y: p.y });
  const T = fitSimilarity(JAW_ANCHORS.map((q) => mir(ref[q])), JAW_ANCHORS.map((q) => lm[q]));
  return { go: T(mir(JAW_SHAPE.go)), ramus: T(mir(JAW_SHAPE.ramus)) };
}

function sideFromMesh(m, px, seg) {
  const fwd = Math.sign(m[1].x - avg([m[234], m[454]]).x) || 1; // nose direction
  // Visible side of the face (the one closer to the camera)
  const leftVisible = fwd < 0; // facing image-right shows the subject's right cheek (mesh 'right' = subject's right)
  const V = (r, l) => pick(m, leftVisible ? l : r);
  const faceH = dist(pick(m, 10), pick(m, 152));
  const lm = {
    g: pick(m, 9), n: pick(m, 168), prn: pick(m, 1), cm: pick(m, 94), sn: pick(m, 2),
    ls: pick(m, 0), sto: mm(m, 13, 14), li: pick(m, 17), sm: pick(m, 18), pog: pick(m, 199), me: pick(m, 152),
    ac: V(98, 327), go: V(172, 397), tragus: V(234, 454), or: V(119, 348),
    cornea: V(468, 473), exs: V(33, 263),
  };
  // Where the midline profile is the silhouette (background just in front of it), snap onto the edge.
  // In a three-quarter view the far cheek is behind the profile, so the mesh points are kept as they are.
  const r = Math.round(faceH * 0.05);
  const bgAhead = (p) => !seg || seg.at(p.x + fwd * r * 0.6, p.y) === C_BG;
  for (const k of ['g', 'n', 'prn', 'ls', 'li', 'pog']) if (bgAhead(lm[k])) lm[k] = snapSilhouette(px, lm[k], fwd, r);
  if (bgAhead(lm.me)) lm.me = snapVertical(px, lm.me, r);
  // Nose details at FaceIQ's spacing: supratip up the bridge, infratip under the tip, columella between
  const noseL = dist(lm.n, lm.prn);
  const toward = (a, b, d) => { const v = sub(b, a), l = len(v) || 1; return add(a, mul(v, d / l)); };
  lm.st = toward(lm.prn, pick(m, 5), noseL * 0.12);
  lm.it = toward(lm.prn, lm.sn, noseL * 0.1);
  lm.cm = lerp(lm.it, lm.sn, 0.5);
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
  // Ear notch (top of the jaw's back edge, FaceIQ's ramus point): just below the tragus
  lm.ramus = { x: lm.tragus.x + fwd * faceH * 0.012, y: lm.tragus.y + faceH * 0.06 };
  // FaceIQ conventions vs the mesh in side photos (median offsets on 41 benchmark faces, in face heights,
  // forward / down): its chin point and chin bottom sit lower, and its chin bottom, jaw angle and ear notch
  // further back than the mesh points.
  const H = dist(lm.n, lm.me);
  const shift = (p, f, d) => ({ x: p.x + fwd * f * H, y: p.y + d * H });
  lm.pog = shift(lm.pog, 0, 0.05);
  lm.me = shift(lm.me, -0.075, 0.064);
  lm.go = shift(lm.go, -0.13, 0.017);
  lm.ramus = shift(lm.ramus, -0.072, 0);
  // Guard the jaw points with the population shape: in three-quarter views the mesh jaw can drift
  const shape = jawFromShape(lm, fwd);
  for (const q of ['go', 'ramus']) if (dist(lm[q], shape[q]) > H * 0.18) lm[q] = shape[q];
  {
    const jaw2 = sub(lm.go, lm.me);
    lm.c = add(lerp(lm.me, lm.go, 0.48), { x: 0, y: Math.abs(jaw2.x) * 0.12 + faceH * 0.03 });
    lm.neck = add(lm.c, { x: -fwd * faceH * 0.06, y: faceH * 0.3 });
  }
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
function profileFromSilhouette(img, front, skinRGB, seg, pxFull, forceDir, mode = seg ? 'face' : 'color') {
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
  const body = seg ? new Uint8Array(w * h) : null; // face + body skin (neck, ears)
  const hairM = new Uint8Array(w * h);
  let hairX = 0, hairN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (seg) {
      // Segmentation. 'face' traces face-skin only (another person or the body can't leak in);
      // 'skin' also accepts body skin (some photos label parts of the face as body skin).
      // Hair is tracked separately to tell which way the face points.
      const c = seg.at(x / sc, y / sc);
      body[y * w + x] = isSkinClass(c) ? 1 : 0;
      if (c === C_HAIR) { hairX += x; hairN++; hairM[y * w + x] = 1; }
      // 'skin' also takes 'other' (accessories, drawn marks) so they don't punch holes in the outline
      if (mode !== 'color') { raw[y * w + x] = mode === 'face' ? (c === C_FACE ? 1 : 0) : (body[y * w + x] || c === C_OTHER ? 1 : 0); continue; }
    }
    const c = rgb(x, y);
    // Trace skin, not hair: hair can stick out further than the nose. A plain background adds a second check.
    const isSkin = chromaDist(c, skin) < 0.065 && c[0] + c[1] + c[2] > 120;
    raw[y * w + x] = isSkin && (!uniform || cdist(c, med) > 30) ? 1 : 0;
    if (c[0] + c[1] + c[2] < 180 && y < h * 0.6) { hairX += x; hairN++; hairM[y * w + x] = 1; }
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
    // Nose tip = the sharpest peak: how far a row sticks out beyond the dips just above (nasion) and
    // just below (nose base). A wide flat region (hair, a shoulder, another person) scores low.
    const a = Math.round(span * 0.14), b = Math.max(2, Math.round(span * 0.02));
    const minIn = (y0, y1) => { let m = Infinity; for (let y = y0; y <= y1; y++) if (y >= 0 && y < h && !Number.isNaN(f[y])) m = Math.min(m, f[y]); return m; };
    let best = null, bestP = -Infinity;
    for (const y of ys) {
      if (f[y] >= w - 3) continue; // touching the image edge: not a usable nose
      const p = f[y] - Math.max(minIn(y - a, y - b), minIn(y + b, y + a));
      if (Number.isFinite(p) && p > bestP) { bestP = p; best = y; }
    }
    if (best == null) return { dir, f, bump: -1 };
    return { dir, f, prnY: best, bump: bestP };
  });
  // Facing: hair sits behind the face, and the nose makes the biggest bump on the front outline.
  // Both cues vote; a forced direction (from the "flip" button) overrides them.
  let S = sides[0].bump >= sides[1].bump ? sides[0] : sides[1];
  if (forceDir) S = sides.find((q) => q.dir === forceDir);
  else if (hairN > w * h * 0.005) {
    const hx = hairX / hairN;
    const hairVote = hx < skinX ? sides[0] : sides[1];
    const other = hairVote === sides[0] ? sides[1] : sides[0];
    // Segmented hair is a reliable cue (the ear makes a sharp bump on the back outline too, so bumps
    // alone can mislead). The colour fallback's "hair" is just dark pixels, so a much bigger bump wins there.
    const strongBump = other.bump > hairVote.bump * 1.8 && other.bump > h * 0.02;
    if (Math.abs(hx - skinX) > w * 0.02 && (mode !== 'color' || !strongBump)) S = hairVote;
  }
  if (!S || S.bump < h * 0.008) return null;
  const fwd = S.dir, f = S.f;
  const X = (fv) => (fwd > 0 ? fv : w - 1 - fv); // forward coord → image x
  const fy0 = (y) => { y = Math.round(y); return y >= 0 && y < h && !Number.isNaN(f[y]) ? f[y] : NaN; };
  // Below the nose, lips and chin always sit behind the nose tip; anything further forward belongs to
  // something else (another person, a hand, a collar) and is ignored.
  const fPrn = fy0(S.prnY);
  const fy = (y) => { const v = fy0(y); return Math.round(y) > S.prnY + 2 && v > fPrn - 1 ? NaN : v; };
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
  // front-photo proportions (roll-corrected heights)
  const th = Math.atan2(front.pupil_l.y - front.pupil_r.y, front.pupil_l.x - front.pupil_r.x);
  const Fy = (k) => { const p = front[k]; return -Math.sin(th) * p.x + Math.cos(th) * p.y; };

  // ── 2-D silhouette: face + neck skin, traced as one ordered contour ──
  const U = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) U[i] = fg[i] || (body && body[i] && !hairM[i]) ? 1 : 0;
  const prnX = Math.round(X(fy0(prnY)));
  let sx = -1;
  for (let d = 0; d < 8 && sx < 0; d++) { const x = prnX - fwd * d; if (x >= 0 && x < w && U[prnY * w + x]) sx = x; }
  if (sx < 0) return null;
  const C = traceContour(U, w, h, sx, prnY, 20000);
  if (C.length < 50) return null;
  // walk the contour from the nose tip in both directions; "down" is the way y increases
  const i0 = 0, n = C.length;
  const walk = (dir, maxArc) => {
    const out = [C[i0]];
    let arc = 0;
    for (let k = 1; k < n && arc < maxArc; k++) {
      const p = C[(i0 + dir * k + n * 4) % n];
      arc += dist(p, out[out.length - 1]);
      out.push(p);
    }
    return smoothPath(out, 2);
  };
  const arcOf = (path) => { const s = [0]; for (let i = 1; i < path.length; i++) s.push(s[i - 1] + dist(path[i], path[i - 1])); return s; };
  const atArc = (path, s, target) => { let i = 0; while (i < path.length - 1 && s[i] < target) i++; return i; };
  // signed distance of a point in front of the line A→B, A above B (forward = towards the nose)
  const fwdOf = (p, A, B) => { const bx = B.x - A.x, by = B.y - A.y; return (fwd * (bx * (p.y - A.y) - by * (p.x - A.x))) / -(Math.hypot(bx, by) || 1); };
  const argExt = (path, i0, i1, fn, sign = 1) => { let b = -1, bv = -Infinity; for (let i = Math.max(0, i0); i <= Math.min(path.length - 1, i1); i++) { const v = sign * fn(path[i]); if (v > bv) { bv = v; b = i; } } return b; };
  const zig = (f, i0, i1, delta) => {
    const out = [];
    let dir = 1, ext = i0, ev = f(i0);
    for (let i = i0 + 1; i <= i1; i++) {
      const v = f(i);
      if (dir > 0) { if (v > ev) { ev = v; ext = i; } else if (ev - v > delta) { out.push({ i: ext, t: 1 }); dir = -1; ext = i; ev = v; } }
      else if (v < ev) { ev = v; ext = i; } else if (v - ev > delta) { out.push({ i: ext, t: -1 }); dir = 1; ext = i; ev = v; }
    }
    out.push({ i: ext, t: dir });
    return out;
  };
  const a1 = walk(1, span * 0.15), a2 = walk(-1, span * 0.15);
  const downDir = a1[a1.length - 1].y > a2[a2.length - 1].y ? 1 : -1;
  // nasion: the first clear dip above the nose tip (measured against the image vertical); its depth sets the scale
  const UP0 = walk(-downDir, span * 1.2), sUP0 = arcOf(UP0);
  const prnP = UP0[0];
  const dUp = (i) => fwd * (UP0[i].x - prnP.x);
  const upZ = zig(dUp, 0, atArc(UP0, sUP0, span * 0.6), span * 0.012);
  const iN0 = upZ.length > 1 && upZ[1].t === -1 ? upZ[1].i : -1;
  if (iN0 < 0) { if (globalThis.__profileDebug) globalThis.__profileDebug.push({ mode, fail: 'no nasion', DN: [], UP: [] }); return null; }
  // face height (nasion → menton) from the nose length and the front photo's proportion, kept sane
  const ratioNose = Math.min(3.2, Math.max(2.0, (Fy('me') - Fy('nasion')) / ((Fy('prn') - Fy('nasion')) || 1)));
  const H = Math.abs(UP0[iN0].y - prnP.y) * ratioNose;
  const faceH = H * ((Fy('me') - Fy('trichion')) / ((Fy('me') - Fy('nasion')) || 1));
  if (!(H > h * 0.08) || H > h * 1.1) return null;
  const DN = walk(downDir, H * 2.6), UP = walk(-downDir, H * 1.6);
  const sDN = arcOf(DN), sUP = arcOf(UP);
  if (globalThis.__profileDebug) globalThis.__profileDebug.push({ mode, fwd, sc, H, DN: DN.map((p) => ({ x: p.x / sc, y: p.y / sc })), UP: UP.map((p) => ({ x: p.x / sc, y: p.y / sc })) });

  // nasion & glabella on the upper contour (refined against a chord to the forehead)
  const iTopRef = atArc(UP, sUP, H * 0.75);
  let iN = argExt(UP, atArc(UP, sUP, H * 0.12), atArc(UP, sUP, H * 0.62), (p) => fwdOf(p, UP[iTopRef], prnP), -1);
  if (iN < 0) return null;
  const nP = UP[iN];
  const gRef = UP[atArc(UP, sUP, sUP[iN] + H * 0.45)];
  let iG = argExt(UP, iN + 2, atArc(UP, sUP, sUP[iN] + H * 0.3), (p) => fwdOf(p, gRef, nP), 1);
  if (iG < 0 || fwdOf(UP[iG], gRef, nP) < H * 0.004) iG = atArc(UP, sUP, sUP[iN] + H * 0.11);
  const noseL = dist(nP, prnP);

  // The face's own down-axis (nasion → chin): first guess straight down the image, then refined once.
  // The lower profile is read as alternating peaks and dips of "how far forward" along the outline,
  // first coarsely (nose base, lips, lip–chin fold, chin), then finely between nose base and fold (both lips
  // and the mouth line). This needs no scale from the front photo, so a different pose or crop can't shift it.
  let chin = { x: nP.x, y: nP.y + H };
  let L = null;
  for (let pass = 0; pass < 2; pass++) {
    const d = (i) => fwdOf(DN[i], nP, chin);
    const iMax = atArc(DN, sDN, H * 2.2);
    // nose base: the deepest point behind the line from the nose tip to the upper lip (works even when the
    // lips don't stick out past the nose base)
    const iLipRef = atArc(DN, sDN, H * 0.33);
    let iSn = -1, snDepth = 0;
    for (let i = 2; i < iLipRef; i++) { const v = -fwdOf(DN[i], DN[0], DN[iLipRef]); if (v > snDepth) { snDepth = v; iSn = i; } }
    if (iSn < 0 || snDepth < H * 0.01) { if (globalThis.__profileDebug) globalThis.__profileDebug.at(-1).fail = 'no nose base'; return null; }
    // where the outline has turned far back under the chin
    let iBack = -1;
    for (let i = iSn + 5; i <= iMax; i++) if (d(i) < d(iSn) - H * 0.15 && sDN[i] - sDN[iSn] > H * 0.3) { iBack = i; break; }
    if (iBack < 0) { if (globalThis.__profileDebug) Object.assign(globalThis.__profileDebug.at(-1), { fail: 'no under-chin', pass, iSn, dSn: d(iSn) / H, dMin: Math.min(...DN.slice(iSn, iMax).map((_, j) => d(iSn + j))) / H, iMax, len: DN.length, chin }); return null; }
    // Lips and chin from the convex hull of the lower profile (nose base → under the chin): the chin is the
    // last bulge on the hull before the outline turns under; the lips are the bulges between nose base and
    // chin. Bulges are judged against chords, so head angle and face size don't matter.
    const hullIdx = frontHull(DN, iSn, iBack, (p) => fwdOf(p, DN[iSn], DN[iBack]));
    const gap = (a, b) => sDN[b] - sDN[a];
    const cands = hullIdx.filter((i) => gap(iSn, i) > H * 0.04 && i < iBack - 2);
    if (!cands.length) { if (globalThis.__profileDebug) globalThis.__profileDebug.at(-1).fail = 'no hull'; return null; }
    let iPog = -1;
    for (let j = cands.length - 1; j >= 0; j--) if (gap(iSn, cands[j]) > H * 0.32) { iPog = cands[j]; break; }
    if (iPog < 0) iPog = cands[cands.length - 1];
    const lips = cands.filter((i) => i < iPog && gap(i, iPog) > H * 0.12);
    const bulge = (a, b) => { let bi = -1, bv = -Infinity; for (let i = a + 1; i < b; i++) { const v = fwdOf(DN[i], DN[a], DN[b]); if (v > bv) { bv = v; bi = i; } } return bi; };
    const dip = (a, b) => { let bi = a + 1, bv = Infinity; for (let i = a + 1; i < b; i++) { const v = fwdOf(DN[i], DN[a], DN[b]); if (v < bv) { bv = v; bi = i; } } return bi; };
    let iLs, iLi;
    if (lips.length >= 2) { iLs = lips[0]; iLi = lips[lips.length - 1]; }
    else if (lips.length === 1) {
      // one lip on the hull: the other one is set back — take its bulge against the neighbouring chord
      const tSto = (Fy('sto') - Fy('sn')) / ((Fy('me') - Fy('sn')) || 1);
      if (gap(iSn, lips[0]) < (sDN[iPog] - sDN[iSn]) * tSto) { iLs = lips[0]; iLi = bulge(iLs + 2, iPog); }
      else { iLi = lips[0]; iLs = bulge(iSn, iLi - 2); }
    } else {
      // no lip on the hull at all: both lips behind the nose-base → chin line
      const tSto = (Fy('sto') - Fy('sn')) / ((Fy('me') - Fy('sn')) || 1);
      const mid = atArc(DN, sDN, sDN[iSn] + (sDN[iPog] - sDN[iSn]) * tSto);
      iLs = bulge(iSn, mid); iLi = bulge(mid, iPog);
    }
    if (!(iLs > iSn && iLi > iLs && iPog > iLi)) { if (globalThis.__profileDebug) globalThis.__profileDebug.at(-1).fail = 'lip order'; return null; }
    const iSto = dip(iLs, iLi);
    const iSm = dip(iLi, iPog);
    const peaks = lips;
    L = { iSn, iLs, iSto, iLi, iSm, iPog };
    chin = DN[iPog];
    if (globalThis.__profileDebug) globalThis.__profileDebug.at(-1).L = { ...L, iBack, peaks };
  }
  // under the chin: cervical point = the inner corner between the chin's underside and the neck;
  // menton = the chin bottom (outermost point between the chin point and that corner)
  const down = (() => { const v = { x: chin.x - nP.x, y: chin.y - nP.y }, l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; })();
  const along = (p) => (p.x - nP.x) * down.x + (p.y - nP.y) * down.y;
  const pogA = along(chin);
  let iQ = -1;
  for (let i = L.iPog + 1; i < DN.length; i++) if (along(DN[i]) > pogA + H * 0.42) { iQ = i; break; }
  let iC = -1, iMe = -1, iNeck = -1;
  if (iQ > 0) {
    iC = argExt(DN, L.iPog + 2, iQ, (p) => fwdOf(p, chin, DN[iQ]), -1);
    if (iC > 0) {
      iMe = argExt(DN, L.iPog + 1, iC - 1, (p) => -fwdOf(p, chin, DN[iC]), -1);
      iNeck = atArc(DN, sDN, sDN[iC] + H * 0.2);
    }
  }
  if (iMe < 0) { // neck not visible (crop, collar): menton = lowest contour point near the chin
    iMe = argExt(DN, L.iPog + 1, atArc(DN, sDN, sDN[L.iPog] + H * 0.35), (p) => along(p), 1);
  }
  if ([L.iSn, L.iLs, L.iSto, L.iLi, L.iSm, L.iPog, iMe].some((i) => !(i >= 0))) return null;

  // forehead: hairline where the contour meets hair (segmentation) or loses the skin; mid-forehead halfway
  let iTr = -1;
  for (let i = iG + 1; i < UP.length && sUP[i] < sUP[iG] + H * 0.9; i++) {
    const p = UP[i], x = Math.round(p.x), y = Math.round(p.y);
    let hairy = 0;
    for (let r = 1; r <= 3; r++) { const q = (y * w + x + fwd * r); if (q >= 0 && q < w * h && hairM[q]) hairy++; }
    if (hairy >= 2 || !fg[y * w + x]) { iTr = i; break; }
  }
  const gP = UP[iG];
  // FaceIQ's hairline sits ~0.37 face heights above the nasion; trust the traced point only near there
  const trExpect = H * ((Fy('nasion') - Fy('trichion')) / ((Fy('me') - Fy('nasion')) || 1));
  let tr = iTr > 0 ? UP[iTr] : null;
  if (!tr || Math.abs(dist(tr, nP) - trExpect) > trExpect * 0.35) {
    // extrapolate the forehead: continue the brow-ridge contour direction, leaning back ~10°
    const up = { x: -down.x, y: -down.y };
    let fu = { x: down.y, y: -down.x };
    if (Math.sign(fu.x) !== fwd) fu = { x: -fu.x, y: -fu.y };
    const len2 = Math.max(H * 0.15, trExpect - dist(gP, nP)), k = Math.tan((10 * Math.PI) / 180);
    tr = { x: gP.x + (up.x - fu.x * k) * len2, y: gP.y + (up.y - fu.y * k) * len2 };
  }
  const iFh = iTr > 0 ? Math.round((iG + iTr) / 2) : -1;
  const fh = iFh > 0 ? UP[iFh] : lerp(gP, tr, 0.5);

  // nose details: supratip / infratip at FaceIQ's spacing, columella halfway to the nose base
  const st = UP[atArc(UP, sUP, noseL * 0.12)];
  const it = DN[atArc(DN, sDN, noseL * 0.1)];
  const cm = DN[Math.round((atArc(DN, sDN, noseL * 0.1) + L.iSn) / 2)];

  const lm = {
    tr, fh, g: gP, n: nP, st, prn: prnP, it, cm, sn: DN[L.iSn], ls: DN[L.iLs], sto: DN[L.iSto], li: DN[L.iLi],
    sm: DN[L.iSm], pog: DN[L.iPog], me: DN[iMe],
  };
  if (iC > 0) { lm.c = DN[iC]; lm.neck = DN[iNeck]; }

  // Ear: the back-most skin at ear height is the back rim of the ear; the ear canal sits ~0.14 face
  // heights in front of it. Used to anchor the template so the Frankfort plane follows the real ear.
  const nY = Math.round(nP.y), snY = Math.round(lm.sn.y);
  const faceHn = H;
  let earX = null;
  {
    const ys = [];
    for (let y = Math.round(nY + 0.3 * (snY - nY)); y <= snY + 0.3 * (snY - nY); y += 2) {
      const fF = fy0(y);
      if (!Number.isFinite(fF)) continue;
      let back = null;
      for (let t = Math.round(faceHn * 1.5); t >= faceHn * 0.5; t--) {
        const x = Math.round(X(fF - t));
        if (x < 0 || x >= w) continue;
        const mk = body || op;
        if (mk[y * w + x] && mk[y * w + Math.min(w - 1, x + 1)]) { back = fF - t; break; }
      }
      if (back != null) ys.push(back);
    }
    if (ys.length > 4) {
      ys.sort((a, b) => a - b);
      earX = ys[Math.floor(ys.length * 0.2)] + faceHn * 0.14; // forward coordinate of the ear canal
      const dSn = fy0(snY) - earX; // ear canal → nose base, horizontally
      if (!(dSn > faceHn * 0.75 && dSn < faceHn * 1.3)) earX = null;
    }
  }
  // interior points from the reference template, fitted to the outline points
  const ref = refPoints('side');
  const mir = (p) => (fwd > 0 ? p : { x: 767 - p.x, y: p.y });
  // Fit only on upper/mid-face outline points: including the chin would let a recessed chin rotate the
  // Frankfort plane and partly cancel itself out in the profile angles.
  const keys = ['g', 'n', 'sn', 'sto'];
  let T = fitSimilarity(keys.map((q) => mir(ref[q])), keys.map((q) => lm[q]));
  if (earX != null) {
    const tg = T(mir(ref.tragus));
    lm.tragus = { x: X(earX), y: tg.y };
    T = fitSimilarity([...keys, 'tragus'].map((q) => mir(ref[q])), [...keys, 'tragus'].map((q) => lm[q]));
  }
  for (const q of ['or', 'cornea', 'exs', 'ac']) lm[q] = T(mir(ref[q]));
  Object.assign(lm, jawFromShape(lm, fwd));
  if (earX == null) lm.tragus = T(mir(ref.tragus));
  if (!lm.c) { lm.c = T(mir(ref.c)); lm.neck = T(mir(ref.neck)); }

  // back to full-resolution pixels, then snap outline points onto the sharpest edge along the contour normal
  const out = {};
  for (const q in lm) out[q] = { x: lm[q].x / sc, y: lm[q].y / sc };
  if (pxFull) {
    const r = Math.max(3, Math.round((H / sc) * 0.02));
    const norm = (path, i) => { const a = path[Math.max(0, i - 3)], b = path[Math.min(path.length - 1, i + 3)]; const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1; return { x: -ty / l, y: tx / l }; };
    const idx = { g: [UP, iG], n: [UP, iN], st: [UP, atArc(UP, sUP, noseL * 0.12)], prn: [DN, 0], it: [DN, atArc(DN, sDN, noseL * 0.1)], sn: [DN, L.iSn], ls: [DN, L.iLs], sto: [DN, L.iSto], li: [DN, L.iLi], sm: [DN, L.iSm], pog: [DN, L.iPog], me: [DN, iMe] };
    if (iC > 0) { idx.c = [DN, iC]; idx.neck = [DN, iNeck]; }
    for (const [q, [path, i]] of Object.entries(idx)) out[q] = snapNormal(pxFull, out[q], norm(path, i), r);
  }
  out._dir = fwd;
  // Plausibility: the profile's vertical spacing should match the front photo's
  // (nose base → chin vs nasion → nose base), and the nose should clearly stick out.
  const ratioF = (Fy('me') - Fy('sn')) / ((Fy('sn') - Fy('nasion')) || 1);
  const ratioP = dist(lm.me, lm.sn) / (dist(lm.sn, nP) || 1);
  out._score = -Math.abs(Math.log(Math.max(1e-3, ratioP / ratioF))) - (S.bump < H * 0.06 ? 0.3 : 0);
  if (globalThis.__profileDebug) Object.assign(globalThis.__profileDebug.at(-1), { score: out._score, ratioP, ratioF, bump: S.bump / H });
  void faceH; void yBot;
  return out;
}

// Moore-neighbour boundary trace of mask M starting at boundary pixel (sx, sy). Returns the closed contour.
function traceContour(M, w, h, sx, sy, maxLen) {
  const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const inM = (x, y) => x >= 0 && y >= 0 && x < w && y < h && M[y * w + x] === 1;
  const dirIdx = (dx, dy) => D.findIndex((d) => d[0] === dx && d[1] === dy);
  let b = D.findIndex(([dx, dy]) => !inM(sx + dx, sy + dy));
  if (b < 0) return [];
  const out = [{ x: sx, y: sy }];
  let cx = sx, cy = sy;
  for (let it = 0; it < maxLen; it++) {
    let moved = false;
    const px = cx, py = cy;
    for (let k = 1; k <= 8; k++) {
      const nd = (b + k) % 8, nx = cx + D[nd][0], ny = cy + D[nd][1];
      if (inM(nx, ny)) {
        const pd = (b + k - 1) % 8; // last background neighbour checked
        const bx = cx + D[pd][0] - nx, by = cy + D[pd][1] - ny;
        cx = nx; cy = ny;
        b = dirIdx(bx, by);
        if (b < 0) b = (nd + 5) % 8;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    // Jacob's stopping rule: done when the first step (start → second pixel) repeats. Passing back through
    // the start pixel alone isn't enough — thin parts of the outline cross it twice.
    if (out.length > 2 && px === sx && py === sy && cx === out[1].x && cy === out[1].y) { out.pop(); break; }
    out.push({ x: cx, y: cy });
  }
  return out;
}
// Indices (ascending) of path[i0..i1] on the convex hull's front side, where front(p) > 0 measures how far a
// point sits in front of the chord from path[i0] to path[i1].
function frontHull(path, i0, i1, front) {
  const idx = [];
  for (let i = i0; i <= i1; i++) idx.push(i);
  const pts = idx.map((i) => ({ i, x: path[i].x, y: path[i].y })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = new Set([...lower, ...upper].map((p) => p.i));
  return [...hull].filter((i) => front(path[i]) > 0.5).sort((a, b) => a - b);
}
// moving-average smoothing of a polyline (removes the pixel staircase)
function smoothPath(p, r) {
  return p.map((_, i) => {
    let x = 0, y = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(p.length - 1, i + r); j++) { x += p[j].x; y += p[j].y; n++; }
    return { x: x / n, y: y / n };
  });
}
// move a point along a direction to the strongest colour edge within ±radius
function snapNormal(px, p, nrm, radius) {
  let best = 0, bestV = 0;
  for (let t = -radius; t <= radius; t++) {
    const q = { x: p.x + nrm.x * t, y: p.y + nrm.y * t };
    const a = px.at(q.x - nrm.x * 3, q.y - nrm.y * 3, 1), b = px.at(q.x + nrm.x * 3, q.y + nrm.y * 3, 1);
    const v = cdist(a, b) - Math.abs(t) * 0.8;
    if (v > bestV) { bestV = v; best = t; }
  }
  return bestV > 30 ? { x: p.x + nrm.x * best, y: p.y + nrm.y * best } : p;
}

// Public entry: returns { lm, mesh, source: 'ai' | 'outline' | 'template', dir?, error? }
// For the profile, pass { front, skin } from the frontal result so the outline tracer can scale itself,
// and { forceDir: 1 | -1 } to force the facing direction (1 = facing image right).
export async function detect(view, img, opts = {}) {
  let mesh = null, error = null;
  const segP = runSeg(img);
  if (!(view === 'side' && opts.forceDir)) {
    try {
      mesh = await runMesh(img);
    } catch (e) {
      error = 'model';
    }
  }
  const seg = await segP;
  const px = pixelReader(img);
  if (view === 'front') {
    if (!mesh) return { lm: templateFor(view, img), mesh: null, source: 'template', error: error || 'noface' };
    const r = frontFromMesh(mesh, px, seg);
    return { lm: r.lm, skin: r.skin, mesh, source: 'ai', seg: !!seg };
  }
  // A profile at ~90° is usually invisible to the mesh model; prefer it when it does see a face.
  // Three-quarter views: the face mesh finds the midline profile reliably. Near-90° profiles are often
  // outside the mesh model's range, so those go to the outline tracer first.
  const yawR = mesh ? meshProfileRatio(mesh) : 1;
  if (mesh && yawR >= 0.2 && yawR < 0.8 && !opts.forceDir) {
    const lm = sideFromMesh(mesh, px, seg);
    return { lm, mesh, source: 'ai', dir: Math.sign(lm.prn.x - lm.tragus.x) || 1 };
  }
  if (opts.front) {
    // Try several masks and keep the result whose proportions best match the front photo.
    // 'skin' (face + body skin) is the most complete outline, so it wins unless another mask fits the
    // front proportions clearly better.
    let best = null;
    for (const mode of seg ? ['skin', 'face', 'color'] : ['color']) {
      try {
        const lm = profileFromSilhouette(img, opts.front, opts.skin, seg, px, opts.forceDir, mode);
        if (lm && (!best || lm._score > best._score + 0.25)) best = lm;
      } catch (e) { console.warn('outline tracer failed', mode, e); }
    }
    if (best && best._score > -0.6) {
      const dir = best._dir;
      delete best._dir; delete best._score;
      return { lm: best, mesh: null, source: 'outline', dir, seg: !!seg };
    }
  }
  if (mesh && !opts.forceDir) {
    const lm = sideFromMesh(mesh, px, seg);
    return { lm, mesh, source: 'ai', dir: Math.sign(lm.prn.x - lm.tragus.x) || 1 };
  }
  const lm = templateFor(view, img);
  if (opts.forceDir === -1) for (const k in lm) lm[k] = { x: (img.naturalWidth || img.width) - lm[k].x, y: lm[k].y };
  return { lm, mesh: null, source: 'template', dir: opts.forceDir || 1, error: error || 'noface' };
}

// A real profile has the nose tip far outside the eye corners; a near-frontal detection doesn't.
// eye-span ÷ face-span: ≈0.75 straight on, falls towards 0 as the head turns to a full profile
function meshProfileRatio(m) {
  const eyeW = Math.abs(m[263].x - m[33].x);
  const faceW = Math.abs(m[454].x - m[234].x) || 1;
  return eyeW / faceW;
}


// ---------- orientation: sideways/upside-down photos and small tilts ----------
// Draw img rotated by `rad` about its centre on a canvas big enough to keep every pixel; corners are filled
// with the photo's border colour. Returns the canvas and a point mapper from old to new pixels.
function rotateToCanvas(img, rad) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = Math.cos(rad), s = Math.sin(rad);
  const W = Math.round(Math.abs(w * c) + Math.abs(h * s)), H = Math.round(Math.abs(w * s) + Math.abs(h * c));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // border colour from a 1-px strip of the original
  const probe = document.createElement('canvas');
  probe.width = 8; probe.height = 8;
  const pc = probe.getContext('2d');
  pc.drawImage(img, 0, 0, w, Math.max(1, h * 0.02), 0, 0, 8, 8);
  const d = pc.getImageData(0, 0, 8, 8).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  ctx.fillStyle = `rgb(${(r / 64) | 0},${(g / 64) | 0},${(b / 64) | 0})`;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(rad);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -w / 2, -h / 2);
  const map = (p) => { const x = p.x - w / 2, y = p.y - h / 2; return { x: W / 2 + x * c - y * s, y: H / 2 + x * s + y * c }; };
  return { canvas: cv, W, H, map };
}
const canvasToImage = (cv) => new Promise((res, rej) => {
  const url = cv.toDataURL('image/jpeg', 0.92);
  const im = new Image();
  im.onload = () => res({ img: im, url, w: cv.width, h: cv.height });
  im.onerror = () => rej(new Error('rotate failed'));
  im.src = url;
});

// How "upright" a person looks in the segmentation: head (face + hair) above body (neck, clothes).
async function uprightScore(src) {
  const seg = await runSeg(src);
  if (!seg) return -Infinity;
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  let hy = 0, hn = 0, by = 0, bn = 0;
  for (let y = 0; y < h; y += h / 64) for (let x = 0; x < w; x += w / 64) {
    const c = seg.at(x, y);
    if (c === C_FACE || c === C_HAIR) { hy += y; hn++; } else if (c === C_CLOTHES || c === C_BODY) { by += y; bn++; }
  }
  if (!hn) return -Infinity;
  const head = hy / hn / h;
  return bn ? by / bn / h - head : 0.5 - head; // > 0: head above body
}

// Quarter turns (0–3, clockwise) that make the photo upright.
async function uprightTurns(view, img) {
  if (view === 'front') {
    try { if (await runMesh(img)) return 0; } catch { return 0; }
    for (const q of [1, 3, 2]) {
      const { canvas } = rotateToCanvas(img, (q * Math.PI) / 2);
      try { if (await runMesh(canvas)) return q; } catch { /* keep trying */ }
    }
    return 0;
  }
  const s0 = await uprightScore(img);
  if (s0 > 0.05) return 0;
  let best = 0, bs = s0;
  for (const q of [1, 3, 2]) {
    const { canvas } = rotateToCanvas(img, (q * Math.PI) / 2);
    const s = await uprightScore(canvas);
    if (s > bs + 0.05) { bs = s; best = q; }
  }
  return best;
}

// Head roll in the photo: the eye line (front) or the Frankfort plane, ear canal → under-eye rim (side).
function photoTilt(view, lm) {
  if (view === 'front') return Math.atan2(lm.pupil_l.y - lm.pupil_r.y, lm.pupil_l.x - lm.pupil_r.x);
  const f = Math.sign(lm.prn.x - lm.tragus.x) || 1;
  return f * Math.atan2(lm.or.y - lm.tragus.y, f * (lm.or.x - lm.tragus.x));
}

// detect() on an upright, levelled version of the photo. When the photo had to be turned, the result
// carries `image: { url, w, h }` — the corrected photo the landmarks belong to.
export async function detectUpright(view, img, opts = {}) {
  let cur = img, rotated = false;
  const turns = await uprightTurns(view, img).catch(() => 0);
  if (turns) { cur = (await canvasToImage(rotateToCanvas(img, (turns * Math.PI) / 2).canvas)).img; rotated = true; }
  let res = await detect(view, cur, opts);
  if (res.source !== 'template') {
    const tilt = photoTilt(view, res.lm);
    const deg = (tilt * 180) / Math.PI;
    // level the photo when the head is visibly tilted (but not for wild values from a bad detection)
    if (Math.abs(deg) > 1.5 && Math.abs(deg) < 35) {
      const r = rotateToCanvas(cur, -tilt);
      const up = await canvasToImage(r.canvas);
      if (view === 'side' && Math.abs(deg) > 4) {
        // the outline tracer works best on a levelled profile: trace again
        const again = await detect(view, up.img, opts);
        res = again.source === 'template' ? { ...res, lm: mapLm(res.lm, r.map) } : again;
      } else {
        res = { ...res, lm: mapLm(res.lm, r.map), mesh: res.mesh ? res.mesh.map((p) => ({ ...r.map(p), z: p.z })) : res.mesh };
      }
      cur = up.img; rotated = true;
      res.levelled = deg;
    }
  }
  if (turns) res.turned = turns * 90;
  if (rotated) res.image = { url: cur.src, w: cur.naturalWidth, h: cur.naturalHeight };
  return res;
}
const mapLm = (lm, f) => Object.fromEntries(Object.entries(lm).map(([k, p]) => [k, f(p)]));
