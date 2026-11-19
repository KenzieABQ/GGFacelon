// Appearance: what the photo itself shows, beyond landmark geometry.
//
// Ratios only see where points are. These measurements read the pixels around the verified landmarks:
//  • Eyebrows — thickness and darkness against the surrounding skin, and how far the tail really runs.
//  • Eye area — the gap between the brow and the upper lid, and how open the eye is against the iris
//    (white showing under the iris reads as tired or startled).
//  • Lips — vermilion fullness.
//  • Hairline — how far the temple corners have receded compared with the centre.
//  • Profile — whether the forehead points are hidden under hair (then forehead angles can't be measured).
//
// Everything is expressed relative to the face (inter-pupil distance, skin brightness), so photo size and
// exposure cancel out. Shading-based reads (jaw shadow, cheek hollows) were tried and dropped: on FaceIQ's
// benchmark they tracked lighting and double-chin shadows, not definition.

import { segmentPhoto, SEG_CLASS } from './detect.js';

export const APPEARANCE_VERSION = 1;
const IPD_MM = 63; // average adult male inter-pupil distance — converts IPD units to millimetres

// ───────────────────────── pixels ─────────────────────────
// Luminance of the photo, downscaled so the eyes are ~170 px apart (enough for brow hairs), lightly blurred.
function lumaOf(img, ipdPx) {
  const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
  const k = Math.min(1, 170 / Math.max(1, ipdPx));
  const w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // 3×3 box blur: suppresses single-hair and JPEG noise without washing out a brow edge
  const B = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += L[yy * w + xx]; n++; } }
    B[y * w + x] = s / n;
  }
  const at = (x, y) => { // bilinear, in ORIGINAL image pixels
    const fx = Math.min(w - 1.001, Math.max(0, x * k)), fy = Math.min(h - 1.001, Math.max(0, y * k));
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * w + x0;
    return (B[i] * (1 - ax) + B[i + 1] * ax) * (1 - ay) + (B[i + w] * (1 - ax) + B[i + w + 1] * ax) * ay;
  };
  return { at, inside: (x, y) => x >= 0 && y >= 0 && x < W0 && y < H0 };
}

// ───────────────────────── small helpers ─────────────────────────
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN; };
const pctile = (a, q) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return NaN; return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const P = (x, y) => ({ x, y });
const addv = (p, v, t) => P(p.x + v.x * t, p.y + v.y * t);
const sub = (a, b) => P(a.x - b.x, a.y - b.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return P(v.x / l, v.y / l); };
const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const avgOf = (...p) => P(mean(p.map((q) => q.x)), mean(p.map((q) => q.y)));

// Face axes from the pupils: ex runs along the eye line (image-left eye → image-right eye), ey points down.
function axes(lm) {
  const a = lm.pupil_r.x <= lm.pupil_l.x ? lm.pupil_r : lm.pupil_l, b = a === lm.pupil_r ? lm.pupil_l : lm.pupil_r;
  const ex = norm(sub(b, a));
  return { ex, ey: P(-ex.y, ex.x), ipd: Math.hypot(b.x - a.x, b.y - a.y) };
}

// Point on a polyline at fraction t of its length; t outside [0, 1] extends the end segments.
function along(pts, t) {
  const segL = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segL.push(l); total += l; }
  let d = t * total;
  if (d <= 0) { const v = norm(sub(pts[1], pts[0])); return { p: addv(pts[0], v, d), tan: v }; }
  for (let i = 0; i < segL.length; i++) {
    if (d <= segL[i] || i === segL.length - 1) { const v = norm(sub(pts[i + 1], pts[i])); return { p: addv(pts[i], v, d), tan: v }; }
    d -= segL[i];
  }
}

