// Landmark definitions for the frontal and profile views.
// Side naming follows the subject: "Right" = the subject's right = left side of a non‑mirrored photo.
// `ref` is the point's location on the reference photos in assets/ (767×1024 each).
// `zoom` picks the default verify zoom: close (eye/lip detail), medium (nose/mouth), wide (contour).

const L = (id, name, anat, zoom, how, extra = {}) => ({ id, name, anat, zoom, how, ...extra });

export const FRONT = [
  // Eyes
  L('pupil_r', 'Right Pupil', 'Pupil centre', 'close', 'Centre of the pupil on your right eye (left side of the photo). Click the exact middle of the dark circle, not a light reflection.'),
  L('pupil_l', 'Left Pupil', 'Pupil centre', 'close', 'Centre of the pupil on your left eye (right side of the photo).'),
  L('endo_r', 'Right Inner Eye Corner', 'Endocanthion', 'close', 'Where the upper and lower eyelids meet next to the nose. Place it at the corner of the eye opening, not on the pink tear duct.'),
  L('exo_r', 'Right Outer Eye Corner', 'Exocanthion', 'close', 'The outer corner where the eyelids meet. Follow the lash lines until they join.'),
  L('lidU_r', 'Right Upper Eyelid', 'Palpebrale superius', 'close', 'Highest point of the upper lid margin (the lash line) above the pupil.'),
  L('lidL_r', 'Right Lower Eyelid', 'Palpebrale inferius', 'close', 'Lowest point of the lower lid margin below the pupil.'),
  L('endo_l', 'Left Inner Eye Corner', 'Endocanthion', 'close', 'Inner corner of your left eye (right side of the photo), at the corner of the eye opening.'),
  L('exo_l', 'Left Outer Eye Corner', 'Exocanthion', 'close', 'Outer corner of your left eye where the lash lines meet.'),
  L('lidU_l', 'Left Upper Eyelid', 'Palpebrale superius', 'close', 'Highest point of the upper lid margin above the pupil.'),
  L('lidL_l', 'Left Lower Eyelid', 'Palpebrale inferius', 'close', 'Lowest point of the lower lid margin below the pupil.'),
  // Brows
  L('brI_r', 'Right Brow Head', 'Medial brow', 'close', 'Inner start of the eyebrow, centred between its top and bottom edge.'),
  L('brP_r', 'Right Brow Peak', 'Brow apex', 'close', 'Highest point of the brow arch, centred in the brow’s thickness.'),
  L('brT_r', 'Right Brow Tail', 'Lateral brow', 'close', 'Outer end of the eyebrow where the hairs stop.'),
  L('brI_l', 'Left Brow Head', 'Medial brow', 'close', 'Inner start of the left eyebrow, centred in its thickness.'),
  L('brP_l', 'Left Brow Peak', 'Brow apex', 'close', 'Highest point of the left brow arch.'),
  L('brT_l', 'Left Brow Tail', 'Lateral brow', 'close', 'Outer end of the left eyebrow.'),
  // Midline upper
  L('trichion', 'Hairline', 'Trichion', 'wide', 'Where the forehead skin meets the hairline on the centre line of the face. If hair covers the forehead, estimate where the natural hairline would be.'),
  L('glabella', 'Brow Centre', 'Glabella', 'medium', 'Smooth area between the eyebrows, on the line joining the brow heads.'),
  L('nasion', 'Nose Bridge Root', 'Soft‑tissue nasion', 'medium', 'Deepest point of the nose bridge, usually level with the upper eyelid creases.'),
  // Nose
  L('bridge_r', 'Right Nose Bridge', 'Nasal dorsum (lateral)', 'medium', 'Edge of the nose bridge halfway between the inner eye corners and the nose tip: the shading line where the bridge meets the side wall of the nose, about one third of the way from the centre line to the inner eye corner.'),
  L('bridge_l', 'Left Nose Bridge', 'Nasal dorsum (lateral)', 'medium', 'Edge of the nose bridge on your left, at the same height and the same distance from the centre line as the right one.'),
  L('ala_r', 'Right Nose Side', 'Alare', 'medium', 'Widest point of the nostril wing on your right (left of the photo), on the curved crease where the wing meets the cheek.'),
  L('ala_l', 'Left Nose Side', 'Alare', 'medium', 'Widest point of the nostril wing on your left, on the crease where the wing meets the cheek.'),
  L('prn', 'Nose Tip', 'Pronasale', 'medium', 'Centre of the nose tip on the face’s centre line, just above the nostrils. Only its left–right position is measured.'),
  L('sn', 'Nose Base', 'Subnasale', 'medium', 'Where the bottom of the nose (columella) meets the upper lip.'),
  // Mouth
  L('ch_r', 'Right Mouth Corner', 'Cheilion', 'close', 'Outer corner of the mouth where the lips meet.'),
  L('ch_l', 'Left Mouth Corner', 'Cheilion', 'close', 'Outer corner of the mouth on your left.'),
  L('cupid_r', "Right Cupid's Bow", 'Crista philtri', 'close', "Peak of the upper lip's cupid's bow on your right."),
  L('cupid_l', "Left Cupid's Bow", 'Crista philtri', 'close', "Peak of the upper lip's cupid's bow on your left."),
  L('ls', 'Upper Lip Centre', 'Labrale superius', 'close', 'Centre of the upper lip border, in the dip between the cupid’s bow peaks.'),
  L('sto', 'Mouth Centre', 'Stomion', 'close', 'Where the upper and lower lip meet on the centre line.'),
  L('li', 'Lower Lip Centre', 'Labrale inferius', 'close', 'Lowest point of the lower lip border on the centre line.'),
  // Contour
  L('temple_r', 'Right Temple', 'Frontotemporale', 'wide', 'Side edge of the forehead at the temple, a little more than halfway up from the brows to the hairline, where the forehead turns to the side of the head. If hair covers it, estimate where the skin edge runs.'),
  L('temple_l', 'Left Temple', 'Frontotemporale', 'wide', 'Edge of the forehead at the temple on your left.'),
  L('earTop_r', 'Right Ear Root', 'Otobasion superius', 'wide', 'Where the top of your right ear (left of the photo) joins the side of the head, usually level with the brow. If hair covers it, estimate.'),
  L('ear_r', 'Right Ear Edge', 'Helix (most lateral)', 'wide', 'The point of the right ear that sticks out the farthest sideways.'),
  L('earTop_l', 'Left Ear Root', 'Otobasion superius', 'wide', 'Where the top of your left ear joins the side of the head.'),
  L('ear_l', 'Left Ear Edge', 'Helix (most lateral)', 'wide', 'The point of the left ear that sticks out the farthest sideways.'),
  L('zy_r', 'Right Cheekbone', 'Zygion', 'wide', 'Widest point of the face across the cheekbones, on the outer skin contour about level with the lower eyelids. Ignore hair hanging over the face.'),
  L('zy_l', 'Left Cheekbone', 'Zygion', 'wide', 'Widest point of the face across the cheekbones on your left.'),
  L('cheek_r', 'Right Lower Cheek', 'Buccal contour', 'wide', 'Outer skin contour level with the mouth corners. If a strand of hair lies over the edge, click the skin edge under it.'),
  L('cheek_l', 'Left Lower Cheek', 'Buccal contour', 'wide', 'Outer face contour level with the mouth corners on your left.'),
  L('go_r', 'Right Jaw Angle', 'Gonion', 'wide', 'Corner of the jaw on the outer contour: where the side of the face stops slanting inward and the jawline turns towards the chin.'),
  L('go_l', 'Left Jaw Angle', 'Gonion', 'wide', 'Corner of the jaw on your left.'),
  L('chin_r', 'Right Chin Edge', 'Chin lateral', 'medium', 'Where the chin’s curve starts on your right; the outer edge of the chin pad.'),
  L('chin_l', 'Left Chin Edge', 'Chin lateral', 'medium', 'Outer edge of the chin pad on your left.'),
  L('me', 'Chin Bottom', 'Menton', 'medium', 'Lowest point of the chin on the centre line, where the lit chin meets the shadow underneath it.'),
  L('neck_r', 'Right Neck Side', 'Neck (lateral)', 'wide', 'Outer edge of the neck on your right at its narrowest point, below the jaw and above the collar.'),
  L('neck_l', 'Left Neck Side', 'Neck (lateral)', 'wide', 'Outer edge of the neck on your left, level with the right neck point.'),
];

