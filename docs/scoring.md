# How GGFacelon scores a face — and how that maps to FaceIQ Labs

GGFacelon's scoring is modelled on FaceIQ Labs' published method. This page summarises what FaceIQ publishes,
what was measured from its public data, and where GGFacelon necessarily differs.

## Sources (public, read November 2026)

- `faceiqlabs.com/support/scores` — the 0–10 scale, rarity table, how pillars and the overall combine.
- `faceiqlabs.com/support/harmony.md` and `/support/harmony/<ratio>.md` — one guide per ratio with its
  "Calculation" line.
- `faceiqlabs.com/support/facial-analysis.md`, `/support/photos.md` — Frankfort levelling, photo rules.
- `faceiqlabs.com/celebs-wiki` — 1,947 analysed celebrities. Each ratio page lists the value, ideal range,
  score and population percentages, and embeds the landmark coordinates used to draw it.

The raw numbers used for fitting live in `tools/faceiq-data.mjs` (three published faces) and, locally only,
`tools/testdata/` (benchmark of 64 men and ideal ranges for each ethnicity — not committed).

## FaceIQ's method

| Step | What FaceIQ does |
|---|---|
| Landmarks | AI places the points; users can correct them. The side photo is levelled to the Frankfort plane (ear canal → lowest point of the eye socket). Millimetres assume a 190 mm hairline‑to‑chin height. |
| Ratios | 66 Harmony ratios (33 front, 33 side), each with a reference range adjusted for gender and ethnicity, a scoring curve and a weight. |
| Ratio score | 10 inside the range, falling off outside it. Fitting FaceIQ's published scores shows a Gaussian fall‑off: `score = 10·exp(−(d/s)²)`, `d` = distance outside the range, `s` set per ratio (e.g. mentolabial angle s ≈ 22°, face width‑to‑height s ≈ 0.18). |
| Harmony | "A gentler power mean, still weighted toward weaker items" of the ratio scores; about 60% front, 40% side. |
| Angularity, Dimorphism, Features | Rated from the photo by a vision model (not landmarks). |
| Overall | "Power mean with a very small exponent" of the four pillars — a geometric mean. Four 7s → 7.0; three 8s and a 4 → ~6.7. This reproduces every published celebrity overall exactly. |
| Scale | 5 = population average; 7.0 ≈ 94th percentile; 8.0 ≈ 99.6th; rarity is symmetric. |

## What GGFacelon replicates

- **All 66 ratios** with FaceIQ's formulas (`js/metrics.js`), including its landmark conventions measured from
  its own coordinates: cheekbone width at about lower‑eyelid level, "bigonial" width on the jaw contour at mouth
  level, the lower jaw angle a little down the jawline, temples a little over halfway from brows to hairline,
  the eye region measured to the end of the eyelid hood (~18% past the corner), the neck a third of the way
  from jaw angle to chin, supratip/infratip at ~12%/10% of nose length from the tip, and the ear notch below
  the tragus as the top of the jaw's back edge.
- **Ideal ranges** for every ratio and all six of FaceIQ's ethnicity sets (Caucasian, East Asian, South Asian,
  Black, Middle Eastern, Hispanic). GGFacelon doesn't ask for ethnicity: each face is scored against every set
  and the best‑fitting one is used throughout.
- **Score curves**: the fall‑off width `s` of each ratio, fitted to FaceIQ's published scores
  (`tools/fit-faceiq.mjs`).
- **Harmony aggregation**: weighted power mean (p = 0.5) per view, 60/40. Weights were fitted so FaceIQ's
  published "impact" of each flaw is reproduced (face width‑to‑height, brow position and eye shape weigh about
  five times as much as the nose tip angle or mouth corners). On FaceIQ's three published breakdowns this gives
  Harmony 7.65 / 9.02 / 6.56 against FaceIQ's 7.7 / 9.1 / 6.4.
- **Overall** = geometric mean of the four pillars; **scale and percentiles** = FaceIQ's.

## Where it can't be identical

- FaceIQ's Angularity, Dimorphism and Features come from a vision model trained on photos. GGFacelon estimates
  them from groups of landmark measurements (and leaves skin out), then calibrates them against FaceIQ's
  scores on the benchmark faces.
- Landmarks are detected automatically and can be corrected by hand. Small placement differences, especially
  on the jaw angle and hairline, move several ratios at once — FaceIQ notes the same.
- Without an ethnicity question, the best‑fit range set can be a little more lenient than FaceIQ for some
  faces.

## Re‑deriving the numbers

```
node tools/fit-faceiq.mjs --write     # ratio curves, weights, Harmony map, range sets → js/norms.js
node tools/faceiq-bench.mjs 64        # (local) rebuild the benchmark from the public wiki
node tools/side-shape.mjs             # median jaw-angle / ear-notch position used for profiles
```

In the app (dev tools console): `const b = await import('/tools/bench.js'); const r = await b.run(); b.report(r)`
compares detection and scores with FaceIQ on the benchmark; `b.fitCalibration(r)` refits the pillar maps.
