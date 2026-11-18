// Browser benchmark: runs GGFacelon's detector + scoring on the FaceIQ celebrity benchmark and compares with
// FaceIQ's own landmarks, ratio values and scores. Run from the app's page console (or the dev tools):
//
//   const b = await import('/tools/bench.js'); const r = await b.run({ n: 30 }); b.report(r)
//
// Needs tools/testdata/faceiq-bench.json (node tools/faceiq-bench.mjs). Photos are loaded by URL, not saved.
import { detect } from '../js/detect.js';
import { analyze } from '../js/metrics.js';

const load = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; });

// FaceIQ landmark name → ours (null = no equivalent, compared separately)
// FaceIQ's "bigonial" points sit on the jaw contour at mouth level (our cheek points); its lower gonion (jaw
// frontal angle) is our jaw angle.
const FRONT_MAP = { pupil_r: 'pupil_r', pupil_l: 'pupil_l', zy_r: 'zy_r', zy_l: 'zy_l', temple_r: 'temple_r', temple_l: 'temple_l', ch_r: 'ch_r', ch_l: 'ch_l',
  ala_r: 'ala_r', ala_l: 'ala_l', sn: 'sn', sto: 'sto', li: 'li', me: 'me', trichion: 'trichion', go_r: 'cheek_r', go_l: 'cheek_l', neck_r: 'neck_r', neck_l: 'neck_l',
  hood_r: 'exo_r', hood_l: 'exo_l', jaw_r: 'go_r', jaw_l: 'go_l' };
const SIDE_MAP = { g: 'g', n: 'n', prn: 'prn', sn: 'sn', pog: 'pog', me: 'me', go: 'go', ramus: 'ramus' };

export async function run({ n = 99, only = null, verbose = true } = {}) {
  const data = await fetch('/tools/testdata/faceiq-bench.json', { cache: 'no-store' }).then((r) => r.json());
  const out = [];
  window.__bench = out; // filled in as it goes
  for (const f of data.faces.slice(0, n)) {
    if (only && !only.includes(f.slug)) continue;
    const t0 = performance.now();
    try {
      const [fi, si] = await Promise.all([load(f.photos.front), load(f.photos.side)]);
      const rf = await detect('front', fi);
      const rs = await detect('side', si, { front: rf.lm, skin: rf.skin });
      const ipd = Math.hypot(f.lm.front.pupil_l.x - f.lm.front.pupil_r.x, f.lm.front.pupil_l.y - f.lm.front.pupil_r.y);
      const hS = f.lm.side.me && f.lm.side.n ? Math.hypot(f.lm.side.me.x - f.lm.side.n.x, f.lm.side.me.y - f.lm.side.n.y) : 1;
      const err = { front: {}, side: {} };
      const sgn = { front: {}, side: {} };
      for (const [a, b] of Object.entries(FRONT_MAP)) if (f.lm.front[a] && rf.lm[b]) { err.front[a] = Math.hypot(rf.lm[b].x - f.lm.front[a].x, rf.lm[b].y - f.lm.front[a].y) / ipd; sgn.front[a] = [(rf.lm[b].x - f.lm.front[a].x) / ipd, (rf.lm[b].y - f.lm.front[a].y) / ipd]; }
      const fdir = Math.sign((f.lm.side.prn?.x ?? 1) - (f.lm.side.ramus?.x ?? 0)) || 1;
      for (const [a, b] of Object.entries(SIDE_MAP)) if (f.lm.side[a] && rs.lm[b]) { err.side[a] = Math.hypot(rs.lm[b].x - f.lm.side[a].x, rs.lm[b].y - f.lm.side[a].y) / hS; sgn.side[a] = [fdir * (rs.lm[b].x - f.lm.side[a].x) / hS, (rs.lm[b].y - f.lm.side[a].y) / hS]; }
      const res = analyze(rf.lm, rs.lm);
      const vals = {};
      for (const [id, r] of Object.entries(f.ratios)) if (res.values[id]) vals[id] = { fiq: r.v, ours: res.values[id].v, fiqS: r.s, ourS: res.values[id].s };
      const row = { slug: f.slug, name: f.name, eth: f.ethnicity, fiq: { overall: f.overall, harmony: f.harmony, front: f.front, side: f.side, angularity: f.angularity, dimorphism: f.dimorphism, features: f.features },
        ours: { overall: res.overall, harmony: res.pillars.harmony.score, front: res.pillars.harmony.front, side: res.pillars.harmony.side, angularity: res.pillars.angularity.score, dimorphism: res.pillars.dimorphism.score, features: res.pillars.features.score },
        raw: { front: res.pillars.harmony.raw.front, side: res.pillars.harmony.raw.side, angularity: res.pillars.angularity.raw, dimorphism: res.pillars.dimorphism.raw, features: res.pillars.features.raw },
        rangeSet: res.rangeSet, sideSource: rs.source, dir: rs.dir, err, sgn, vals, ms: Math.round(performance.now() - t0), lm: { front: rf.lm, side: rs.lm } };
      out.push(row);
      if (verbose) console.log(`${out.length} ${f.name}: FaceIQ ${f.overall} vs ours ${res.overall.toFixed(2)} | side ${rs.source}`);
    } catch (e) {
      out.push({ slug: f.slug, name: f.name, error: String(e) });
      if (verbose) console.warn(f.name, e);
    }
  }
  return out;
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
function corr(a, b) {
  const ma = mean(a), mb = mean(b);
  const c = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  return c / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0));
}

