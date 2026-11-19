'use client';
// Calibration & data: tune the overall scale with known scores (e.g. from FaceIQ) and export landmarks.
import { useState } from 'react';
import { app } from '@/lib/app.js';
import { Icon, openModal, toast } from './ui.jsx';
import { FaceThumb } from './Shell.jsx';

// Least-squares fit target ≈ a + b · model; one anchor → shift only.
export function fitAnchors(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n, my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let b = 1;
  if (n >= 2) {
    const sxx = pairs.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    const sxy = pairs.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    b = sxx > 1e-6 ? sxy / sxx : 1;
    b = Math.max(0.4, Math.min(2.5, b)); // keep the scale sane with few or noisy anchors
  }
  const a = my - b * mx;
  return { a: +a.toFixed(4), b: +b.toFixed(4), n };
}

function CalibrationBody({ close }) {
  const [rows, setRows] = useState(() => app.scans.map((s) => ({ id: s.id, label: s.label || '', target: s.target ?? '' })));
  const fit0 = app.prefs.get('anchorFit', null);
  const [status, setStatus] = useState(fit0 ? `Active: shown = ${fit0.a.toFixed(2)} + ${fit0.b.toFixed(2)} × model, from ${fit0.n} known score${fit0.n > 1 ? 's' : ''}.` : 'No calibration active — using the built‑in population scale.');
  const set = (id, k, v) => setRows((r) => r.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const collect = async () => {
    for (const r of rows) {
      const s = app.scan(r.id);
      const t = parseFloat(r.target);
      const target = Number.isFinite(t) && t >= 0 && t <= 10 ? +t.toFixed(2) : undefined;
      const label = r.label.trim();
      if ((s.label || '') !== label || s.target !== target) { s.label = label || undefined; s.target = target; await app.save(s); }
    }
  };
  const apply = async () => {
    await collect();
    const pairs = app.scans.filter((s) => Number.isFinite(s.target)).map((s) => ({ x: app.baseResult(s).overall, y: s.target }));
    const f = fitAnchors(pairs);
    app.prefs.set('anchorFit', f);
    if (!f) setStatus('No known scores entered — using the built‑in population scale.');
    else {
      const err = (fn) => Math.sqrt(pairs.reduce((s, p) => s + (fn(p.x) - p.y) ** 2, 0) / pairs.length);
      setStatus(`Applied: shown = ${f.a.toFixed(2)} + ${f.b.toFixed(2)} × model, from ${f.n} known score${f.n > 1 ? 's' : ''}. Average error ${err((x) => x).toFixed(2)} → ${err((x) => f.a + f.b * x).toFixed(2)}.`);
    }
    app.resCache.clear(); app.touch();
    toast('Calibration saved');
  };
  const reset = () => { app.prefs.set('anchorFit', null); app.resCache.clear(); app.touch(); setStatus('Calibration cleared — using the built‑in population scale.'); toast('Calibration reset'); };
  return (
    <>
      <h3 className="m-title">Calibration &amp; data</h3>
      <p className="m-body">If you know the real overall score for some faces — for example FaceIQ results such as 7.77 or 7.03 — enter them here. GGFacelon fits its overall and pillar scale to match (one known score shifts the scale; two or more also stretch it). Leave blank for faces you don’t have a score for.</p>
      <div className="cal-list">
        {!rows.length && <p className="fine">No scans yet.</p>}
        {rows.map((r) => {
          const s = app.scan(r.id);
          return (
            <div className="cal-row" key={r.id}>
              <FaceThumb scan={s} size={80} />
              <div className="cal-meta"><input className="cal-label" type="text" placeholder="Name (optional)" value={r.label} maxLength={40} onChange={(e) => set(r.id, 'label', e.target.value)} />
                <span>{new Date(s.created).toLocaleDateString([], { dateStyle: 'medium' })} · model {app.baseResult(s).overall.toFixed(2)}</span></div>
              <input className="cal-target" type="number" min="0" max="10" step="0.01" placeholder="Known" value={r.target} aria-label="Known overall score" onChange={(e) => set(r.id, 'target', e.target.value)} />
            </div>
          );
        })}
      </div>
      <div className="cal-status">{status}</div>
      <div className="m-actions wrap">
        <button className="btn ghost" onClick={async () => { await collect(); exportJSON(); }}><Icon name="download" size={15} /> Export landmarks (JSON)</button>
        <span className="grow" />
        <button className="btn ghost" onClick={reset}>Reset</button>
        <button className="btn dark" onClick={apply}>Save &amp; apply</button>
      </div>
      <p className="fine">The export contains landmark coordinates, image sizes, names and scores — no photos.</p>
    </>
  );
}

export const openCalibration = () => openModal((close) => <CalibrationBody close={close} />, { cls: 'cal-modal' });

function exportJSON() {
  const round = (lm) => Object.fromEntries(Object.entries(lm).map(([k, p]) => [k, [+p.x.toFixed(1), +p.y.toFixed(1)]]));
  const data = {
    app: 'GGFacelon', exported: new Date().toISOString(), calibration: app.prefs.get('anchorFit', null),
    scans: app.scans.map((s) => {
      const r = app.baseResult(s);
      return {
        id: s.id, created: new Date(s.created).toISOString(), label: s.label || null, target: s.target ?? null,
        front: { w: s.front.w, h: s.front.h, source: s.front.source || null, lm: round(s.front.lm) },
        side: { w: s.side.w, h: s.side.h, source: s.side.source || null, lm: round(s.side.lm) },
        model: { overall: +r.overall.toFixed(3), pillars: Object.fromEntries(Object.entries(r.pillars).map(([k, p]) => [k, +p.score.toFixed(3)])) },
      };
    }),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ggfacelon-landmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Exported ${data.scans.length} scan${data.scans.length === 1 ? '' : 's'}`);
}