export const SIDE = [
  L('tr', 'Hairline', 'Trichion', 'wide', 'Where the forehead skin meets the hairline on the profile outline. If bangs cover the forehead, estimate it by continuing the forehead’s curve up under the hair.'),
  L('fh', 'Mid Forehead', 'Forehead (metopion)', 'wide', 'Point on the forehead outline halfway between the hairline and the brow ridge (estimate under hair if needed).'),
  L('g', 'Brow Ridge', 'Glabella', 'medium', 'Most forward point of the forehead at eyebrow height, on the profile outline.'),
  L('n', 'Nose Bridge Root', 'Soft‑tissue nasion', 'medium', 'Deepest point of the curve between forehead and nose.'),
  L('st', 'Above Nose Tip', 'Supratip', 'close', 'Point on the nose outline just above the tip, where the bridge line meets the rounded tip — about one eighth of the nose length above the tip.'),
  L('prn', 'Nose Tip', 'Pronasale', 'medium', 'Most forward point of the nose.'),
  L('it', 'Below Nose Tip', 'Infratip', 'close', 'Point on the underside of the nose just below the tip, where the rounded tip turns into the columella — about one tenth of the nose length from the tip.'),
  L('cm', 'Columella', 'Columella tangent', 'close', 'Middle of the underside of the nose, between the tip and the base.'),
  L('sn', 'Nose Base', 'Subnasale', 'close', 'Where the underside of the nose meets the upper lip, on the profile outline.'),
  L('ac', 'Nostril Base', 'Subalare', 'close', 'Bottom of the nostril wing where it joins the upper lip: the lowest point of the curved crease around the wing.'),
  L('ls', 'Upper Lip', 'Labrale superius', 'close', 'Most forward point of the upper lip.'),
  L('sto', 'Mouth Junction', 'Stomion', 'close', 'Where the lips meet, on the profile outline (the notch between upper and lower lip).'),
  L('li', 'Lower Lip', 'Labrale inferius', 'close', 'Most forward point of the lower lip.'),
  L('sm', 'Lip–Chin Fold', 'Mentolabial sulcus', 'close', 'Deepest point of the curve between the lower lip and the chin.'),
  L('pog', 'Chin Point', 'Soft‑tissue pogonion', 'medium', 'Most forward point of the chin.'),
  L('me', 'Chin Bottom', 'Menton', 'medium', 'Lowest point of the chin outline.'),
  L('c', 'Neck–Chin Point', 'Cervical point', 'wide', 'Deepest point where the underside of the chin turns into the neck.'),
  L('neck', 'Front of Neck', 'Anterior neck', 'wide', 'A point on the front of the neck about a thumb’s width above the collar, used to draw the neck line.'),
  L('go', 'Jaw Angle', 'Gonion', 'wide', 'Corner of the jaw, where the back edge of the jaw meets the lower jawline. Usually below the earlobe and slightly in front of it; follow the shadow under the jaw back until it turns upward.'),
  L('ramus', 'Ear Notch', 'Intertragic notch / ramus top', 'wide', 'Bottom of the small flap in front of the ear canal (tragus), where the front of the ear meets the cheek. The back edge of the jaw runs down from here to the jaw angle.'),
  L('exs', 'Outer Eye Corner', 'Exocanthion (profile)', 'close', 'Back corner of the eye opening seen from the side, where the upper and lower eyelids meet.'),
  L('cornea', 'Eye Front', 'Corneal apex', 'close', 'Most forward point of the eyeball (front of the iris / cornea) seen from the side. Not the eyelashes or the skin in front of the eye.'),
  L('tragus', 'Ear Canal', 'Tragion / porion', 'medium', 'The notch just above the small flap in front of the ear canal (tragus).'),
  L('or', 'Under‑Eye Rim', 'Orbitale', 'medium', 'Lowest point of the bony eye socket rim, about a finger width below the lower eyelid and slightly behind the front of the eye.'),
];

