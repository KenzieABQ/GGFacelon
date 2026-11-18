// Fits FaceIQ's per-ratio score curves and population spread from tools/faceiq-data.mjs.
//   node tools/fit-faceiq.mjs            → prints the fit
//   node tools/fit-faceiq.mjs --write    → also writes js/norms.js
import { CHICO, PERFECT, FIQ, CHICO_IMPACT } from './faceiq-data.mjs';
import { writeFileSync } from 'node:fs';

const Phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
const invPhi = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };

const out = {};
for (const [id, [v, lo, hi, , hPct, qPct]] of Object.entries(CHICO)) {
  // population: X ~ N(mu, sd) with P(X < v) = h and P(lo < X < hi) = q
  const h = Math.min(0.995, Math.max(0.005, hPct / 100)), q = qPct / 100, zh = invPhi(h);
  let best = null;
  const span = hi - lo || Math.abs(v) * 0.1 || 1;
  for (let k = -60; k <= 60; k++) {
    const sd = span * Math.pow(10, k / 30);
    const mu = v - sd * zh;
    const qq = Phi((hi - mu) / sd) - Phi((lo - mu) / sd);
    const err = Math.abs(qq - q);
    if (!best || err < best.err) best = { sd, mu, err };
  }
  // score curve width: score = 10·exp(−(d/s)²), d = distance outside [lo, hi]
  const ss = [];
  for (const [src, val, sc] of [['chico', v, CHICO[id][3]], ['perfect', ...(PERFECT[id] || [])], ['fiq', ...(FIQ[id] || [])]]) {
    if (!Number.isFinite(val) || !(sc < 9.95)) continue;
    const d = val < lo ? lo - val : val > hi ? val - hi : 0;
    if (d <= 0) continue;
    // rounding to 0.1 matters near 10: weight by how far below 10 the score is
    ss.push({ s: d / Math.sqrt(-Math.log(sc / 10)), w: Math.min(1, (10 - sc) / 1.5), src });
  }
  const s = ss.length ? ss.reduce((a, x) => a + x.s * x.w, 0) / ss.reduce((a, x) => a + x.w, 0) : null;
  out[id] = { lo, hi, mu: +best.mu.toPrecision(4), sd: +best.sd.toPrecision(3), s: s && +s.toPrecision(3), n: ss.length, fitErr: +best.err.toFixed(3), v, zh };
}
// Where no out-of-range example exists, use the median ratio s/sd of the fitted ones
const ratios = Object.values(out).filter((o) => o.s).map((o) => o.s / o.sd).sort((a, b) => a - b);
const k = ratios[Math.floor(ratios.length / 2)];
for (const o of Object.values(out)) if (!o.s) { o.s = +(k * o.sd).toPrecision(3); o.sFrom = 'sd'; }
// The two-percentage fit is unstable when the example sits near a range edge; keep the population spread
// within ×0.5–×2 of what the score curve implies, and re-centre so the example keeps its percentile.
for (const o of Object.values(out)) {
  const prior = o.s / k, sd = Math.min(prior * 2, Math.max(prior * 0.5, o.sd));
  if (sd !== o.sd) { o.sd = +sd.toPrecision(3); o.mu = +(o.v - sd * o.zh).toPrecision(4); o.reg = true; }
  delete o.v; delete o.zh;
}
console.log('median s/sd =', k.toFixed(2), ' (from', ratios.length, 'ratios)');
console.table(out);

