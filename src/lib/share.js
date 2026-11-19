// The shareable report card (1080×1350 PNG): dark, blurred-photo backdrop, soft glows, glass panels.
import { bbox } from './canvas/draw.js';
import { METRICS, PILLARS, rating, fmt, pctText } from './engine/metrics.js';

export async function renderShareCard(app, scan, res) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  await document.fonts?.ready;
  const font = (w, s) => `${w} ${s}px Manrope, system-ui, sans-serif`;
  const hex = (s) => (s >= 7 ? '#3ddc97' : s >= 5.5 ? '#a8d84e' : s >= 4 ? '#f5b544' : '#ff6b5e');
  const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const [fi, si] = await Promise.all([app.img(scan.front.url), app.img(scan.side.url)]);

  // backdrop: the front photo, heavily blurred, under a dark wash and two soft glows
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, W, H);
  {
    const k = Math.max(W / fi.naturalWidth, H / fi.naturalHeight) * 1.15;
    ctx.save(); ctx.filter = 'blur(70px) saturate(1.25)'; ctx.globalAlpha = 0.55;
    ctx.drawImage(fi, (W - fi.naturalWidth * k) / 2, (H - fi.naturalHeight * k) / 2, fi.naturalWidth * k, fi.naturalHeight * k);
    ctx.restore();
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, 'rgba(5,7,10,0.55)'); wash.addColorStop(0.45, 'rgba(5,7,10,0.72)'); wash.addColorStop(1, 'rgba(5,7,10,0.94)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
    const glow = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    glow(250, 830, 420, rgba(hex(res.overall), 0.16));
    glow(980, 120, 380, 'rgba(110,140,255,0.10)');
  }
  const glass = (x, y, w, h, r = 30) => {
    ctx.save(); rr(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  };
  // header
  ctx.fillStyle = '#fff'; ctx.font = font(800, 32); ctx.fillText('GGFacelon', 70, 88);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = font(500, 22); ctx.textAlign = 'right';
  ctx.fillText(new Date(scan.created).toLocaleDateString([], { dateStyle: 'long' }), W - 70, 88); ctx.textAlign = 'left';

  // photos with their profile scores
  const ph = (img, view, x) => {
    const b = bbox(scan[view].lm, 0.16), w = 455, h = 500;
    const sz = Math.max(b.x1 - b.x0, ((b.y1 - b.y0) * w) / h);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    ctx.save(); rr(ctx, x, 130, w, h, 30); ctx.clip();
    ctx.drawImage(img, cx - sz / 2, cy - (sz * h) / w / 2, sz, (sz * h) / w, x, 130, w, h);
    const g = ctx.createLinearGradient(0, 130 + h * 0.55, 0, 130 + h); g.addColorStop(0, 'rgba(5,7,10,0)'); g.addColorStop(1, 'rgba(5,7,10,0.85)');
    ctx.fillStyle = g; ctx.fillRect(x, 130, w, h);
    ctx.restore();
    ctx.save(); rr(ctx, x, 130, w, h, 30); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    const sc = res.views?.[view]?.score;
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = font(700, 17); ctx.fillText(view === 'front' ? 'FRONT PROFILE' : 'SIDE PROFILE', x + 28, 130 + h - 70);
    if (Number.isFinite(sc)) {
      ctx.save(); ctx.shadowColor = rgba(hex(sc), 0.55); ctx.shadowBlur = 24;
      ctx.fillStyle = hex(sc); ctx.font = font(800, 46); ctx.fillText(sc.toFixed(2), x + 26, 130 + h - 22); ctx.restore();
    }
  };
  ph(fi, 'front', 70); ph(si, 'side', 555);

  // overall
  glass(70, 665, 940, 330);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = font(700, 19); ctx.fillText('OVERALL SCORE', 116, 728);
  ctx.save(); ctx.shadowColor = rgba(hex(res.overall), 0.5); ctx.shadowBlur = 48;
  ctx.fillStyle = hex(res.overall); ctx.font = font(800, 132); ctx.fillText(res.overall.toFixed(2), 106, 866); ctx.restore();
  const sw = ctx.measureText(res.overall.toFixed(2)).width;
  ctx.font = font(800, 132); const sw2 = ctx.measureText(res.overall.toFixed(2)).width;
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = font(600, 40); ctx.fillText('/10', 116 + Math.max(sw, sw2), 866);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 30); ctx.fillText(rating(res.overall), 116, 920);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = font(500, 22); ctx.fillText(`Higher than ${pctText(res.percentile)}% of men`, 116, 956);
  PILLARS.forEach((p, i) => {
    const y = 728 + i * 64, s = res.pillars[p.id].score, x = 600, bw = 300;
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.font = font(600, 22); ctx.fillText(p.name, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.09)'; rr(ctx, x, y + 14, bw, 9, 4.5); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + bw, 0); g.addColorStop(0, rgba(hex(s), 0.55)); g.addColorStop(1, hex(s));
    ctx.save(); ctx.shadowColor = rgba(hex(s), 0.5); ctx.shadowBlur = 12; ctx.fillStyle = g; rr(ctx, x, y + 14, Math.max(9, (bw * s) / 10), 9, 4.5); ctx.fill(); ctx.restore();
    ctx.fillStyle = hex(s); ctx.font = font(800, 24); ctx.textAlign = 'right'; ctx.fillText(s.toFixed(2), 970, y + 2); ctx.textAlign = 'left';
  });

  // strongest measurements
  const top = METRICS.filter((m) => m.hm || m.look).map((m) => ({ m, ...res.values[m.id] })).filter((t) => Number.isFinite(t.v) && t.s >= 9)
    .sort((a, b) => b.m.w - a.m.w).slice(0, 4);
  glass(70, 1025, 940, 225);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = font(700, 19); ctx.fillText('STRONGEST', 116, 1080);
  top.forEach((t, i) => {
    const x = 116 + (i % 2) * 450, y = 1130 + Math.floor(i / 2) * 64;
    ctx.fillStyle = '#fff'; ctx.font = font(700, 25); ctx.fillText(t.m.name.length > 26 ? t.m.name.slice(0, 25) + '…' : t.m.name, x, y);
    ctx.fillStyle = hex(t.s); ctx.font = font(600, 21); ctx.fillText(`${fmt(t.m, t.v)} · ideal`, x, y + 30);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = font(500, 19); ctx.textAlign = 'center';
  ctx.fillText(`${METRICS.length} measurements · analysed on‑device · ggfacelon`, W / 2, 1302);
  ctx.textAlign = 'left';

  return c.toDataURL('image/png');
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
