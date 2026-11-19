// Canvas stage: draws an image with a camera (centre + scale) and lets screens paint on top.
import { easeInOut } from '../engine/geom.js';

export class Stage {
  constructor(host, img, { onDraw, bg = null, minScale = 0.05, maxScale = 40 } = {}) {
    this.host = host;
    this.img = img;
    this.onDraw = onDraw;
    this.bg = bg;
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.view = { cx: img.naturalWidth / 2, cy: img.naturalHeight / 2, s: 1 };
    this.w = 1; this.h = 1;
    this._raf = 0;
    this._anim = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }
  get iw() { return this.img.naturalWidth; }
  get ih() { return this.img.naturalHeight; }
  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const first = this.w === 1;
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    if (first || this.autoFit) this.view = this.fitView(this.fitPad ?? 0);
    if (this.onResize) this.onResize();
    this.render();
  }
  fitView(pad = 0, cover = false) {
    const s = cover ? Math.max(this.w / this.iw, this.h / this.ih) : Math.min((this.w - pad * 2) / this.iw, (this.h - pad * 2) / this.ih);
    return { cx: this.iw / 2, cy: this.ih / 2, s };
  }
  // View that shows an image-space rect
  rectView(x0, y0, x1, y1, pad = 0) {
    const s = Math.min((this.w - pad * 2) / Math.max(1, x1 - x0), (this.h - pad * 2) / Math.max(1, y1 - y0));
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s };
  }
  toScreen(p) {
    const v = this.view;
    return { x: (p.x - v.cx) * v.s + this.w / 2, y: (p.y - v.cy) * v.s + this.h / 2 };
  }
  toImage(p) {
    const v = this.view;
    return { x: (p.x - this.w / 2) / v.s + v.cx, y: (p.y - this.h / 2) / v.s + v.cy };
  }
  setView(v) {
    this._anim = null;
    this.view = { ...v, s: Math.min(this.maxScale, Math.max(this.minScale, v.s)) };
    this.render();
  }
  animateTo(v, ms = 420) {
    const from = { ...this.view }, to = { ...v, s: Math.min(this.maxScale, Math.max(this.minScale, v.s)) };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 0;
    const t0 = performance.now();
    this._anim = { t0, ms, from, to };
    const step = (now) => {
      if (!this._anim || this._anim.t0 !== t0) return;
      const t = ms ? Math.min(1, (now - t0) / ms) : 1;
      const e = easeInOut(t);
      // interpolate scale geometrically so zooms feel even
      const s = from.s * Math.pow(to.s / from.s, e);
      this.view = { cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, s };
      this.draw();
      if (t < 1) requestAnimationFrame(step); else this._anim = null;
    };
    requestAnimationFrame(step);
  }
  zoomAt(sp, factor) {
    const before = this.toImage(sp);
    const s = Math.min(this.maxScale, Math.max(this.minScale, this.view.s * factor));
    this.view.s = s;
    const after = this.toImage(sp);
    this.view.cx += before.x - after.x;
    this.view.cy += before.y - after.y;
    this.render();
  }
  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }
  draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.bg) { ctx.fillStyle = this.bg; ctx.fillRect(0, 0, this.w, this.h); }
    const v = this.view;
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(v.s, v.s);
    ctx.translate(-v.cx, -v.cy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = v.s > 2 ? 'medium' : 'high';
    ctx.drawImage(this.img, 0, 0);
    ctx.restore();
    if (this.onDraw) this.onDraw(ctx, this);
  }
  destroy() {
    this.ro.disconnect();
    this._anim = null;
    this.canvas.remove();
  }
}