// Compact summary (returned as plain data so it can be printed anywhere)
export function report(rows = window.__bench) {
  const ok = rows.filter((r) => !r.error);
  const lmErr = (view) => {
    const keys = [...new Set(ok.flatMap((r) => Object.keys(r.err[view])))];
    return Object.fromEntries(keys.map((k) => { const sg = ok.map((r) => r.sgn?.[view]?.[k]).filter(Boolean);
      return [k, [+median(ok.map((r) => r.err[view][k]).filter(Number.isFinite)).toFixed(3), +median(sg.map((v) => v[0])).toFixed(3), +median(sg.map((v) => v[1])).toFixed(3)]]; }).sort((a, b) => b[1][0] - a[1][0]));
  };
  const ids = [...new Set(ok.flatMap((r) => Object.keys(r.vals)))];
  const ratio = Object.fromEntries(ids.map((id) => {
    const p = ok.map((r) => r.vals[id]).filter((v) => v && Number.isFinite(v.ours));
    const d = p.map((v) => v.ours - v.fiq);
    return [id, { bias: +median(d).toFixed(3), mad: +median(d.map((x) => Math.abs(x - median(d)))).toFixed(3), r: +corr(p.map((v) => v.fiq), p.map((v) => v.ours)).toFixed(2), n: p.length }];
  }));
  const sc = (k) => { const a = ok.map((r) => r.fiq[k]), b = ok.map((r) => r.ours[k]); const keep = a.map((x, i) => Number.isFinite(x) && Number.isFinite(b[i])); const A = a.filter((_, i) => keep[i]), B = b.filter((_, i) => keep[i]);
    return { r: +corr(A, B).toFixed(2), bias: +(mean(B) - mean(A)).toFixed(2), mae: +mean(A.map((x, i) => Math.abs(B[i] - x))).toFixed(2) }; };
  return {
    n: ok.length, errors: rows.length - ok.length,
    scores: Object.fromEntries(['overall', 'harmony', 'front', 'side', 'angularity', 'dimorphism', 'features'].map((k) => [k, sc(k)])),
    landmarks: { front: lmErr('front'), side: lmErr('side') },
    ratios: ratio,
    sideSources: ok.reduce((a, r) => ((a[r.sideSource] = (a[r.sideSource] || 0) + 1), a), {}),
  };
}

// Least-squares maps from our raw pillar values to FaceIQ's displayed scores (paste into js/norms.js AGG).
// Harmony views map raw → FaceIQ's front/side harmony; the other pillars map raw → FaceIQ's pillar score.
export function fitCalibration(rows = window.__bench) {
  const ok = rows.filter((r) => !r.error && r.raw);
  const out = {};
  for (const [k, target] of [['front', 'front'], ['side', 'side'], ['angularity', 'angularity'], ['dimorphism', 'dimorphism'], ['features', 'features']]) {
    const pts = ok.map((r) => ({ x: r.raw[k], y: r.fiq[target] })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const mx = mean(pts.map((p) => p.x)), my = mean(pts.map((p) => p.y));
    const b = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / (pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1);
    const a = my - b * mx;
    const rmse = Math.sqrt(mean(pts.map((p) => (a + b * p.x - p.y) ** 2)));
    out[k] = { a: +a.toFixed(4), b: +b.toFixed(4), r: +corr(pts.map((p) => p.x), pts.map((p) => p.y)).toFixed(3), rmse: +rmse.toFixed(3), n: pts.length };
  }
  return out;
}
