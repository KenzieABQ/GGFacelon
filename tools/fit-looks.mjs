// Offline fitting on the FaceIQ benchmark (tools/testdata/bench-raw.json, saved by tools/bench.js `upload`).
//
//   node tools/fit-looks.mjs            # report only
//   node tools/fit-looks.mjs --write    # update tools/calibration.json, then run fit-faceiq.mjs --write
//
// What it fits, and why:
//  1. Convention shifts — FaceIQ never publishes where it puts the ear canal, under-eye rim, nostril base or
//     profile eye corner, so ratios built on them come out consistently offset from FaceIQ's own values. The
//     median offset (only when clearly larger than chance) is subtracted before scoring.
//  2. Reliability — how far our automatic value scatters around FaceIQ's, compared with the ratio's score
//     width. A ratio we measure much less precisely than its ideal range is narrow gets proportionally less
//     weight (s² / (s² + σ²)): its score is mostly noise.
//  3. Range-set choice — scoring every face against all six of FaceIQ's ethnicity range sets and keeping the
//     best one favours whichever set is most lenient. Each set's average Harmony on the benchmark is
//     subtracted first, so the set that fits *this* face unusually well is chosen.
//  4. Appearance (photo) measurements — population spread, how they relate to FaceIQ's vision-model pillars,
//     ideal ranges, and leave-one-out tests that they actually improve agreement with FaceIQ.
//  5. Score maps — spread-preserving maps from our raw values onto FaceIQ's displayed scale, for each pillar,
//     each view (front-only / side-only) and the overall.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DATA = new URL('./testdata/bench-raw.json', import.meta.url);
const CALF = new URL('./calibration.json', import.meta.url);
if (!existsSync(DATA)) { console.error('missing tools/testdata/bench-raw.json — run the browser bench and upload() first'); process.exit(1); }
const faces = JSON.parse(readFileSync(DATA, 'utf8')).faces;
const WRITE = process.argv.includes('--write');

const M = await import('../js/metrics.js');
const { METRICS, METRIC_BY_ID, scoreValues, RANGE_SET_IDS } = M;
const { AGG } = await import('../js/norms.js');

// ───────── stats helpers ─────────
const fin = (a) => a.filter(Number.isFinite);
const mean = (a) => { a = fin(a); return a.reduce((s, x) => s + x, 0) / (a.length || 1); };
const sd = (a) => { a = fin(a); const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const median = (a) => { const s = fin(a).sort((x, y) => x - y); if (!s.length) return NaN; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const q = (a, p) => { const s = fin(a).sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
function corr(a, b) { const k = a.map((x, i) => Number.isFinite(x) && Number.isFinite(b[i])); const A = a.filter((_, i) => k[i]), B = b.filter((_, i) => k[i]); const ma = mean(A), mb = mean(B); let c = 0, va = 0, vb = 0; for (let i = 0; i < A.length; i++) { c += (A[i] - ma) * (B[i] - mb); va += (A[i] - ma) ** 2; vb += (B[i] - mb) ** 2; } return c / Math.sqrt(va * vb || 1); }
const r2 = (x) => (Number.isFinite(x) ? +x.toFixed(2) : null), r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null), r4 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : null);
const pad = (s, n) => String(s).padEnd(n);
const cal = existsSync(CALF) ? JSON.parse(readFileSync(CALF, 'utf8')) : {};

const GROUPS = { caucasian: /caucasian|mediterranean|slavic|white/i, black: /black|african/i, east_asian: /east asian/i, south_asian: /south asian|indian/i, middle_eastern: /middle eastern|arab/i, hispanic: /hispanic|latino/i };
const groupOf = (eth) => { const first = (eth || '').split(',')[0]; for (const [g, re] of Object.entries(GROUPS)) if (re.test(first)) return g; return null; };

console.log(`${faces.length} faces; side sources:`, faces.reduce((a, f) => ((a[f.sideSource] = (a[f.sideSource] || 0) + 1), a), {}));

// ───────── 1 + 2. ratio agreement: convention shift and measurement scatter ─────────
// Faces whose profile fell back to the template say nothing about measurement precision: leave them out.
function statsOn(pool0) {
  const realP = pool0.filter((f) => f.sideSource !== 'template'), out = {};
  for (const m of METRICS.filter((x) => x.hm)) {
    const pool = m.view === 'side' ? realP : pool0;
    const d = pool.map((f) => { const a = f.rawM[m.id], b = f.ratios[m.id]?.v; return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN; });
    const n = fin(d).length, bias = median(d), sig = 1.4826 * median(d.map((x) => Math.abs(x - bias))), se = 1.2533 * sig / Math.sqrt(Math.max(1, n));
    out[m.id] = { shift: Math.abs(bias) > 3 * se && Math.abs(bias) > 0.25 * m.s ? bias : 0, rel: Math.max(0.08, m.s ** 2 / (m.s ** 2 + sig ** 2)) };
  }
  return { shift: Object.fromEntries(Object.entries(out).filter(([, v]) => v.shift).map(([k, v]) => [k, v.shift])), rel: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.rel])) };
}
const real = faces.filter((f) => f.sideSource !== 'template');
const ratioStats = {};
console.log('\nratio            n   bias    σ(ours−FaceIQ)  s      σ/s   r    shift?');
for (const m of METRICS.filter((x) => x.hm)) {
  const pool = m.view === 'side' ? real : faces;
  const ours = pool.map((f) => f.rawM[m.id]), fiq = pool.map((f) => f.ratios[m.id]?.v);
  const d = ours.map((x, i) => (Number.isFinite(x) && Number.isFinite(fiq[i]) ? x - fiq[i] : NaN));
  const n = fin(d).length;
  const bias = median(d), sig = 1.4826 * median(d.map((x) => Math.abs(x - bias)));
  const se = 1.2533 * sig / Math.sqrt(Math.max(1, n));
  // shift only interior-profile conventions we can't see in FaceIQ's coordinates, and only when clear
  const shift = Math.abs(bias) > 3 * se && Math.abs(bias) > 0.25 * m.s ? bias : 0;
  ratioStats[m.id] = { n, bias, sig, se, s: m.s, r: corr(ours, fiq), shift };
  console.log(`${pad(m.id, 16)} ${pad(n, 3)} ${pad(r3(bias), 7)} ${pad(r3(sig), 15)} ${pad(r3(m.s), 6)} ${pad(r2(sig / m.s), 5)} ${pad(r2(corr(ours, fiq)), 5)} ${shift ? 'SHIFT ' + r3(shift) : ''}`);
}

