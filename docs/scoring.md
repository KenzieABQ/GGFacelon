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
`tools/testdata/` (benchmark of 119 men and ideal ranges for each ethnicity — not committed).

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

- **All 66 ratios** with FaceIQ's formulas (`src/lib/engine/metrics.js`), including its landmark conventions measured from
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
- **Harmony aggregation**: weighted power mean (p = 0.5) per view. Weights were fitted so FaceIQ's
  published "impact" of each flaw is reproduced (face width‑to‑height, brow position and eye shape weigh about
  five times as much as the nose tip angle or mouth corners). On FaceIQ's three published breakdowns this gives
  Harmony 7.65 / 9.02 / 6.56 against FaceIQ's 7.7 / 9.1 / 6.4.
- **Overall** = geometric mean of the four pillars; **scale and percentiles** = FaceIQ's.

## What GGFacelon adds or changes, and why

Fitted with `tools/fit-looks.mjs` on 119 FaceIQ‑analysed men (automatic landmarks, FaceIQ's own values and
scores as the target): 64 spread evenly over the whole scale, plus 55 rated 7 or higher — the celebrity wiki is
mostly 6.5–8.5, and the top end needs its own test (e.g. both Marlons and the Mathematically Perfect Male Face).

- **Convention offsets.** Some ratios came out consistently offset from FaceIQ's value for the same face — e.g.
  FaceIQ's brow level sits ~0.02 IPD below the mean of the brow points, and it places the ear canal, nostril base
  and profile eye corner differently from us (it never publishes those coordinates). The median offset is
  subtracted when it is clearly larger than chance (> 3 standard errors and > ¼ of the ratio's score width).
- **Reliability weights.** Each ratio's weight is multiplied by s² / (s² + σ²), where σ is how far our automatic
  value scatters around FaceIQ's and s is the ratio's score width, capped by the correlation between our value
  and FaceIQ's (a measurement that doesn't track FaceIQ's at all — e.g. the under‑chin angle, r ≈ 0 — carries
  almost nothing, however tight its scatter). Front ratios keep most of their weight; many profile angles and lip
  lines drop to 5–40%. Their scores were mostly noise and could sink a good profile.
- **Front/side split 70/30** instead of FaceIQ's 60/40: our side Harmony agrees with FaceIQ's far less well
  (r ≈ 0.4 vs 0.8 for the front), so the front carries more. Raises Harmony agreement from r 0.74 to 0.76.
- **Range‑set choice.** Picking the set with the best Harmony favoured the most lenient set (East Asian won for
  most faces, including clearly European ones). Each set's benchmark average is now subtracted before choosing.
  Neither method identifies ethnicity reliably from geometry (about one face in five matches FaceIQ’s label either way),
  and using FaceIQ's true ethnicity didn't score more accurately, so no question is asked.
- **Hidden points.** When the segmenter shows hair over the profile's forehead points, the angles built on them
  are left out (and a pose‑check note says so). Hair over the cheekbones in the front photo moves the cheekbone
  points in to the visible face edge instead of the head outline the mesh guesses under the hair.
- **Photo measurements** (`src/lib/engine/appearance.js`), read from the pixels around the verified landmarks:

  | Measurement | How | Ideal |
  |---|---|---|
  | Eyebrow thickness | height of the dark brow band, half‑contrast edges against the skin above and below (stops at the upper lid so lid shadow isn't counted) | 5.5–11 mm |
  | Eyebrow density | (forehead skin − brow) ÷ skin brightness | ≥ 68% |
  | Brow tail length | where the brow hair ends past the outer eye corner, in eye widths (stops at scalp hair) | 0.35–0.7 |
  | Brow‑to‑eye distance | upper lid → lower brow edge above the pupil | 2–6 mm |
  | Eye openness | lid opening ÷ iris diameter (iris edge found from the limbus) | 0.55–0.75 |
  | Lower scleral show | white between iris and lower lid | ≤ 0.3 mm |
  | Lip fullness | vermilion height ÷ mouth width | 27–42% |
  | Temple recession | hairline height at the temple corners − centre, from the hair mask | ≤ 2% of face height |

  Directions come from looksmax.org's eyebrow and eye‑area guides (full, dark, flat brows that reach past the
  eye corner; low‑set brows; lids close to the iris) and the clinical periorbital literature (scleral show reads
  as tired). On the benchmark, brow darkness (r = 0.53) and a small brow‑to‑eye gap (r = −0.49) track FaceIQ's
  Dimorphism; brow tail length tracks Features and Harmony. "Thicker is better" did **not** hold up (thicker
  brows went with slightly lower FaceIQ scores, r ≈ −0.2), so thickness only penalises clearly thin brows. They feed Features and Dimorphism. **Jaw shadow and
  cheek hollows were measured and dropped**: they correlated *negatively* with FaceIQ — they follow lighting and
  double‑chin shadows, not definition.
