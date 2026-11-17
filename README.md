# GGFacelon

Landmark‑based facial analysis for men. Upload a front and a side photo; AI places 70 landmarks, you verify each one, and GGFacelon scores 70 measurements across four pillars: **Harmony, Angularity, Dimorphism, Features**. Everything is unlocked and runs in the browser. Photos never leave the device (stored in IndexedDB).

## Run

```bash
python3 serve.py
```

Open http://localhost:5180. (`serve.py` is a plain static server that turns off browser caching, so updates always load.) It has to be served over http (ES modules + camera); opening `index.html` as a file won't work.
The AI model (MediaPipe Face Landmarker, ~4 MB) loads from a CDN the first time. Offline, points start from a template instead.

## Flow

1. Consent → profile (male) → front photo → side photo (upload or camera, with photo instructions)
2. **Detection**: MediaPipe 478‑point face mesh for the front; MediaPipe person segmentation (hair / face skin / body skin / background) for the hairline, ears, neck and the profile outline. The profile works facing left or right (a "flip" button re‑detects if it guessed wrong)
3. **Verify**: one point at a time, zoomed, with reference photo / diagram / how‑to (arrow keys nudge, Enter next, Backspace back, R reset, 1‑3 zoom)
4. **Review** all points (drag with magnifier) → **Analyze**
5. Dashboard: Overview, Analysis (per pillar; hovering a measurement zooms into it), Plan, Simulate, Compare, Methodology, Calibration & data, PNG report export

## Scoring

- Each measurement is scored by its distance from the male ideal in units of how much men normally vary (`NORMS` in `js/metrics.js`), so an average face lands mid‑scale.
- Harmony weighs ratios by importance; Angularity/Dimorphism/Features take research‑based weighted averages of their assessments; the weakest third counts extra.
- Pillars and Overall are mapped to a population scale matched to FaceIQ (mean 5.44, SD 0.97: 7.03 ≈ top 5%, 7.77 ≈ top 0.8%). Regenerate the mapping after changing norms or weights:

```bash
node tools/calibrate.mjs
```

- **Calibration & data** (sidebar): enter known scores for some scans (e.g. FaceIQ results) to fit the scale to them, and export landmarks as JSON (no photos).

## Files

| File | Purpose |
| --- | --- |
| `js/landmarks.js` | 49 front + 21 profile landmark definitions, reference positions, link lines |
| `js/detect.js` | Face mesh mapping, segmentation-based hairline/ear/neck and profile outline tracer, template fallback |
| `js/metrics.js` | All measurements (formula, ideal male range, overlay), scoring, pillars, pose checks |
| `js/ui/*.js` | Screens: flow, detecting, verify, review, analyzing, dashboard, analysis, extras, calibration |
| `tools/calibrate.mjs` | Simulates the male population to calibrate the score scale |
| `serve.py` | Local server with caching disabled |

Norms, weights and the calibration table live in `js/metrics.js`.

## Consistency

- Every measurement is a ratio or an angle, so photo size and face‑to‑frame size don't change it.
- Front points are de‑rotated so the pupils are level; profile points are mirrored to face right and rotated onto the Frankfort horizontal (ear canal → under‑eye rim).
- Same landmarks → same scores. Results are recomputed from stored landmarks, so formula updates apply to old scans.
- A pose check warns about small/low‑res faces, turned heads and a strongly tilted Frankfort plane.
