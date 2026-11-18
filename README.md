# GGFacelon

Landmark‑based facial analysis for men, modelled on FaceIQ Labs' published method. Upload a front and a side photo; AI places 73 landmarks, you verify each one, and GGFacelon scores 66 FaceIQ ratios (plus symmetry and jaw taper) and 8 measurements read from the photo itself (brow thickness, darkness and length, brow‑to‑eye gap, eye openness, white under the iris, lip fullness, temple recession) across four pillars: **Harmony, Angularity, Dimorphism, Features** — overall, and separately for the front and the side profile. Everything is unlocked and runs in the browser. Photos never leave the device (stored in IndexedDB).

## Run

```bash
python3 serve.py
```

Open http://localhost:5180. (`serve.py` is a plain static server that turns off browser caching, so updates always load.) It has to be served over http (ES modules + camera); opening `index.html` as a file won't work.
The AI models (MediaPipe Face Landmarker ~4 MB, selfie segmenter ~16 MB) load from a CDN the first time. Offline, points start from a template instead.

## Flow

1. Consent → profile (male) → front photo → side photo (upload or camera, with photo instructions)
2. **Detection**: sideways or upside‑down photos are turned upright and tilted ones levelled (eyes level on the front, Frankfort plane on the profile). MediaPipe 478‑point face mesh for the front; for the profile, the traced silhouette (peaks and dips give nose tip, nose base, lips, lip–chin fold, chin, chin bottom, neck point) or, for three‑quarter photos, the mesh midline. Works facing left or right (a "flip" button re‑detects if it guessed wrong)
3. **Verify**: one point at a time, zoomed, with reference photo / diagram / how‑to (arrow keys nudge, Enter next, Backspace back, R reset, 1‑3 zoom)
4. **Review** all points (drag with magnifier) → **Analyze**
5. Dashboard: Overview (overall, front‑profile and side‑profile scores, photo measurements), Analysis (per pillar; hovering a measurement zooms into it), Plan, Simulate, Compare, Methodology, Calibration & data, PNG report export

## Scoring

Follows FaceIQ Labs — see [docs/scoring.md](docs/scoring.md) for sources and derivation.

- 66 ratios with FaceIQ's formulas and male ideal ranges; each scores 10 inside its range and `10·exp(−(d/s)²)` outside, with `s` fitted to FaceIQ's published scores.
- FaceIQ adjusts ranges for ethnicity; GGFacelon scores against all six of its range sets and uses the one the face fits unusually well (each set's benchmark average subtracted first), with no ethnicity question.
- Per‑ratio convention offsets and reliability weights, fitted on 64 FaceIQ‑analysed celebrities: ratios FaceIQ measures from slightly different points are shifted onto FaceIQ's convention, and ratios that can't be measured reliably from a photo (many profile angles) count less.
- Photo measurements (`js/appearance.js`) have their own ideal ranges and feed Features and Dimorphism.
- Harmony = weighted power mean (p = 0.5) per view, 70% front + 30% side (FaceIQ: 60/40; profile angles are measured less reliably); Overall = geometric mean of the four pillars; Front/Side profile = the same from one photo's measurements; scale = FaceIQ's (5 average, 7 ≈ top 6%, 8 ≈ top 0.4%).
- Against FaceIQ on the benchmark (automatic landmarks): overall correlation ≈ 0.7, mean difference ≈ 0.9 points.
- Regenerate the fitted parameters (`js/norms.js`):

```bash
node tools/fit-faceiq.mjs --write     # ratio curves, weights, range sets
node tools/fit-looks.mjs --write      # offsets, reliabilities, photo-measurement ranges, score maps (needs the local benchmark)
```

- **Calibration & data** (sidebar): enter known scores for some scans (e.g. FaceIQ results) to fit the scale to them, and export landmarks as JSON (no photos).

## Files

| File | Purpose |
| --- | --- |
| `js/landmarks.js` | 49 front + 24 profile landmark definitions, hand‑placed reference positions, link lines |
| `js/detect.js` | Face mesh mapping, segmentation, 2‑D profile outline tracer, auto‑rotation/levelling, template fallback |
| `js/metrics.js` | All measurements (FaceIQ formula, overlay), scoring, pillars, front/side profile scores, scale, pose checks |
| `js/appearance.js` | Photo measurements: brows, eye openness, lips, hairline; profile points hidden by hair |
| `js/norms.js` | Generated: ideal ranges (all range sets), score‑curve widths, Harmony weights and map |
| `js/ui/*.js` | Screens: flow, detecting, verify, review, analyzing, dashboard, analysis, extras, calibration |
| `tools/fit-faceiq.mjs`, `tools/faceiq-data.mjs` | Fit FaceIQ's score curves, weights and ranges → `js/norms.js` |
| `tools/faceiq-bench.mjs`, `tools/bench.js` | Build a local benchmark from FaceIQ's public celebrity wiki and compare detection + scores against it |
| `tools/fit-looks.mjs`, `tools/sink.py` | Fit convention offsets, reliability weights, range‑set bias, photo‑measurement ranges and score maps on the benchmark → `tools/calibration.json` (`sink.py` receives the benchmark data from the browser) |
| `tools/side-shape.mjs` | Median jaw‑angle / ear‑notch position for profiles |
| `serve.py` | Local server with caching disabled |

Ranges, curves, weights and the score maps live in `js/norms.js` (generated).

## Consistency

- Every measurement is a ratio, an angle, or millimetres on a fixed 190 mm hairline‑to‑chin scale, so photo size and face‑to‑frame size don't change it.
- Front points are de‑rotated so the pupils are level; profile points are mirrored to face right and rotated onto the Frankfort horizontal (ear canal → under‑eye rim).
- Same landmarks → same scores. Results are recomputed from stored landmarks, so formula updates apply to old scans.
- A pose check warns about small/low‑res faces, turned heads and a strongly tilted Frankfort plane, and profile angles whose points are hidden under hair are left out rather than guessed.
