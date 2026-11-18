// Builds a local benchmark from FaceIQ Labs' public celebrity wiki: photos (URLs only), FaceIQ's landmark
// positions, every ratio value/score and the pillar scores. Output: tools/testdata/faceiq-bench.json (git-ignored).
//
//   node tools/faceiq-bench.mjs [count=30]
//
// Requests are sequential with a pause between them. Photos are not downloaded; the browser benchmark
// (tools/bench.js) loads them by URL.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

const BASE = 'https://www.faceiqlabs.com/celebs-wiki';
const UA = { 'User-Agent': 'Mozilla/5.0 (benchmark)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.text(); } catch {} await sleep(1500); } return null; };

export const SLUG_ID = {
  'top-third': 'top_third', 'middle-third': 'middle_third', 'lower-third': 'lower_third', 'face-width-to-height-ratio': 'fwhr',
  'midface-ratio': 'midface_ratio', 'total-facial-width-to-height-ratio': 'total_wh', 'bitemporal-width': 'bitemporal',
  'cheekbone-height': 'cheekbone_height', 'eye-separation-ratio': 'esr', 'one-eye-apart-test': 'one_eye_apart',
  'lateral-canthal-tilt': 'canthal_tilt', 'brow-length-to-face-width-ratio': 'brow_length', 'eyebrow-low-setedness': 'brow_low_set',
  'eye-aspect-ratio': 'eye_ar', 'eyebrow-tilt': 'brow_tilt', 'deviation-of-iaaipsilateral-alar-angle-jfajaw-frontal-angle': 'iaa_jfa_dev',
  'ipsilateral-alar-angle': 'iaa', 'nose-bridge-to-nose-width': 'bridge_nose', 'intercanthal-nasal-width-ratio': 'icd_nose',
  'nose-tip-position': 'nose_tip_pos', 'mouth-corner-position': 'mouth_corner', 'cupids-bow-depth': 'cupid_depth',
  'mouth-width-to-nose-width-ratio': 'mouth_nose', 'lower-lip-to-upper-lip-ratio': 'lip_ratio', 'interpupillary-mouth-width-ratio': 'ipd_mouth',
  'chin-to-philtrum-ratio': 'chin_philtrum', 'jaw-slope': 'jaw_slope', 'bigonial-width': 'bigonial', 'lower-third-proportion': 'lower_third_prop',
  'jaw-frontal-angle': 'jfa', 'ear-protrusion-angle': 'ear_angle', 'ear-protrusion-ratio': 'ear_ratio', 'neck-width': 'neck_width',
  'nasofrontal-angle': 'nasofrontal', 'browridge-inclination-angle': 'browridge_incl', 'upper-forehead-slope': 'upper_forehead',
  'total-facial-convexity': 'total_convexity', 'interior-midface-projection-angle': 'midface_proj', 'facial-depth-to-height-ratio': 'depth_height',
  'z-angle': 'z_angle', 'orbital-vector': 'orbital_vector', 'facial-convexity-glabella': 'convexity_g', 'facial-convexity-nasion': 'convexity_n',
  'anterior-facial-depth': 'anterior_depth', 'nasal-tip-angle': 'nasal_tip_angle', 'nasofacial-angle': 'nasofacial', 'nasomental-angle': 'nasomental',
  'frankfort-tip-angle': 'frankfort_tip', 'nose-tip-rotation-angle': 'tip_rotation', 'nasolabial-angle': 'nasolabial', 'nasal-projection': 'nasal_projection',
  'nasal-w-to-h-ratio': 'nasal_wh', 'mentolabial-angle': 'mentolabial', 'holdaway-h-line': 'holdaway', 'lower-lip-s-line-position': 's_lower',
  'lower-lip-burstone-line': 'b_lower', 'upper-lip-e-line-position': 'e_upper', 'lower-lip-e-line-position': 'e_lower',
  'upper-lip-s-line-position': 's_upper', 'upper-lip-burstone-line': 'b_upper', 'gonial-angle': 'gonial', 'ramus-to-mandible-ratio': 'ramus_mandible',
  'mandibular-plane-angle': 'mpa', 'gonion-to-mouth-line': 'gonion_mouth', 'recession-relative-to-frankfort-plane': 'fh_recession',
  'submental-cervical-angle': 'submental',
};

// Ratio pages whose illustration shows the whole photo, and which of their points are which landmark.
// Canvas is 500×667: the 2048² photo fitted to the width and centred vertically → photo = (x, y − 83.5) / 0.24414.
const LM_PAGES = {
  front: {
    'top-third': ['trichion', 'browY', 'sn', 'me'],
    'face-width-to-height-ratio': ['zy_r', 'zy_l', null, 'cupidY'],
    'midface-ratio': ['pupil_r', 'pupil_l'],
    'bitemporal-width': ['temple_r', 'temple_l'],
    'ipsilateral-alar-angle': ['hood_r', null, 'hood_l'],
    'jaw-frontal-angle': ['jaw_r', 'jfaV', 'jaw_l'],
    'bigonial-width': [null, null, 'go_r', 'go_l'],
    'neck-width': ['neck_r', 'neck_l'],
    'mouth-width-to-nose-width-ratio': ['ch_r', 'ch_l', 'ala_r', 'ala_l'],
    'chin-to-philtrum-ratio': [null, 'li', 'cupid', 'snBase'],
    'lower-third-proportion': [null, 'sto'],
  },
  side: {
    'total-facial-convexity': ['g', 'prn', 'pog'],
    'facial-convexity-glabella': [null, 'sn'],
    'facial-convexity-nasion': ['n'],
    'gonial-angle': ['ramus', 'me', 'go'],
  },
};

const rsc = (html) => [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => { try { return JSON.parse('"' + m[1] + '"'); } catch { return ''; } }).join('');
function illustration(html) {
  const ch = rsc(html);
  const i = ch.indexOf('"illustration":');
  if (i < 0) return null;
  let d = 0, j = i + 15;
  for (; j < ch.length; j++) { if (ch[j] === '{') d++; else if (ch[j] === '}') { d--; if (!d) break; } }
  try { return JSON.parse(ch.slice(i + 15, j + 1)); } catch { return null; }
}
const toPhoto = (p) => ({ x: +(p.x / 0.244140625).toFixed(1), y: +((p.y - 83.5) / 0.244140625).toFixed(1) });

function parseMd(md) {
  const out = { ratios: {} };
  out.gender = (md.match(/Gender:\s*(\w+)/) || [])[1];
  out.ethnicity = (md.match(/Ethnicity:\s*([^·\n]+)/) || [])[1]?.trim();
  const num = (label) => { const m = md.match(new RegExp(`\\|\\s*${label}\\s*\\|\\s*([\\d.]+)\\s*\\|`)); return m ? +m[1] : null; };
  for (const [k, l] of [['overall', 'Overall'], ['harmony', 'Harmony'], ['front', 'Harmony, front'], ['side', 'Harmony, side'], ['angularity', 'Angularity'], ['dimorphism', 'Dimorphism'], ['features', 'Features']]) out[k] = num(l);
  for (const m of md.matchAll(/\|\s*\[[^\]]+\]\([^)]*\/harmony\/([a-z0-9-]+)\)\s*\|\s*(Front|Side)\s*\|\s*(-?[\d.]+)[^|]*\|\s*(-?[\d.]+) to (-?[\d.]+)[^|]*\|\s*([\d.]+)\s*\|/g)) {
    const id = SLUG_ID[m[1]];
    if (id) out.ratios[id] = { v: +m[3], lo: +m[4], hi: +m[5], s: +m[6] };
  }
  return out;
}

