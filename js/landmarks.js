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
  L('bridge_r', 'Right Nose Bridge', 'Nasal dorsum (lateral)', 'medium', 'Side edge of the nose bridge halfway between the inner eye corners and the nose tip — where the bridge’s highlight turns into the side wall of the nose.'),
  L('bridge_l', 'Left Nose Bridge', 'Nasal dorsum (lateral)', 'medium', 'Side edge of the nose bridge on your left, at the same height as the right one.'),
  L('ala_r', 'Right Nose Side', 'Alare', 'medium', 'Widest point of the nostril wing on your right (left of the photo).'),
  L('ala_l', 'Left Nose Side', 'Alare', 'medium', 'Widest point of the nostril wing on your left.'),
  L('prn', 'Nose Tip', 'Pronasale', 'medium', 'Most forward point of the nose tip, usually the brightest highlight.'),
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
  L('temple_r', 'Right Temple', 'Frontotemporale', 'wide', 'Edge of the forehead at the temple, just above the outer end of the brow, where the forehead turns to the side of the head.'),
  L('temple_l', 'Left Temple', 'Frontotemporale', 'wide', 'Edge of the forehead at the temple on your left.'),
  L('earTop_r', 'Right Ear Root', 'Otobasion superius', 'wide', 'Where the top of your right ear (left of the photo) joins the side of the head.'),
  L('ear_r', 'Right Ear Edge', 'Helix (most lateral)', 'wide', 'The point of the right ear that sticks out the farthest sideways.'),
  L('earTop_l', 'Left Ear Root', 'Otobasion superius', 'wide', 'Where the top of your left ear joins the side of the head.'),
  L('ear_l', 'Left Ear Edge', 'Helix (most lateral)', 'wide', 'The point of the left ear that sticks out the farthest sideways.'),
  L('zy_r', 'Right Cheekbone', 'Zygion', 'wide', 'Widest point of the face across the cheekbones, on the outer face contour.'),
  L('zy_l', 'Left Cheekbone', 'Zygion', 'wide', 'Widest point of the face across the cheekbones on your left.'),
  L('cheek_r', 'Right Lower Cheek', 'Buccal contour', 'wide', 'Outer face contour level with the mouth corners.'),
  L('cheek_l', 'Left Lower Cheek', 'Buccal contour', 'wide', 'Outer face contour level with the mouth corners on your left.'),
  L('go_r', 'Right Jaw Angle', 'Gonion', 'wide', 'Corner of the jaw, where the side of the jaw turns into the jawline.'),
  L('go_l', 'Left Jaw Angle', 'Gonion', 'wide', 'Corner of the jaw on your left.'),
  L('chin_r', 'Right Chin Edge', 'Chin lateral', 'medium', 'Where the chin’s curve starts on your right; the outer edge of the chin pad.'),
  L('chin_l', 'Left Chin Edge', 'Chin lateral', 'medium', 'Outer edge of the chin pad on your left.'),
  L('me', 'Chin Bottom', 'Menton', 'medium', 'Lowest point of the chin on the centre line.'),
  L('neck_r', 'Right Neck Side', 'Neck (lateral)', 'wide', 'Outer edge of the neck on your right at its narrowest point, below the jaw.'),
  L('neck_l', 'Left Neck Side', 'Neck (lateral)', 'wide', 'Outer edge of the neck on your left, level with the right neck point.'),
];

