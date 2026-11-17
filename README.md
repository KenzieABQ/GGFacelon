# GGFacelon

Landmark‑based facial analysis for men. Upload a front and a side photo; AI places 70 landmarks, you verify each one, and GGFacelon scores 70 measurements across four pillars: **Harmony, Angularity, Dimorphism, Features**. Everything is unlocked and runs in the browser. Photos never leave the device (stored in IndexedDB).

## Run

```bash
python3 -m http.server 5180
```

Open http://localhost:5180. It has to be served over http (ES modules + camera); opening `index.html` as a file won't work.
The AI model (MediaPipe Face Landmarker, ~4 MB) loads from a CDN the first time. Offline, points start from a template instead.

## Flow

1. Consent → profile (male) → front photo → side photo (upload or camera, with photo instructions)
2. **Detection**: MediaPipe 478‑point mesh for the front; hairline, ears and neck found from colour edges; the 90° profile is traced from its skin outline and scaled using your own front proportions
3. **Verify**: one point at a time, zoomed, with reference photo / diagram / how‑to (arrow keys nudge, Enter next, Backspace back, R reset, 1‑3 zoom)
4. **Review** all points (drag with magnifier) → **Analyze**
5. Dashboard: Overview, Analysis (per pillar, animated overlays per measurement), Plan, Simulate (drag points, see score changes), Compare (two scans), Methodology, PNG report export

## Files

| File | Purpose |
| --- | --- |
| `js/landmarks.js` | 49 front + 21 profile landmark definitions, reference positions, link lines |
| `js/detect.js` | MediaPipe mapping, hairline/ear/neck edge finding, profile outline tracer, template fallback |
| `js/metrics.js` | All measurements (formula, ideal male range, overlay), scoring, pillars, pose checks |
| `js/ui/*.js` | Screens: flow, detecting, verify, review, analyzing, dashboard, analysis, extras |

Ideal ranges live in `js/metrics.js` (`lo`, `hi`, `sig` per measurement). Edit there to recalibrate.

## Consistency

- Every measurement is a ratio or an angle, so photo size and face‑to‑frame size don't change it.
- Front points are de‑rotated so the pupils are level; profile points are mirrored to face right and rotated onto the Frankfort horizontal (ear canal → under‑eye rim).
- Same landmarks → same scores. Results are recomputed from stored landmarks, so formula updates apply to old scans.
- A pose check warns about small/low‑res faces, turned heads and a strongly tilted Frankfort plane.
