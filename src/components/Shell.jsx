'use client';
// Dashboard frame: sidebar (profile, history, links) + top tabs + page area.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useApp, app } from '@/lib/app.js';
import { scoreColor } from '@/lib/engine/metrics.js';
import { bbox } from '@/lib/canvas/draw.js';
import { Icon, relTime, confirmDialog, toast } from './ui.jsx';
import { openCalibration } from './Calibration.jsx';
import { photoGuide } from './PhotoGuide.jsx';
import { openShare } from './Share.jsx';
import { scanUrl } from '@/lib/routes.js';

export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'plan', label: 'Plan' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'compare', label: 'Compare' },
];

// Face crop for thumbnails
export function FaceThumb({ scan, size = 104, view = 'front', pad = 0.25, className }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    if (!scan || !ref.current) return;
    app.img(scan[view].url).then((img) => {
      if (!alive || !ref.current) return;
      const b = bbox(scan[view].lm);
      const sz = Math.max(b.w, b.h) * (1 + pad);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const ctx = ref.current.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz, 0, 0, size, size);
    });
    return () => { alive = false; };
  }, [scan?.id, scan?.updated, scan?.[view]?.url, view, size, pad]);
  return <canvas ref={ref} width={size} height={size} className={className} />;
}

export default function Shell({ scan, tab, children }) {
  const a = useApp();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setCollapsed(app.prefs.get('sideCollapsed', false)); }, []);
  const res = scan ? a.result(scan) : null;

  const del = async () => {
    if (!(await confirmDialog('Delete this scan?', 'The photos, landmarks and scores for this scan will be permanently removed from this browser.', 'Delete', true))) return;
    await app.remove(scan.id);
    toast('Scan deleted');
    router.push(app.scans[0] ? scanUrl(app.scans[0].id) : '/');
  };
  const wipe = async () => {
    if (!app.scans.length) return toast('Nothing to delete');
    if (!(await confirmDialog('Delete all data?', `This permanently removes all ${app.scans.length} scans and photos from this browser. It can’t be undone.`, 'Delete everything', true))) return;
    for (const s of [...app.scans]) await app.remove(s.id);
    app.prefs.set('consent', null);
    router.push('/');
  };
  const toggle = () => { const c = !collapsed; setCollapsed(c); app.prefs.set('sideCollapsed', c); };

  return (
    <div className={`dash ${collapsed ? 'collapsed' : ''} ${open ? 'side-open' : ''}`}>
      <aside className="side">
        <div className="side-brand"><Link href="/" className="brand"><Icon name="logo" size={22} /> <span>GGFacelon</span></Link>
          <button className="icon-btn ghost" id="collapse" title="Collapse sidebar" onClick={toggle}><Icon name="sidebar" size={19} /></button></div>
        <div className="profile-card">
          <div className="pc-row"><div className="avatar">{a.scans[0] ? <FaceThumb scan={a.scans[0]} size={88} /> : <Icon name="user" />}</div>
            <div><div className="pc-name">Your profile</div><span className="chip tiny">MALE · ALL FEATURES</span></div></div>
          <Link className="btn dark block" href="/new/"><Icon name="scan" size={16} /> New scan</Link>
        </div>
        <div className="hist-head"><span className="cap">History</span>
          <div><Link className="mini-btn" href="/new/"><Icon name="plus" size={13} /> New</Link>
            <button className="mini-btn" onClick={() => (a.scans.length > 1 ? router.push(scanUrl((scan || a.scans[0]).id, 'compare')) : toast('Make two scans to compare'))}><Icon name="compare" size={13} /> Compare</button></div></div>
        <div className="hist">
          {!a.scans.length && <div className="hist-empty">No scans yet</div>}
          {a.scans.map((s, i) => {
            const r = a.result(s);
            const ps = ['harmony', 'angularity', 'dimorphism', 'features'].map((k) => r.pillars[k].score);
            return (
              <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <Link className={`hist-item ${scan && s.id === scan.id ? 'on' : ''}`} href={scanUrl(s.id, 'overview')} onClick={() => setOpen(false)}>
                  <FaceThumb scan={s} className="hthumb" />
                  <div className="hmid"><div className="hscore" style={{ color: scoreColor(r.overall) }}>{r.overall.toFixed(2)}</div>
                    <div className="hmini">{['H', 'A', 'D', 'F'].map((l, j) => <span key={l}>{l} <b style={{ color: scoreColor(ps[j]) }}>{ps[j].toFixed(1)}</b></span>)}</div></div>
                  <div className="hdate">{s.label && <span className="hlabel">{s.label}</span>}{relTime(s.created)}</div>
                </Link>
              </motion.div>
            );
          })}
        </div>
        <div className="side-foot">
          <div className="cap">Explore</div>
          <Link className="side-link" href="/methodology/"><Icon name="book" size={17} /> Methodology</Link>
          <button className="side-link" onClick={photoGuide}><Icon name="camera" size={17} /> Photo guide</button>
          <button className="side-link" onClick={openCalibration}><Icon name="sliders" size={17} /> Calibration &amp; data</button>
          <button className="side-link" onClick={wipe}><Icon name="trash" size={17} /> Delete all data</button>
        </div>
      </aside>
      <div className="side-scrim" onClick={() => setOpen(false)} />
      <main className="main">
        <header className="topnav">
          <button className="icon-btn ghost only-m" title="Show sidebar" onClick={() => (collapsed && matchMedia('(min-width: 961px)').matches ? toggle() : setOpen(true))}><Icon name="sidebar" size={19} /></button>
          <nav className="tabs">
            {TABS.map((t) => (
              <Link key={t.id} className={`tab ${t.id === tab ? 'on' : ''} ${!scan ? 'disabled' : ''}`} href={scan ? scanUrl(scan.id, t.id) : '/'}>
                {t.label}
                {t.id === tab && <motion.span className="tab-line" layoutId="tab-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              </Link>
            ))}
          </nav>
          {scan && (
            <div className="top-acts">
              <button className="icon-btn" title="Share report card" onClick={() => openShare(scan, res)}><Icon name="share" size={17} /></button>
              <Link className="icon-btn" title="Edit landmarks" href={`/edit/?id=${scan.id}`}><Icon name="edit" size={17} /></Link>
              <button className="icon-btn" title="Delete this scan" onClick={del}><Icon name="trash" size={17} /></button>
            </div>
          )}
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
