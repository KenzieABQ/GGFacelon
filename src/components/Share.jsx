'use client';
// Share card preview + download
import { useEffect, useState } from 'react';
import { app } from '@/lib/app.js';
import { renderShareCard } from '@/lib/share.js';
import { Icon, openModal, toast } from './ui.jsx';

function SharePreview({ scan, res, close }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { renderShareCard(app, scan, res).then(setUrl); }, [scan, res]);
  const download = () => {
    const a = document.createElement('a');
    a.download = `ggfacelon-${new Date(scan.created).toISOString().slice(0, 10)}.png`;
    a.href = url;
    a.click();
    toast('Report image saved');
  };
  return (
    <div className="share-prev">
      {url ? <img src={url} alt="Report card" /> : <div className="share-wait"><div className="spinner" /> Rendering…</div>}
      <div className="m-actions"><button className="btn ghost" onClick={close}>Close</button>
        <button className="btn dark" disabled={!url} onClick={download}><Icon name="download" size={16} /> Download PNG</button></div>
    </div>
  );
}
export const openShare = (scan, res) => openModal((close) => <SharePreview scan={scan} res={res} close={close} />, { cls: 'share' });