async function main() {
  const count = +(process.argv[2] || 30);
  const outPath = new URL('./testdata/faceiq-bench.json', import.meta.url);
  mkdirSync(new URL('./testdata/', import.meta.url), { recursive: true });
  const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { faces: [] };
  const have = new Set(prev.faces.map((f) => f.slug));

  const index = await get(`${BASE}/llms.txt`);
  const rows = [...index.matchAll(/- \[([^\]]+)\]\(https:\/\/www\.faceiqlabs\.com\/celebs-wiki\/([a-z0-9-]+)\.md\):[^\n]*?Overall ([\d.]+)\/10/g)]
    .map((m) => ({ name: m[1], slug: m[2], overall: +m[3] })).filter((r) => !/female|perfect/i.test(r.name));
  // Stratify by overall score so the benchmark covers the whole scale
  rows.sort((a, b) => b.overall - a.overall);
  // round-robin over score bins (2.5–8.5) so every part of the scale is represented
  const bins = Array.from({ length: 12 }, (_, b) => rows.filter((r) => r.overall >= 2.5 + b * 0.5 && r.overall < 3 + b * 0.5).filter((_, i) => i % 5 === 0));
  const picks = [];
  for (let i = 0; picks.length < rows.length && i < 80; i++) for (const bin of bins) if (bin[i]) picks.push(bin[i]);
  const faces = [...prev.faces];
  for (const r of picks) {
    if (faces.length >= count) break;
    if (have.has(r.slug)) continue;
    const md = await get(`${BASE}/${r.slug}.md`); await sleep(300);
    if (!md) continue;
    const info = parseMd(md);
    if (info.gender !== 'male' || Object.keys(info.ratios).length < 50) continue;
    const page = await get(`${BASE}/${r.slug}`); await sleep(300);
    if (!page) continue;
    const ch = rsc(page);
    const url = (re) => ([...ch.matchAll(new RegExp(`https://[^"]*/celebrity-snapshots/${r.slug}/${re}[^"]*\\.webp`, 'g'))][0] || [])[0];
    const photos = { front: url('front-restored'), side: url('side-restored'), frontSeg: url('front-segmented-restored'), sideSeg: url('side-segmented-restored') };
    if (!photos.front || !photos.side) continue;
    const lm = { front: {}, side: {} };
    for (const view of ['front', 'side']) {
      for (const [slug, names] of Object.entries(LM_PAGES[view])) {
        const html = await get(`${BASE}/${r.slug}/harmony/${slug}`); await sleep(250);
        const il = html && illustration(html);
        if (!il || il.crop) continue;
        Object.values(il.points).forEach((p, i) => { if (names[i]) lm[view][names[i]] = toPhoto(p); });
      }
    }
    faces.push({ slug: r.slug, name: r.name, ...info, photos, lm });
    console.log(`${faces.length}/${count} ${r.name} overall ${info.overall} (${info.ethnicity}) — ${Object.keys(lm.front).length}+${Object.keys(lm.side).length} landmarks`);
    writeFileSync(outPath, JSON.stringify({ built: new Date().toISOString(), faces }, null, 0));
  }
  console.log('wrote', outPath.pathname, faces.length, 'faces');
}
if (import.meta.url === `file://${process.argv[1]}`) main();
