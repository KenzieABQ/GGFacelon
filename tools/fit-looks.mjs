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
// bench-raw.json (stratified over the whole scale) + bench-raw-top.json (extra faces rated 7+), if present
const faces = (() => {
  const all = [...JSON.parse(readFileSync(DATA, 'utf8')).faces];
  const top = new URL('./testdata/bench-raw-top.json', import.meta.url);
  if (existsSync(top)) all.push(...JSON.parse(readFileSync(top, 'utf8')).faces);
  const seen = new Set();
  return all.filter((f) => !seen.has(f.slug) && seen.add(f.slug));
})();
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
    const ours = pool.map((f) => f.rawM[m.id]), fq = pool.map((f) => f.ratios[m.id]?.v);
    const rs = Math.max(0.08, m.s ** 2 / (m.s ** 2 + sig ** 2));
    out[m.id] = { shift: Math.abs(bias) > 3 * se && Math.abs(bias) > 0.25 * m.s ? bias : 0, rel: Math.max(0.05, Math.min(rs, Math.max(0, corr(ours, fq)))), sig };
  }
  return { shift: Object.fromEntries(Object.entries(out).filter(([, v]) => v.shift).map(([k, v]) => [k, v.shift])), rel: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.rel])), sig: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.sig])) };
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
  brow_thickness: [5.5, 11, 2.5],    // mm — only clearly thin brows are penalised: on the benchmark, thicker brows
                                     // did NOT go with higher FaceIQ scores (r ≈ −0.2), unlike darker ones (r ≈ +0.5)
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
const shift = {};
// relS: scatter-only reliability. relC also caps it by the correlation with FaceIQ's value — a measurement
// that doesn't track FaceIQ's at all (e.g. r ≈ 0) carries no information however tight its scatter looks.
const relS = {}, relC = {}, sig = {};
for (const [id, st] of Object.entries(ratioStats)) {
  if (st.shift) shift[id] = r4(st.shift);
  relS[id] = r3(Math.max(0.08, st.s ** 2 / (st.s ** 2 + st.sig ** 2)));
  relC[id] = r3(Math.max(0.05, Math.min(relS[id], Math.max(0, st.r))));
  sig[id] = st.sig;
}
const rel = relC;

// Apply a candidate configuration to the live metric objects (so scoreValues uses it)
const baseW = Object.fromEntries(METRICS.map((m) => [m.id, AGG.w[m.id] ?? 1]));
const baseS = Object.fromEntries(METRICS.map((m) => [m.id, AGG.sEff ? null : m.s]));
for (const m of METRICS) if (baseS[m.id] == null) baseS[m.id] = m.s0 ?? m.s; // FaceIQ's own fall-off width
// widen: score fall-off width s → √(s² + (k·σ)²), σ = our measurement scatter. Noise can only pull a ratio
// that truly sits in its ideal range down, so without this the best faces lose points on every ratio.
// p: power-mean exponent (lower leans harder on the weakest items).
function configure({ useRel = true, lookK = 1, setBias = cal.setBias, rel: relO = rel, widen = 0, sig: sigO = sig, p = 0.5 } = {}) {
  for (const m of METRICS) {
    if (m.look) Object.assign(m, { lo: look[m.id].lo, hi: look[m.id].hi, mean: look[m.id].mu, sd: look[m.id].sd });
    const s0 = m.look ? look[m.id].s : baseS[m.id];
    m.s = widen && sigO[m.id] ? Math.sqrt(s0 ** 2 + (widen * sigO[m.id]) ** 2) : s0;
    m.w = baseW[m.id] * (useRel && relO[m.id] ? relO[m.id] : 1) * (m.look ? lookK : 1);
  }
  AGG.setBias = setBias || {};
  AGG.p = p;
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
  const PW = opts.pw || { harmony: 1, angularity: 1, dimorphism: 1, features: 1 };
  const wgm = (vals) => { const ks = ['harmony', 'angularity', 'dimorphism', 'features']; const W = ks.reduce((a, k) => a + PW[k], 0); return Math.exp(ks.reduce((a, k, j) => a + PW[k] * Math.log(Math.max(0.05, vals[j])), 0) / W); };
  const gm = H.map((h, i) => wgm([h, P.angularity[i], P.dimorphism[i], P.features[i]]));
  const om = spreadMap(gm, fq('overall'));
  const O = gm.map((g) => show(g, om));
  // per-view overall
  const byView = {}, VO = {};
  for (const view of ['front', 'side']) {
    const bv = {};
    const pv = {};
    for (const k of ['angularity', 'dimorphism', 'features']) { const x = R.map((r) => r.views[view].raw[k]); bv[k] = spreadMap(x, fq(k)); pv[k] = x.map((v) => show(v, bv[k])); }
    const hv = view === 'front' ? F : S;
    const g = hv.map((h, i) => wgm([h, pv.angularity[i], pv.dimorphism[i], pv.features[i]]));
    bv.overall = spreadMap(g, fq('overall'));
    VO[view] = g.map((x) => show(x, bv.overall));
    byView[view] = bv;
  }
  const st = (a, k) => ({ r: r2(corr(a, fq(k))), mae: r2(mean(a.map((x, i) => Math.abs(x - fq(k)[i])))) });
  const res = { overall: st(O, 'overall'), harmony: st(H, 'harmony'), front: st(F, 'front'), side: st(S, 'side'), angularity: st(P.angularity, 'angularity'), dimorphism: st(P.dimorphism, 'dimorphism'), features: st(P.features, 'features'), frontOverall: st(VO.front, 'overall'), sideOverall: st(VO.side, 'overall') };
  if (!quiet) console.log(pad(label, 34), Object.entries(res).map(([k, v]) => `${k} ${v.r}/${v.mae}`).join('  '));
  return { res, maps: { view: { front: vf, side: vs }, pillar: pm, overall: om, byView }, R, scores: { overall: O, harmony: H, front: F, side: S, ...P, frontOverall: VO.front, sideOverall: VO.side }, FS };
}