// ───────── 3. range-set choice ─────────
function evalSets(rawOf) {
  const per = faces.map((f) => Object.fromEntries(RANGE_SET_IDS.map((set) => { const r = scoreValues(rawOf(f), { set }); return [set, r.pillars.harmony.score]; })));
  const base = Object.fromEntries(RANGE_SET_IDS.map((set) => [set, mean(per.map((p) => p[set]))]));
  return { per, base };
}
{
  const { per, base } = evalSets((f) => f.rawM);
  console.log('\nmean Harmony per range set (benchmark):', Object.fromEntries(Object.entries(base).map(([k, v]) => [k, r2(v)])));
  const pick = (p, off) => RANGE_SET_IDS.reduce((b, s) => (p[s] - (off ? base[s] : 0) > p[b] - (off ? base[b] : 0) ? s : b), RANGE_SET_IDS[0]);
  for (const off of [false, true]) {
    const picks = per.map((p) => pick(p, off));
    const hit = faces.filter((f, i) => groupOf(f.eth) === picks[i]).length;
    const tally = picks.reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
    console.log(`  ${off ? 'debiased' : 'raw max '} pick: matches FaceIQ's ethnicity ${hit}/${faces.length}`, tally);
  }
  cal.setBias = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, r4(v - mean(Object.values(base)))]));
}

// ───────── 4. appearance measurements ─────────
const LOOKS = METRICS.filter((m) => m.look).map((m) => m.id);
const T = (k) => faces.map((f) => f.fiq[k]);
console.log('\nappearance        n   p10    p25    p50    p75    p90   | r: features dimorph angular overall harmony');
for (const id of LOOKS) {
  const v = faces.map((f) => f.look?.[id] ?? NaN);
  console.log(`${pad(id, 17)} ${pad(fin(v).length, 3)} ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => pad(r2(q(v, p)), 6)).join(' ')} | ${['features', 'dimorphism', 'angularity', 'overall', 'harmony'].map((k) => pad(r2(corr(v, T(k))), 7)).join(' ')}`);
}

