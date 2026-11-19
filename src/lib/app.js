'use client';
// App state: scans (IndexedDB), preferences, image and result caches. A tiny store with a React hook, so
// every screen re-renders when a scan is saved, edited or deleted.
import { useSyncExternalStore } from 'react';
import { listScans, saveScan, deleteScan, prefs } from './store.js';
import { analyze, percentile } from './engine/metrics.js';
import { loadImage } from './engine/img.js';

let version = 0;
const listeners = new Set();
const emit = () => { version++; listeners.forEach((l) => l()); };

export const app = {
  scans: [],
  loaded: false,
  imgCache: new Map(),
  resCache: new Map(),
  lookPending: new Map(),
  prefs,
  sample: false,

  async load() {
    if (this.loaded) return;
    try { this.scans = await listScans(); } catch (e) { console.warn('Storage unavailable', e); }
    this.loaded = true;
    emit();
    // older scans get the photo measurements in the background
    setTimeout(async () => { for (const s of [...this.scans]) await this.ensureLook(s); }, 2500);
  },
  img(url) {
    if (!this.imgCache.has(url)) this.imgCache.set(url, loadImage(url));
    return this.imgCache.get(url);
  },
  // Model result for a scan, before any user calibration
  baseResult(scan) {
    const key = scan.id + ':' + (scan.updated || scan.created);
    if (!this.resCache.has(key)) {
      this.resCache.set(key, analyze(scan.front.lm, scan.side.lm, {
        frontSize: { w: scan.front.w, h: scan.front.h },
        sideSize: { w: scan.side.w, h: scan.side.h },
        appearance: scan.look || null,
      }));
    }
    return this.resCache.get(key);
  },
  // Result shown in the app: the model result, adjusted by the user's known-score calibration if set
  result(scan) {
    const base = this.baseResult(scan);
    const fit = prefs.get('anchorFit', null);
    if (!fit) return base;
    const key = scan.id + ':' + (scan.updated || scan.created) + ':' + fit.a + ':' + fit.b;
    if (!this.resCache.has(key)) {
      const adj = (x) => Math.max(0, Math.min(9.99, fit.a + fit.b * x));
      const pillars = {};
      for (const k in base.pillars) pillars[k] = { ...base.pillars[k], score: adj(base.pillars[k].score) };
      const views = {};
      for (const k in base.views || {}) views[k] = { ...base.views[k], score: adj(base.views[k].score) };
      const overall = adj(base.overall);
      this.resCache.set(key, { ...base, pillars, views, overall, percentile: percentile(overall) });
    }
    return this.resCache.get(key);
  },
  scan(id) { return this.scans.find((s) => s.id === id); },
  async save(scan) {
    scan.updated = Date.now();
    await saveScan(scan);
    const i = this.scans.findIndex((s) => s.id === scan.id);
    if (i >= 0) this.scans[i] = scan; else this.scans.unshift(scan);
    this.scans.sort((a, b) => b.created - a.created);
    this.scans = [...this.scans];
    emit();
  },
  async remove(id) {
    await deleteScan(id);
    this.scans = this.scans.filter((s) => s.id !== id);
    emit();
  },
  // Photo measurements (brows, eye openness, lips, hairline), computed once and saved with the scan
  ensureLook(scan) {
    if (!scan) return Promise.resolve(false);
    if (this.lookPending.has(scan.id)) return this.lookPending.get(scan.id);
    const p = (async () => {
      const { measureAppearance, APPEARANCE_VERSION } = await import('./engine/appearance.js');
      if (scan.look && scan.look.ver === APPEARANCE_VERSION) return false;
      const [fi, si] = await Promise.all([this.img(scan.front.url), this.img(scan.side.url)]);
      scan.look = await measureAppearance(fi, scan.front.lm, si, scan.side.lm);
      await this.save(scan);
      return true;
    })().catch((e) => { console.warn('appearance failed', e); return false; }).finally(() => this.lookPending.delete(scan.id));
    this.lookPending.set(scan.id, p);
    return p;
  },
  touch: emit,
};

if (typeof window !== 'undefined') window.__ggf = app; // handy for debugging in the console

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
// Re-render on any store change; returns the app
export function useApp() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return app;
}
