// Small 2D geometry helpers. Points are {x, y} in image pixels, y pointing down.

export const P = (x, y) => ({ x, y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const len = (v) => Math.hypot(v.x, v.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const avg = (pts) => {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
};
export const DEG = 180 / Math.PI;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Interior angle at vertex v (degrees, 0..180)
export function angleAt(a, v, b) {
  const u = sub(a, v), w = sub(b, v);
  const c = (u.x * w.x + u.y * w.y) / ((len(u) * len(w)) || 1);
  return Math.acos(clamp(c, -1, 1)) * DEG;
}

// Acute angle between two directions (degrees, 0..90)
export function angleBetween(u, w) {
  const c = Math.abs(u.x * w.x + u.y * w.y) / ((len(u) * len(w)) || 1);
  return Math.acos(clamp(c, -1, 1)) * DEG;
}

export function rotate(p, rad, o = { x: 0, y: 0 }) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const dx = p.x - o.x, dy = p.y - o.y;
  return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
}

// Map every point of a landmark object through fn
export function mapPts(lm, fn) {
  const out = {};
  for (const k in lm) out[k] = fn(lm[k], k);
  return out;
}

// Least-squares similarity transform (scale, rotation, translation) from src -> dst pairs
export function fitSimilarity(src, dst) {
  const n = src.length;
  if (n === 0) return (p) => p;
  const cs = avg(src), cd = avg(dst);
  if (n === 1) return (p) => add(sub(p, cs), cd);
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const s = sub(src[i], cs), t = sub(dst[i], cd);
    a += s.x * t.x + s.y * t.y;
    b += s.x * t.y - s.y * t.x;
    d += s.x * s.x + s.y * s.y;
  }
  const sc = d ? a / d : 1, sn = d ? b / d : 0;
  return (p) => {
    const q = sub(p, cs);
    return { x: cd.x + sc * q.x - sn * q.y, y: cd.y + sn * q.x + sc * q.y };
  };
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