// ───────── fitting ─────────
// Ideal ranges for the photo measurements. Direction from looksmax.org's eye-area and brow guides and the
// clinical periorbital literature (full, dark, low-set brows that reach past the eye corner; lids close to the
// iris, no white under it; moderately full lips; a full hairline), confirmed against how each measurement
// moves with FaceIQ's vision-model scores above. Widths are set from the benchmark spread (a median face loses
// a point or two on each, the 10th percentile most of its score).
const LOOK_RANGES = {
  brow_thickness: [7, 11, 2.5],      // mm — thin brows are penalised, thick ones aren't
  brow_density: [68, 100, 18],       // % darker than the surrounding skin
  brow_tail_reach: [0.35, 0.7, 0.2], // eye widths past the outer corner
  brow_eye_gap: [2, 6, 4],           // mm, upper lid → lower brow edge
  iris_exposure: [0.55, 0.75, 0.12], // eye opening ÷ iris diameter
  scleral_show: [0, 0.3, 0.8],       // mm of white under the iris
  lip_fullness: [27, 42, 9],         // % of mouth width
  temple_recession: [-30, 2, 4],     // % of face height
};
const look = {};
for (const id of LOOKS) {
  const [lo, hi, s] = LOOK_RANGES[id];
  const v = faces.map((f) => f.look?.[id] ?? NaN);
  look[id] = { lo, hi, s, mu: r3(median(v)), sd: r3((q(v, 0.75) - q(v, 0.25)) / 1.349) };
}
const shift = {}, rel = {};
for (const [id, st] of Object.entries(ratioStats)) {
  if (st.shift) shift[id] = r4(st.shift);
  rel[id] = r3(Math.max(0.08, st.s ** 2 / (st.s ** 2 + st.sig ** 2)));
}

// Apply a candidate configuration to the live metric objects (so scoreValues uses it)
const baseW = Object.fromEntries(METRICS.map((m) => [m.id, AGG.w[m.id] ?? 1]));
function configure({ useRel = true, lookK = 1, setBias = cal.setBias, rel: relO = rel } = {}) {
  for (const m of METRICS) {
    if (m.look) Object.assign(m, { lo: look[m.id].lo, hi: look[m.id].hi, s: look[m.id].s, mean: look[m.id].mu, sd: look[m.id].sd });
    m.w = baseW[m.id] * (useRel && relO[m.id] ? relO[m.id] : 1) * (m.look ? lookK : 1);
  }
  AGG.setBias = setBias || {};
}
const rawOf = (f, useShift = true, shiftO = shift) => {
  const r = { ...f.rawM };
  for (const k in r) if (r[k] == null) r[k] = NaN;
  if (useShift) for (const [id, d] of Object.entries(shiftO)) if (Number.isFinite(r[id])) r[id] -= d;
  for (const id of LOOKS) r[id] = f.look?.[id] ?? NaN;
  for (const k of f.hidden || []) for (const m of METRICS) if (m.deps?.includes(k)) r[m.id] = NaN;
  return r;
};
const spreadMap = (x, y) => { const k = x.map((v, i) => Number.isFinite(v) && Number.isFinite(y[i])); const X = x.filter((_, i) => k[i]), Y = y.filter((_, i) => k[i]); const b = sd(Y) / (sd(X) || 1) * Math.sign(corr(X, Y) || 1); return [r4(mean(Y) - b * mean(X)), r4(b)]; };
const show = (raw, [a, b]) => Math.max(0, Math.min(10, a + b * raw));
const gmean = (a) => Math.exp(mean(a.map((x) => Math.log(Math.max(0.05, x)))));

