// Reference data collected from FaceIQ Labs' public pages (November 2026), used by tools/fit-faceiq.mjs
// to derive the scoring parameters in src/lib/engine/norms.js.
//
// Sources
//  • Ideal ranges, values, scores and population stats: faceiqlabs.com/celebs-wiki/custom-chico-lachowski/harmony/<ratio>
//    (male, Caucasian ranges). "higher" = share of the wiki's men with a lower value; "inside" = share inside the range.
//  • Per-ratio scores for two more faces: /celebs-wiki/custom-mathematically-perfect-male-face/harmony and
//    /celebs-wiki/custom-faceiq/harmony.
//  • Formulas: faceiqlabs.com/support/harmony/<ratio> ("Calculation" lines), summarised in docs/scoring.md.
//  • Scale: faceiqlabs.com/support/scores — 5 = population average, 7.0 ≈ 94th percentile, 8.0 ≈ 99.6th;
//    overall = power mean of the four pillars with a very small exponent (≈ geometric mean);
//    Harmony = weighted, gentler power mean of the ratio scores, about 60% front / 40% side.

// id: [value, lo, hi, score, higher%, inside%]   (Chico Lachowski)
export const CHICO = {
  // front
  top_third: [30.8, 30, 32, 10, 34.5, 34], middle_third: [33.3, 31.4, 33.4, 10, 75, 36], lower_third: [36.0, 33.9, 37.0, 10, 44.5, 49],
  fwhr: [1.81, 1.96, 2.0, 5.2, 26, 9.5], midface_ratio: [1.05, 0.97, 1.0, 9.0, 75.5, 24], total_wh: [1.37, 1.34, 1.37, 9.9, 55, 24.5],
  bitemporal: [86.1, 86.5, 92.5, 9.9, 50, 40], cheekbone_height: [83.7, 83, 100, 10, 75, 29.5], esr: [47.1, 45.7, 46.8, 9.8, 80, 25.5],
  one_eye_apart: [0.96, 0.95, 1.0, 10, 10.5, 24.5], canthal_tilt: [6.5, 6.0, 7.7, 10, 66, 25], brow_length: [0.70, 0.69, 0.76, 10, 90, 15],
  brow_low_set: [1.54, 0, 0.45, 2.6, 96, 20.5], eye_ar: [4.16, 3.0, 3.5, 3.6, 99, 36], brow_tilt: [4.9, 6.5, 11.0, 9.2, 19.5, 46],
  iaa_jfa_dev: [4.2, 0, 2.5, 9.3, 44.5, 30], iaa: [93.1, 86.5, 92.5, 9.8, 81, 46], bridge_nose: [2.06, 2.06, 2.14, 10, 10, 14],
  icd_nose: [1.15, 1.04, 1.16, 10, 55.5, 51], nose_tip_pos: [0.66, 0, 3.0, 10, 24, 76], mouth_corner: [-1.71, 0, 4.0, 5.5, 5, 70],
  cupid_depth: [1.31, 2.3, 4.0, 6.6, 6, 21], mouth_nose: [1.35, 1.42, 1.5, 7.9, 35.5, 25.5], lip_ratio: [1.29, 1.55, 1.85, 8.6, 49.5, 9.5],
  ipd_mouth: [0.79, 0.83, 0.87, 9.3, 26, 29], chin_philtrum: [2.53, 2.15, 2.45, 9.7, 74.5, 34], jaw_slope: [144.7, 140, 142.5, 9.0, 64, 16],
  bigonial: [86.2, 87.5, 91.5, 9.5, 15, 50.5], lower_third_prop: [32.3, 31, 33.5, 10, 44.5, 41], jfa: [89.0, 86.5, 92.5, 10, 44, 31],
  ear_angle: [11.4, 10, 11.5, 10, 31, 15], ear_ratio: [9.9, 8, 12, 10, 26, 50.5], neck_width: [90.3, 92, 98, 9.7, 45.5, 34.5],
  // side
  nasofrontal: [130.8, 116, 128, 9.4, 49.5, 34], browridge_incl: [22.7, 15, 22, 9.9, 64.5, 44], upper_forehead: [2.3, 0, 2, 9.9, 21, 19.5],
  total_convexity: [151.1, 140, 147, 8.3, 81, 44.5], midface_proj: [63.4, 53, 60, 8.6, 70.5, 36], depth_height: [1.25, 1.30, 1.44, 8.8, 25, 46],
  z_angle: [82.5, 78, 82, 9.9, 70.5, 25.5], orbital_vector: [0.33, 1, 10, 9.9, 65.5, 24], convexity_g: [172.8, 170, 175, 10, 49, 34],
  convexity_n: [165.6, 163, 166, 10, 39, 19.5], anterior_depth: [65.9, 64.5, 67.5, 10, 45, 24.5], nasal_tip_angle: [153.6, 128.5, 138.5, 1.6, 99.9, 64.5],
  nasofacial: [26.5, 31, 35, 4.0, 20, 26], nasomental: [137.8, 126, 131, 4.3, 80.5, 29], frankfort_tip: [46.7, 32, 38, 5.0, 94, 36],
  tip_rotation: [27.7, 11.5, 21.5, 6.9, 85.5, 46], nasolabial: [107.4, 97, 114, 10, 65.5, 60.5], nasal_projection: [0.59, 0.58, 0.65, 10, 9, 19.5],
  nasal_wh: [0.75, 0.67, 0.83, 10, 15.5, 36], mentolabial: [141.1, 111, 127, 6.5, 61, 14], holdaway: [-1.36, -0.2, 1.2, 7.1, 21, 34.5],
  s_lower: [-0.87, -0.4, 1.4, 8.8, 26, 21], b_lower: [-3.42, -3.2, -0.8, 9.7, 30.5, 34.5], e_upper: [3.85, 1.2, 5.8, 10, 34, 45.5],
  e_lower: [1.18, 1.1, 4.4, 10, 25.5, 39], s_upper: [0.75, -0.4, 1.4, 10, 40, 25], b_upper: [-3.12, -5.2, -1.8, 10, 55, 54],
  gonial: [121.6, 115, 121, 9.9, 59, 30], ramus_mandible: [0.76, 0.62, 0.75, 9.9, 94, 50], mpa: [19.4, 15, 22, 10, 44.5, 50.5],
  gonion_mouth: [21.2, 15, 45, 10, 74, 60.5], fh_recession: [4.42, 1.5, 15, 10, 74.5, 36], submental: [113.9, 94, 106, 7.7, 40.5, 15.5],
};

