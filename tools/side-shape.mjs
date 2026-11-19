// Mean profile shape from FaceIQ's side landmarks in the benchmark, in the reference photo's frame.
// Used to place the jaw angle and ear notch from the traced outline points.
//   node tools/side-shape.mjs
import { readFileSync } from 'node:fs';
import { REF } from '../src/lib/engine/landmarks.js';
import { fitSimilarity } from '../src/lib/engine/geom.js';
const data = JSON.parse(readFileSync(new URL('./testdata/faceiq-bench.json', import.meta.url), 'utf8'));
const ANCH = ['g', 'n', 'sn', 'pog', 'me'];
const ref = Object.fromEntries(Object.entries(REF.side).map(([k, [x, y]]) => [k, { x, y }]));
const acc = {}, all = [];
for (const f of data.faces) {
  const S = f.lm.side;
  if (!ANCH.every((k) => S[k]) || !S.go || !S.ramus) continue;
  const fwd = Math.sign(S.prn.x - S.ramus.x) || 1;
  const m = (p) => (fwd > 0 ? p : { x: -p.x, y: p.y });
  const T = fitSimilarity(ANCH.map((k) => m(S[k])), ANCH.map((k) => ref[k]));
  const row = {};
  for (const k of ['go', 'ramus', 'prn']) row[k] = T(m(S[k]));
  all.push(row);
  for (const k in row) (acc[k] ??= []).push(row[k]);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const out = {};
for (const [k, pts] of Object.entries(acc)) out[k] = [+med(pts.map((p) => p.x)).toFixed(1), +med(pts.map((p) => p.y)).toFixed(1)];
// leave-one-out style spread: distance of each face from the median, in units of the ref face height
const H = ref.me.y - ref.n.y;
for (const k of Object.keys(out)) {
  const d = acc[k].map((p) => Math.hypot(p.x - out[k][0], p.y - out[k][1]) / H).sort((a, b) => a - b);
  console.log(k, 'median position', out[k], 'REF', REF.side[k], ' typical error', d[d.length >> 1].toFixed(3), 'H');
}
console.log(all.length, 'faces');
