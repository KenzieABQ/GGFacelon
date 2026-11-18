// GGFacelon — app state and routing.
import { listScans, saveScan, deleteScan, prefs } from './store.js';
import { analyze, percentile } from './metrics.js';
import { measureAppearance, APPEARANCE_VERSION } from './appearance.js';
import { loadImage } from './img.js';
import { mountFlow } from './ui/flow.js';
import { mountDashboard } from './ui/dashboard.js';
import { loadDetector } from './detect.js';

const root = document.getElementById('app');

export const app = {
  scans: [],
  cleanup: null,
  imgCache: new Map(),
  resCache: new Map(),

  async img(url) {
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
    const fit = this.prefs.get('anchorFit', null);
    if (!fit) return base;
    const key = scan.id + ':' + (scan.updated || scan.created) + ':' + fit.a + ':' + fit.b;
    if (!this.resCache.has(key)) {
      const adj = (x) => Math.max(0, Math.min(9.99, fit.a + fit.b * x));
      const pillars = {};
      for (const k in base.pillars) pillars[k] = { ...base.pillars[k], score: adj(base.pillars[k].score) };
      const overall = adj(base.overall);
      this.resCache.set(key, { ...base, pillars, overall, percentile: percentile(overall) });
    }
    return this.resCache.get(key);
  },
  scan(id) { return this.scans.find((s) => s.id === id); },
  // Photo measurements (brows, eye openness, lips, hairline) for a scan; computed once and saved with it.
  // Older scans get them the first time they're opened. Resolves true when they were (re)computed.
  lookPending: new Map(),
  ensureLook(scan) {
    if (scan.look && scan.look.ver === APPEARANCE_VERSION) return Promise.resolve(false);
    if (this.lookPending.has(scan.id)) return this.lookPending.get(scan.id);
    const p = (async () => {
      const [fi, si] = await Promise.all([this.img(scan.front.url), this.img(scan.side.url)]);
      scan.look = await measureAppearance(fi, scan.front.lm, si, scan.side.lm);
      await this.save(scan);
      return true;
    })().catch((e) => { console.warn('appearance failed', e); return false; }).finally(() => this.lookPending.delete(scan.id));
    this.lookPending.set(scan.id, p);
    return p;
  },

  show(mount, ...args) {
    if (this.cleanup) { try { this.cleanup(); } catch (e) { console.error(e); } }
    this.cleanup = null;
    root.innerHTML = '';
    root.scrollTop = 0;
    window.scrollTo(0, 0);
    this.cleanup = mount(root, ...args) || null;
  },
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
  async save(scan) {
    scan.updated = Date.now();
    await saveScan(scan);
    const i = this.scans.findIndex((s) => s.id === scan.id);
    if (i >= 0) this.scans[i] = scan; else this.scans.unshift(scan);
    this.scans.sort((a, b) => b.created - a.created);
  },
  async remove(id) {
    await deleteScan(id);
    this.scans = this.scans.filter((s) => s.id !== id);
  },
  prefs,
};
window.__ggf = app; // handy for debugging in the console

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'new') return app.show(mountFlow, app, { mode: 'new' });
  if (parts[0] === 'edit' && parts[1] && app.scan(parts[1])) return app.show(mountFlow, app, { mode: 'edit', scan: app.scan(parts[1]) });
  if (parts[0] === 'scan' && app.scan(parts[1])) {
    const s = app.scan(parts[1]), at = location.hash;
    // scans saved before photo measurements existed: measure once, then redraw the same page
    app.ensureLook(s).then((changed) => { if (changed && location.hash === at) route(); });
    return app.show(mountDashboard, app, { scanId: parts[1], tab: parts[2] || 'overview', sub: parts[3] });
  }
  if (parts[0] === 'methodology' || parts[0] === 'compare') {
    return app.show(mountDashboard, app, { scanId: app.scans[0]?.id, tab: parts[0] });
  }
  if (app.scans.length) return app.go(`#/scan/${app.scans[0].id}/overview`);
  return app.show(mountDashboard, app, { scanId: null, tab: 'empty' });
}

(async function boot() {
  try { app.scans = await listScans(); } catch (e) { console.warn('Storage unavailable', e); }
  window.addEventListener('hashchange', route);
  route();
  // Warm up the landmark model in the background so the first scan starts faster.
  setTimeout(() => loadDetector().catch(() => {}), 1200);
  // Older scans: add the photo measurements in the background, one at a time (the open scan goes first)
  setTimeout(async () => {
    let any = false;
    for (const s of [...app.scans]) any = (await app.ensureLook(s)) || any;
    if (any && /^#\/?scan\//.test(location.hash) === false) route();
  }, 2500);
})();