// id: [value, score] for the two other published faces (same ranges)
export const PERFECT = {
  top_third: [31.8, 10], middle_third: [32.1, 10], lower_third: [36.1, 10], fwhr: [1.88, 8.2], midface_ratio: [0.95, 9.6], total_wh: [1.36, 10],
  bitemporal: [86.7, 10], cheekbone_height: [83.7, 10], esr: [45.4, 9.8], one_eye_apart: [0.94, 9.8], brow_length: [0.69, 10], canthal_tilt: [7.1, 10],
  brow_low_set: [0.40, 10], eye_ar: [3.28, 10], brow_tilt: [10.2, 10], iaa_jfa_dev: [5.2, 8.5], iaa: [86.7, 10], icd_nose: [1.15, 10],
  nose_tip_pos: [1.92, 10], bridge_nose: [2.13, 10], lip_ratio: [1.29, 8.6], cupid_depth: [2.27, 9.8], mouth_nose: [1.46, 10], chin_philtrum: [2.32, 10],
  ipd_mouth: [0.83, 10], mouth_corner: [1.23, 10], bigonial: [89.5, 10], lower_third_prop: [31.9, 10], jfa: [91.9, 10], ear_angle: [11.3, 10],
  ear_ratio: [11.0, 10], jaw_slope: [141.3, 10], neck_width: [94.4, 10],
  upper_forehead: [4.0, 8.6], browridge_incl: [15.8, 10], nasofrontal: [121, 10], total_convexity: [153, 6.4], convexity_g: [178.7, 7.9],
  convexity_n: [169.3, 8.1], anterior_depth: [61.9, 9.4], midface_proj: [52.5, 10], depth_height: [1.44, 10], orbital_vector: [2.46, 10],
  z_angle: [81.1, 10], nasal_projection: [0.80, 4.9], tip_rotation: [29.2, 5.4], nasomental: [135.4, 6.7], frankfort_tip: [44, 7.3],
  nasal_wh: [0.91, 8.8], nasofacial: [29, 9.0], nasal_tip_angle: [131.9, 10], nasolabial: [108.8, 10], mentolabial: [139.7, 7.2],
  holdaway: [-0.5, 9.6], e_upper: [4.73, 10], e_lower: [2.44, 10], s_upper: [1.08, 10], s_lower: [0.18, 10], b_upper: [-3.63, 10],
  b_lower: [-2.74, 10], fh_recession: [-0.10, 9.7], ramus_mandible: [0.60, 9.8], gonial: [121.7, 9.9], mpa: [19.8, 10], gonion_mouth: [17.31, 10],
  submental: [101, 10],
};
export const FIQ = {
  lower_third: [38.8, 6.4], middle_third: [30.4, 9.1], top_third: [30.9, 10], cheekbone_height: [75.3, 6.6], fwhr: [1.86, 7.3], bitemporal: [85.2, 9.6],
  midface_ratio: [0.96, 9.9], total_wh: [1.36, 10], canthal_tilt: [-0.5, 2.1], one_eye_apart: [1.06, 7.6], brow_low_set: [0.73, 8.7], esr: [45.0, 9.3],
  eye_ar: [3.14, 10], brow_tilt: [8.3, 10], brow_length: [0.70, 10], bridge_nose: [2.59, 2.5], iaa_jfa_dev: [6.6, 7.0], iaa: [93.5, 9.7],
  icd_nose: [1.17, 9.9], nose_tip_pos: [-0.15, 9.9], mouth_nose: [1.29, 3.4], mouth_corner: [-1.02, 7.2], lip_ratio: [1.29, 8.7], cupid_depth: [1.88, 8.7],
  ipd_mouth: [0.82, 9.9], chin_philtrum: [2.24, 10], jaw_slope: [133.4, 6.0], jfa: [100.1, 6.8], ear_angle: [14.3, 7.5], bigonial: [95.1, 7.9],
  lower_third_prop: [34.0, 9.1], ear_ratio: [10.9, 10], neck_width: [84.5, 5.5],
  upper_forehead: [9.1, 2.6], browridge_incl: [27.2, 4.8], nasofrontal: [131, 9.3], convexity_n: [167.9, 9.4], z_angle: [82.4, 9.9], orbital_vector: [0.55, 9.9],
  total_convexity: [139.5, 9.9], midface_proj: [60.4, 10], convexity_g: [172.4, 10], depth_height: [1.34, 10], anterior_depth: [66.1, 10],
  nasal_wh: [1.02, 3.9], nasal_projection: [0.72, 8.7], nasal_tip_angle: [126.5, 9.5], tip_rotation: [21.9, 10], nasolabial: [108.1, 10],
  nasomental: [129.3, 10], nasofacial: [31.5, 10], frankfort_tip: [36.1, 10], s_upper: [2.96, 5.1], e_upper: [6.97, 7.4], mentolabial: [134.5, 9.1],
  s_lower: [1.72, 9.3], holdaway: [-0.26, 10], e_lower: [4.41, 10], b_upper: [-2.26, 10], b_lower: [-1.77, 10], mpa: [12.7, 8.5], gonial: [112.4, 9.1],
  ramus_mandible: [0.67, 10], gonion_mouth: [28.95, 10], fh_recession: [6.8, 10], submental: [117.5, 5.8],
};

// Displayed pillar results for the same faces
export const SHOWN = {
  chico: { front: 7.6, side: 7.8, harmony: 7.7, angularity: 8.8, dimorphism: 7.5, features: 8.3, overall: 8.1 },
  perfect: { front: 9.5, side: 8.3, harmony: 9.1, angularity: 10.0, dimorphism: 8.5, features: 8.8, overall: 9.1 },
  fiq: { harmony: 6.4 },
};
// "Impact" of each listed flaw on Chico's Harmony (points ×10 the score would rise if fixed)
export const CHICO_IMPACT = {
  fwhr: 4.5, brow_low_set: 3.4, eye_ar: 3.0, nasal_tip_angle: 1.3, submental: 1.1, mouth_corner: 0.7, cupid_depth: 0.3,
};
