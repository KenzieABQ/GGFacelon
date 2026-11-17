// GGFacelon — app state and routing.
import { listScans, saveScan, deleteScan, prefs } from './store.js';
import { analyze } from './metrics.js';
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
  result(scan) {
    const key = scan.id + ':' + (scan.updated || scan.created);
    if (!this.resCache.has(key)) {
      this.resCache.set(key, analyze(scan.front.lm, scan.side.lm, {
        frontSize: { w: scan.front.w, h: scan.front.h },
        sideSize: { w: scan.side.w, h: scan.side.h },
      }));
    }
    return this.resCache.get(key);
  },
  scan(id) { return this.scans.find((s) => s.id === id); },

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
})();
