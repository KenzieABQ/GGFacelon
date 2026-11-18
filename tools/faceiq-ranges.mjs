// Collects FaceIQ's male ideal ranges for each ethnicity from celebrity pages (Markdown only).
//   node tools/faceiq-ranges.mjs  → tools/testdata/faceiq-ranges.json
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { SLUG_ID } from './faceiq-bench.mjs';
const BASE = 'https://www.faceiqlabs.com/celebs-wiki';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (benchmark)' } }); return r.ok ? r.text() : null; } catch { return null; } };
const out = new URL('./testdata/faceiq-ranges.json', import.meta.url);
const db = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { groups: {}, seen: [] };
const index = await get(`${BASE}/llms.txt`);
const slugs = [...index.matchAll(/celebs-wiki\/([a-z0-9-]+)\.md\)/g)].map((m) => m[1]).filter((s) => !/female/.test(s));
let fetched = 0;
for (let i = 0; i < slugs.length && fetched < 140; i += 11) {
  const slug = slugs[i];
  if (db.seen.includes(slug)) continue;
  const md = await get(`${BASE}/${slug}.md`); await sleep(250); fetched++;
  db.seen.push(slug);
  if (!md || !/Gender:\s*male/.test(md)) continue;
  const eth = (md.match(/Ethnicity:\s*([^·\n]+)/) || [])[1]?.trim() || '?';
  const ranges = {};
  for (const m of md.matchAll(/\|\s*\[[^\]]+\]\([^)]*\/harmony\/([a-z0-9-]+)\)\s*\|\s*(?:Front|Side)\s*\|[^|]*\|\s*(-?[\d.]+) to (-?[\d.]+)/g)) if (SLUG_ID[m[1]]) ranges[SLUG_ID[m[1]]] = [+m[2], +m[3]];
  if (Object.keys(ranges).length < 50) continue;
  const key = JSON.stringify(ranges);
  const g = (db.groups[key] ??= { ethnicities: {}, ranges });
  g.ethnicities[eth] = (g.ethnicities[eth] || 0) + 1;
}
writeFileSync(out, JSON.stringify(db));
for (const g of Object.values(db.groups)) console.log(JSON.stringify(g.ethnicities));
console.log(Object.keys(db.groups).length, 'distinct range sets from', db.seen.length, 'pages');