// ───────────────────────── eyebrows ─────────────────────────
// One cross-section through the brow at p: brightness profile along the "up" normal, averaged along the brow.
// Returns the dark band around the brow: its top/bottom offsets (IPD units, + = below p), core darkness and
// contrast against the skin around it.
function browSection(L, p, tan, up, ipd, uMax = Infinity) {
  const u0 = -0.34, u1 = 0.3, du = 0.006;
  const prof = [];
  for (let u = u0; u <= u1 + 1e-9; u += du) {
    let s = 0, n = 0;
    for (let a = -0.025; a <= 0.025 + 1e-9; a += 0.0125) {
      const q = addv(addv(p, up, -u * ipd), tan, a * ipd);
      if (!L.inside(q.x, q.y)) continue;
      s += L.at(q.x, q.y); n++;
    }
    prof.push(n ? s / n : NaN);
  }
  const U = (i) => u0 + i * du;
  // core: darkest point near the landmark (the brow can sit a little above or below it)
  let ci = -1, cv = Infinity;
  for (let i = 0; i < prof.length; i++) { const u = U(i); if (u < -0.16 || u > 0.11) continue; if (prof[i] < cv) { cv = prof[i]; ci = i; } }
  if (ci < 0) return null;
  // Skin on each side of the brow: the brightest level within a brow-width of the core. Each edge uses its
  // own side's level, so the shadowed lid under a heavy brow (or the dark eye below it) doesn't count as brow.
  // (the lower side stops short of the upper eyelid, whose lashes form a second dark band)
  const win = (a, b) => prof.filter((_, i) => U(i) >= U(ci) + a && U(i) <= Math.min(U(ci) + b, uMax));
  const skinA = pctile(win(-0.22, -0.04), 0.9), skinB = pctile(win(0.04, 0.18), 0.9);
  if (!Number.isFinite(skinA) || !Number.isFinite(skinB) || skinA < 25) return null;
  const TA = cv + 0.5 * (skinA - cv), TB = cv + 0.5 * (skinB - cv);
  // walk out from the core while below the half-contrast level, bridging gaps of up to 0.02 IPD (hair texture)
  const gapMax = Math.round(0.02 / du);
  const walk = (dir, T) => {
    let last = ci, gap = 0;
    for (let i = ci + dir; i >= 0 && i < prof.length; i += dir) {
      if (dir > 0 && U(i) > uMax) break;
      if (prof[i] < T) { last = i; gap = 0; } else if (++gap > gapMax) break;
    }
    return last;
  };
  const it = walk(-1, TA), ib = walk(1, TB);
  const edge = (i, j, T) => { const a = prof[i], b = prof[j]; return Number.isFinite(a) && Number.isFinite(b) && a !== b ? U(i) + (U(j) - U(i)) * ((T - a) / (b - a)) : U(i); };
  const top = it > 0 ? edge(it - 1, it, TA) : U(0), bot = ib < prof.length - 1 ? edge(ib, ib + 1, TB) : U(prof.length - 1);
  return { top, bot, core: U(ci), dark: cv, skin: skinA, contrast: (skinA - cv) / skinA, clipped: it === 0 || ib === prof.length - 1 };
}

