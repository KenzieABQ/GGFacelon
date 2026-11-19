// Drawing landmarks, links and measurement overlays on a Stage.
import { LINKS } from '../landmarks.js';

export const COL = {
  pt: '#ff3b4f',
  ring: '#ffffff',
  line: 'rgba(255,255,255,0.72)',
  mint: '#5ee8b0',
  mintSoft: 'rgba(94,232,176,0.25)',
  dim: 'rgba(255,255,255,0.55)',
};

export function drawLinks(ctx, st, lm, view, { color = 'rgba(255,255,255,0.55)', width = 1, progress = 1 } = {}) {
  const links = LINKS[view];
  const n = Math.floor(links.length * progress);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [a, b] = links[i];
    if (!lm[a] || !lm[b]) continue;
    const p = st.toScreen(lm[a]), q = st.toScreen(lm[b]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawDot(ctx, p, { r = 4, fill = COL.pt, ring = COL.ring, ringW = 1.6, glow = false } = {}) {
  ctx.save();
  if (glow) { ctx.shadowColor = 'rgba(255,59,79,0.6)'; ctx.shadowBlur = 10; }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + ringW, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

export function drawPoints(ctx, st, lm, { r = 3.2, active = null, hover = null, only = null, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const k in lm) {
    if (only && !only.includes(k)) continue;
    const p = st.toScreen(lm[k]);
    if (p.x < -20 || p.y < -20 || p.x > st.w + 20 || p.y > st.h + 20) continue;
    const isA = k === active, isH = k === hover;
    drawDot(ctx, p, { r: isA ? r * 1.6 : isH ? r * 1.35 : r, glow: isA });
  }
  ctx.restore();
}

export function drawCrosshair(ctx, p, { size = 26, gap = 7, color = 'rgba(255,255,255,0.95)' } = {}) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  const seg = (x0, y0, x1, y1) => { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
  const path = () => {
    ctx.beginPath();
    seg(p.x - size, p.y, p.x - gap, p.y); seg(p.x + gap, p.y, p.x + size, p.y);
    seg(p.x, p.y - size, p.x, p.y - gap); seg(p.x, p.y + gap, p.x, p.y + size);
  };
  path(); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  path(); ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = COL.pt;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// ── measurement overlay ──
// prims are in the analysis frame; inv maps them back to image px.
// '#rrggbb' → 'rgba(r,g,b,a)'
export const withAlpha = (hex, a) => {
  const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
// color: the measurement's score colour, used for its lines, angle wedge, glow and value label
export function drawOverlay(ctx, st, prims, inv, { progress = 1, text = '', color = COL.mint } = {}) {
  const S = (p) => st.toScreen(inv(p));
  const glow = withAlpha(color, 0.6), wedge = withAlpha(color, 0.22);
  const e = (k) => Math.min(1, Math.max(0, (progress - k) / (1 - k || 1)));
  const lineP = e(0), labP = e(0.55);
  ctx.save();
  ctx.lineCap = 'round';
  let labelAt = null;
  for (const pr of prims) {
    if (pr.t === 'line') {
      const a = S(pr.a), b = S(pr.b);
      const bx = a.x + (b.x - a.x) * lineP, by = a.y + (b.y - a.y) * lineP;
      ctx.strokeStyle = pr.dim ? COL.dim : pr.dash ? 'rgba(255,255,255,0.6)' : color;
      ctx.lineWidth = pr.dim || pr.dash ? 1.1 : 2;
      ctx.setLineDash(pr.dash ? [5, 5] : []);
      if (!pr.dim && !pr.dash) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      if (pr.ticks && lineP > 0.98) {
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const nx = (-dy / L) * 5, ny = (dx / L) * 5;
        ctx.beginPath();
        ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(a.x + nx, a.y + ny);
        ctx.moveTo(b.x - nx, b.y - ny); ctx.lineTo(b.x + nx, b.y + ny);
        ctx.stroke();
      }
      if (pr.label) {
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        let nx = -dy / L, ny = dx / L;
        if (ny > 0.2 || (Math.abs(ny) <= 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
        labelAt = { x: (a.x + b.x) / 2 + nx * 16, y: (a.y + b.y) / 2 + ny * 16 };
      }
    } else if (pr.t === 'angle') {
      const a = S(pr.a), v = S(pr.v), b = S(pr.b);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = glow; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y); ctx.lineTo(v.x + (a.x - v.x) * lineP, v.y + (a.y - v.y) * lineP);
      ctx.moveTo(v.x, v.y); ctx.lineTo(v.x + (b.x - v.x) * lineP, v.y + (b.y - v.y) * lineP);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(b.y - v.y, b.x - v.x);
      let d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const r = Math.min(30, Math.hypot(a.x - v.x, a.y - v.y) * 0.4, Math.hypot(b.x - v.x, b.y - v.y) * 0.4);
      ctx.fillStyle = wedge;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.arc(v.x, v.y, r, a1, a1 + d * lineP, d < 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, a1, a1 + d * lineP, d < 0);
      ctx.stroke();
      if (pr.label) {
        const m = a1 + d / 2;
        labelAt = { x: v.x + Math.cos(m) * (r + 22), y: v.y + Math.sin(m) * (r + 22) };
      }
    } else if (pr.t === 'pt') {
      const p = S(pr.p);
      ctx.globalAlpha = lineP;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (pr.t === 'label') {
      const p = S(pr.p);
      labelAt = { x: p.x + (pr.dx || 0) * 30, y: p.y + (pr.dy || 0) * 22 };
    }
  }
  if (labelAt && text && labP > 0) {
    ctx.globalAlpha = labP;
    ctx.font = '600 13px Manrope, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 14;
    const x = Math.min(st.w - w / 2 - 6, Math.max(w / 2 + 6, labelAt.x)), y = Math.min(st.h - 16, Math.max(16, labelAt.y));
    ctx.fillStyle = 'rgba(8,12,14,0.78)';
    ctx.shadowColor = withAlpha(color, 0.35); ctx.shadowBlur = 12;
    roundRect(ctx, x - w / 2, y - 11, w, 22, 11);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = withAlpha(color, 0.45); ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Bounding box of landmarks
export function bbox(lm, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k in lm) {
    const p = lm[k];
    if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
  }
  const w = x1 - x0, h = y1 - y0;
  return { x0: x0 - w * pad, y0: y0 - h * pad, x1: x1 + w * pad, y1: y1 + h * pad, w, h };
}