- **Front profile / side profile scores**: the four pillars recomputed from one photo's measurements, each mapped
  onto the same scale.

### Accuracy against FaceIQ (119 men, automatic landmarks)

| | before | after |
|---|---|---|
| Overall: correlation / mean abs. difference | 0.66 / 1.10 | 0.79 / 0.88 |
| Front Harmony | 0.67 / 1.30 | 0.81 / 0.96 |
| Side Harmony | 0.33 / 1.80 | 0.49 / 1.65 |
| Angularity | 0.42 / 1.52 | 0.52 / 1.40 |
| Dimorphism | 0.48 / 0.98 | 0.59 / 0.86 |
| Features | 0.48 / 1.76 | 0.65 / 1.47 |

Fitting the offsets and reliabilities on half the faces and testing on the other half gives overall correlations
of 0.78 and 0.80 on the held‑out halves (0.69 and 0.64 before), so the gain isn't overfitting.

By FaceIQ score band (mean FaceIQ → mean ours):

| FaceIQ band | n | FaceIQ | ours |
|---|---|---|---|
| under 5 | 30 | 4.09 | 4.43 |
| 5–6 | 19 | 5.51 | 5.90 |
| 6–7 | 6 | 6.57 | 7.35 |
| 7–7.5 | 17 | 7.40 | 7.29 |
| 7.5–8 | 19 | 7.85 | 7.45 |
| 8+ | 28 | 8.21 | 7.75 |

Grouped the other way — by our score — it mirrors: faces we rate 8+ average 8.0 at FaceIQ, faces we rate under 5
average 4.4. That is what imperfect measurement does to any estimate (extremes drift toward the middle), not a
skewed scale: the two score distributions match (FaceIQ / ours: 25th percentile 5.0 / 5.4, median 7.4 / 6.7,
90th 8.2 / 8.4). Stretching the top further would push the faces we already over‑rate higher still. Only better
measurement (mainly the profile) closes it. Before the top‑band faces were added to the fit, faces FaceIQ rates
8+ came out 1.1–1.7 points low; now 0.5.

Examples (FaceIQ's own photos): Marlon Teixeira 7.8 → 7.82, Marlon Lundgren Garcia 7.9 → 8.05, David Gandy 8.3 →
8.29, Mathematically Perfect Male Face 9.1 → 8.52. Different photos of the same person can differ by more than
that — lighting, lens distance, head tilt and expression all move the landmarks.

Sanity checks: a morphed "ideal" male face (front) with a male model's profile scores **9.0** overall (front
profile 8.8, side profile 8.6); the average‑looking reference face scores 4.1 fully automatic and 4.7 with its
hand‑placed points. Scores are not measured against the reference photo — it only shows where each landmark
goes; every ratio is judged against FaceIQ's ideal ranges.

What was tried and not kept, because it didn't hold up on held‑out faces: widening each ratio's score curve by
our measurement noise, a softer power mean, and fitted (unequal) pillar weights for the overall.

## Where it can't be identical

- FaceIQ's Angularity, Dimorphism and Features come from a vision model trained on photos. GGFacelon estimates
  them from groups of landmark measurements plus the photo measurements above (and leaves skin out), then
  calibrates them against FaceIQ's scores on the benchmark faces.
- Profile interior points (ear canal, under‑eye rim, nostril base, eye corner) are placed from a template fitted
  to the traced outline, not detected — the main reason side Harmony agrees less well.
- Landmarks are detected automatically and can be corrected by hand. Small placement differences, especially
  on the jaw angle and hairline, move several ratios at once — FaceIQ notes the same.
- Without an ethnicity question, the range set is a best guess from the face's proportions.

## Re‑deriving the numbers

```
node tools/fit-faceiq.mjs --write     # ratio curves, weights, Harmony map, range sets → src/lib/engine/norms.js
node tools/faceiq-bench.mjs 64        # (local) rebuild the benchmark from the public wiki
node tools/faceiq-bench.mjs 120 --min 7 --nolm   # (local) add faces rated 7+ (scores only, no landmark pages)
node tools/side-shape.mjs             # median jaw-angle / ear-notch position used for profiles
node tools/fit-looks.mjs --write      # offsets, reliabilities, photo ranges, score maps (needs bench-raw.json)
```

In the dev server, open `/bench/` (it reads `tools/testdata/` through the `public/testdata` link) and press Run all; `report(r)`
compares detection and scores with FaceIQ on the benchmark; `b.upload(r)` saves the raw per‑face data to
`tools/testdata/bench-raw.json` (run `python3 tools/sink.py` first) for `tools/fit-looks.mjs`.
