// Calibrates the pillar/overall scale in js/metrics.js (the CAL table).
//
//   node tools/calibrate.mjs
//
// Simulates adult men from the population norms in metrics.js. Each measurement is drawn from
// Normal(mean, sd) with a shared latent factor (RHO) so that good traits tend to come together, as
// they do in real faces, plus landmark-placement noise (NOISE). The raw composites' percentiles become CAL, which maps them onto the target
// scale POP (mean 5.44, SD 0.97 → 7.03 ≈ top 5%, 7.77 ≈ top 0.8%) by matching percentiles.
import { METRICS, scoreValues, POP } from '../js/metrics.js';

// NOISE: extra spread from landmark placement (AI + manual), in units of each measurement's SD
const N = 20000, RHO = 0.4, NOISE = 0.7;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => {
  let u = 0;
  while (!u) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
};

const keys = ['harmony', 'angularity', 'dimorphism', 'features', 'overall'];
const samples = Object.fromEntries(keys.map((k) => [k, []]));
const metricAvg = [];
for (let i = 0; i < N; i++) {
  const L = gauss();
  const raw = {};
  for (const m of METRICS) {
    const dir = Math.sign(m.ideal - m.mean);
    let x = m.mean + m.sd * (dir * RHO * L + Math.sqrt(1 - RHO * RHO) * gauss() + NOISE * gauss());
    if (m.oneSided) x = Math.abs(x);
    raw[m.id] = x;
  }
  const r = scoreValues(raw);
  for (const k of keys.slice(0, 4)) samples[k].push(r.pillars[k].raw);
  samples.overall.push(r.rawOverall);
  metricAvg.push(METRICS.reduce((a, m) => a + r.values[m.id].s, 0) / METRICS.length);
}
const stat = (a) => {
  const mu = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length);
  return [mu, sd];
};
// Percentile-matched knots: raw composite at population percentile p → POP.mean + POP.sd · z(p)
const P = [[0.001, -3.09], [0.01, -2.326], [0.05, -1.645], [0.16, -0.994], [0.5, 0], [0.84, 0.994], [0.95, 1.645], [0.99, 2.326], [0.999, 3.09]];
const q = (a, p) => a[Math.floor(p * (a.length - 1))];
console.log('const CAL = {');
for (const k of keys) {
  const a = [...samples[k]].sort((x, y) => x - y);
  const knots = P.map(([p, z]) => `[${q(a, p).toFixed(3)}, ${(POP.mean + POP.sd * z).toFixed(2)}]`);
  console.log(`  ${k}: [${knots.join(', ')}],`);
}
console.log('};');
console.log('average per-measurement score of a simulated man:', stat(metricAvg)[0].toFixed(2));