function browSide(L, lm, s, A, hairAt) {
  const pts = [lm['brI_' + s], lm['brP_' + s], lm['brT_' + s]];
  if (pts.some((p) => !p)) return null;
  const up = P(-A.ey.x, -A.ey.y);
  // upper-lid line (inner corner → lid top → outer corner); the brow's lower edge can't pass it
  const lid = [lm['endo_' + s], lm['lidU_' + s], lm['exo_' + s]].filter(Boolean).sort((a, b) => dot(a, A.ex) - dot(b, A.ex));
  const lidAt = (q) => {
    const x = dot(q, A.ex);
    if (lid.length < 2) return null;
    if (x <= dot(lid[0], A.ex)) return lid[0];
    for (let i = 1; i < lid.length; i++) { const x0 = dot(lid[i - 1], A.ex), x1 = dot(lid[i], A.ex); if (x <= x1) return lerp(lid[i - 1], lid[i], (x - x0) / ((x1 - x0) || 1)); }
    return lid[lid.length - 1];
  };
  const at = (t) => {
    const { p, tan } = along(pts, t);
    const n = dot(P(-tan.y, tan.x), up) > 0 ? P(-tan.y, tan.x) : P(tan.y, -tan.x);
    const lp = lidAt(p), uMax = lp ? -dot(sub(lp, p), n) / A.ipd - 0.03 : Infinity;
    return { p, tan, n, sec: browSection(L, p, tan, n, A.ipd, uMax) };
  };
  const body = [];
  for (let t = 0.1; t <= 0.9 + 1e-9; t += 0.1) body.push({ t, ...at(t) });
  const good = body.filter((b) => b.sec && !b.sec.clipped && b.sec.contrast > 0.06);
  if (good.length < 4) return { ok: false };
  const thick = good.map((b) => b.sec.bot - b.sec.top);
  const inner = good.filter((b) => b.t <= 0.6);
  const cBody = median(good.map((b) => b.sec.contrast));
  // follow the band past the marked tail (and before the marked head) while it stays dark and continuous
  const walk = (t0, dt, limit) => {
    let last = null, prevCore = null;
    for (let t = t0; dt > 0 ? t <= limit : t >= limit; t += dt) {
      const r = at(t);
      if (!r.sec || r.sec.contrast < 0.55 * cBody || r.sec.clipped || r.sec.bot - r.sec.top < 0.03) break;
      if (prevCore != null && Math.abs(r.sec.core - prevCore) > 0.05) break;
      const q = addv(r.p, r.n, -r.sec.core * A.ipd);
      // the tail can run into scalp hair at the temple: stop where the segmenter sees hair rather than face
      if (hairAt && hairAt(q.x, q.y)) break;
      prevCore = r.sec.core;
      last = q;
    }
    return last;
  };
  const tail = walk(0.9, 0.04, 1.7) || addv(at(0.9).p, at(0.9).n, -median(good.map((b) => b.sec.core)) * A.ipd);
  const head = walk(0.1, -0.04, -0.6) || addv(at(0.1).p, at(0.1).n, -median(good.map((b) => b.sec.core)) * A.ipd);
  // lower brow edge straight above the pupil → gap to the upper lid
  const pup = lm['pupil_' + s];
  const nearest = good.reduce((b, x) => (Math.abs(dot(sub(x.p, pup), A.ex)) < Math.abs(dot(sub(b.p, pup), A.ex)) ? x : b), good[0]);
  const lowEdge = addv(nearest.p, nearest.n, -nearest.sec.bot * A.ipd);
  const lidTop = lm['lidU_' + s];
  const gap = lidTop ? dot(sub(lidTop, lowEdge), A.ey) / A.ipd : NaN;
  // a fringe lying over the brow makes the "skin" above it dark — flag it
  const fringe = hairAt ? good.filter((b) => hairAt(addv(b.p, b.n, (0.2 - b.sec.core) * A.ipd))).length / good.length : 0;
  return {
    ok: true,
    thick: median(inner.length >= 3 ? inner.map((b) => b.sec.bot - b.sec.top) : thick),
    tailThick: median(good.filter((b) => b.t >= 0.7).map((b) => b.sec.bot - b.sec.top)),
    contrast: cBody,
    tail, head, gap, fringe,
    band: good.map((b) => ({ top: addv(b.p, b.n, -b.sec.top * A.ipd), bot: addv(b.p, b.n, -b.sec.bot * A.ipd) })),
    lowEdge,
  };
}