function evaluate(opts, label, quiet = false) {
  configure(opts);
  const FS = opts.faces || faces;
  const R = FS.map((f) => scoreValues(rawOf(f, opts.useShift !== false, opts.shift || shift), opts.set ? { set: opts.set === 'oracle' ? groupOf(f.eth) || 'caucasian' : opts.set } : {}));
  const fq = (k) => FS.map((f) => f.fiq[k]);
  // view maps → harmony with a front share wF
  const xf = R.map((r) => r.pillars.harmony.raw.front), xs = R.map((r) => r.pillars.harmony.raw.side);
  const vf = spreadMap(xf, fq('front')), vs = spreadMap(xs, fq('side'));
  const F = xf.map((x) => show(x, vf)), S = xs.map((x) => show(x, vs));
  const wF = opts.wF ?? 0.6;
  const H = F.map((x, i) => wF * x + (1 - wF) * S[i]);
  const pm = {}, P = {};
  for (const k of ['angularity', 'dimorphism', 'features']) { const x = R.map((r) => r.pillars[k].raw); pm[k] = spreadMap(x, fq(k)); P[k] = x.map((v) => show(v, pm[k])); }
  const gm = H.map((h, i) => gmean([h, P.angularity[i], P.dimorphism[i], P.features[i]]));
  const om = spreadMap(gm, fq('overall'));
  const O = gm.map((g) => show(g, om));
  // per-view overall
  const byView = {}, VO = {};
  for (const view of ['front', 'side']) {
    const bv = {};
    const pv = {};
    for (const k of ['angularity', 'dimorphism', 'features']) { const x = R.map((r) => r.views[view].raw[k]); bv[k] = spreadMap(x, fq(k)); pv[k] = x.map((v) => show(v, bv[k])); }
    const hv = view === 'front' ? F : S;
    const g = hv.map((h, i) => gmean([h, pv.angularity[i], pv.dimorphism[i], pv.features[i]]));
    bv.overall = spreadMap(g, fq('overall'));
    VO[view] = g.map((x) => show(x, bv.overall));
    byView[view] = bv;
  }
  const st = (a, k) => ({ r: r2(corr(a, fq(k))), mae: r2(mean(a.map((x, i) => Math.abs(x - fq(k)[i])))) });
  const res = { overall: st(O, 'overall'), harmony: st(H, 'harmony'), front: st(F, 'front'), side: st(S, 'side'), angularity: st(P.angularity, 'angularity'), dimorphism: st(P.dimorphism, 'dimorphism'), features: st(P.features, 'features'), frontOverall: st(VO.front, 'overall'), sideOverall: st(VO.side, 'overall') };
  if (!quiet) console.log(pad(label, 34), Object.entries(res).map(([k, v]) => `${k} ${v.r}/${v.mae}`).join('  '));
  return { res, maps: { view: { front: vf, side: vs }, pillar: pm, overall: om, byView }, R };
}

console.log('\nconfiguration                       r / MAE vs FaceIQ');
evaluate({ useRel: false, useShift: false, lookK: 0, setBias: {} }, 'before (no shift/rel/looks, max set)');
evaluate({ useRel: false, useShift: true, lookK: 0, setBias: {} }, '+ convention shifts');
evaluate({ useRel: true, useShift: true, lookK: 0, setBias: {} }, '+ reliability weights');
evaluate({ useRel: true, useShift: true, lookK: 0 }, '+ debiased range set');
evaluate({ useRel: true, useShift: true, lookK: 0, set: 'caucasian' }, '  (always caucasian set)');
evaluate({ useRel: true, useShift: true, lookK: 0, set: 'oracle' }, '  (FaceIQ\'s own ethnicity — upper bound)');
for (const k of [0.5, 1, 2, 3]) evaluate({ useRel: true, useShift: true, lookK: k }, `+ photo measurements ×${k}`);
for (const wF of [0.6, 0.7, 0.8]) evaluate({ useRel: true, useShift: true, lookK: 1, wF }, `  front share ${wF}`);

// Honest check: fit the shifts and reliabilities on one half of the faces, test on the other half
{
  const A = faces.filter((_, i) => i % 2 === 0), B = faces.filter((_, i) => i % 2 === 1);
  for (const [fitOn, testOn, name] of [[A, B, 'fit even → test odd'], [B, A, 'fit odd → test even']]) {
    const st = statsOn(fitOn);
    evaluate({ faces: testOn, useRel: false, useShift: false, lookK: 0, setBias: {} }, `  ${name}: before`);
    evaluate({ faces: testOn, ...st, useRel: true, useShift: true, lookK: 1.5, wF: 0.7 }, `  ${name}: after`);
  }
}

export { faces, ratioStats, cal, LOOKS, look, shift, rel, evaluate, configure, rawOf, mean, sd, median, q, corr, fin, r2, r3, r4, groupOf, WRITE, CALF, writeFileSync, execFileSync };

// ───────── final configuration ─────────
// Photo measurements ×1.5 (between the ×1 and ×2 rows — gains flatten after ×1, so no more is taken);
// Harmony 70% front / 30% side instead of FaceIQ's 60/40, because our profile ratios agree with FaceIQ's
// far less well than the frontal ones (see the side column) — the front carries more of the signal.
const FINAL = { useRel: true, useShift: true, lookK: 1.5, wF: 0.7 };
const fin_ = evaluate(FINAL, 'FINAL');
if (WRITE) {
  const { maps } = fin_;
  const out = { ...cal, view: maps.view, pillar: maps.pillar, overall: maps.overall, byView: maps.byView,
    mix: { front: FINAL.wF, side: r2(1 - FINAL.wF) }, lookK: FINAL.lookK, look, shift, rel, setBias: cal.setBias };
  writeFileSync(CALF, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote tools/calibration.json');
  console.log(execFileSync('node', [new URL('./fit-faceiq.mjs', import.meta.url).pathname, '--write']).toString().split('\n').slice(-3).join('\n'));
}