// Mean FaceIQ vs mean ours per FaceIQ score band — does any part of the scale come out systematically off?
function bandReport(ev, label) {
  const { scores, FS } = ev;
  const bands = [[0, 5], [5, 6], [6, 7], [7, 7.5], [7.5, 8], [8, 10.1]];
  console.log(`\n${label}: by FaceIQ overall band — FaceIQ mean → ours mean (pillars H/A/D/F, FaceIQ → ours)`);
  for (const [a, b] of bands) {
    const ix = FS.map((f, i) => (f.fiq.overall >= a && f.fiq.overall < b ? i : -1)).filter((i) => i >= 0);
    if (!ix.length) continue;
    const m = (arr) => mean(ix.map((i) => arr[i]));
    const fqm = (k) => mean(ix.map((i) => FS[i].fiq[k]));
    const pil = ['harmony', 'angularity', 'dimorphism', 'features'].map((k) => `${r2(fqm(k))}→${r2(m(scores[k]))}`).join('  ');
    console.log(`  ${pad(`${a}–${b > 10 ? 10 : b}`, 8)} n=${pad(ix.length, 3)} overall ${r2(fqm('overall'))} → ${r2(m(scores.overall))}  (bias ${r2(m(scores.overall) - fqm('overall'))})   ${pil}`);
  }
  for (const slug of ['marlon-lundgren-garcia', 'marlon-teixeira', 'custom-marlon3lg', 'custom-mathematically-perfect-male-face']) {
    const i = FS.findIndex((f) => f.slug === slug);
    if (i < 0) continue;
    const f = FS[i];
    console.log(`  ${pad(f.name, 34)} FaceIQ ${f.fiq.overall} (H ${f.fiq.harmony} A ${f.fiq.angularity} D ${f.fiq.dimorphism} F ${f.fiq.features})  ours ${r2(scores.overall[i])} (H ${r2(scores.harmony[i])} A ${r2(scores.angularity[i])} D ${r2(scores.dimorphism[i])} F ${r2(scores.features[i])})  side: ${f.sideSource}`);
  }
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

// Top-end behaviour: mean (ours − FaceIQ) for faces FaceIQ rates ≥ 7.5 and ≤ 5
const topBias = (ev) => { const b = (lo, hi) => { const ix = ev.FS.map((f, i) => (f.fiq.overall >= lo && f.fiq.overall < hi ? i : -1)).filter((i) => i >= 0); return r2(mean(ix.map((i) => ev.scores.overall[i] - ev.FS[i].fiq.overall))); }; return `≥7.5: ${b(7.5, 11)}  ≤5: ${b(0, 5)}`; };
console.log('\nnoise-aware scoring grid (overall r/MAE, harmony r/MAE, band bias)');
for (const relName of ['scatter', 'scatter+corr']) for (const widen of [0, 0.5, 1]) for (const p of [0.5, 1]) {
  const ev = evaluate({ useRel: true, useShift: true, lookK: 1.5, wF: 0.7, rel: relName === 'scatter' ? relS : relC, widen, p }, '', true);
  console.log(`  rel ${pad(relName, 13)} widen ${pad(widen, 4)} p ${pad(p, 4)} overall ${ev.res.overall.r}/${ev.res.overall.mae}  harmony ${ev.res.harmony.r}/${ev.res.harmony.mae}  features ${ev.res.features.r}  ${topBias(ev)}`);
}

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
bandReport(fin_, 'FINAL');
if (WRITE) {
  const { maps } = fin_;
  const out = { ...cal, view: maps.view, pillar: maps.pillar, overall: maps.overall, byView: maps.byView,
    mix: { front: FINAL.wF, side: r2(1 - FINAL.wF) }, lookK: FINAL.lookK, look, shift, rel, setBias: cal.setBias };
  writeFileSync(CALF, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote tools/calibration.json');
  console.log(execFileSync('node', [new URL('./fit-faceiq.mjs', import.meta.url).pathname, '--write']).toString().split('\n').slice(-3).join('\n'));
}
if (process.argv.includes('--sets')) {
  for (const [name, o] of [['max', { setBias: {} }], ['debiased', {}], ['caucasian', { set: 'caucasian' }], ['oracle', { set: 'oracle' }]]) {
    const ev = evaluate({ ...FINAL, rel: relC, p: 1, ...o }, '', true);
    console.log(`  set ${pad(name, 10)} overall ${ev.res.overall.r}/${ev.res.overall.mae}  harmony ${ev.res.harmony.r}/${ev.res.harmony.mae}  front ${ev.res.front.r}  ${topBias(ev)}`);
  }
}

// Pillar weights for the overall: grid over the simplex, chosen on one half and tested on the other
if (process.argv.includes('--pw')) {
  const grid = [];
  for (let h = 0.2; h <= 0.7001; h += 0.05) for (let a = 0.05; a <= 0.4001; a += 0.05) for (let d = 0.05; d <= 0.4001; d += 0.05) { const f = 1 - h - a - d; if (f >= 0.05 - 1e-9) grid.push({ harmony: h, angularity: a, dimorphism: d, features: f }); }
  const base = { ...FINAL, rel: relC, p: 1 };
  const best = (FS) => grid.map((pw) => ({ pw, r: evaluate({ ...base, faces: FS, pw }, '', true).res.overall.r })).sort((x, y) => y.r - x.r)[0];
  const A = faces.filter((_, i) => i % 2 === 0), B = faces.filter((_, i) => i % 2 === 1);
  for (const [fitOn, testOn, name] of [[A, B, 'even→odd'], [B, A, 'odd→even']]) {
    const b = best(fitOn);
    const eq = evaluate({ ...base, faces: testOn }, '', true), tw = evaluate({ ...base, faces: testOn, pw: b.pw }, '', true);
    console.log(`  ${name}: weights ${JSON.stringify(Object.fromEntries(Object.entries(b.pw).map(([k, v]) => [k[0], r2(v)])))}  held-out overall r ${eq.res.overall.r} → ${tw.res.overall.r}, MAE ${eq.res.overall.mae} → ${tw.res.overall.mae}, top ${topBias(eq)} → ${topBias(tw)}`);
  }
  const all = best(faces);
  const ev = evaluate({ ...base, pw: all.pw }, '', true);
  console.log(`  all faces: weights ${JSON.stringify(Object.fromEntries(Object.entries(all.pw).map(([k, v]) => [k, r2(v)])))}  overall ${ev.res.overall.r}/${ev.res.overall.mae}  ${topBias(ev)}`);
}
if (process.argv.includes('--shape')) {
  const ev = evaluate({ ...FINAL, rel: relC }, '', true);
  const O = ev.scores.overall, Y = ev.FS.map((f) => f.fiq.overall);
  console.log('\nby OUR score band: our mean → FaceIQ mean (is the map\'s shape right?)');
  for (const [a, b] of [[0, 5], [5, 6], [6, 7], [7, 7.5], [7.5, 8], [8, 10.1]]) {
    const ix = O.map((o, i) => (o >= a && o < b ? i : -1)).filter((i) => i >= 0);
    if (ix.length) console.log(`  ours ${a}–${b > 10 ? 10 : b}: n=${pad(ix.length, 3)} ours ${r2(mean(ix.map((i) => O[i])))} → FaceIQ ${r2(mean(ix.map((i) => Y[i])))}`);
  }
  const qs = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
  console.log('  quantiles  ours:', qs.map((p) => r2(q(O, p))).join(' '), '  FaceIQ:', qs.map((p) => r2(q(Y, p))).join(' '));
}
if (process.argv.includes('--brow')) {
  const save = { ...look.brow_thickness };
  for (const [name, rng] of [['7–11 (current)', [7, 11, 2.5]], ['5–11', [5, 11, 2.5]], ['4.5–12, s 2', [4.5, 12, 2]]]) {
    Object.assign(look.brow_thickness, { lo: rng[0], hi: rng[1], s: rng[2] });
    const ev = evaluate({ ...FINAL, rel: relC }, '', true);
    console.log(`  brow thickness ideal ${pad(name, 16)} overall ${ev.res.overall.r}/${ev.res.overall.mae}  dimorphism ${ev.res.dimorphism.r}  features ${ev.res.features.r}  ${topBias(ev)}`);
  }
  Object.assign(look.brow_thickness, save);
}