// Reference positions (pixels in assets/ref-front.jpg and assets/ref-side.jpg, 767×1024)
export const REF = {
  // Placed by hand on 4–14× zoomed crops (iris fitted from the limbus, outlines traced from pixel edges).
  // Points hidden by hair (hairline, temples, ear roots, brow tails, profile forehead) are anatomical estimates.
  front: {
    pupil_r: [319.4, 382.4], pupil_l: [450.8, 380.2],
    endo_r: [347, 390], exo_r: [291, 385.5], lidU_r: [316.5, 377.5], lidL_r: [318, 394],
    endo_l: [423.3, 388.9], exo_l: [478.5, 382], lidU_l: [453.5, 376], lidL_l: [452.8, 390.8],
    brI_r: [352.5, 346.5], brP_r: [299, 339.5], brT_r: [266, 354],
    brI_l: [414, 345.5], brP_l: [467, 334.5], brT_l: [500, 348],
    trichion: [383, 251], glabella: [385, 345], nasion: [385, 372],
    bridge_r: [366.5, 417], bridge_l: [405.5, 417], ala_r: [344, 458], ala_l: [426, 458],
    prn: [386, 444], sn: [386, 469.5],
    ch_r: [336, 517], ch_l: [435.5, 516], cupid_r: [372.5, 490.8], cupid_l: [399, 491.2],
    ls: [386, 494.5], sto: [386, 511.5], li: [386, 535.5],
    temple_r: [264, 305], temple_l: [506, 303],
    earTop_r: [231, 363], ear_r: [209, 432], earTop_l: [537, 360], ear_l: [563, 437],
    zy_r: [246, 400], zy_l: [523, 399], cheek_r: [255, 517], cheek_l: [514, 516],
    go_r: [270, 553], go_l: [499, 551], chin_r: [341, 600.5], chin_l: [431, 598], me: [386, 604],
    neck_r: [270, 630], neck_l: [497, 630],
  },

  side: {
    tr: [544, 280], fh: [560, 322], g: [575, 364], n: [566, 384],
    st: [608.5, 445.5], prn: [612.5, 455], it: [609.5, 463], cm: [602, 471], sn: [588, 478.5], ac: [573.5, 477],
    ls: [598.5, 504], sto: [588, 520], li: [596.5, 534], sm: [583.5, 554],
    pog: [588.5, 574], me: [561, 604.5], c: [483, 607.5], neck: [468.5, 660],
    go: [420, 550], ramus: [383, 466], exs: [527.5, 391], cornea: [550, 392], tragus: [373, 446.5], or: [546, 413],
  },
};