// ───────────────────────── eyes ─────────────────────────
// Iris radius from the limbus: the strongest dark→bright step going sideways out of the pupil centre
// (sideways because the lids cover the top and bottom of the iris).
function irisRadius(L, c, A) {
  const rs = [];
  for (let r = 0.065; r <= 0.14 + 1e-9; r += 0.0025) rs.push(r);
  const score = rs.map(() => 0);
  for (const base of [0, Math.PI]) for (let a = -0.6; a <= 0.6 + 1e-9; a += 0.15) {
    const ang = base + a, v = P(A.ex.x * Math.cos(ang) + A.ey.x * Math.sin(ang), A.ex.y * Math.cos(ang) + A.ey.y * Math.sin(ang));
    for (let i = 0; i < rs.length; i++) {
      const pIn = addv(c, v, (rs[i] - 0.008) * A.ipd), pOut = addv(c, v, (rs[i] + 0.008) * A.ipd);
      if (!L.inside(pOut.x, pOut.y)) continue;
      score[i] += L.at(pOut.x, pOut.y) - L.at(pIn.x, pIn.y);
    }
  }
  let bi = 0; for (let i = 1; i < rs.length; i++) if (score[i] > score[bi]) bi = i;
  const r = rs[bi];
  // implausible (closed eye, glare, glasses): fall back to the population iris size (11.7 mm)
  return { r: bi > 0 && bi < rs.length - 1 ? r : 0.093, fit: bi > 0 && bi < rs.length - 1 };
}

function eyeSide(L, lm, s, A) {
  const c = lm['pupil_' + s], U = lm['lidU_' + s], D = lm['lidL_' + s];
  if (!c || !U || !D) return null;
  const { r, fit } = irisRadius(L, c, A);
  const open = dot(sub(D, U), A.ey) / A.ipd;
  const below = dot(sub(D, c), A.ey) / A.ipd - r; // > 0: white visible under the iris
  const above = -dot(sub(U, c), A.ey) / A.ipd - r; // > 0: white visible above the iris
  return { r, fit, open, exposure: open / (2 * r), below, above };
}

// ───────────────────────── hairline ─────────────────────────
// Hairline height above brow level at the centre and at the temple corners (from the hair mask).
// recession > 0: corners sit higher than the centre (receding temples). NaN when no hairline is visible.
function hairline(lm, A, hairAt, faceH) {
  if (!hairAt) return { v: NaN };
  const browC = avgOf(lm.brI_r, lm.brI_l);
  const half = Math.abs(dot(sub(lm.temple_l, lm.temple_r), A.ex)) / 2;
  const midX = avgOf(lm.temple_r, lm.temple_l);
  const heightAt = (f) => {
    const base = addv(addv(browC, A.ex, dot(sub(midX, browC), A.ex) + f * half), A.ey, 0);
    let run = 0;
    for (let d = 0.05 * faceH; d <= 0.75 * faceH; d += faceH / 300) {
      const q = addv(base, A.ey, -d);
      if (q.y < 0) return NaN;
      if (hairAt(q.x, q.y)) { if (++run >= 3) return (d - (2 * faceH) / 300) / faceH; } else run = 0;
    }
    return NaN;
  };
  const c = median([heightAt(-0.12), heightAt(0), heightAt(0.12)]);
  const corners = [heightAt(-0.72), heightAt(0.72)];
  if (!Number.isFinite(c)) return { v: NaN };
  // a corner with no hair at all up to the crown counts as strongly receded
  const cv = corners.map((h) => (Number.isFinite(h) ? h : c + 0.25));
  return { v: mean(cv) - c, center: c, corners: cv };
}

