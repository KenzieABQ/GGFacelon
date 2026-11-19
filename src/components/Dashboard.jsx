'use client';
// Dashboard page: loads scans, picks the scan + tab from the URL, renders the shell and the tab.
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useApp, app } from '@/lib/app.js';
import { METRICS } from '@/lib/engine/metrics.js';
import Shell from './Shell.jsx';
import Overview, { PILLAR_ART } from './Overview.jsx';
import Analysis from './Analysis.jsx';
import Compare from './Compare.jsx';
import { Plan, Simulate, Methodology } from './Extras.jsx';
import { Icon } from './ui.jsx';
import { scanUrl } from '@/lib/routes.js';

export function Empty() {
  const router = useRouter();
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty-card card">
        <div className="empty-art">{PILLAR_ART.features}</div>
        <h1 className="serif">Get your facial analysis.</h1>
        <p className="sub">Upload a front and a side photo. AI places 73 landmarks, you verify them, and GGFacelon measures {METRICS.filter((m) => !m.look).length} facial ratios plus {METRICS.filter((m) => m.look).length} things read from the photo itself — brows, eye openness, lips, hairline — across Harmony, Angularity, Dimorphism and Features, for your front and side profile. Every result unlocked.</p>
        <div className="empty-acts"><Link className="btn dark" href="/new/"><Icon name="scan" size={16} /> Start a new scan</Link>
          <button className="btn ghost" onClick={() => { app.sample = true; router.push('/new/'); }}><Icon name="sparkle" size={16} /> Try the sample face</button></div>
        <ul className="empty-feats">
          <li><Icon name="target" size={16} /><span><b>{METRICS.length} measurements</b> — thirds, FWHR, canthal tilt, gonial angle, E‑line, brow thickness and more</span></li>
          <li><Icon name="shield" size={16} /><span><b>Private</b> — everything runs in your browser</span></li>
          <li><Icon name="wand" size={16} /><span><b>Plan &amp; Simulate</b> — see what moves your score</span></li>
        </ul>
      </div>
    </motion.div>
  );
}

export default function Dashboard({ fixedTab }) {
  const a = useApp();
  const q = useSearchParams();
  const router = useRouter();
  const id = q.get('id'), tab = fixedTab || q.get('tab') || 'overview', sub = q.get('sub');
  useEffect(() => { app.load(); }, []);
  const scan = id ? a.scan(id) : fixedTab ? a.scans[0] : null;
  useEffect(() => { if (scan) app.ensureLook(scan); }, [scan?.id]);
  useEffect(() => {
    if (!a.loaded || fixedTab) return;
    if (!scan) router.replace(a.scans[0] ? scanUrl(a.scans[0].id) : '/');
  }, [a.loaded, scan?.id]);
  if (!a.loaded) return <div className="dash" />;
  const res = scan ? a.result(scan) : null;
  let body = null;
  if (tab === 'methodology') body = <Methodology />;
  else if (!scan) body = <Empty />;
  else if (tab === 'analysis') body = <Analysis key={scan.id + (scan.updated || '') + (sub || '')} scan={scan} res={res} pid={sub || 'harmony'} />;
  else if (tab === 'plan') body = <Plan res={res} />;
  else if (tab === 'simulate') body = <Simulate key={scan.id + (scan.updated || '')} scan={scan} res={res} />;
  else if (tab === 'compare') body = <Compare key={scan.id} scan={scan} otherId={sub} />;
  else body = <Overview key={scan.id + (scan.updated || '')} scan={scan} res={res} />;
  return <Shell scan={tab === 'methodology' ? null : scan} tab={tab}>{body}</Shell>;
}