// Lines drawn between landmarks (for review overlays, diagrams and the analysis scan)
export const LINKS = {
  front: [
    ['exo_r', 'lidU_r'], ['lidU_r', 'endo_r'], ['endo_r', 'lidL_r'], ['lidL_r', 'exo_r'],
    ['exo_l', 'lidU_l'], ['lidU_l', 'endo_l'], ['endo_l', 'lidL_l'], ['lidL_l', 'exo_l'],
    ['brI_r', 'brP_r'], ['brP_r', 'brT_r'], ['brI_l', 'brP_l'], ['brP_l', 'brT_l'],
    ['trichion', 'glabella'], ['glabella', 'nasion'], ['nasion', 'prn'],
    ['ala_r', 'sn'], ['sn', 'ala_l'], ['ala_r', 'prn'], ['prn', 'ala_l'],
    ['ch_r', 'cupid_r'], ['cupid_r', 'ls'], ['ls', 'cupid_l'], ['cupid_l', 'ch_l'],
    ['ch_r', 'li'], ['li', 'ch_l'], ['ch_r', 'sto'], ['sto', 'ch_l'],
    ['bridge_r', 'ala_r'], ['bridge_l', 'ala_l'], ['earTop_r', 'ear_r'], ['earTop_l', 'ear_l'], ['neck_r', 'go_r'], ['neck_l', 'go_l'],
    ['temple_r', 'zy_r'], ['zy_r', 'cheek_r'], ['cheek_r', 'go_r'], ['go_r', 'chin_r'], ['chin_r', 'me'],
    ['me', 'chin_l'], ['chin_l', 'go_l'], ['go_l', 'cheek_l'], ['cheek_l', 'zy_l'], ['zy_l', 'temple_l'],
  ],
  side: [
    ['tr', 'fh'], ['fh', 'g'], ['g', 'n'], ['tragus', 'or'], ['n', 'st'], ['st', 'prn'], ['prn', 'it'], ['it', 'cm'], ['cm', 'sn'], ['sn', 'ls'], ['ls', 'sto'],
    ['sto', 'li'], ['li', 'sm'], ['sm', 'pog'], ['pog', 'me'], ['me', 'c'], ['c', 'neck'],
    ['ramus', 'go'], ['go', 'me'], ['ac', 'sn'], ['exs', 'cornea'],
  ],
};

export const DEFS = { front: FRONT, side: SIDE };
export const DEF_BY_ID = {
  front: Object.fromEntries(FRONT.map((d) => [d.id, d])),
  side: Object.fromEntries(SIDE.map((d) => [d.id, d])),
};

export function refPoints(view) {
  const out = {};
  for (const [k, v] of Object.entries(REF[view])) out[k] = { x: v[0], y: v[1] };
  return out;
}