// ───────────────────────── entry points ─────────────────────────
// Front photo appearance. lm: verified front landmarks (image pixels). Returns { v: {id: value}, dbg }.
export async function measureFront(img, lm) {
  const A = axes(lm);
  const L = lumaOf(img, A.ipd);
  const seg = await segmentPhoto(img).catch(() => null);
  const hairAt = seg ? (x, y) => seg.at(x, y) === SEG_CLASS.HAIR : null;
  const faceH = Math.abs(dot(sub(lm.me, lm.trichion), A.ey)) || A.ipd * 3;
  const mmPerIpd = IPD_MM;
  const v = {}, dbg = {};

  // eyebrows
  const br = ['r', 'l'].map((s) => browSide(L, lm, s, A, hairAt));
  const okB = br.filter((b) => b && b.ok);
  if (okB.length) {
    v.brow_thickness = mean(okB.map((b) => b.thick)) * mmPerIpd;
    v.brow_density = mean(okB.map((b) => b.contrast)) * 100;
    // tail reach past the outer eye corner, as a share of eye width (0 = ends exactly above the corner)
    v.brow_tail_reach = mean(['r', 'l'].map((s, i) => {
      const b = br[i]; if (!b || !b.ok) return NaN;
      const exo = lm['exo_' + s], endo = lm['endo_' + s], w = Math.abs(dot(sub(exo, endo), A.ex)) || 1;
      const outward = Math.sign(dot(sub(exo, endo), A.ex));
      return (outward * dot(sub(b.tail, exo), A.ex)) / w;
    }));
    v.brow_eye_gap = mean(okB.map((b) => b.gap)) * mmPerIpd;
    if (okB.some((b) => b.fringe > 0.5)) dbg.browFringe = true;
    dbg.brows = br;
  }
  // eyes
  const ey = ['r', 'l'].map((s) => eyeSide(L, lm, s, A)).filter(Boolean);
  if (ey.length) {
    v.iris_exposure = mean(ey.map((e) => e.exposure));
    v.scleral_show = Math.max(0, mean(ey.map((e) => e.below))) * mmPerIpd;
    dbg.eyes = ey;
  }
  // lips: vermilion height (upper lip top → lower lip bottom) against mouth width
  if (lm.ls && lm.li && lm.ch_r && lm.ch_l) {
    const mw = Math.abs(dot(sub(lm.ch_l, lm.ch_r), A.ex));
    v.lip_fullness = (dot(sub(lm.li, lm.ls), A.ey) / (mw || 1)) * 100;
  }
  // hairline
  const hl = hairline(lm, A, hairAt, faceH);
  v.temple_recession = hl.v * 100;
  dbg.hair = hl;
  for (const k in v) if (!Number.isFinite(v[k])) v[k] = NaN;
  return { v, dbg, seg: !!seg };
}

// Profile: flags points that sit under hair (their angles can't be measured from this photo).
export async function measureSide(img, lm) {
  const seg = await segmentPhoto(img).catch(() => null);
  if (!seg) return { hidden: [] };
  const hidden = ['tr', 'fh', 'g'].filter((k) => lm[k] && seg.at(lm[k].x, lm[k].y) === SEG_CLASS.HAIR
    // the outline point itself sits on the edge; look just inside the face too
    && seg.at(lm[k].x + (lm.tragus && lm.prn ? Math.sign(lm.tragus.x - lm.prn.x) : 0) * 6, lm[k].y) === SEG_CLASS.HAIR);
  return { hidden };
}

// Both views; never throws (appearance is a bonus — the analysis works without it).
export async function measureAppearance(frontImg, frontLm, sideImg, sideLm) {
  const out = { ver: APPEARANCE_VERSION, v: {}, hidden: [] };
  try { const f = await measureFront(frontImg, frontLm); out.v = f.v; out.flags = f.dbg.browFringe ? ['browFringe'] : []; } catch (e) { console.warn('appearance (front) failed', e); }
  try { if (sideImg && sideLm) out.hidden = (await measureSide(sideImg, sideLm)).hidden; } catch (e) { console.warn('appearance (side) failed', e); }
  // JSON can't hold NaN: store missing values as null
  for (const k in out.v) if (!Number.isFinite(out.v[k])) out.v[k] = null;
  return out;
}

// internals, for tools/bench.js and debugging
export const _internals = { lumaOf, browSection, browSide, axes, along, irisRadius };