export const SIDE = [
  L('tr', 'Hairline', 'Trichion', 'wide', 'Where the forehead skin meets the hairline on the profile outline.'),
  L('fh', 'Mid Forehead', 'Forehead (metopion)', 'wide', 'Point on the forehead outline halfway between the hairline and the brow ridge.'),
  L('g', 'Brow Ridge', 'Glabella', 'medium', 'Most forward point of the forehead between the brows.'),
  L('n', 'Nose Bridge Root', 'Soft‑tissue nasion', 'medium', 'Deepest point of the curve between forehead and nose.'),
  L('prn', 'Nose Tip', 'Pronasale', 'medium', 'Most forward point of the nose.'),
  L('cm', 'Columella', 'Columella tangent', 'close', 'Middle of the underside of the nose, between the tip and the base.'),
  L('sn', 'Nose Base', 'Subnasale', 'close', 'Where the underside of the nose meets the upper lip.'),
  L('ac', 'Nostril Crease', 'Alar curvature point', 'close', 'Back end of the nostril wing where it joins the cheek.'),
  L('ls', 'Upper Lip', 'Labrale superius', 'close', 'Most forward point of the upper lip.'),
  L('sto', 'Mouth Junction', 'Stomion', 'close', 'Where the lips meet.'),
  L('li', 'Lower Lip', 'Labrale inferius', 'close', 'Most forward point of the lower lip.'),
  L('sm', 'Lip–Chin Fold', 'Mentolabial sulcus', 'close', 'Deepest point of the curve between the lower lip and the chin.'),
  L('pog', 'Chin Point', 'Soft‑tissue pogonion', 'medium', 'Most forward point of the chin.'),
  L('me', 'Chin Bottom', 'Menton', 'medium', 'Lowest point of the chin outline.'),
  L('c', 'Neck–Chin Point', 'Cervical point', 'wide', 'Deepest point where the underside of the chin turns into the neck.'),
  L('neck', 'Front of Neck', 'Anterior neck', 'wide', 'A point on the front of the neck about a thumb’s width above the collar, used to draw the neck line.'),
  L('go', 'Jaw Angle', 'Gonion', 'wide', 'Corner of the jaw, where the back edge of the jaw meets the lower jawline.'),
  L('ramus', 'Jaw Joint', 'Condylion (approx.)', 'wide', 'Top of the back edge of the jaw, just in front of the ear canal, where the jaw hinges. You can feel it move when you open your mouth.'),
  L('cornea', 'Eye Front', 'Corneal apex', 'close', 'Most forward point of the eyeball (front of the cornea) seen from the side.'),
  L('tragus', 'Ear Canal', 'Tragion / porion', 'medium', 'The notch just above the small flap in front of the ear canal (tragus).'),
  L('or', 'Under‑Eye Rim', 'Orbitale', 'medium', 'Lowest point of the bony eye socket rim, about a finger width below the lower eyelid.'),
];

// Reference positions (pixels in assets/ref-front.jpg and assets/ref-side.jpg, 767×1024)
export const REF = {
  front: {
    pupil_r: [319.3, 383.1], pupil_l: [450.9, 381.1], endo_r: [347, 390.2], exo_r: [287, 386.0],
    lidU_r: [315.8, 376.5], lidL_r: [317.3, 393.1], endo_l: [423.3, 388.9], exo_l: [482, 382.8],
    lidU_l: [453.5, 374.1], lidL_l: [452.8, 390.8], brI_r: [354.4, 347.1], brP_r: [297.6, 339.6],
    brT_r: [267.6, 357.7], brI_l: [413.6, 345.4], brP_l: [469.5, 335.7], brT_l: [500.1, 353.1],
    glabella: [383.8, 340.1], nasion: [384.7, 374.2], bridge_r: [366, 417.7], bridge_l: [404.8, 417],
    ala_r: [344.5, 457.6], ala_l: [427.5, 456.4], prn: [385.7, 453.1], sn: [386.1, 469.1],
    ch_r: [334.5, 517.6], ch_l: [436.7, 516.3], cupid_r: [370.8, 490.3], cupid_l: [400.6, 489.9],
    ls: [385.6, 492.9], sto: [385.7, 511.5], li: [385.7, 535.8], temple_r: [261.6, 337.8],
    temple_l: [504.3, 333.5], zy_r: [241.8, 404.8], zy_l: [526.8, 399.7], cheek_r: [258.2, 517.6],
    cheek_l: [514.2, 516.3], go_r: [275.3, 555.8], go_l: [499.7, 550.7], chin_r: [341.6, 598.2],
    chin_l: [434, 596.8], me: [387.6, 604.7], ear_r: [209.8, 426.1], earTop_r: [232.2, 364.2],
    ear_l: [560.8, 425.1], earTop_l: [537, 359.6], neck_r: [270.6, 643.7], neck_l: [494.6, 643.7],
    trichion: [382.4, 262],
  },

  side: {
    tr: [566, 355], g: [569.5, 377], n: [566, 397.5], prn: [612, 450], cm: [598, 469], sn: [581, 474],
    ac: [568, 461], ls: [598, 504], sto: [578, 520], li: [596, 532.5], sm: [579.5, 552.5],
    pog: [587, 575], me: [562, 604], c: [483, 617.5], neck: [467, 660], go: [432, 562.5],
    ramus: [392, 456], tragus: [372, 447], or: [550, 412], fh: [568, 366], cornea: [561, 393],
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
    ['tr', 'fh'], ['fh', 'g'], ['g', 'n'], ['tragus', 'or'], ['n', 'prn'], ['prn', 'cm'], ['cm', 'sn'], ['sn', 'ls'], ['ls', 'sto'],
    ['sto', 'li'], ['li', 'sm'], ['sm', 'pog'], ['pog', 'me'], ['me', 'c'], ['c', 'neck'],
    ['ramus', 'go'], ['go', 'me'], ['ac', 'sn'],
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