// ── Harmony aggregation: weighted power mean per view → linear display map, harmony = 0.6 front + 0.4 side ──
// Weights: research-based defaults, with the ones FaceIQ's published flaw impacts pin down fitted.
const FRONT = ['top_third','middle_third','lower_third','fwhr','midface_ratio','total_wh','bitemporal','cheekbone_height','esr','one_eye_apart','canthal_tilt','brow_length','brow_low_set','eye_ar','brow_tilt','iaa_jfa_dev','iaa','bridge_nose','icd_nose','nose_tip_pos','mouth_corner','cupid_depth','mouth_nose','lip_ratio','ipd_mouth','chin_philtrum','jaw_slope','bigonial','lower_third_prop','jfa','ear_angle','ear_ratio','neck_width'];
const SIDE = Object.keys(CHICO).filter((k) => !FRONT.includes(k));
const W = { fwhr: 4, middle_third: 3, lower_third: 3, esr: 3, canthal_tilt: 3, midface_ratio: 3, bigonial: 3, chin_philtrum: 3, fh_recession: 3, convexity_g: 3,
  submental: 3, eye_ar: 2, cheekbone_height: 3, total_wh: 1.2, brow_low_set: 2, jfa: 2, gonial: 2, mpa: 2, top_third: 1.2, one_eye_apart: 2, nasofrontal: 2,
  z_angle: 2, e_upper: 2, e_lower: 2, neck_width: 2, lower_third_prop: 2, mouth_nose: 1.2, icd_nose: 1.2, ipd_mouth: 1.2, lip_ratio: 1.2, bitemporal: 1.2,
  jaw_slope: 1.2, nasolabial: 1.2, nasofacial: 1, nasomental: 1, ramus_mandible: 1.2, holdaway: 1.2, mentolabial: 1, total_convexity: 1.2, convexity_n: 1.2,
  orbital_vector: 1.2, nasal_projection: 1.2, browridge_incl: 1.2, cupid_depth: 0.3, tip_rotation: 0.3 };
const wt = (id) => W[id] ?? 0.6;
const P_MEAN = 0.5;
const scoreOf = (face, id) => face === 'chico' ? CHICO[id][3] : (face === 'perfect' ? PERFECT : FIQ)[id][1];
const pmean = (ids, face, fix) => { let a = 0, b = 0; for (const id of ids) { const s = Math.max(0.05, id === fix ? 10 : scoreOf(face, id)); a += wt(id) * Math.pow(s, P_MEAN); b += wt(id); } return Math.pow(a / b, 1 / P_MEAN); };
const targets = [['chico', FRONT, 7.6], ['chico', SIDE, 7.8], ['perfect', FRONT, 9.5], ['perfect', SIDE, 8.3]].map(([f, ids, y]) => ({ x: pmean(ids, f), y }));
const mx = targets.reduce((a, q) => a + q.x, 0) / 4, my = targets.reduce((a, q) => a + q.y, 0) / 4;
const B = targets.reduce((a, q) => a + (q.x - mx) * (q.y - my), 0) / targets.reduce((a, q) => a + (q.x - mx) ** 2, 0), A = my - B * mx;
const disp = (x) => Math.min(10, A + B * x);
const H = (f) => 0.6 * disp(pmean(FRONT, f)) + 0.4 * disp(pmean(SIDE, f));
console.log(`harmony map: shown = ${A.toFixed(3)} + ${B.toFixed(3)} × powermean(p=${P_MEAN})`);
console.log(`  Chico   F ${disp(targets[0].x).toFixed(2)} (7.6)  S ${disp(targets[1].x).toFixed(2)} (7.8)  H ${H('chico').toFixed(2)} (7.7)`);
console.log(`  Perfect F ${disp(targets[2].x).toFixed(2)} (9.5)  S ${disp(targets[3].x).toFixed(2)} (8.3)  H ${H('perfect').toFixed(2)} (9.1)`);
console.log(`  FaceIQ demo H ${H('fiq').toFixed(2)} (6.4)`);
for (const [id, v] of Object.entries(CHICO_IMPACT)) {
  const ids = FRONT.includes(id) ? FRONT : SIDE, share = FRONT.includes(id) ? 0.6 : 0.4;
  console.log(`  impact ${id}: ${(10 * share * (disp(pmean(ids, 'chico', id)) - disp(pmean(ids, 'chico')))).toFixed(2)} (FaceIQ ${v})`);
}

const CAL = (() => { const u = new URL('./calibration.json', import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : {}; })();
// ── FaceIQ's ideal ranges for each ethnicity (modal range per ratio across the collected pages) ──
import { existsSync, readFileSync } from 'node:fs';
const GROUPS = { caucasian: /caucasian|mediterranean|slavic|white/i, black: /black|african/i, east_asian: /east asian/i,
  south_asian: /south asian|indian/i, middle_eastern: /middle eastern|arab/i, hispanic: /hispanic|latino/i };
const groupOf = (eth) => { const first = (eth || '').split(',')[0]; for (const [g, re] of Object.entries(GROUPS)) if (re.test(first)) return g; return null; };
const RANGE_SETS = {};
{
  const tally = {}; // group -> id -> "lo~hi" -> count
  const add = (eth, id, lo, hi) => { const g = groupOf(eth); if (!g) return; const t = ((tally[g] ??= {})[id] ??= {}); const k = lo + '~' + hi; t[k] = (t[k] || 0) + 1; };
  const rp = new URL('./testdata/faceiq-ranges.json', import.meta.url), bp = new URL('./testdata/faceiq-bench.json', import.meta.url);
  if (existsSync(rp)) for (const g of Object.values(JSON.parse(readFileSync(rp, 'utf8')).groups)) for (const [eth, n] of Object.entries(g.ethnicities)) for (const [id, [lo, hi]] of Object.entries(g.ranges)) for (let i = 0; i < n; i++) add(eth, id, lo, hi);
  if (existsSync(bp)) for (const f of JSON.parse(readFileSync(bp, 'utf8')).faces) for (const [id, r] of Object.entries(f.ratios)) add(f.ethnicity, id, r.lo, r.hi);
  for (const [g, ids] of Object.entries(tally)) {
    RANGE_SETS[g] = {};
    for (const [id, m] of Object.entries(ids)) RANGE_SETS[g][id] = Object.entries(m).sort((a, b) => b[1] - a[1])[0][0].split('~').map(Number);
  }
  console.log('range sets:', Object.entries(RANGE_SETS).map(([g, r]) => `${g} (${Object.keys(r).length})`).join(', '));
}

if (process.argv.includes('--write')) {
  const lines = Object.entries(out).map(([id, o]) => `  ${id}: { lo: ${o.lo}, hi: ${o.hi}, s: ${o.s}, mu: ${o.mu}, sd: ${o.sd} },`);
  writeFileSync(new URL('../js/norms.js', import.meta.url), `// Generated by tools/fit-faceiq.mjs from tools/faceiq-data.mjs — do not edit by hand.
// lo/hi: FaceIQ ideal range (male). s: width of the score fall-off outside the range, score = 10·exp(−(d/s)²).
// mu/sd: spread of the measurement among the men on FaceIQ's celebrity wiki (used to calibrate the scale).
export const FIQ_NORMS = {
${lines.join('\n')}
};
// Harmony: shown = A + B × weighted power mean (exponent p) of the ratio scores, per view; 60% front, 40% side.
// view / pillar: maps fitted on the FaceIQ benchmark (tools/calibration.json, from tools/bench.js), which also
// absorb the small differences between automatically placed landmarks and FaceIQ's.
export const AGG = { p: ${P_MEAN}, A: ${A.toFixed(4)}, B: ${B.toFixed(4)}, front: 0.6, side: 0.4,
  view: ${JSON.stringify(CAL.view || null)}, pillar: ${JSON.stringify(CAL.pillar || null)}, overall: ${JSON.stringify(CAL.overall || null)},
  w: ${JSON.stringify(Object.fromEntries([...FRONT, ...SIDE].map((id) => [id, wt(id)])))} };
// FaceIQ adjusts ideal ranges for ethnicity. GGFacelon doesn't ask, so each face is scored against every set
// and the best-fitting one is used. [lo, hi] per ratio; ratios missing from a set use FIQ_NORMS.
export const RANGE_SETS = ${JSON.stringify(RANGE_SETS)};
`);
  console.log('wrote js/norms.js');
}
